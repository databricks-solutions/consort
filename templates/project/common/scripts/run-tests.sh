#!/usr/bin/env bash
# Run tests using the branch URL from .env (post-checkout hook writes it).
# Detects project language and calls the appropriate test runner.
# Usage: ./scripts/run-tests.sh [extra args]
#
# E2E-ASSEMBLY CONTRACT (kit maintainers): this template is intentionally
# BLOCK-LESS for the Playwright E2E suite. The E2E block is NOT shipped inline
# here; scm-utils' `enableE2eForProject` / `addE2eToRunTestsScript` APPENDS it
# per-project at scaffold/upgrade time (idempotent; delimited by the marker
# `# run Playwright E2E suite when configured`). Do NOT inline the E2E block in
# this template — it would double with the appended one. The non-E2E body here
# tracks scm-utils' run-tests.sh and must be kept at parity on a tiered
# (scm-utils -> consort) upgrade; that body-parity is handled by the e2e-assembly
# convergence effort, NOT the workflow drift guard (which covers .github/workflows).
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

# Ephemeral verify DB: when the kit's deploy substrate provides a disposable
# CHILD branch DSN, run migrations + tests against IT instead of the shared
# branch. A contract/cleanup story's tests carry migration up/down fixtures; run
# against the shared branch they leave it half-migrated for the next run and the
# build thrashes fighting DB state. Forked off the experiment branch at its
# committed schema, the child gives every verify a clean, isolated DB and is
# deleted after. (Python + Node read DATABASE_URL directly; Java/Spring would
# also need SPRING_DATASOURCE_* overridden , tracked follow-up.)
if [ -n "${VERIFY_DATABASE_URL:-}" ]; then
  echo "Verify DB: running migrations + tests against the ephemeral child branch (isolating migration fixtures)."
  export DATABASE_URL="$VERIFY_DATABASE_URL"
fi

# FALSE-GREEN GUARD (fail fast, before any backend/migration work): client TEST
# files can be present with NO client/package.json to run them , a project
# scaffolded with no client SPA (uiTrack/clientFramework=none) whose design still
# authored client-owned ACs, so the agents wrote a home-screen *.test.tsx / e2e
# *.spec.ts against a client that was never built. The client Vitest block far
# below runs only when client/package.json EXISTS, so those tests would be
# SILENTLY SKIPPED and every client-owned AC would green with ZERO coverage , a
# false GREEN that surfaces (if ever) only as "the home screen doesn't exist" at
# the acceptance gate. Refuse to run at all. A genuinely backend-only project
# authors no client tests, so this never trips it. Full run only ($# -eq 0); a
# per-cycle backend-layer invocation (path arg) is not the authoritative verify.
if [ "$#" -eq 0 ] && [ ! -f "$REPO_ROOT/client/package.json" ] && [ -d "$REPO_ROOT/client" ]; then
  orphan_client_tests="$(find "$REPO_ROOT/client" -type f \( -name '*.test.tsx' -o -name '*.test.ts' -o -name '*.spec.tsx' -o -name '*.spec.ts' \) 2>/dev/null | head -n 10)"
  if [ -n "$orphan_client_tests" ]; then
    echo "ERROR: client tests exist but there is no client/package.json to run them , refusing to report a hollow pass." >&2
    echo "  Orphaned client test file(s):" >&2
    printf '%s\n' "$orphan_client_tests" | sed 's/^/    /' >&2
    echo "  A client SPA scaffold is absent (uiTrack/clientFramework=none) while client-owned tests are present, so they" >&2
    echo "  would be SILENTLY SKIPPED and every client-owned AC would green with zero coverage (a false GREEN)." >&2
    echo "  Resolve the mismatch: scaffold the client (enable the UI track), OR do not author client/E2E ACs + tests on a" >&2
    echo "  backend-only project. This is a real coverage gap, not a flake , do not bypass it." >&2
    exit 1
  fi
fi

# Detect project language and run pending migrations before tests.
# SFTDD_CLIENT_ONLY (Finding 26): the build's honest-GREEN verify runs the backend
# via the SFTDD_PYTEST_MARKER two-pass, which exits before the client Vitest block
# below. To gate build GREEN on the SAME client suite the deploy feature-verify runs,
# the build makes ONE extra invocation with SFTDD_CLIENT_ONLY=1: skip the backend
# entirely (no migrations, no pytest) and run only the client Vitest block.
if [ "$#" -eq 0 ] && [ -n "${SFTDD_CLIENT_ONLY:-}" ]; then
  echo "Client-only pass (SFTDD_CLIENT_ONLY=1): skipping the backend suite; running the client Vitest suite only."
elif [ -f "$REPO_ROOT/pom.xml" ]; then
  # Java / Maven – export SPRING_DATASOURCE_* for Maven/Spring
  if [ -z "${SPRING_DATASOURCE_URL:-}" ] && [ -n "${DATABASE_URL:-}" ]; then
    SPRING_DATASOURCE_URL="jdbc:$(echo "$DATABASE_URL" | sed 's|^postgresql://[^@]*@|postgresql://|')"
    SPRING_DATASOURCE_USERNAME="${DB_USERNAME:-}"
    SPRING_DATASOURCE_PASSWORD="${DB_PASSWORD:-}"
  fi
  export SPRING_DATASOURCE_URL SPRING_DATASOURCE_USERNAME SPRING_DATASOURCE_PASSWORD
  echo "Running Flyway migrations..."
  if [ -f "$REPO_ROOT/scripts/flyway-migrate.sh" ]; then
    "$REPO_ROOT/scripts/flyway-migrate.sh"
  else
    ./mvnw -q flyway:migrate
  fi
  ./mvnw test "$@"
elif [ -f "$REPO_ROOT/requirements.txt" ] || [ -f "$REPO_ROOT/pyproject.toml" ]; then
  # Python / Alembic + pytest
  if [ -d ".venv" ]; then
    source .venv/bin/activate
  fi
  echo "Running Alembic migrations..."
  uv run alembic upgrade head
  # pytest + httpx live in [project.optional-dependencies].dev in the
  # Python scaffold, so they aren't installed by a default `uv run` /
  # `uv sync`. Without --extra dev, uv falls back to a system pytest
  # that can't see the venv's fastapi etc., and test collection crashes
  # with ModuleNotFoundError. Pass --extra dev so uv resolves against
  # the dev extras for the test invocation.
  #
  # E2E (tests/e2e) is owned by the dedicated Playwright block that enable-e2e
  # appends below (it runs `playwright install chromium` first, then
  # `pytest tests/e2e`). The base full run (no positional args, e.g. the deploy
  # gate's `run-tests.sh`) must NOT collect tests/e2e, or pytest tries to launch
  # a browser before that install ran and the run dies with "Failed to spawn:
  # playwright" before the e2e block is reached. An explicit path arg is honored
  # verbatim (the per-cycle layer runner).
  if [ "$#" -eq 0 ]; then
    # SFTDD_PYTEST_MARKER lets the verify split the suite across ISOLATED ephemeral
    # branches: the main pass runs `not migration`, then a second pass runs
    # `migration`-marked tests on their OWN branch, so a reversibility test's
    # downgrade cannot corrupt the shared verify DB for its siblings. When a marker
    # selects zero tests pytest exits 5 (nothing collected); that is not a failure.
    if [ -n "${SFTDD_PYTEST_MARKER:-}" ]; then
      set +e
      uv run --extra dev pytest --ignore=tests/e2e -m "$SFTDD_PYTEST_MARKER"
      rc=$?
      set -e
      [ "$rc" -eq 5 ] && rc=0
      exit "$rc"
    fi
    uv run --extra dev pytest --ignore=tests/e2e
  else
    uv run --extra dev pytest "$@"
  fi
elif [ -f "$REPO_ROOT/package.json" ]; then
  # Node.js / Knex + Jest
  echo "Running Knex migrations..."
  npx knex migrate:latest
  npm test "$@"
else
  echo "Could not detect project language. Expected pom.xml (Java), pyproject.toml/requirements.txt (Python), or package.json (Node.js)."
  exit 1
fi

# React SPA client unit tests (Vitest + Testing Library). Only on a full run
# (no positional path arg, so a per-cycle backend-layer invocation does not drag
# in the client suite), and only when a client/ workspace is present. The
# client's e2e (Playwright) is owned by CI / the E2E block; this is the fast unit
# lane. This is part of the AUTHORITATIVE full run (the build's honest-GREEN
# verify and the deploy gate both use it), so the client tests must ACTUALLY RUN,
# never be skipped: a silent skip when client/node_modules is absent would green
# UI code whose tests never executed (a false GREEN), and the break would surface
# only later at the deploy gate. So install the client deps if missing, then run;
# a failing client test fails the run (set -e) exactly like a backend one.
if [ "$#" -eq 0 ] && [ -f "$REPO_ROOT/client/package.json" ]; then
  if [ ! -d "$REPO_ROOT/client/node_modules" ]; then
    echo "client/node_modules missing - installing client deps so the client tests actually run..."
    # --include=dev is REQUIRED: this reinstall commonly runs under the deploy
    # gate, where NODE_ENV=production is set; without it npm omits devDependencies
    # and vitest (a devDep) is skipped, so `npm test` below dies with
    # "vitest: command not found" and the deploy fails on a phantom, not the code.
    # Make the lockfile installable off the Databricks network before `npm ci` fetches its
    # `resolved` URLs verbatim (a proxy-host lock hangs an external clone). No-op if already public.
    command -v scrub_npm_proxy_lock >/dev/null 2>&1 && scrub_npm_proxy_lock "$REPO_ROOT/client/package-lock.json"
    if [ -f "$REPO_ROOT/client/package-lock.json" ]; then
      ( cd "$REPO_ROOT/client" && npm ci --include=dev )
    else
      ( cd "$REPO_ROOT/client" && npm install --include=dev )
    fi
  fi
  echo "Running client unit tests (Vitest)..."
  ( cd "$REPO_ROOT/client" && npm test )
fi
