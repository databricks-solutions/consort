#!/usr/bin/env bash
# Run the application locally so a human can open it in a browser and review it.
# Detects the project language, applies pending migrations against the current
# branch's database (from .env, written by the post-checkout hook), then starts
# the dev server with hot-reload. Ctrl-C to stop.
#
# For a full-stack Python project (a client/ SPA alongside the JSON backend) it
# also starts the client's Vite dev server and proxies its /api + /health at the
# backend, so "run both" is one command; Ctrl-C stops both.
#
# Usage: ./scripts/run-dev.sh [extra args passed to the server]
#   PORT         override the backend listen port (default 8200 Python, 8000 Node, 8080 Java)
#   CLIENT_PORT  override the client Vite dev port (default 5200; full-stack Python only)
#   HOST         override the bind host (default 127.0.0.1)
#   SEED         set to 0 to skip dev-data seeding (default: seed if SEED_SCRIPT exists)
#   SEED_SCRIPT  path to the dev seed script (default scripts/seed_dev.py); it OWNS
#                its own idempotency (no-op when data already present)
#   SYNC_ENV     set to 0 to skip the pre-connect credential refresh (default: refresh)
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"
# shellcheck source=/dev/null
[ -f "$SCRIPT_DIR/scrub-npm-lock.sh" ] && source "$SCRIPT_DIR/scrub-npm-lock.sh"
if [ ! -f .env ]; then
  echo "No .env found. Run 'git checkout <branch>' so the hook creates/updates .env, or copy .env.example to .env."
  exit 1
fi
set -a
# shellcheck source=/dev/null
source .env 2>/dev/null || true
set +a

# Re-mint fresh DB credentials for the current branch BEFORE connecting. The .env
# password is a short-lived token; an idle checkout (or one whose token has aged
# out) otherwise fails the first DB connect with "password authentication failed".
# Re-syncing here means a developer never has to think about it. Best-effort: it
# needs the kit's `lk` resolver + a working databricks auth, so a non-kit project
# or an offline box falls back to whatever .env already holds. Re-source after, so
# the refreshed DATABASE_URL/credentials land in this shell's environment.
# Set SYNC_ENV=0 to skip (e.g. a pinned/offline .env you don't want overwritten).
if [ "${SYNC_ENV:-1}" != "0" ] && [ -x "$REPO_ROOT/scripts/lk" ]; then
  if "$REPO_ROOT/scripts/lk" lakebase-branch sync-env --cwd "$REPO_ROOT" >/dev/null 2>&1; then
    set -a
    # shellcheck source=/dev/null
    source .env 2>/dev/null || true
    set +a
  else
    echo "Note: could not refresh DB credentials (lakebase-branch sync-env); using existing .env." >&2
  fi
fi

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

HOST="${HOST:-127.0.0.1}"

# port_in_use + free_port live in the shared scripts/port-utils.sh so run-dev
# (local serve) and CI's E2E free-port allocation can't drift. free_port probes
# upward from the requested port, so run-dev does NOT collide with a deploy
# server (the deploy target also uses 8000), a stale dev server, or another
# listener already on the port. PORT pins the start. Fall back to inline stubs
# if a retrofit project predates the shared helper.
if [ -f "$SCRIPT_DIR/port-utils.sh" ]; then
  # shellcheck source=/dev/null
  source "$SCRIPT_DIR/port-utils.sh"
else
  port_in_use() {
    local p="$1"
    if command -v lsof >/dev/null 2>&1; then
      lsof -iTCP:"$p" -sTCP:LISTEN -n -P >/dev/null 2>&1
    else
      (exec 3<>"/dev/tcp/127.0.0.1/$p") 2>/dev/null && { exec 3>&- 3<&-; return 0; } || return 1
    fi
  }
  free_port() {
    local p="$1" tries=0
    while [ "$tries" -lt 20 ]; do
      if ! port_in_use "$p"; then printf '%s' "$p"; return 0; fi
      p=$((p + 1)); tries=$((tries + 1))
    done
    printf '%s' "$1"
  }
fi

# Resolve the listen port from the per-language default (or PORT), then bump off
# any busy port. Announce the bump so the URL printed below is the real one.
resolve_port() {
  local req="${PORT:-$1}" got
  got="$(free_port "$req")"
  if [ "$got" != "$req" ]; then
    echo "Port $req is in use (a deploy or another server?), using $got instead." >&2
  fi
  printf '%s' "$got"
}

# Detect project language, migrate, then serve with hot-reload.
if [ -f "$REPO_ROOT/pom.xml" ]; then
  # Java / Maven + Spring Boot
  PORT="$(resolve_port 8080)"
  echo "Serving on http://${HOST}:${PORT}  (Ctrl-C to stop). Open it in your browser."
  ./mvnw spring-boot:run -Dspring-boot.run.arguments="--server.port=${PORT} --server.address=${HOST}" "$@"
elif [ -f "$REPO_ROOT/requirements.txt" ] || [ -f "$REPO_ROOT/pyproject.toml" ]; then
  # Python / Alembic + FastAPI (uvicorn)
  if [ -d ".venv" ]; then
    # shellcheck source=/dev/null
    source .venv/bin/activate
  fi
  echo "Running Alembic migrations..."
  uv run alembic upgrade head

  # Dev convenience: seed demo data so a freshly checked-out branch has something
  # to review. The seed script (default scripts/seed_dev.py, override with
  # SEED_SCRIPT) OWNS its own idempotency , it should no-op when data already
  # exists, since "is it empty?" is app-specific (which table?). Set SEED=0 to
  # skip. Non-fatal: a failed seed never blocks the dev server.
  SEED_SCRIPT="${SEED_SCRIPT:-scripts/seed_dev.py}"
  if [ "${SEED:-1}" != "0" ] && [ -f "$REPO_ROOT/$SEED_SCRIPT" ]; then
    echo "Seeding dev data ($SEED_SCRIPT)..."
    # Run the seed with the repo ROOT importable. `uv run python scripts/seed_dev.py`
    # puts the script's OWN dir (scripts/) on sys.path[0], NOT the repo root, so the
    # seed's `import app...` fails with ModuleNotFoundError , unlike `uvicorn app.main:app`
    # and `python -c` below, which import from cwd. Prepend the repo root to PYTHONPATH
    # so the app package resolves.
    PYTHONPATH="$REPO_ROOT${PYTHONPATH:+:$PYTHONPATH}" uv run python "$SEED_SCRIPT" || true
  fi

  # Dev backend port: start at 8200, NOT 8000. Port 8000 is the deploy target and
  # the port CI's Playwright webServer binds (client/playwright.config.ts), so a
  # local run-dev must stay off it. resolve_port respects PORT and probes upward
  # off any busy port.
  PORT="$(resolve_port 8200)"

  # Full-stack: when a client/ SPA exists, the browsable UI is its Vite dev server,
  # NOT this (JSON-only) backend. Start Vite in the background and point its
  # /api + /health proxy at THIS backend (VITE_PROXY_TARGET, honored by
  # client/vite.config.ts). Trapped so Ctrl-C stops both. Without this a JSON-only
  # backend alone "shows nothing" to a reviewer who opens the bare host.
  CLIENT_PID=""
  if [ -f "$REPO_ROOT/client/package.json" ]; then
    if [ ! -d "$REPO_ROOT/client/node_modules" ]; then
      echo "Installing client dependencies (first run)..."
      # Make the lockfile installable off the Databricks network before npm fetches its
      # `resolved` URLs verbatim (a proxy-host lock hangs an external clone). No-op if already public.
      command -v scrub_npm_proxy_lock >/dev/null 2>&1 && scrub_npm_proxy_lock "$REPO_ROOT/client/package-lock.json"
      ( cd "$REPO_ROOT/client" && npm install )
    fi
    # Dev client port: start at 5200, NOT Vite's default 5173. CI's Playwright
    # webServer and any stray Vite instance grab 5173, so run-dev avoids it.
    # CLIENT_PORT overrides the base; --strictPort makes Vite bind exactly this
    # resolved free port (so the printed URL is real), since Vite would otherwise
    # silently auto-increment.
    CLIENT_REQ="${CLIENT_PORT:-5200}"
    CLIENT_PORT="$(free_port "$CLIENT_REQ")"
    if [ "$CLIENT_PORT" != "$CLIENT_REQ" ]; then
      echo "Client port $CLIENT_REQ is in use (a stale dev server?), using $CLIENT_PORT instead." >&2
    fi
    ( cd "$REPO_ROOT/client" && VITE_PROXY_TARGET="http://${HOST}:${PORT}" npm run dev -- --port "$CLIENT_PORT" --strictPort ) &
    CLIENT_PID=$!
    trap 'if [ -n "$CLIENT_PID" ]; then kill "$CLIENT_PID" 2>/dev/null; fi' EXIT INT TERM

    # Announce the URL only AFTER Vite is actually serving, otherwise the line is
    # immediately buried by Vite's startup banner and then the uvicorn log stream,
    # so the reviewer never sees the real port. Vite often binds IPv6 ::1, so probe
    # with curl against localhost (resolves either family), NOT /dev/tcp/127.0.0.1
    # which false-negatives. Print localhost in the URL: it is what Cursor's
    # integrated-browser link handler routes inline (127.0.0.1 opens externally).
    APP_URL="http://localhost:${CLIENT_PORT}/"
    printf 'Waiting for the client (Vite) on port %s' "$CLIENT_PORT"
    _t=0
    until curl -sf -o /dev/null --max-time 2 "$APP_URL" 2>/dev/null || [ "$_t" -ge 30 ]; do
      printf '.'; sleep 1; _t=$((_t + 1))
    done
    echo ""
    echo "============================================================"
    echo "  Open the app:  $APP_URL"
    echo "  Backend API:   http://${HOST}:${PORT}  (Vite proxies /api + /health here)"
    echo "  Ctrl-C stops both."
    echo "============================================================"
    echo ""
  else
    # API/CLI-only project: no SPA, so print the backend's browsable GET routes.
    # A freshly built app may have no "/" route (only e.g. /bugs/new), so opening
    # the bare host 404s; printing the real entry points avoids the guessing game.
    # Non-fatal if introspection fails.
    echo "Serving on http://${HOST}:${PORT}  (Ctrl-C to stop)."
    routes="$(uv run python -c "
from app.main import app
for r in getattr(app, 'routes', []):
    methods = getattr(r, 'methods', None) or set()
    path = getattr(r, 'path', '')
    if 'GET' in methods and not path.startswith('/openapi') and path not in ('/docs', '/redoc', '/docs/oauth2-redirect'):
        print(path)
" 2>/dev/null)" || true
    if [ -n "$routes" ]; then
      echo "Open one of these in your browser:"
      printf '%s\n' "$routes" | while IFS= read -r p; do echo "  http://${HOST}:${PORT}${p}"; done
    fi
  fi

  uv run uvicorn app.main:app --reload --host "$HOST" --port "$PORT" "$@"
elif [ -n "$(find "$REPO_ROOT" -maxdepth 1 \( -name '*.sln' -o -name '*.slnx' -o -name '*.csproj' \) -print -quit 2>/dev/null)" ]; then
  # .NET / ASP.NET Core. The app reads .env itself and mints its own credential.
  PORT="$(resolve_port 8000)"
  export PORT HOST
  # Relative paths (cwd is the repo root): see the symlink note in flyway-migrate.sh.
  _app="$(find src -maxdepth 2 -name '*.csproj' 2>/dev/null | head -1)"
  _app="${_app:-$(find . -maxdepth 1 -name '*.csproj' 2>/dev/null | head -1)}"
  echo "Serving on http://${HOST}:${PORT}  (Ctrl-C to stop). Open it in your browser."
  dotnet watch --project "$_app" run -- --urls "http://${HOST}:${PORT}" "$@"
elif [ -f "$REPO_ROOT/package.json" ]; then
  # Node.js – prefer a "dev" script, fall back to "start".
  PORT="$(resolve_port 8000)"
  export PORT HOST
  echo "Serving on http://${HOST}:${PORT}  (Ctrl-C to stop). Open it in your browser."
  if node -e "process.exit(require('./package.json').scripts && require('./package.json').scripts.dev ? 0 : 1)" 2>/dev/null; then
    npm run dev -- "$@"
  else
    npm start -- "$@"
  fi
else
  echo "Could not detect project language. Expected pom.xml (Java), pyproject.toml/requirements.txt (Python), *.sln/*.csproj (.NET), or package.json (Node.js)."
  exit 1
fi
