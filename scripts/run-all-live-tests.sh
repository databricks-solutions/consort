#!/usr/bin/env bash
# Run the kit's FULL test suite, including every env-gated live test,
# against a real Databricks workspace. One command, one project, all
# env vars set sensibly.
#
# Differs from scripts/run-live-tests.sh:
#   - Auto-resolves DATABRICKS_HOST from a `databricks` CLI profile.
#   - Provisions a fresh Lakebase project on demand (or accepts an
#     existing project id via --project).
#   - Sets every additional env var the kit's tests gate on
#     (LAKEBASE_TEST_INITIALIZR, PEER_DEP_INTEGRATION, the four
#     LAKEBASE_TEST_INSTANCE/BRANCH/PARENT/HOST identifiers, etc.).
#   - Defaults to NO TEARDOWN on failure (the kit's convention; failed
#     state must survive for inspection). Use --teardown to delete the
#     provisioned project after a green run.
#
# Usage:
#   scripts/run-all-live-tests.sh --profile <name>                       # auto-provision + full suite
#   scripts/run-all-live-tests.sh --profile <name> --project <id>        # reuse an existing project
#   scripts/run-all-live-tests.sh --profile <name> --teardown            # delete the project on green
#   scripts/run-all-live-tests.sh --profile <name> --no-prompt           # CI mode (skip grace period)
#   scripts/run-all-live-tests.sh --profile <name> \
#     --project-prefix smoke-ci- --grace-seconds 10 --database my_db     # fully parameterized invocation
#
# Required:
#   --profile <name>     A `databricks` CLI profile (from ~/.databrickscfg).
#                        DATABRICKS_HOST is auto-resolved via
#                        `databricks auth env --profile <name>`.
#
# Optional:
#   --project <id>             Use an existing Lakebase project (skips auto-provision).
#                              Default branch is auto-discovered via list-branches.
#   --branch <name>            Override LAKEBASE_TEST_BRANCH (default: project's default branch).
#   --parent <name>            Override LAKEBASE_TEST_PARENT (default: same as --branch).
#   --project-prefix <prefix>  Prefix for auto-provisioned project ids. Default: "live-all-".
#                              The full id becomes <prefix><unix-timestamp>.
#   --grace-seconds <n>        Seconds to wait before creating the project (Ctrl-C abort
#                              window). Default: 5. Use 0 + --no-prompt for CI.
#   --teardown                 After a green run, delete the auto-provisioned project.
#                              No-op when --project was supplied.
#   --no-prompt                Skip the grace period entirely (for CI).
#   --no-github-runner         Skip the self-hosted-runner live test
#                              (default: enabled). Requires GitHub auth on the
#                              host (gh CLI logged in or GITHUB_TOKEN env).
#   --no-migrate-tools         Skip auto-provisioning alembic/flyway tools and
#                              leave migrate-live + migrate-live-flyway gated
#                              on whatever is already on PATH (default: enabled).
#                              migrate-live-knex self-provisions via `npm install`
#                              in beforeAll, no script-level prep needed.
#   --help                     This help.
#
# What this script unlocks (every live-gated test in the kit):
#   - All LAKEBASE_TEST_E2E-gated suites (cut-experiment, paired-branch,
#     branch-create/delete, branch-utils, branch-endpoint, etc.).
#   - migrate-live + migrate-live-flyway via auto-provisioned venv + tools.
#   - migrate-live-knex (slice 3) via per-suite `npm install`.
#   - tdd-experiment-lifecycle live describe (LAKEBASE_TEST_PROJECT_PATH).
#   - detect-language-via-self-hosted-runner via --include-github-runner
#     (LAKEBASE_TEST_E2E_GITHUB=1; pass --no-github-runner to opt out).
# A clean run reports zero contributor-actionable skips. Skips that remain
# are pure assertion-shape decisions inside the test files themselves
# (e.g. kit-config defaults vs env overrides).
#
# Configuration model (two surfaces, by persona):
#   Kit users      set LAKEBASE_KIT_* in their app's env / shell (substrate
#                  behavior: registries, TTL caps, timeouts).
#   Contributors   set BOTH LAKEBASE_KIT_* + LAKEBASE_TEST_* in
#                  .env.local.test.config (gitignored, sourced below). One file
#                  per machine; no per-flag duplication.
# Per-run choices (which project, which branch, whether to teardown) stay
# as CLI flags above. Everything else (database name, GitHub owner, TTL
# overrides) lives in .env.local.test.config; you set it once.
#
# What this script gates on (substrate convention):
#   LAKEBASE_TEST_NO_TEARDOWN=1 is set by default. The orchestrator-level
#   Lakebase project (live-all-<ts>) is preserved on a failed run so the
#   user can inspect; pass --teardown to delete on a fully-green run.
#   Per-suite ephemera (migrate-7091, migrate-7098 Lakebase projects, the
#   GitHub repo + runner) clean themselves up on green and
#   preserve on fail. The orchestrator and per-suite teardown rules are
#   independent; LAKEBASE_TEST_NO_TEARDOWN does NOT block per-suite
#   cleanup of green tests.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

red()    { printf '\033[31m%s\033[0m\n' "$*"; }
green()  { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
blue()   { printf '\033[34m%s\033[0m\n' "$*"; }

PROFILE=""
PROJECT_ID=""
BRANCH_OVERRIDE=""
PARENT_OVERRIDE=""
PROJECT_PREFIX="live-all-"
GRACE_SECONDS=5
TEARDOWN_ON_GREEN=0
NO_PROMPT=0
INCLUDE_GITHUB_RUNNER=1
INCLUDE_MIGRATE_TOOLS=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile)            PROFILE="$2"; shift 2 ;;
    --project)            PROJECT_ID="$2"; shift 2 ;;
    --branch)             BRANCH_OVERRIDE="$2"; shift 2 ;;
    --parent)             PARENT_OVERRIDE="$2"; shift 2 ;;
    --project-prefix)     PROJECT_PREFIX="$2"; shift 2 ;;
    --grace-seconds)      GRACE_SECONDS="$2"; shift 2 ;;
    --teardown)           TEARDOWN_ON_GREEN=1; shift ;;
    --no-prompt)          NO_PROMPT=1; shift ;;
    --no-github-runner)   INCLUDE_GITHUB_RUNNER=0; shift ;;
    --no-migrate-tools)   INCLUDE_MIGRATE_TOOLS=0; shift ;;
    --database|--feature-ttl-days|--github-owner)
      red "$1 was removed: set LAKEBASE_TEST_DATABASE / LAKEBASE_KIT_FEATURE_BRANCH_TTL_MS / LAKEBASE_TEST_GITHUB_OWNER in .env.local.test.config instead."
      exit 2
      ;;
    --help|-h)
      # `sed '$d'` drops the trailing `set -euo pipefail` line that closes
      # the range. Cross-platform: `head -n -1` is GNU-only (BSD head on
      # macOS errors with "illegal line count -- -1").
      sed -n '2,/^set -euo pipefail/p' "$0" | sed 's/^# \{0,1\}//' | sed '$d'
      exit 0
      ;;
    *)
      red "Unknown flag: $1"
      red "See $0 --help"
      exit 2
      ;;
  esac
done

if ! [[ "$GRACE_SECONDS" =~ ^[0-9]+$ ]]; then
  red "--grace-seconds must be a non-negative integer (got: $GRACE_SECONDS)"
  exit 2
fi

if [[ -z "$PROFILE" ]]; then
  red "--profile is required."
  red "See $0 --help"
  exit 2
fi

# Load .env.template.test.config (public defaults, committed) then
# .env.local.test.config (local overrides, gitignored). Both use `export
# VAR=value` so values propagate to child processes (npx vitest, etc.).
# Variables passed inline at script invocation are stomped by the
# template; if you need an invocation-time override, set it in
# .env.local.test.config or pass via the script's --flags.
if [[ -f "$REPO_ROOT/.env.template.test.config" ]]; then
  blue "==> Sourcing .env.template.test.config (public defaults)"
  # shellcheck source=/dev/null
  . "$REPO_ROOT/.env.template.test.config"
fi
if [[ -f "$REPO_ROOT/.env.local.test.config" ]]; then
  blue "==> Sourcing .env.local.test.config (local overrides)"
  # shellcheck source=/dev/null
  . "$REPO_ROOT/.env.local.test.config"
fi

blue "==> Resolving workspace host from profile '$PROFILE'"
if ! command -v databricks >/dev/null 2>&1; then
  red "  databricks CLI not on PATH"
  red "  install: https://docs.databricks.com/dev-tools/cli/install.html"
  exit 1
fi

# `databricks auth env` was deprecated in CLI v1.1.0; the new replacement
# is `databricks auth describe -o json` which still reports the host from
# ~/.databrickscfg even when the token cache is invalidated by a CLI
# upgrade (auth describe degrades gracefully).
# The new JSON shape is { details: { host: "https://..." }, ... }; we
# tolerate a non-JSON preamble (some CLI builds prefix a warning or
# auth-error line) by trimming to the first `{`.
RAW_AUTH_DESCRIBE="$(databricks auth describe --profile "$PROFILE" -o json 2>&1 || true)"
DATABRICKS_HOST="$(printf '%s\n' "$RAW_AUTH_DESCRIBE" | python3 -c "
import json, sys
text = sys.stdin.read()
start = text.find('{')
if start < 0:
  print('')
  sys.exit(0)
try:
  d = json.loads(text[start:])
  host = (d.get('details') or {}).get('host', '')
  if isinstance(host, str):
    print(host.rstrip('/'))
  else:
    print('')
except Exception:
  print('')
")"

if [[ -z "$DATABRICKS_HOST" ]]; then
  red "  Could not resolve DATABRICKS_HOST from profile '$PROFILE'."
  red "  Try: databricks auth login --profile $PROFILE"
  exit 1
fi
green "  DATABRICKS_HOST = $DATABRICKS_HOST"
export DATABRICKS_HOST
export DATABRICKS_CONFIG_PROFILE="$PROFILE"

# Token freshness reminder. OAuth tokens from `databricks auth login` rotate
# silently; PAT-based profiles stay until revoked. The 60-second sanity probe
# below catches expired tokens before we attempt destructive ops.
blue "==> Auth sanity check (current-user me)"
if ! databricks current-user me --profile "$PROFILE" -o json >/dev/null 2>&1; then
  red "  Auth probe failed. Token may be expired."
  red "  Try: databricks auth login --profile $PROFILE"
  exit 1
fi
green "  auth OK"

# Resolve or provision the Lakebase project.
PROVISIONED=0
if [[ -n "$PROJECT_ID" ]]; then
  blue ""
  blue "==> Using existing Lakebase project: $PROJECT_ID"
  if ! databricks postgres get-project "projects/$PROJECT_ID" --profile "$PROFILE" -o json >/dev/null 2>&1; then
    red "  Project '$PROJECT_ID' not found on $DATABRICKS_HOST"
    exit 1
  fi
  green "  project exists, READY"
else
  PROJECT_ID="${PROJECT_PREFIX}$(date +%s)"
  yellow ""
  yellow "==> About to create a fresh Lakebase project"
  yellow "    workspace:  $DATABRICKS_HOST"
  yellow "    project:    $PROJECT_ID  (NEW)"
  yellow "    teardown:   $( [[ $TEARDOWN_ON_GREEN == 1 ]] && echo 'on green run' || echo 'DISABLED – manual cleanup required at end' )"
  yellow ""
  if [[ "$NO_PROMPT" != "1" ]]; then
    yellow "    Press Ctrl-C in the next ${GRACE_SECONDS} seconds to abort. Pass --no-prompt to skip in CI, or --grace-seconds to tune."
    sleep "$GRACE_SECONDS"
  fi
  blue "==> Creating Lakebase project $PROJECT_ID (long-running, ~30s)"
  databricks postgres create-project "$PROJECT_ID" --profile "$PROFILE" -o json >/dev/null
  PROVISIONED=1
  green "  created: $PROJECT_ID"
fi

# Resolve the default branch name (leaf of name, never uid – see
# scripts/lakebase/branch-id.ts for the rationale).
DEFAULT_BRANCH="$(databricks postgres list-branches "projects/$PROJECT_ID" --profile "$PROFILE" -o json 2>&1 | python3 -c "
import json, sys
try:
  d = json.load(sys.stdin)
  items = d if isinstance(d, list) else d.get('branches') or d.get('items') or []
  for b in items:
    if (b.get('status') or {}).get('default') or b.get('is_default'):
      name = b.get('name', '')
      print(name.split('/branches/')[-1] if '/branches/' in name else '')
      break
except Exception:
  pass
")"

if [[ -z "$DEFAULT_BRANCH" ]]; then
  red "  Could not resolve default branch for project $PROJECT_ID"
  exit 1
fi
green "  default branch (leaf, not uid): $DEFAULT_BRANCH"

BRANCH="${BRANCH_OVERRIDE:-$DEFAULT_BRANCH}"
PARENT="${PARENT_OVERRIDE:-$BRANCH}"

# Export everything every env-gated test in the kit looks at. The list was
# derived by greping process.env.* across tests/. Each block notes which
# tests are unlocked.
blue ""
blue "==> Exporting env vars"
export LAKEBASE_TEST_E2E=1
export LAKEBASE_TEST_INSTANCE="$PROJECT_ID"
export LAKEBASE_TEST_BRANCH="$BRANCH"
export LAKEBASE_TEST_PARENT="$PARENT"
export LAKEBASE_TEST_HOST="$DATABRICKS_HOST"
export LAKEBASE_TEST_PROFILE="$PROFILE"
# Optional fields: only set when the user provides them. Tests have
# sensible defaults if absent.
export LAKEBASE_TEST_COMPARISON_BRANCH="${LAKEBASE_TEST_COMPARISON_BRANCH:-$BRANCH}"
# LAKEBASE_TEST_DATABASE, LAKEBASE_KIT_FEATURE_BRANCH_TTL_MS,
# LAKEBASE_TEST_GITHUB_OWNER: all read from the caller's env (sourced from
# .env.local.test.config by the kit's entry point). Set them there once per
# machine; no per-flag duplication in this script.
if [[ -n "${LAKEBASE_TEST_DATABASE:-}" ]]; then
  green "  LAKEBASE_TEST_DATABASE=$LAKEBASE_TEST_DATABASE"
fi
if [[ -n "${LAKEBASE_KIT_FEATURE_BRANCH_TTL_MS:-}" ]]; then
  green "  LAKEBASE_KIT_FEATURE_BRANCH_TTL_MS=$LAKEBASE_KIT_FEATURE_BRANCH_TTL_MS"
fi
if [[ -n "${LAKEBASE_TEST_GITHUB_OWNER:-}" ]]; then
  green "  LAKEBASE_TEST_GITHUB_OWNER=$LAKEBASE_TEST_GITHUB_OWNER  (unlocks gates-state-machine-e2e-live + lakebase-pr-cli-live)"
else
  yellow "  LAKEBASE_TEST_GITHUB_OWNER unset  (gates-state-machine-e2e-live + lakebase-pr-cli-live will skip)"
  yellow "    Set in .env.local.test.config to unlock those suites."
fi
# Unlock the live Initializr fetch + the MCP peer-dep integration check.
# Both are network/integration-side and the gate is just a "yes please".
export LAKEBASE_TEST_INITIALIZR=1
export PEER_DEP_INTEGRATION=1
# Substrate convention: failed live runs MUST leave the project + branches
# in place so the user can inspect. Only --teardown switches this off, and
# even then only after a fully-green run.
export LAKEBASE_TEST_NO_TEARDOWN=1

green "  LAKEBASE_TEST_INSTANCE=$LAKEBASE_TEST_INSTANCE"
green "  LAKEBASE_TEST_BRANCH=$LAKEBASE_TEST_BRANCH  LAKEBASE_TEST_PARENT=$LAKEBASE_TEST_PARENT"
green "  LAKEBASE_TEST_E2E=1  LAKEBASE_TEST_INITIALIZR=1  PEER_DEP_INTEGRATION=1"
green "  LAKEBASE_TEST_NO_TEARDOWN=1  (per substrate convention)"

# Provision the per-suite tooling that migrate-live + migrate-live-flyway
# gate on (alembic, sqlalchemy, psycopg2-binary; flyway + java). Both
# blocks are idempotent: a cached venv / Flyway tree skips download.
# Pass --no-migrate-tools to leave PATH untouched (e.g. on machines with
# the tools pre-installed via brew / apt).
FLYWAY_VERSION="10.20.1"
if [[ "$INCLUDE_MIGRATE_TOOLS" -eq 1 ]]; then
  VENV="$REPO_ROOT/.venv-live-tests"
  if [[ ! -x "$VENV/bin/alembic" ]]; then
    blue ""
    blue "==> Provisioning Python venv at $VENV (one-time setup, alembic + deps)"
    python3 -m venv "$VENV"
    "$VENV/bin/pip" install --quiet --upgrade pip
    "$VENV/bin/pip" install --quiet alembic sqlalchemy psycopg2-binary
  fi
  green "  using alembic from $VENV/bin/alembic"
  export PATH="$VENV/bin:$PATH"

  FLYWAY_HOME="$REPO_ROOT/.tools-live-tests/flyway-$FLYWAY_VERSION"
  if command -v flyway >/dev/null 2>&1; then
    green "  using flyway from $(command -v flyway) (pre-installed)"
  elif [[ -x "$FLYWAY_HOME/flyway" ]]; then
    green "  using flyway from $FLYWAY_HOME/flyway (cached)"
    export PATH="$FLYWAY_HOME:$PATH"
  else
    blue ""
    blue "==> Provisioning Flyway CLI $FLYWAY_VERSION at $FLYWAY_HOME (one-time setup)"
    mkdir -p "$REPO_ROOT/.tools-live-tests"
    ZIP="$REPO_ROOT/.tools-live-tests/flyway-commandline-$FLYWAY_VERSION.zip"
    MAVEN_CENTRAL="${LAKEBASE_KIT_REGISTRY_MAVEN_CENTRAL:-https://repo1.maven.org/maven2}"
    URL="${MAVEN_CENTRAL%/}/org/flywaydb/flyway-commandline/$FLYWAY_VERSION/flyway-commandline-$FLYWAY_VERSION.zip"
    if [[ ! -f "$ZIP" ]]; then
      if ! curl --fail --silent --show-error --location -o "$ZIP" "$URL"; then
        red ""
        red "  Could not download Flyway from $URL"
        yellow "  Workarounds: install Flyway via brew/apt and re-run, or pass --no-migrate-tools."
        exit 1
      fi
    fi
    unzip -q -d "$REPO_ROOT/.tools-live-tests" "$ZIP"
    rm -f "$ZIP"
    if [[ ! -x "$FLYWAY_HOME/flyway" ]]; then
      red "  flyway extracted but $FLYWAY_HOME/flyway is missing or not executable"
      exit 1
    fi
    green "  using flyway from $FLYWAY_HOME/flyway"
    export PATH="$FLYWAY_HOME:$PATH"
  fi
fi

# self-hosted-runner suite: register a real runner against a
# fresh private repo and prove npx --package=github:... routing works
# end-to-end. Defaults to enabled (per the "no exceptions" policy) and
# opts out via --no-github-runner. Requires GitHub auth on the host
# (gh CLI logged in OR GITHUB_TOKEN env). The test creates a real repo
# scoped to the contributor's login; on assertion FAIL the repo and
# runner are preserved per the kit's never-teardown-on-failure rule.
if [[ "$INCLUDE_GITHUB_RUNNER" -eq 1 ]]; then
  export LAKEBASE_TEST_E2E_GITHUB=1
  if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
    green "  LAKEBASE_TEST_E2E_GITHUB=1  (gh CLI auth detected)"
  elif [[ -n "${GITHUB_TOKEN:-}" ]]; then
    green "  LAKEBASE_TEST_E2E_GITHUB=1  (GITHUB_TOKEN env detected)"
  else
    yellow "  LAKEBASE_TEST_E2E_GITHUB=1  (no gh auth or GITHUB_TOKEN visible)"
    yellow "  The suite will error fast if auth cannot be resolved at run-time."
    yellow "  To opt out, re-run with --no-github-runner."
  fi
else
  yellow "  --no-github-runner: skipping self-hosted-runner suite"
fi

# Fetch the recorded corpora (they live in the consort-examples repo, not this one)
# so the live replay / build-support / per-agent tests resolve their inputs. Idempotent.
blue ""
blue "==> Fetching recorded corpora (consort-examples)"
"$REPO_ROOT/scripts/fetch-examples.sh"

# Build dist so the integration tests import the latest compiled substrate.
blue ""
blue "==> Building dist/"
npm run build >/dev/null
green "  dist ready"

# Run the full suite. vitest discovers every test; the env above unlocks
# each gated describe block.
blue ""
blue "==> Running full suite (vitest, every gated describe unlocked)"
RUN_STATUS=0
npx vitest run 2>&1 | tee /tmp/run-all-live-tests.out || RUN_STATUS=$?

green ""
green "==> Run complete (exit $RUN_STATUS)"
SKIP_COUNT="$(grep -oE 'Tests +[0-9]+ passed.*[0-9]+ skipped' /tmp/run-all-live-tests.out | tail -1 || true)"
[[ -n "$SKIP_COUNT" ]] && yellow "  $SKIP_COUNT"

if [[ "$RUN_STATUS" -eq 0 && "$TEARDOWN_ON_GREEN" -eq 1 && "$PROVISIONED" -eq 1 ]]; then
  yellow ""
  yellow "==> Green run + --teardown specified. Deleting $PROJECT_ID..."
  # --purge = HARD delete: never leave a soft-deleted tombstone that keeps the name reserved
  # (a later scaffold with the same --project-name then hits "a soft-deleted tombstone exists").
  if databricks postgres delete-project "projects/$PROJECT_ID" --purge --profile "$PROFILE" 2>&1 | tail -3; then
    green "  deleted $PROJECT_ID"
  else
    red "  delete failed; manual cleanup needed:"
    red "    databricks postgres delete-project projects/$PROJECT_ID --purge --profile $PROFILE"
  fi
elif [[ "$PROVISIONED" -eq 1 ]]; then
  yellow ""
  yellow "==> Project preserved (per never-teardown-on-failure convention):"
  yellow "    project:    $PROJECT_ID"
  yellow "    workspace:  $DATABRICKS_HOST"
  yellow "    cleanup:    databricks postgres delete-project projects/$PROJECT_ID --purge --profile $PROFILE"
fi

exit "$RUN_STATUS"
