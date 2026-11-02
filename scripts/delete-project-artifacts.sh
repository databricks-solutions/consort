#!/usr/bin/env bash
# delete-project-artifacts.sh — FULLY tear down every artifact of a scaffolded Lakebase project.
#
# A `consort` / scm-utils scaffold (createProject) creates FOUR things that must ALL be removed, or
# each run leaks resources: a GitHub repo, a self-hosted GitHub Actions runner, a Lakebase project,
# and a local project directory (plus any live setup.sh / lk / runner processes). This script removes
# all of them, in the safe order, idempotently (best-effort: an already-gone artifact is reported, not
# an error), and verifies the result. It NEVER touches the shared kit cache (~/.cache/consort/*).
#
# Usage:
#   scripts/delete-project-artifacts.sh <project-name> [gh-owner] [databricks-profile]
# Args / env:
#   <project-name>        required — the project == repo name == Lakebase project id == local dir name.
#   gh-owner              default: kevin-hartman   (or $GH_OWNER)
#   databricks-profile    default: $DATABRICKS_CONFIG_PROFILE  (Lakebase purge is SKIPPED if unset)
#   CODE_DIR              where the local project dir lives (default: $HOME/code)
#
# Order matters: stop local processes first (so nothing re-creates the dir mid-teardown), then delete
# the GitHub repo (which also de-registers its repo-scoped self-hosted runner server-side), then hard
# -purge the Lakebase project (permanent — no undelete), then remove the local dir + runner dir.

set -uo pipefail

PROJECT="${1:-}"
if [ -z "$PROJECT" ]; then
  echo "usage: $(basename "$0") <project-name> [gh-owner] [databricks-profile]" >&2
  exit 2
fi
OWNER="${2:-${GH_OWNER:-kevin-hartman}}"
PROFILE="${3:-${DATABRICKS_CONFIG_PROFILE:-}}"
CODE_DIR="${CODE_DIR:-$HOME/code}"

echo "== delete-project-artifacts: ${OWNER}/${PROJECT} =="

# 1. Kill any live processes for this project so the local dir cannot be re-created mid-teardown.
echo "-- 1. stop processes (setup.sh / lk / self-hosted runner)"
pkill -9 -f "setup.sh ${PROJECT}"            2>/dev/null && echo "   killed setup.sh ${PROJECT}"            || true
pkill -9 -f "runners/${PROJECT}"             2>/dev/null && echo "   killed runner procs for ${PROJECT}"   || true
pkill -9 -f "Runner.Listener.*${PROJECT}"    2>/dev/null && echo "   killed Runner.Listener for ${PROJECT}" || true
sleep 1

# 2. GitHub repo (deleting the repo de-registers its repo-scoped self-hosted runner too).
echo "-- 2. GitHub repo"
if gh repo view "${OWNER}/${PROJECT}" >/dev/null 2>&1; then
  gh repo delete "${OWNER}/${PROJECT}" --yes && echo "   deleted ${OWNER}/${PROJECT}"
else
  echo "   already absent"
fi

# 3. Lakebase project — HARD purge (permanent; no undelete).
echo "-- 3. Lakebase project (hard purge)"
if [ -n "$PROFILE" ]; then
  if databricks postgres get-project "projects/${PROJECT}" --profile "$PROFILE" >/dev/null 2>&1; then
    databricks postgres delete-project "projects/${PROJECT}" --purge --profile "$PROFILE" \
      && echo "   purged projects/${PROJECT}"
  else
    echo "   already absent"
  fi
else
  echo "   SKIPPED — pass a databricks profile (arg 3) or set DATABRICKS_CONFIG_PROFILE"
fi

# 4. Local project dir + self-hosted runner dir.
echo "-- 4. local directories"
rm -rf "${CODE_DIR}/${PROJECT}" "${HOME}/.lakebase/runners/${PROJECT}" \
  && echo "   removed ${CODE_DIR}/${PROJECT} and ~/.lakebase/runners/${PROJECT}"

# 5. Verify nothing remains.
echo "== verify =="
gh repo view "${OWNER}/${PROJECT}" >/dev/null 2>&1 && echo "   repo: STILL PRESENT ✗" || echo "   repo: gone ✓"
if [ -n "$PROFILE" ]; then
  databricks postgres get-project "projects/${PROJECT}" --profile "$PROFILE" >/dev/null 2>&1 \
    && echo "   lakebase: STILL PRESENT ✗" || echo "   lakebase: gone ✓"
fi
[ -d "${CODE_DIR}/${PROJECT}" ]          && echo "   dir: STILL PRESENT ✗"    || echo "   dir: gone ✓"
[ -d "${HOME}/.lakebase/runners/${PROJECT}" ] && echo "   runner: STILL PRESENT ✗" || echo "   runner: gone ✓"
echo "== done: ${PROJECT} =="
