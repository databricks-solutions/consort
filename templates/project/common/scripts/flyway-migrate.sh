#!/usr/bin/env bash
# Run database migrations using the branch URL from .env (post-checkout hook writes it).
# Detects project language and calls the appropriate migration tool.
# Usage: ./scripts/flyway-migrate.sh [extra args]
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"
if [ ! -f .env ]; then
  echo "No .env found. Run 'git checkout <branch>' so the hook creates/updates .env, or copy .env.example to .env."
  exit 1
fi
set -a
# shellcheck source=/dev/null
source .env 2>/dev/null || true
set +a

# Build DATABASE_URL from SPRING_DATASOURCE_* if not already set (backward compat).
# URL-encode both username and password – the email-style username always
# contains '@' which otherwise confuses libpq/psycopg DSN parsing.
if [ -z "${DATABASE_URL:-}" ] && [ -n "${SPRING_DATASOURCE_URL:-}" ]; then
  DATABASE_URL="$(echo "$SPRING_DATASOURCE_URL" | sed 's|^jdbc:postgresql://|postgresql://|')"
  if [ -n "${SPRING_DATASOURCE_USERNAME:-}" ] && [ -n "${SPRING_DATASOURCE_PASSWORD:-}" ]; then
    ENCODED_USER="$(printf '%s' "$SPRING_DATASOURCE_USERNAME" | sed 's/@/%40/g; s/:/%3A/g; s/\//%2F/g; s/?/%3F/g; s/#/%23/g')"
    ENCODED_PASS="$(printf '%s' "$SPRING_DATASOURCE_PASSWORD" | sed 's/@/%40/g; s/:/%3A/g; s/\//%2F/g; s/?/%3F/g; s/#/%23/g')"
    DATABASE_URL="$(echo "$DATABASE_URL" | sed "s|postgresql://|postgresql://${ENCODED_USER}:${ENCODED_PASS}@|")"
  fi
  export DATABASE_URL
fi

# Detect project language
if [ -f "$REPO_ROOT/pom.xml" ]; then
  # Java / Maven / Flyway. No token is stored in .env; mint a FRESH short-lived
  # Lakebase credential for this migration run from the connection metadata via
  # the kit's get-connection seam, then derive SPRING_DATASOURCE_* from it.
  if [ -z "${SPRING_DATASOURCE_PASSWORD:-}" ] && [ -x "$SCRIPT_DIR/lk" ] \
      && [ -n "${LAKEBASE_PROJECT_ID:-}" ] && [ -n "${LAKEBASE_BRANCH_ID:-}" ]; then
    _DSN="$("$SCRIPT_DIR/lk" lakebase-get-connection --output dsn \
      --instance "$LAKEBASE_PROJECT_ID" --branch "$LAKEBASE_BRANCH_ID" 2>/dev/null || true)"
    if [ -n "$_DSN" ]; then
      # postgresql://<encoded-user>:<token>@<host:port/db?...>
      _noproto="${_DSN#postgresql://}"
      _creds="${_noproto%%@*}"
      _hostpart="${_noproto#*@}"
      SPRING_DATASOURCE_URL="jdbc:postgresql://${_hostpart}"
      SPRING_DATASOURCE_USERNAME="${DB_USERNAME:-${_creds%%:*}}"
      SPRING_DATASOURCE_PASSWORD="${_creds#*:}"
    fi
  fi
  # Fall back to an explicit DATABASE_URL override (a CI secret) if still unset.
  if [ -z "${SPRING_DATASOURCE_URL:-}" ] && [ -n "${DATABASE_URL:-}" ]; then
    SPRING_DATASOURCE_URL="jdbc:$(echo "$DATABASE_URL" | sed 's|^postgresql://[^@]*@|postgresql://|')"
    SPRING_DATASOURCE_USERNAME="${DB_USERNAME:-}"
    _np="${DATABASE_URL#postgresql://}"; _cr="${_np%%@*}"
    SPRING_DATASOURCE_PASSWORD="${_cr#*:}"
  fi
  if [ -z "${SPRING_DATASOURCE_URL:-}" ] || [ -z "${SPRING_DATASOURCE_PASSWORD:-}" ]; then
    echo "Could not resolve a Lakebase credential for Flyway (need LAKEBASE_PROJECT_ID + LAKEBASE_BRANCH_ID + the kit's lk resolver, or an explicit DATABASE_URL)." >&2
    exit 1
  fi
  export SPRING_DATASOURCE_URL SPRING_DATASOURCE_USERNAME SPRING_DATASOURCE_PASSWORD
  ./mvnw flyway:migrate "$@"
elif [ -f "$REPO_ROOT/requirements.txt" ] || [ -f "$REPO_ROOT/pyproject.toml" ]; then
  # Python / Alembic
  if [ -d ".venv" ]; then
    source .venv/bin/activate
  fi
  alembic upgrade head "$@"
elif [ -n "$(find "$REPO_ROOT" -maxdepth 1 \( -name '*.sln' -o -name '*.slnx' -o -name '*.csproj' \) -print -quit 2>/dev/null)" ]; then
  # .NET: EF Core or Flyway (db/migrations/).
  if [ -n "${DATABASE_URL:-}" ]; then
    # Explicit target (CI secret, ephemeral-verify DSN): run the tool directly.
    if [ -d "$REPO_ROOT/db/migrations" ]; then
      _np="${DATABASE_URL#postgresql://}"; _cr="${_np%%@*}"; _hp="${_np#*@}"
      # Decode %XX only ('+' is literal in URL userinfo, and backslashes in a
      # credential must not be interpreted as escapes).
      _urldecode() {
        local s="$1" out="" c
        while [ -n "$s" ]; do
          c="${s:0:1}"; s="${s:1}"
          if [ "$c" = "%" ] && [ "${#s}" -ge 2 ]; then
            out+="$(printf "\\x${s:0:2}")"; s="${s:2}"
          else
            out+="$c"
          fi
        done
        printf '%s' "$out"
      }
      FLYWAY_URL="jdbc:postgresql://${_hp}" \
      FLYWAY_USER="$(_urldecode "${_cr%%:*}")" \
      FLYWAY_PASSWORD="$(_urldecode "${_cr#*:}")" \
        flyway "-locations=filesystem:$REPO_ROOT/db/migrations" \
          -baselineOnMigrate=true -baselineVersion=0 migrate "$@"
    else
      # Relative to the repo root (the cwd here): an absolute path through a
      # symlinked directory (e.g. macOS /tmp -> /private/tmp) makes MSBuild see
      # two different project paths and dotnet ef then loses the build output.
      _csproj="$(grep -l "Microsoft.EntityFrameworkCore.Design" \
        $(find . -maxdepth 3 -name '*.csproj' -not -path '*/tests/*' -not -path '*/test/*' \
            -not -path '*/client/*' -not -path '*/bin/*' -not -path '*/obj/*' -not -path '*/node_modules/*' | sort) \
        2>/dev/null | head -1)"
      [ -n "$_csproj" ] || { echo "No *.csproj references Microsoft.EntityFrameworkCore.Design." >&2; exit 1; }
      # dotnet ef reads project metadata before it builds, so restore first
      # (a fresh clone or a cleaned obj/ has no assets file).
      if [ -f .config/dotnet-tools.json ]; then dotnet tool restore >/dev/null; fi
      dotnet restore "$_csproj" >/dev/null
      # The design-time DbContext factory reads DATABASE_URL, so no password
      # is passed on the command line.
      dotnet ef database update --project "$_csproj" "$@"
    fi
  else
    # Paired branch from .env metadata: the kit's tool-agnostic migrate CLI
    # picks the tool, mints a fresh credential, and refuses protected tiers,
    # exactly as CI does.
    if [ ! -x "$SCRIPT_DIR/lk" ] || [ -z "${LAKEBASE_PROJECT_ID:-}" ] || [ -z "${LAKEBASE_BRANCH_ID:-}" ]; then
      echo "Cannot migrate: need scripts/lk plus LAKEBASE_PROJECT_ID and LAKEBASE_BRANCH_ID (written to .env by the post-checkout hook), or DATABASE_URL." >&2
      exit 1
    fi
    "$SCRIPT_DIR/lk" lakebase-schema-migrate apply \
      --instance "$LAKEBASE_PROJECT_ID" --branch "$LAKEBASE_BRANCH_ID" "$@"
  fi
elif [ -f "$REPO_ROOT/package.json" ]; then
  # Node.js / Knex
  npx knex migrate:latest "$@"
else
  echo "Could not detect project language. Expected pom.xml (Java), pyproject.toml/requirements.txt (Python), *.sln/*.csproj (.NET), or package.json (Node.js)."
  exit 1
fi
