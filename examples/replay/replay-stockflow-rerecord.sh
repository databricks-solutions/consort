#!/usr/bin/env bash
# One-line launcher: replay the recorded `stockflow-rerecord` corpus END TO END through the
# UNIFIED manifest-driven dispatch , the agent turns run through the shipped executor with the
# step-aware REPLAY agent (no model spawns), while the orchestrator drives the full state machine
# (gates, dispatch, deploy, promote) live on a REAL project. This is the standing mechanics
# regression: it proves the recorded corpus still drives cleanly after a refactor, and it is the
# proof that gates removing the legacy commandsForAction agent-turn arms.
#
# It does the whole setup a bare `replay-scenario.sh` leaves to you:
#   1. rebuild dist IF STALE (so the replay exercises THIS checkout's source, not old compiled code);
#   2. source .env.template.test.config + .env.local.test.config (the gitignored config home);
#   3. resolve DATABRICKS_HOST from the CLI profile (databricks auth describe) + map GITHUB_OWNER;
#   4. turn ON the manifest-driven executor (USE_MANIFEST_STEPS) + point the replay dirs at the corpus;
#   5. delegate to replay-scenario.sh (chains F1 -> F6 in ONE project, ships both sprints to the
#      release-engineer handoff incl deploy/promote against Lakebase + GitHub).
#
# FULL CLOUD: this scaffolds a real repo + runner + Lakebase project. Requires the config home to
# resolve a host + a profile authenticated (`databricks auth login --profile <p>`) + gh auth.
#
# Usage:  bash examples/replay/replay-stockflow-rerecord.sh [--to navigator|release-engineer] [--sprint <name>|--no-sprint]
# Env:    everything comes from .env.local.test.config (profile/host/owner); no flags needed.
#
# --sprint <name> (DEFAULT: stockflow-rerecord-s1) replays the PLANNING lane once, on the first
# feature's project, BEFORE the feature drive: spec-author/propose + architect/estimate dispatch
# through the manifest-driven StepExecutor (look for `[executor] dispatch ...propose/estimate...`),
# while author-requests stays deterministic. Pass --no-sprint to skip planning and drive features only.
set -euo pipefail

SCEN_DIR_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"   # examples/replay (machinery dir; corpora/ underneath)
REPO_ROOT="$(cd "$SCEN_DIR_ROOT/../.." && pwd)"                 # repo root (two up)
SCENARIO="stockflow-rerecord"
TO="release-engineer"
SPRINT="stockflow-rerecord-s1"   # default: replay the recorded PLANNING lane for sprint 1 (executor-dispatched)
while [[ $# -gt 0 ]]; do
  case "$1" in
    --to)         TO="$2"; shift 2 ;;
    --sprint)     SPRINT="$2"; shift 2 ;;
    --no-sprint)  SPRINT=""; shift ;;
    *)    echo "replay-stockflow-rerecord: unknown arg '$1' (only --to <handoff>, --sprint <name>, --no-sprint)" >&2; exit 2 ;;
  esac
done

blue()  { printf '\033[34m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
red()   { printf '\033[31m%s\033[0m\n' "$*"; }

cd "$REPO_ROOT"

# ── 1. Rebuild dist ONLY if stale ─────────────────────────────────────────────
# The replay runs against THIS checkout's built dist (LAKEBASE_KIT_DIR defaults to it). If any
# source is newer than the build sentinel, rebuild; else skip (tsup is fast but not free). Uses a
# committed dist file as the sentinel so a fresh clone (no dist) also triggers a build.
SENTINEL="dist/consort/orchestrator/drive/claude-runner.js"
if [[ ! -f "$SENTINEL" ]] || [[ -n "$(find consort bin -name '*.ts' -newer "$SENTINEL" -print -quit 2>/dev/null)" ]]; then
  blue "==> dist is stale (or absent) , building"
  npm run build >/dev/null
  green "  dist rebuilt"
else
  green "  dist up to date (no source newer than $SENTINEL) , skipping build"
fi

# ── 2. Source the config home ─────────────────────────────────────────────────
if [[ -f "$REPO_ROOT/.env.template.test.config" ]]; then
  # shellcheck source=/dev/null
  . "$REPO_ROOT/.env.template.test.config"
fi
if [[ -f "$REPO_ROOT/.env.local.test.config" ]]; then
  blue "==> Sourcing .env.local.test.config"
  # shellcheck source=/dev/null
  . "$REPO_ROOT/.env.local.test.config"
else
  red "  .env.local.test.config not found , set DATABRICKS_CONFIG_PROFILE + LAKEBASE_TEST_GITHUB_OWNER there."
  exit 1
fi

# ── 3. Resolve DATABRICKS_HOST from the profile + map GITHUB_OWNER ─────────────
PROFILE="${DATABRICKS_CONFIG_PROFILE:-}"
if [[ -z "${DATABRICKS_HOST:-}" ]]; then
  [[ -n "$PROFILE" ]] || { red "  set DATABRICKS_CONFIG_PROFILE (or DATABRICKS_HOST) in .env.local.test.config"; exit 1; }
  command -v databricks >/dev/null 2>&1 || { red "  databricks CLI not on PATH"; exit 1; }
  RAW="$(databricks auth describe --profile "$PROFILE" -o json 2>&1 || true)"
  DATABRICKS_HOST="$(printf '%s\n' "$RAW" | python3 -c "
import json, sys
t = sys.stdin.read(); s = t.find('{')
if s < 0: print(''); sys.exit(0)
try:
  d = json.loads(t[s:]); h = (d.get('details') or {}).get('host', '')
  print(h.rstrip('/') if isinstance(h, str) else '')
except Exception: print('')
")"
fi
[[ -n "$DATABRICKS_HOST" ]] || { red "  Could not resolve DATABRICKS_HOST from profile '$PROFILE'. Try: databricks auth login --profile $PROFILE"; exit 1; }
export DATABRICKS_HOST
export DATABRICKS_CONFIG_PROFILE="$PROFILE"
# The replay engine expects GITHUB_OWNER; the config exports LAKEBASE_TEST_GITHUB_OWNER.
export GITHUB_OWNER="${GITHUB_OWNER:-${LAKEBASE_TEST_GITHUB_OWNER:-}}"
[[ -n "$GITHUB_OWNER" ]] || { red "  set LAKEBASE_TEST_GITHUB_OWNER in .env.local.test.config (the replay scaffolds a repo under it)"; exit 1; }
green "  DATABRICKS_HOST=$DATABRICKS_HOST  GITHUB_OWNER=$GITHUB_OWNER  profile=$PROFILE"

# ── 4. Turn on the manifest-driven executor ───────────────────────────────────
# USE_MANIFEST_STEPS routes agent turns THROUGH the shipped executor; combined with the REPLAY_DIR
# the delegate sets (see below), the executor resolves the step-aware REPLAY agent for each agent
# turn (Stage G). The REPLAY dirs themselves are exported by replay-scenario.sh / _replay-smoke.sh
# from the scenario's own recorded-artifacts/ + recorded-build/ , we do NOT set them here (that is
# the delegate's job; setting them twice would risk drift). LAKEBASE_KIT_DIR defaults to this
# checkout's dist (deterministic, offline). AUTO_CONTINUE auto-confirms the handoff gate (headless).
export LAKEBASE_SFTDD_USE_MANIFEST_STEPS=1
export LAKEBASE_CONSORT_AUTO_CONTINUE=1

# ── 5. Delegate to the generic scenario replay ────────────────────────────────
# --sprint (when set) replays the PLANNING lane once on the first feature: propose + estimate
# dispatch through the executor (grep the log for `[executor] dispatch`), author-requests deterministic.
args=( --scenario "$SCENARIO" --to "$TO" )
[[ -n "$SPRINT" ]] && args+=( --sprint "$SPRINT" )
blue "==> Replaying $SCENARIO end to end (manifest-driven executor + step-aware replay, to=$TO${SPRINT:+, sprint=$SPRINT})"
bash "$SCEN_DIR_ROOT/replay-scenario.sh" "${args[@]}"
green "==> $SCENARIO replay complete"
