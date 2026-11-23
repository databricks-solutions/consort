#!/usr/bin/env bash
# Run tests using the branch URL from .env (post-checkout hook writes it).
# Detects project language and calls the appropriate test runner.
# Usage: ./scripts/run-tests.sh [extra args]
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
  # CI-FAITHFUL CLEAN BASELINE. The child is forked off the EXPERIMENT branch, which carries app rows
  # accumulated by earlier verify passes + the app's own e2e writes. CI instead forks a fresh branch off
  # the PR base and migrates with NO seed, so its app tables are EMPTY. If the verify runs on the
  # accumulated rows, a test that asserts rendered content WITHOUT seeding its own row (a test-owns-state
  # violation) passes here on ambient data and only breaks at CI — past every build gate. Truncate the
  # child's app tables (schema kept; alembic_version kept) so the verify runs on the SAME empty baseline
  # as CI: such a bug then FAILS in-cycle, where the Navigator/Driver re-author it through the turns.
  # Python-first (matches the ephemeral-verify follow-up for Java/.NET). Opt out: LAKEBASE_CONSORT_CLEAN_VERIFY_DB=0.
  if { [ -f "$REPO_ROOT/pyproject.toml" ] || [ -f "$REPO_ROOT/requirements.txt" ]; } && [ "${LAKEBASE_CONSORT_CLEAN_VERIFY_DB:-1}" != "0" ]; then
    ( cd "$REPO_ROOT" && uv run --extra dev python - <<'PY'
import os, sqlalchemy as sa
url = os.environ["DATABASE_URL"]
if url.startswith("postgresql://"):
    url = url.replace("postgresql://", "postgresql+psycopg://", 1)
e = sa.create_engine(url)
with e.begin() as c:
    names = [r[0] for r in c.exec_driver_sql(
        "select tablename from pg_tables where schemaname='public' and tablename <> 'alembic_version'")]
    if names:
        c.exec_driver_sql("TRUNCATE TABLE " + ", ".join('"%s"' % n for n in names) + " RESTART IDENTITY CASCADE")
        print(f"clean-verify-db: truncated {len(names)} app table(s) to the CI-faithful empty baseline")
PY
    ) || echo "clean-verify-db: truncate skipped (non-fatal) — verify continues on the forked child"
  fi
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
# entirely (no migrations, no pytest) and run the client blocks below - the Vitest
# unit suite AND the client Playwright E2E block.
if [ "$#" -eq 0 ] && [ -n "${SFTDD_CLIENT_ONLY:-}" ]; then
  echo "Client-only pass (SFTDD_CLIENT_ONLY=1): skipping the backend suite; running the client Vitest + Playwright E2E suites."
elif [ -f "$REPO_ROOT/pom.xml" ]; then
  # Java / Maven – export SPRING_DATASOURCE_* for Maven/Spring
  if [ -z "${SPRING_DATASOURCE_URL:-}" ] && [ -n "${DATABASE_URL:-}" ]; then
    SPRING_DATASOURCE_URL="jdbc:$(echo "$DATABASE_URL" | sed 's|^postgresql://[^@]*@|postgresql://|')"
    # The pg JDBC driver reads `ApplicationName` (capital), NOT libpq's lowercase `application_name`.
    # Translate one carried over from DATABASE_URL, or append the resolved label, so the java/kotlin
    # connection carries consort/<v> (or scm-utils/<v>) like every other language.
    SPRING_DATASOURCE_URL="$(printf '%s' "$SPRING_DATASOURCE_URL" | sed 's/\([?&]\)application_name=/\1ApplicationName=/')"
    case "$SPRING_DATASOURCE_URL" in
      *ApplicationName=*) : ;;
      *\?*) SPRING_DATASOURCE_URL="${SPRING_DATASOURCE_URL}&ApplicationName=${PGAPPNAME:-scm-utils/{{LAKEBASE_SCM_UTILS_VERSION}}}" ;;
      *)    SPRING_DATASOURCE_URL="${SPRING_DATASOURCE_URL}?ApplicationName=${PGAPPNAME:-scm-utils/{{LAKEBASE_SCM_UTILS_VERSION}}}" ;;
    esac
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
elif [ -n "$(find "$REPO_ROOT" -maxdepth 1 \( -name '*.sln' -o -name '*.slnx' -o -name '*.csproj' \) -print -quit 2>/dev/null)" ]; then
  # .NET / EF Core or Flyway + xUnit
  echo "Running migrations..."
  "$REPO_ROOT/scripts/flyway-migrate.sh"
  dotnet test "$@"
elif [ -f "$REPO_ROOT/package.json" ]; then
  # Node.js / Knex + Jest
  echo "Running Knex migrations..."
  npx knex migrate:latest
  npm test "$@"
else
  echo "Could not detect project language. Expected pom.xml (Java), pyproject.toml/requirements.txt (Python), *.sln/*.csproj (.NET), or package.json (Node.js)."
  exit 1
fi

# NOTE: a per-cycle client AC-scope (vitest -t / playwright --grep from SFTDD_TEST_IDS) was tried and
# REVERTED (live-proven harmful, 2026-10-24): scoping the per-cycle client pass to the current AC's
# @T specs stops the FULL client suite from running per cycle, which is what detects SUPERSESSION — a
# prior test asserting an element the current story removed (e.g. S2 split the combined
# `tracking-not-tracked` cell into batch/serial). Without that in-cycle RED the driver never refactors
# the superseded test, so it surfaces LATER as a deploy-verify HALT instead of a smooth in-cycle
# refactor. The client Vitest is cheap (jsdom) and the expensive Playwright E2E is already cost-gated
# by cycle layer below, so the full per-cycle client run stays — it is load-bearing, not waste.
#
# EXCEPTION — #2 parallel-lane scope (gated): in a SCOPED-LANE drive (CONSORT_SCOPE_AC set, i.e. a
# parallel per-AC lane / the contract story's serial-first AC), the cross-story supersession is owned by
# the DETERMINISTIC hoist sweep, NOT by this reactive full-client-run. So there the client pass is scoped
# to THIS AC's @T specs (it must not re-run the cross-story suite + re-trigger supersession wave-by-wave
# on the lanes' critical path). FLEET drives (no CONSORT_SCOPE_AC) are UNCHANGED — full client suite,
# supersession detection intact. The gate is what makes the reverted scope safe to re-introduce here.
SFTDD_CLIENT_GREP=""
if [ -n "${CONSORT_SCOPE_AC:-}" ] && [ -n "${SFTDD_TEST_IDS:-}" ]; then
  SFTDD_CLIENT_GREP="@($(echo "$SFTDD_TEST_IDS" | tr -s ' ' '|' | sed 's/^|//;s/|$//'))"
  echo "Scoped-lane client pass (CONSORT_SCOPE_AC=$CONSORT_SCOPE_AC): client tests scoped to $SFTDD_CLIENT_GREP"
fi

# React SPA client unit tests (Vitest + Testing Library). Only on a full run
# (no positional path arg, so a per-cycle backend-layer invocation does not drag
# in the client suite), and only when a client/ workspace is present. This is the
# fast unit lane; the client's Playwright E2E runs in its OWN block just below (it
# too is part of the local loop now, no longer CI-only). This is part of the AUTHORITATIVE full run (the build's honest-GREEN
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
  # Strict typecheck BEFORE the tests, matching CI. CI builds the client with
  # `tsc --noEmit && vite build` (strict), but the local test lanes run vitest +
  # Playwright against the Vite dev server, which does NOT strict-typecheck the whole
  # app — so a cross-story type regression (a later story making a field REQUIRED,
  # breaking an earlier story's construction of that type) passed the local honest-GREEN
  # + deploy feature-verify and was caught ONLY by CI, after promote. Run the SAME strict
  # typecheck here so local GREEN matches CI. `--if-present` no-ops on an older scaffold
  # with no `typecheck` script; a type error fails the run (set -e), exactly like a test.
  echo "Running client strict typecheck (tsc --noEmit, matching CI's build)..."
  ( cd "$REPO_ROOT/client" && npm run typecheck --if-present )
  echo "Running client unit tests (Vitest)..."
  if [ -n "$SFTDD_CLIENT_GREP" ]; then
    ( cd "$REPO_ROOT/client" && npm test -- -t "$SFTDD_CLIENT_GREP" )
  else
    ( cd "$REPO_ROOT/client" && npm test )
  fi
fi

# React SPA client E2E (Playwright). The client's end-to-end suite (client/tests/e2e/*.spec.ts) MUST run
# in the AUTHORITATIVE full run - the build's honest-GREEN verify AND the deploy gate both use it - NOT be
# deferred to CI. Deferring it (the old "owned by CI" split) was a systemic FALSE GREEN: a client-UI AC
# greened off the backend + client-Vitest passing while its Playwright E2E never ran locally, so the Driver
# got NO RED, never built the UI, and the whole client-E2E class read green until CI caught it post-hoc.
# Run it HERE so the Driver gets an honest RED and builds the UI. The client playwright.config.ts's webServer
# boots the backend + SPA; a failing E2E fails the run (set -e). HARD STOP: E2E specs present with no
# client/package.json + playwright config to run them is itself a false GREEN - refuse, never silently skip
# the class. (The top-of-file orphan guard already covers the no-client/package.json case; this adds the
# "config missing" case and, above all, ACTUALLY RUNS the suite.)
#
# COST GATE (E2E is slow, so don't pay it on every per-cycle re-verify): the drive passes the current
# cycle's layer as CONSORT_CYCLE_LAYER. Run the client E2E only when it is RELEVANT - an E2E-layer cycle
# (CONSORT_CYCLE_LAYER=E2E) OR the layer is UNSET (the deploy-verify gate + any un-scoped full run). A
# non-E2E cycle (API/Infra backend work) SKIPS the client E2E - the driver gets its RED on the E2E-layer
# cycles that own the client UI, and the deploy gate re-runs the full suite. FAIL-SAFE: an unset layer
# RUNS the E2E (correct-but-heavier), so a missing/incorrect thread never degrades to a silent skip
# (false GREEN); the only way to skip is the drive EXPLICITLY naming a non-E2E layer.
# Local E2E resiliency: allocate FREE ports the way pr.yml (CI) does, so a
# stale :8000 (e.g. a /deploy server whose `consort-deploy --stop` teardown
# didn't run) or :5173 can't hard-fail Playwright's webServer. Idempotent -
# allocates at most once per run - so local `./scripts/run-tests.sh` E2E is as
# collision-proof as CI (pr.yml free-port-allocates the same way).
ensure_local_e2e_ports() {
  # The Vite /api proxy MUST follow E2E_BACKEND_PORT in BOTH cases: when the deploy gate
  # pre-set it (below returns early) AND when we free-port-allocate it here. Derive it in one
  # place so the proxy never falls back to the :8000 .env default while the backend sits on
  # the resolved port (the wrong-backend proxy bug). playwright.config.ts also honors
  # E2E_BACKEND_PORT; this keeps run-tests.sh the single, obvious source.
  if [ -n "${E2E_BACKEND_PORT:-}" ]; then
    : "${VITE_PROXY_TARGET:=http://127.0.0.1:${E2E_BACKEND_PORT}}"
    export VITE_PROXY_TARGET
    return 0
  fi
  if [ -f "$SCRIPT_DIR/port-utils.sh" ]; then
    # shellcheck source=/dev/null
    source "$SCRIPT_DIR/port-utils.sh"
    export E2E_BACKEND_PORT="$(free_port 8000)"
    export E2E_CLIENT_PORT="$(free_port 5173)"
    export VITE_PROXY_TARGET="http://127.0.0.1:${E2E_BACKEND_PORT}"
    echo "Local E2E free-port: backend :$E2E_BACKEND_PORT / client :$E2E_CLIENT_PORT"
  fi
  # Stale-server hygiene (issue #197): CI=1 (on the Playwright invocation below)
  # means the webServer never REUSES a stale app, and free_port moved us off any
  # collision - but a lingering uvicorn/vite on the conventional default ports (a
  # prior E2E run, or a deploy whose teardown missed) still serves STALE schema to
  # anything that reaches it. Clear it (TERM, not KILL) before the boot. Never
  # when the caller pre-set the ports (the deploy gate owns that server).
  if [ -z "${BASE_URL:-}" ] && command -v lsof >/dev/null 2>&1; then
    for p in "${E2E_BACKEND_PORT:-8000}" "${E2E_CLIENT_PORT:-5173}"; do
      if lsof -iTCP:"$p" -sTCP:LISTEN -n -P >/dev/null 2>&1; then
        echo "Local E2E: clearing a stale listener on :$p before the webServer boot"
        lsof -ti tcp:"$p" 2>/dev/null | xargs kill 2>/dev/null || true
      fi
    done
  fi
}

# Fail-loud foreign-backend guard. When the backend echoes a serve_id on /health, confirm it
# is THIS project's (CONSORT_SERVE_ID the deploy injected) before running specs: a mismatch
# means a DIFFERENT project holds the proxied port (two projects both defaulting to :8000), so
# the e2e would silently test the WRONG backend and pass/fail misleadingly. Tolerant: no
# CONSORT_SERVE_ID, no curl, a backend not yet up (standalone run boots its own via Playwright),
# or an app that does not echo serve_id (older scaffold) => skip. The deploy gate owns a
# pre-booted backend, so this is where the check bites.
assert_backend_is_ours() {
  [ -n "${CONSORT_SERVE_ID:-}" ] || return 0
  command -v curl >/dev/null 2>&1 || return 0
  local target="${VITE_PROXY_TARGET:-http://127.0.0.1:${E2E_BACKEND_PORT:-8000}}"
  local body seen
  body="$(curl -fsS --max-time 5 "${target%/}/health" 2>/dev/null)" || return 0
  seen="$(printf '%s' "$body" | sed -n 's/.*"serve_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
  [ -n "$seen" ] || return 0
  if [ "$seen" != "${CONSORT_SERVE_ID}" ]; then
    echo "ERROR: the backend at ${target} is a FOREIGN app (serve_id '$seen', expected '${CONSORT_SERVE_ID}') - another project holds this port. Refusing to run the client E2E against the wrong backend; relocate this project's deploy-targets.yaml local base_url to a free port or stop the other server." >&2
    exit 1
  fi
}

if [ "$#" -eq 0 ] && [ -d "$REPO_ROOT/client/tests/e2e" ] \
   && { [ -z "${CONSORT_CYCLE_LAYER:-}" ] || [ "${CONSORT_CYCLE_LAYER:-}" = "E2E" ]; }; then
  client_e2e_spec="$(find "$REPO_ROOT/client/tests/e2e" -type f \( -name '*.spec.ts' -o -name '*.spec.tsx' -o -name '*.spec.js' -o -name '*.spec.mjs' \) 2>/dev/null | head -n 1)"
  if [ -n "$client_e2e_spec" ]; then
    if [ ! -f "$REPO_ROOT/client/package.json" ] || \
       ! { [ -f "$REPO_ROOT/client/playwright.config.ts" ] || [ -f "$REPO_ROOT/client/playwright.config.js" ] || [ -f "$REPO_ROOT/client/playwright.config.mjs" ]; }; then
      echo "ERROR: client E2E specs exist under client/tests/e2e but there is no client/package.json + playwright config to run them - refusing a hollow pass (the entire client E2E class would be silently skipped, a false GREEN)." >&2
      printf '    %s\n' "$client_e2e_spec" >&2
      exit 1
    fi
    # Ensure the client deps + the Playwright browser are present (mirrors the Vitest block's self-heal;
    # --include=dev for the deploy gate's NODE_ENV=production, where devDeps like @playwright/test are omitted).
    if [ ! -x "$REPO_ROOT/client/node_modules/.bin/playwright" ]; then
      echo "client playwright bin missing - installing client deps so the client E2E actually runs..."
      command -v scrub_npm_proxy_lock >/dev/null 2>&1 && scrub_npm_proxy_lock "$REPO_ROOT/client/package-lock.json"
      if [ -f "$REPO_ROOT/client/package-lock.json" ]; then
        ( cd "$REPO_ROOT/client" && npm ci --include=dev )
      else
        ( cd "$REPO_ROOT/client" && npm install --include=dev )
      fi
    fi
    echo "Running client E2E (Playwright)..."
    # Use the client's OWN playwright bin (guaranteed present by the check/install above), not npx,
    # so browser install + the run are deterministic under the deploy gate. install chromium first
    # (playwright test does not auto-install browsers); a failing E2E fails the run (set -e).
    # CI=1: force EVERY playwright.config vintage's reuseExistingServer guard OFF
    # (old `!CI` and new `!!BASE_URL` alike) so the verify never reuses a stale
    # server bound to an unmigrated branch (issue #197's false-500 misdiagnosis).
    ensure_local_e2e_ports
    assert_backend_is_ours
    e2e_rc=0
    # #2 scoped-lane: scope the E2E to THIS AC's @T specs (gated on CONSORT_SCOPE_AC; fleet runs full).
    if [ -n "$SFTDD_CLIENT_GREP" ]; then
      ( cd "$REPO_ROOT/client" && ./node_modules/.bin/playwright install chromium && CI=1 npm run test:e2e -- --grep "$SFTDD_CLIENT_GREP" ) || e2e_rc=$?
    else
      ( cd "$REPO_ROOT/client" && ./node_modules/.bin/playwright install chromium && CI=1 npm run test:e2e ) || e2e_rc=$?
    fi
    # #7 within-cycle reap: Playwright's webServer SHOULD self-tear-down, but a killed/detached run
    # leaves a uvicorn (+ vite) on the E2E ports that otherwise lingers until the NEXT cycle's
    # scan-reaper — so a heavy-E2E cycle's repeated runs pile up. Reap them here, right after the run.
    # NEVER when BASE_URL is set (the deploy gate owns that server, same guard as ensure_local_e2e_ports).
    if [ -z "${BASE_URL:-}" ] && command -v lsof >/dev/null 2>&1; then
      for p in "${E2E_BACKEND_PORT:-}" "${E2E_CLIENT_PORT:-}"; do
        [ -n "$p" ] && lsof -ti tcp:"$p" 2>/dev/null | xargs kill 2>/dev/null || true
      done
    fi
    [ "$e2e_rc" -eq 0 ] || exit "$e2e_rc"
  fi
fi

# Root E2E self-heal (mirrors the client block above). The Playwright E2E block
# that enable-e2e appends BELOW runs `npm run test:e2e` (= `playwright test`) using
# the project ROOT's local bin. But nothing has installed the root's node deps on
# this path: a Python / full-stack root runs its language block (pytest/mvnw), which
# installs NO node deps, and even a Node root can arrive here under the deploy gate's
# NODE_ENV=production, where an earlier install omitted @playwright/test (a devDep).
# Either way the `playwright` bin is absent and the appended e2e run dies with
# "playwright: command not found" , a phantom, not a real failure , so the e2e suite
# is effectively skipped and its ACs green with zero coverage. Install root deps here
# so the root E2E suite ACTUALLY runs, exactly as the client block does for the SPA.
# Gated on a project-root Playwright config (so it fires only when that e2e block
# will), a full run (no path arg), and a root package.json. --include=dev is REQUIRED
# for the same production-gate reason as the client block.
if [ "$#" -eq 0 ] && [ -f "$REPO_ROOT/package.json" ] && { [ -f "$REPO_ROOT/playwright.config.ts" ] || [ -f "$REPO_ROOT/playwright.config.js" ]; }; then
  if [ ! -d "$REPO_ROOT/node_modules" ] || [ ! -x "$REPO_ROOT/node_modules/.bin/playwright" ]; then
    echo "root node_modules / playwright bin missing - installing root deps so the root E2E suite actually runs..."
    command -v scrub_npm_proxy_lock >/dev/null 2>&1 && scrub_npm_proxy_lock "$REPO_ROOT/package-lock.json"
    if [ -f "$REPO_ROOT/package-lock.json" ]; then
      ( cd "$REPO_ROOT" && npm ci --include=dev )
    else
      ( cd "$REPO_ROOT" && npm install --include=dev )
    fi
  fi
  # Allocate free E2E ports before the enable-e2e-appended `npm run test:e2e`
  # block (below) runs, so a stale :8000 / :5173 can't hard-fail its webServer.
  ensure_local_e2e_ports
  assert_backend_is_ours
fi
