#!/usr/bin/env bash
# Replay a recorded Consort scenario end to end (the live, workspace-backed
# integration test). A scenario lives at examples/replay/<name>/ as a
# self-contained corpus (recorded-artifacts/ + recorded-build/ + turns/) plus a
# scenario.json manifest; see SCENARIOS.md.
#
# This is a THIN wrapper over the shared replay engine
# examples/replay/_replay-smoke.sh (replay_smoke): for
# each feature in the manifest, in order, it replays that feature's DESIGN lane
# and restores its recorded BUILD, then drives the deterministic orchestrator to
# the chosen handoff. Multi-feature scenarios chain in ONE project so later
# features build on the earlier ones' merged state (the DB lineage the capture
# recorded).
#
# Usage:
#   replay-scenario.sh --scenario <name> [--to navigator|release-engineer]
#                      [--kit-ref <ref>] [--project-dir <dir>]
# Env: DATABRICKS_HOST, GITHUB_OWNER, a CLI profile (same as run-smoke.sh).
#      LAKEBASE_CONSORT_AUTO_CONTINUE=1 auto-confirms the handoff gate (CI).
# Exit: 0 ok; 2 bad args / missing scenario; non-zero from a failed replay step.
set -euo pipefail

# The machinery dir (examples/replay/); scenarios live under its corpora/ subdir.
REPLAY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCEN_DIR_ROOT="${REPLAY_ROOT}/corpora"
ENGINE="${REPLAY_ROOT}/_replay-smoke.sh"
# Reuse the existing assertion library (deploy-gate / story-pipeline / workflow-state).
export REPLAY_ASSERT_DIR="${REPLAY_ROOT}/assertions"

SCENARIO=""
TO="release-engineer"
KIT_REF=""
PROJECT_DIR=""
SPRINT=""   # opt-in: when set, replay the PLANNING lane once (for the first feature's project)
PLAN_ONLY=0 # opt-in: with --sprint, replay ONLY the planning lane then STOP (no feature drive)
while [[ $# -gt 0 ]]; do
  case "$1" in
    --scenario)    SCENARIO="$2"; shift 2 ;;
    --to)          TO="$2"; shift 2 ;;
    --kit-ref)     KIT_REF="$2"; shift 2 ;;
    --project-dir) PROJECT_DIR="$2"; shift 2 ;;
    --sprint)      SPRINT="$2"; shift 2 ;;   # opt-in: replay the PLANNING lane for the FIRST feature
    --plan-only)   PLAN_ONLY=1; shift ;;     # opt-in: replay ONLY planning (requires --sprint), then stop
    -h|--help)     sed -n '1,22p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "replay-scenario: unknown arg: $1" >&2; exit 2 ;;
  esac
done
[[ "$PLAN_ONLY" == "1" && -z "$SPRINT" ]] && { echo "replay-scenario: --plan-only requires --sprint <name>" >&2; exit 2; }

[[ -n "$SCENARIO" ]] || { echo "replay-scenario: --scenario <name> is required" >&2; exit 2; }
SCEN="${SCEN_DIR_ROOT}/${SCENARIO}"
MANIFEST="${SCEN}/scenario.json"
[[ -f "$MANIFEST" ]] || { echo "replay-scenario: no scenario.json at ${MANIFEST}" >&2; exit 2; }

# Pull manifest fields (node is always available alongside the kit).
read_field() { node -e "const m=require('${MANIFEST}');process.stdout.write(String(${1}))"; }
TIERS="$(read_field "m.tiers ?? 2")"
PAUSE_DEFAULT="$(read_field "m.pauseBefore ?? 'release-engineer'")"
[[ "$TO" == "release-engineer" ]] && TO="$PAUSE_DEFAULT"
# Feature ids, in order; plus a parallel buildReplay flag list. Read line-by-line
# (no `mapfile`, which is bash 4+; macOS ships bash 3.2) so the script is portable.
FEATURES=(); while IFS= read -r _l; do FEATURES+=("$_l"); done \
  < <(node -e "require('${MANIFEST}').features.forEach(f=>console.log(f.id))")
BUILD_REPLAY=(); while IFS= read -r _l; do BUILD_REPLAY+=("$_l"); done \
  < <(node -e "require('${MANIFEST}').features.forEach(f=>console.log(f.buildReplay===false?'0':'1'))")

# Per-scenario intake docs (each scenario ships its own product-overview / nfrs /
# design-brief next to the manifest); fall back to the corpus design dir.
if [[ -f "${SCEN}/intake/product-overview.md" ]]; then
  export REPLAY_INTAKE_DIR="${SCEN}/intake"
else
  export REPLAY_INTAKE_DIR="${SCEN}/recorded-artifacts"
fi
export LAKEBASE_SFTDD_REPLAY_BUILD_DIR="${SCEN}/recorded-build"

# One project for the whole scenario, so feature N+1 builds on feature N's merged
# state (the recorded DB + git lineage). Default name is scenario-scoped.
PROJECT_DIR="${PROJECT_DIR:-$HOME/code/tdd-workflow-smoke/${SCENARIO}-replay-$(date +%Y%m%d-%H%M%S)}"

# shellcheck source=/dev/null
source "$ENGINE"

i=0
for FID in "${FEATURES[@]}"; do
  # A feature's drive cd's into the project; restore a stable, absolute cwd before
  # the next feature so nothing downstream depends on where the last one left us.
  cd "$SCEN_DIR_ROOT"
  SMOKE_NAME="replay-scenario:${SCENARIO}:${FID}"
  PAUSE_BEFORE="$TO"
  REPLAY_BUILD="${BUILD_REPLAY[$i]}"
  echo "[replay-scenario] ${SCENARIO} feature ${FID} (build-replay=${REPLAY_BUILD}, to=${PAUSE_BEFORE})" >&2
  args=( --scenario-noop )  # placeholder to keep the array non-empty under set -u
  args=( --tiers "$TIERS" --feature "$FID" --corpus "${SCEN}/recorded-artifacts" --project-dir "$PROJECT_DIR" )
  [[ -n "$KIT_REF" ]] && args+=( --kit-ref "$KIT_REF" )
  # Replay the PLANNING lane ONCE, on the FIRST feature (it scaffolds the project); the engine
  # runs it only when FRESH==1, so later features never re-plan even if --sprint were repeated.
  [[ -n "$SPRINT" && $i -eq 0 ]] && args+=( --sprint "$SPRINT" )
  # --plan-only: with --sprint on the FIRST feature, replay ONLY the planning lane then stop (the
  # engine returns after planning-complete, no feature drive). A plan-only corpus has no build turns.
  [[ "$PLAN_ONLY" == "1" && $i -eq 0 ]] && args+=( --plan-only )
  replay_smoke "${args[@]}"
  i=$((i + 1))
done

echo "[replay-scenario] ${SCENARIO} replay complete (${#FEATURES[@]} feature(s))" >&2
