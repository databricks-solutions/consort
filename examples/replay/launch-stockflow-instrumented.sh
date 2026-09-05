#!/usr/bin/env bash
# Launch the instrumented live re-record of stockflow-rerecord as an INTERACTIVE-MIMIC capture:
# TWO sprints driven from a real /sprint, the Human Proxy standing in for the HIL, recording EVERY
# turn + routing-decisions.jsonl + the run-level correspondence.jsonl (the orchestrator<->proxy
# exchange). One-shot, unattended (proxy auto-answers YES through the whole lifecycle , spec/plan/
# accept/deploy/promote gates , for both sprints).
#
# TWO SPRINTS (shared project): stockflow-rerecord-s1 ships F1-stock-visibility, then
# stockflow-rerecord-s2 ships F6-split-tracking-code. The SECOND run reuses the same project dir
# (_replay-smoke.sh sets FRESH=0 when the project's .git exists, so it skips scaffold + goes straight
# to the sprint's planning + feature drive), so s2 builds on s1's merged state , the real sprint cadence.
#
# Env is prepared here (the capture engine requires DATABRICKS_HOST + GITHUB_OWNER EXPORTED;
# _replay-smoke.sh does not source the test config itself). Kit resolution is the ONE split-brain-safe
# path (resolve_kit_single_source, wired in _replay-smoke.sh).
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

STAMP="${STAMP:-$(date +%Y%m%d-%H%M%S)}"
REC="$REPO_ROOT/examples/replay/captures/stockflow-instrumented-$STAMP"
SCEN="$REPO_ROOT/examples/replay/corpora/stockflow-rerecord"
CORPUS="$SCEN/recorded-artifacts"
PROJECT_NAME="stockflow-instrumented-$STAMP"
PROJECT_DIR="$HOME/code/tdd-workflow-smoke/$PROJECT_NAME"

# The TWO sprints, in order, each paired with the feature it ships. The launcher loops these; the
# first scaffolds the project, the second reuses it (FRESH=0). Format: "<sprint> <feature>".
SPRINTS=(
  "stockflow-rerecord-s1 F1-stock-visibility"
  "stockflow-rerecord-s2 F6-split-tracking-code"
)

# CRITICAL (the launcher bug that killed the first live capture): --corpus sets ONLY CORPUS_DIR (the
# recorded design/build artifacts). INTAKE is a SEPARATE dir resolved from REPLAY_INTAKE_DIR (defaults
# to bug-tracker!). Point it at THIS scenario's intake so the proxy supplies stockflow's
# product-overview/nfrs/design-brief in-run, not bug-tracker's.
export REPLAY_INTAKE_DIR="$SCEN/intake"
mkdir -p "$REC"

# --- env prep (source config, resolve host from profile) ---
[[ -f "$REPO_ROOT/.env.template.test.config" ]] && . "$REPO_ROOT/.env.template.test.config"
[[ -f "$REPO_ROOT/.env.local.test.config" ]] || { echo "MISSING .env.local.test.config" >&2; exit 1; }
. "$REPO_ROOT/.env.local.test.config"
PROFILE="${DATABRICKS_CONFIG_PROFILE:-}"
if [[ -z "${DATABRICKS_HOST:-}" ]]; then
  [[ -n "$PROFILE" ]] || { echo "set DATABRICKS_CONFIG_PROFILE or DATABRICKS_HOST" >&2; exit 1; }
  RAW="$(databricks auth describe --profile "$PROFILE" -o json 2>&1 || true)"
  DATABRICKS_HOST="$(printf '%s\n' "$RAW" | python3 -c "import json,sys; t=sys.stdin.read(); s=t.find('{'); print('' if s<0 else (json.loads(t[s:]).get('details') or {}).get('host','').rstrip('/'))" 2>/dev/null || echo "")"
fi
[[ -n "$DATABRICKS_HOST" ]] || { echo "could not resolve DATABRICKS_HOST from profile '$PROFILE'" >&2; exit 1; }
export DATABRICKS_HOST DATABRICKS_CONFIG_PROFILE="$PROFILE"
export GITHUB_OWNER="${GITHUB_OWNER:-${LAKEBASE_TEST_GITHUB_OWNER:-}}"
[[ -n "$GITHUB_OWNER" ]] || { echo "set LAKEBASE_TEST_GITHUB_OWNER" >&2; exit 1; }

# --- recording + unattended resume ---
export LAKEBASE_CONSORT_RECORD_DIR="$REC"   # turns/ + routing-decisions.jsonl + correspondence.jsonl
export LAKEBASE_CONSORT_AUTO_CONTINUE=1        # auto-confirm the navigator pause (unattended)
# Manifest-steps path is ON (the executor is the sole agent path + the route-contract seam fires). It
# is ON by default, but set it EXPLICITLY here so a stray USE_MANIFEST_STEPS=0 in the environment can
# never silently drop the capture onto the retired legacy dispatch. (The flag is not retired , it does
# not prevent capture , per the "flag on unless it blocks" rule; keep it pinned on for the capture.)
export LAKEBASE_SFTDD_USE_MANIFEST_STEPS=1

echo "[launch] record dir : $REC"
echo "[launch] project    : $PROJECT_NAME  ($PROJECT_DIR)"
echo "[launch] host       : $DATABRICKS_HOST  owner=$GITHUB_OWNER  profile=$PROFILE"
echo "[launch] sprints    : ${SPRINTS[*]}"

# Drive each sprint in order on the SHARED project. run-capture.sh -> _replay-smoke.sh scaffolds on the
# first (FRESH=1) and reuses on the second (FRESH=0, .git present). Each --sprint runs the PLANNING lane
# (proxy supplies the feature-request THROUGH author-requests + intake via supply, IDENTICAL to
# interactive) then drives design+build+deploy+promote to done with the proxy approving every gate. The
# kickoff + correspondence for each sprint land under the same RECORD_DIR (per-sprint /sprint entries).
i=0
for pair in "${SPRINTS[@]}"; do
  sprint="${pair%% *}"; feature="${pair##* }"
  i=$((i + 1))
  echo ""
  echo "════════════════════════════════════════════════════════════════════"
  echo "[launch] SPRINT $i/${#SPRINTS[@]}: $sprint  ships  $feature"
  echo "════════════════════════════════════════════════════════════════════"
  # RESUME idempotence: on a re-launch of a partially-complete capture, a sprint whose
  # feature already shipped must be SKIPPED. run-capture re-claims the feature, but the SCM
  # ladder can only hold one active claim; a completed feature's re-claim fails
  # `already-claimed-other` and halts the whole capture even though there is nothing left to
  # do for it. The done-oracle is the DRIVE'S OWN SCM-derived derivation , the SAME one the
  # in-band sprint loop uses (drive.cli isFeatureShipped: planNextAction().kind === "done",
  # which requires promote.merged, itself derived from the SCM workflow-state, NOT from
  # pipeline story-status). We reuse it via `consort-drive --dry-run` so the launcher and the
  # drive never disagree. The pipeline all-stories-done shortcut was WRONG: every story can be
  # `done` while the feature has NOT been PR-reviewed + merged to the parent (promote), so it
  # marked an un-promoted feature "shipped" and skipped it (the ✓ BOTH sprints false-positive).
  # The drive dry-run reads only local disk (SCM workflow-state.json + gate markers), so this is
  # cheap + network-free. The scaffolded `lk` shim exists only on a resume (FRESH=0) , exactly
  # when a skip is possible; on the first, fresh sprint there is nothing to skip.
  _lk="$PROJECT_DIR/scripts/lk"
  if [[ -x "$_lk" ]]; then
    _next="$("$_lk" consort-drive --feature "$feature" --project-dir "$PROJECT_DIR" --dry-run 2>/dev/null || true)"
    if printf '%s' "$_next" | python3 -c "import json,sys; d=json.load(sys.stdin); sys.exit(0 if (d.get('action') or {}).get('kind')=='done' else 1)" 2>/dev/null; then
      echo "[launch] SPRINT $i ($sprint): feature $feature already shipped (drive dry-run: next action = done) , skipping (resume)"
      continue
    fi
  fi
  bash "$REPO_ROOT/examples/replay/run-capture.sh" \
    --tiers 2 \
    --corpus "$CORPUS" \
    --feature "$feature" \
    --sprint "$sprint" \
    --project-name "$PROJECT_NAME" \
    --project-dir "$PROJECT_DIR" \
    || { echo "[launch] SPRINT $i ($sprint) FAILED , halting the capture" >&2; exit 2; }
done

echo ""
echo "[launch] ✓ BOTH sprints complete , capture at $REC"
echo "[launch]   correspondence: $REC/correspondence.jsonl   turns: $REC/turns/   routing: $REC/routing-decisions.jsonl"
