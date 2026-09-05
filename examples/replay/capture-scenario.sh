#!/usr/bin/env bash
# Capture a new Consort replay scenario: drive a real feature live with the per-turn
# recorder on, recording straight into examples/replay/<name>/ so the
# result is immediately a committable, replayable integration-test corpus. This
# is the "record once" half of the loop whose "replay forever" half is
# replay-scenario.sh; see SCENARIOS.md.
#
# It is a thin wrapper around the kit drive (consort-drive) with the
# recorder env pointed at the scenario dir:
#   LAKEBASE_CONSORT_RECORD_DIR        = <scenario>/            (turns/ + recorded-artifacts/)
#   LAKEBASE_CONSORT_RECORD_BUILD_DIR  = <scenario>/recorded-build
# The recorder (consort/logging/turn-recorder.ts) writes every state-machine turn;
# at the end the agent-log is reconstituted (consort-log --reconstitute).
#
# Usage:
#   # Against an existing scaffolded project (design may be replayed if a corpus
#   # is staged; otherwise live):
#   capture-scenario.sh --scenario <name> --project-dir <dir> --feature <id> [...]
#                       [--pause-before navigator|release-engineer]
#
#   # Fully automated: create a fresh project, stage the scenario's intake, and
#   # run the FULL LIVE design lane (no replay) + build, recorded end to end:
#   capture-scenario.sh --scenario <name> --create --project-name <n> \
#     --databricks-host <url> --github-owner <o> --tiers 2 [--ui] \
#     --inputs-from <corpus-dir> --feature <id> [--feature <id> ...] \
#     [--pause-before release-engineer]
#   # --inputs-from reads intake/{product-overview,nfrs,design-brief}.md +
#   # recorded-artifacts/features/<id>/feature-request.md from that dir (the
#   # scenario's own inputs); recording still goes to <this scenario>/.
#
#   # Sprint mode: drive the PLANNING lane too (emits backlog.json) with the
#   # backlog scoped to EXACTLY the --feature ids, instead of the per-feature loop:
#   capture-scenario.sh --scenario <name> --create ... \
#     --sprint <sprint-name> --feature F1-... --feature F6-...
#   # The whole-sprint orchestrator plans to the plan gate (sync-backlog projects
#   # backlog.json from just these features), then claims + drives each. The
#   # feature-requests are supplied to planning via LAKEBASE_CONSORT_SPRINT_REQUESTS.
#
#   # Plan-only: capture JUST the planning lane (propose/estimate via the executor +
#   # author-requests/sync-backlog/estimate-committed/gate-plan) and STOP at
#   # planning-complete , no feature drive. Requires --sprint:
#   capture-scenario.sh --scenario <name> --create ... \
#     --sprint <name> --feature <F1> --plan-only
# Env: DATABRICKS_HOST, DATABRICKS_CONFIG_PROFILE, GITHUB_OWNER.
#      LAKEBASE_CONSORT_AUTO_CONTINUE=1 to run headless (required for --create).
#      Do NOT set LAKEBASE_KIT_DIR: the script refuses it (it would split-brain
#      the orchestrator vs the claude -p agents). The script instead pins one dev
#      ref (CAPTURE_KIT_REF, default sftdd-capture-local) symlinked to THIS kit
#      checkout for both, and asserts the project resolves it. See CAPTURE-RUNBOOK.md.
# Exit: 0 ok; 2 bad args.
#
# NOTE: a capture is a full live drive (real agents + workspace); it is the
# expensive authoring step, not a CI test. The cheap always-on guard is
# tests/bdd/consort-scenarios.test.ts; the live replay is replay-scenario.sh.
set -euo pipefail

# The machinery dir (examples/replay/); scenarios/corpora live under its corpora/ subdir.
REPLAY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCEN_DIR_ROOT="${REPLAY_ROOT}/corpora"
SCENARIO=""
PROJECT_DIR=""
PAUSE_BEFORE=""
# --only <phase>: bound the per-feature drive to ONE lane (design|build|deploy),
# threaded to `consort-drive --only`. The optimize launcher uses
# `--only design` to scaffold + drive the design lane and STOP cleanly at the
# build boundary, so the per-handoff sweep takes the build turns from there.
ONLY=""
# --plan-only: sprint mode only , drive the PLANNING lane to planning-complete + STOP (no per-feature
# claim/drive), so the capture records JUST the plan turns (propose/estimate via the executor +
# author-requests/sync-backlog/estimate-committed/gate-plan) into the scenario. The result is a
# planning-only corpus that replays identically on the current state machine.
PLAN_ONLY=""
# --no-drive: scaffold + stage intake + CLAIM the feature, but do NOT run the
# drive. The optimize LANE sweep needs the project positioned at the start of the
# design lane (claimed, nothing designed) so IT owns + experiments on every design
# turn, rather than capture-scenario driving them straight (un-swept).
NO_DRIVE=""
FEATURES=()
# --sprint <name>: drive the whole-sprint orchestrator (planning -> plan gate ->
# per-feature claim+drive) instead of the per-feature loop, so the capture
# exercises the PLANNING lane and emits backlog.json. REPEATABLE: each --sprint
# opens a new sprint whose backlog is the --feature ids that FOLLOW it, so
#   --sprint s1 --feature F1 --sprint s2 --feature F6
# drives s1 (backlog F1) then s2 (backlog F6) in order on the ONE project. A
# single --sprint with several --features puts them all in that one sprint.
SPRINT=""                 # legacy single-sprint name (last --sprint; back-compat)
SPRINT_NAMES=()           # ordered sprint names
SPRINT_FEATS=()           # parallel: space-separated feature ids per sprint
CUR_SPRINT_IDX=-1         # index of the sprint --feature currently attaches to
# --create: scaffold a fresh project + stage the scenario's own intake (the FULL
# LIVE design lane, no replay), so one command does create -> stage -> claim ->
# drive+record. Intake lives at <scenario>/intake/{product-overview,nfrs,design-brief}.md
# and per-feature <scenario>/recorded-artifacts/features/<id>/feature-request.md.
CREATE=""
PROJECT_NAME=""
DATABRICKS_HOST_ARG=""
GITHUB_OWNER_ARG=""
TIERS=2
UI=""
INPUTS_FROM=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --scenario)       SCENARIO="$2"; shift 2 ;;
    --project-dir)    PROJECT_DIR="$2"; shift 2 ;;
    --feature)
      FEATURES+=("$2")
      # A --feature after a --sprint belongs to that sprint's backlog.
      if [[ $CUR_SPRINT_IDX -ge 0 ]]; then
        SPRINT_FEATS[$CUR_SPRINT_IDX]="${SPRINT_FEATS[$CUR_SPRINT_IDX]} $2"
      fi
      shift 2 ;;
    --sprint)
      SPRINT="$2"
      SPRINT_NAMES+=("$2")
      SPRINT_FEATS+=("")
      CUR_SPRINT_IDX=$(( ${#SPRINT_NAMES[@]} - 1 ))
      shift 2 ;;
    --pause-before)   PAUSE_BEFORE="$2"; shift 2 ;;
    --only)           ONLY="$2"; shift 2 ;;
    --plan-only)      PLAN_ONLY=1; shift ;;   # sprint mode: capture the PLANNING lane, then STOP (no feature drive)
    --no-drive)       NO_DRIVE=1; shift ;;
    --create)         CREATE=1; shift ;;
    --project-name)   PROJECT_NAME="$2"; shift 2 ;;
    --databricks-host) DATABRICKS_HOST_ARG="$2"; shift 2 ;;
    --github-owner)   GITHUB_OWNER_ARG="$2"; shift 2 ;;
    --tiers)          TIERS="$2"; shift 2 ;;
    --ui)             UI=1; shift ;;
    # Where the intake + per-feature feature-request INPUTS come from (a scenario
    # dir with intake/ + recorded-artifacts/features/<id>/feature-request.md).
    # Defaults to the record scenario dir; point at an existing corpus to record
    # a fresh live run from the SAME inputs into a NEW scenario dir.
    --inputs-from)    INPUTS_FROM="$2"; shift 2 ;;
    -h|--help)        sed -n '1,47p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "capture-scenario: unknown arg: $1" >&2; exit 2 ;;
  esac
done

[[ -n "$SCENARIO" ]]    || { echo "capture-scenario: --scenario <name> is required" >&2; exit 2; }
[[ ${#FEATURES[@]} -gt 0 ]] || { echo "capture-scenario: at least one --feature <id> is required" >&2; exit 2; }
[[ -n "$PROJECT_DIR" || -n "$CREATE" ]] || { echo "capture-scenario: --project-dir <dir> OR --create is required" >&2; exit 2; }

# Absolutize --inputs-from NOW, while the CWD is still the invocation dir: it is
# consumed AFTER `cd "$PROJECT_DIR"` (intake staging in --create, the feature-request
# reads in the drive loop), so a RELATIVE path would otherwise resolve against the
# project dir and vanish (the "recorded source not found" refusal). Fail loud here
# rather than deep in the human-proxy.
if [[ -n "$INPUTS_FROM" ]]; then
  INPUTS_FROM="$(cd "$INPUTS_FROM" 2>/dev/null && pwd -P)" \
    || { echo "capture-scenario: --inputs-from directory not found: $INPUTS_FROM" >&2; exit 2; }
fi

SCEN="${SCEN_DIR_ROOT}/${SCENARIO}"

# ── Single-source kit resolution (makes the stale-shim / split-brain impossible) ──
# The orchestrator (this script + consort-drive) and the `claude -p` role
# agents resolve the kit SEPARATELY: agents do NOT inherit env, so they read the
# ref from the project's .lakebase/kit-ref and load it from the shared cache,
# while LAKEBASE_KIT_DIR only redirects the orchestrator. Setting only
# LAKEBASE_KIT_DIR therefore runs the agents on a DIFFERENT (often stale `main`)
# kit than the driver. To force EVERYONE onto ONE kit , this working tree , we pin
# a dev ref whose cache slot is a symlink to this checkout, export it for the
# orchestrator, and write it into the project for the agents. Never LAKEBASE_KIT_DIR.
# Shared single source for local-kit pinning (cache symlink + recovery hint),
# used here AND by the teardown/restart coordinators so the wiring lives once.
source "${REPLAY_ROOT}/lib/pin-local-kit.sh"
# ONE kit resolution via the shared resolver: pins the local CAPTURE_KIT_REF's cache slot to THIS
# working tree + refuses LAKEBASE_KIT_DIR (split-brain), so orchestrator AND the env-less claude -p
# agents load identical bits. assert_kit_single_source (the lib's; called per-project below) writes
# the ref hint into each scaffolded project. This script was the reference impl; it is now a caller.
CAPTURE_KIT_REF="${CAPTURE_KIT_REF:-$LOCAL_KIT_REF_DEFAULT}"
resolve_kit_single_source "${REPLAY_ROOT}" "" "$CAPTURE_KIT_REF" || exit 2
KIT_ROOT="$KIT_SINGLE_ROOT"

# ── --create: scaffold a fresh project + stage this scenario's intake, then run
#    the FULL LIVE design lane (no replay) so the design roles + the pre-build
#    reflection gate all run live and are recorded. ─────────────────────────────
if [[ -n "$CREATE" ]]; then
  KIT_LK="$(kit_lk_path "$KIT_ROOT")" || exit 1
  HOST="${DATABRICKS_HOST_ARG:-${DATABRICKS_HOST:?--databricks-host or DATABRICKS_HOST required}}"
  OWNER="${GITHUB_OWNER_ARG:-${GITHUB_OWNER:?--github-owner or GITHUB_OWNER required}}"
  PROJECT_NAME="${PROJECT_NAME:-${SCENARIO}-cap-$(date +%Y%m%d-%H%M%S)}"
  PARENT="${CAPTURE_PARENT_DIR:-$HOME/code/tdd-workflow-smoke}"
  PROJECT_DIR="${PARENT}/${PROJECT_NAME}"
  INPUTS="${INPUTS_FROM:-$SCEN}"
  INTAKE_DIR="${INPUTS}/intake"
  [[ -f "${INTAKE_DIR}/product-overview.md" ]] || { echo "capture-scenario: missing ${INTAKE_DIR}/product-overview.md (inputs from ${INPUTS})" >&2; exit 2; }
  [[ -d "$PROJECT_DIR/.git" ]] && { echo "capture-scenario: project exists: $PROJECT_DIR" >&2; exit 1; }
  mkdir -p "$PARENT"
  # The scenario MANIFEST is the single source for this project's conditions. Read
  # them via the tested reader and funnel them into create-project as flags , the
  # ONE way in. uiTrack (persisted to consort-config.json) drives BOTH the drive's UX
  # lane AND the e2e harness (create-project derives e2e from it); language/runner
  # come from the manifest, not a harness hardcode. Degrades to the --ui flag when
  # the reader bin is absent (stale dist).
  #
  # An IN-PROGRESS scenario holds its manifest as scenario.json.pending (so
  # consort-scenarios.test.ts does not treat the unfinished dir as a shippable corpus;
  # it is renamed to scenario.json only at finalization). That .pending file IS the
  # authored manifest, so a capture/optimize run must read it: prefer scenario.json,
  # fall back to scenario.json.pending. Without this fallback every condition
  # silently defaults (java, no UI), scaffolding the WRONG stack (Finding: the
  # stockflow-optimize first live run provisioned Spring Boot/Java, not python+UI).
  SCENARIO_MANIFEST="${INPUTS}/scenario.json"
  [[ -f "$SCENARIO_MANIFEST" ]] || SCENARIO_MANIFEST="${INPUTS}/scenario.json.pending"
  # Warn LOUD when the conditions reader is missing (unbuilt/stale dist): sc() then
  # returns empty for every field and the run silently scaffolds the WRONG stack
  # (java, no UI, wrong tiers) instead of the manifest's , the exact silent-default
  # failure the comment above records. Non-fatal (we still degrade to the --ui flag).
  SC_CLI="${KIT_ROOT}/dist/bin/consort/scenario-conditions.cli.js"
  [[ -f "$SC_CLI" ]] || echo "capture-scenario: WARNING , conditions reader missing (${SC_CLI}); scenario conditions will DEFAULT (run 'npm run build' in the kit). Scaffolding may use the wrong language/UI/tiers." >&2
  sc() { node "$SC_CLI" --manifest "$SCENARIO_MANIFEST" --field "$1" 2>/dev/null || true; }
  SC_UI="$(sc uiTrack)"; SC_LANG="$(sc language)"; SC_RUNNER="$(sc runner)"; SC_TIERS="$(sc tiers)"
  create_flags=(--tiers "${SC_TIERS:-$TIERS}")
  [[ "$SC_UI" == "true" || -n "$UI" ]] && create_flags+=(--ui-track)
  [[ -n "$SC_LANG" ]] && create_flags+=(--language "$SC_LANG")
  [[ -n "$SC_RUNNER" ]] && create_flags+=(--runner "$SC_RUNNER")
  # AGENT_MODELS (optional): space-separated <role>=<model> pairs, threaded into
  # create-project as repeated --agent-model flags (persisted to consort-config.json,
  # which the drive reads per turn). Lets a capture pin a weak-point role to a
  # stronger model, e.g. AGENT_MODELS='test-strategist=opus'.
  for _pair in ${AGENT_MODELS:-}; do create_flags+=(--agent-model "$_pair"); done

  echo "[capture-scenario] create ${PROJECT_NAME} on ${HOST} (owner ${OWNER}; conditions ${SCENARIO_MANIFEST}: uiTrack=${SC_UI:-false} lang=${SC_LANG:-<default>} runner=${SC_RUNNER:-<default>} tiers=${SC_TIERS:-$TIERS})" >&2
  bash "$KIT_LK" --warm || { echo "capture-scenario: kit --warm failed" >&2; exit 1; }
  bash "$KIT_LK" lakebase-create-project \
    --project-name "$PROJECT_NAME" --parent-dir "$PARENT" \
    --databricks-host "$HOST" --github-owner "$OWNER" \
    "${create_flags[@]}" \
    || { echo "capture-scenario: create-project failed" >&2; exit 1; }

  cd "$PROJECT_DIR"
  clk() { "$PROJECT_DIR/scripts/lk" "$@"; }
  # Stage the intake on the ENTRY TIER , the branch features fork from , not main.
  # A feature git branch is forked from `origin/<entry-tier>` (staging by default,
  # per convention-branches), so intake committed on main NEVER reaches the feature
  # branch (main was already diverged when the tiers were cut), and the spec-author
  # correctly refuses to draft with no feature-request.md on the feature branch.
  # Commit intake on the entry tier and PUSH it so the fork inherits it.
  ENTRY_TIER="${CAPTURE_ENTRY_TIER:-staging}"
  git rev-parse --verify "$ENTRY_TIER" >/dev/null 2>&1 \
    || { ENTRY_TIER="main"; git rev-parse --verify main >/dev/null 2>&1 || ENTRY_TIER="master"; }
  git checkout "$ENTRY_TIER" >/dev/null 2>&1 || { echo "capture-scenario: cannot checkout entry tier '${ENTRY_TIER}'" >&2; exit 1; }
  SFTDD_DIR="$(clk lakebase-resolve-consort-dir --project-dir "$PROJECT_DIR")"
  SFTDD_REL="$(basename "$SFTDD_DIR")"
  # Stage the project intake (the "3 original inputs") via the Human Proxy, then
  # each feature's feature-request (the per-feature design input).
  clk consort-human-proxy supply --from "${INTAKE_DIR}/product-overview.md" --to "${SFTDD_DIR}/product-overview.md" --artifact product-overview.md
  clk consort-human-proxy supply --from "${INTAKE_DIR}/nfrs.md" --to "${SFTDD_DIR}/nfrs.md" --artifact nfrs.md
  [[ -f "${INTAKE_DIR}/design-brief.md" ]] && clk consort-human-proxy supply --from "${INTAKE_DIR}/design-brief.md" --to "${SFTDD_DIR}/design/design-brief.md" --artifact design-brief.md
  git add "${SFTDD_REL}" >/dev/null 2>&1 || true
  git commit -m "intake: project product-overview + nfrs + design-brief" >/dev/null 2>&1 || true
  # PER-FEATURE mode: pre-seed each feature-request on the entry tier so the fork
  # inherits it. SPRINT mode does NOT pre-seed: the planning lane authors the
  # feature-requests LIVE (the proxy-as-PO author-requests step, fed by
  # LAKEBASE_CONSORT_SPRINT_REQUESTS), and runSprint's commitAndPushRequests commits
  # + pushes them to origin AFTER the plan gate, BEFORE the first fork. Pre-seeding
  # here would defeat the point of exercising the planning lane.
  if [[ ${#SPRINT_NAMES[@]} -eq 0 ]]; then
    for FID in "${FEATURES[@]}"; do
      FR="${INPUTS}/recorded-artifacts/features/${FID}/feature-request.md"
      [[ -f "$FR" ]] || { echo "capture-scenario: missing feature-request for ${FID} at ${FR}" >&2; exit 2; }
      mkdir -p "${SFTDD_DIR}/features/${FID}"
      cp "$FR" "${SFTDD_DIR}/features/${FID}/feature-request.md"
      git add "${SFTDD_REL}/features/${FID}/feature-request.md" >/dev/null 2>&1 || true
      git commit -m "plan: feature-request for ${FID}" >/dev/null 2>&1 || true
    done
  fi
  # Push the entry tier so the feature branch (forked from origin/<entry-tier>)
  # inherits the intake. This is the throwaway capture project's OWN remote.
  # Retry with backoff: a transient DNS/network blip (github.com briefly
  # unresolvable) must not abort a whole capture setup that already provisioned
  # the project + tiers. Fail loud only after the retries are exhausted.
  push_ok=""
  for attempt in 1 2 3 4 5; do
    if git push origin "$ENTRY_TIER" >/dev/null 2>&1; then push_ok=1; break; fi
    echo "capture-scenario: push to origin/${ENTRY_TIER} failed (attempt ${attempt}/5); retrying in $((attempt * 5))s..." >&2
    sleep $((attempt * 5))
  done
  [[ -n "$push_ok" ]] || { echo "capture-scenario: failed to push intake to origin/${ENTRY_TIER} after 5 attempts (check network/VPN to github.com)" >&2; exit 1; }
  # NOTE: do NOT claim here. Only ONE feature may be claimed at a time, so each
  # feature is claimed right before its own drive (in the drive loop below) and
  # released when that drive finishes, then the next is claimed.
  echo "[capture-scenario] created + staged intake on '${ENTRY_TIER}' (pushed) ${PROJECT_DIR}; design lane runs LIVE" >&2
fi

mkdir -p "$SCEN"
export LAKEBASE_CONSORT_RECORD_DIR="$SCEN"
export LAKEBASE_CONSORT_RECORD_BUILD_DIR="${SCEN}/recorded-build"

cd "$PROJECT_DIR"
# Pin + verify the project resolves the SAME kit as the orchestrator BEFORE any
# agent runs (both --create and --project-dir modes). Aborts on drift.
assert_kit_single_source "$PROJECT_DIR"
lk() { "$PROJECT_DIR/scripts/lk" "$@"; }
SFTDD_DIR="$(lk lakebase-resolve-consort-dir --project-dir "$PROJECT_DIR")"

pause_args=(); [[ -n "$PAUSE_BEFORE" ]] && pause_args=( --pause-before "$PAUSE_BEFORE" )
only_args=(); [[ -n "$ONLY" ]] && only_args=( --only "$ONLY" )
plan_args=(); [[ -n "$PLAN_ONLY" ]] && plan_args=( --plan-only )
if [[ -n "$PLAN_ONLY" && ${#SPRINT_NAMES[@]} -eq 0 ]]; then
  echo "capture-scenario: --plan-only requires --sprint <name> (it captures the planning lane)" >&2; exit 2
fi

if [[ ${#SPRINT_NAMES[@]} -gt 0 ]]; then
  # ── Sprint mode: drive the whole-sprint orchestrator per sprint IN ORDER
  #    (planning -> plan gate -> per-feature claim+drive), so the capture exercises
  #    the PLANNING lane and emits backlog.json. Each sprint's backlog is EXACTLY
  #    its own --feature group, and the feature-requests are authored LIVE by the
  #    planning lane (NOT pre-seeded above):
  #      - LAKEBASE_CONSORT_SPRINT_REQUESTS supplies THIS sprint's recorded requests
  #        to the planning author-requests step (proxy-as-PO), so sync-backlog
  #        projects the backlog from just this sprint's features; AND
  #      - runSprint's commitAndPushRequests commits + pushes the just-authored
  #        requests to origin/<entry-tier> after the plan gate and before the first
  #        fork, so each feature branch (forked from origin) inherits its request.
  #    The sprint driver claims each backlog feature itself, so do NOT claim per
  #    feature here. Sprints run sequentially on the ONE project; the driver clears
  #    the prior feature/sprint's terminal coarse phase at each feature start
  #    (resetStaleTerminalPhase), so sprint 2 does not inherit sprint 1's "shipped".
  REQ_SRC="${INPUTS_FROM:-$SCEN}"
  for si in "${!SPRINT_NAMES[@]}"; do
    sname="${SPRINT_NAMES[$si]}"
    # shellcheck disable=SC2206
    sfeats=(${SPRINT_FEATS[$si]})
    [[ ${#sfeats[@]} -gt 0 ]] || { echo "capture-scenario: sprint '${sname}' has no --feature after it" >&2; exit 2; }
    reqs=""
    for FID in "${sfeats[@]}"; do
      FR="${REQ_SRC}/recorded-artifacts/features/${FID}/feature-request.md"
      [[ -f "$FR" ]] || { echo "capture-scenario: --sprint '${sname}' needs a recorded feature-request for ${FID} at ${FR}" >&2; exit 2; }
      reqs+="${FID}"$'\t'"${FR}"$'\n'
    done
    export LAKEBASE_CONSORT_SPRINT_REQUESTS="$reqs"
    echo "[capture-scenario] recording ${SCENARIO} SPRINT '${sname}' (backlog: ${sfeats[*]}) into ${SCEN}" >&2
    # Honor the drive's exit code: a raise-to-HIL (or any failure) exits non-zero,
    # and the sprint's feature is still claimed. Advancing to the NEXT sprint would
    # then trip `already-claimed-other` on the open feature. Stop the capture here
    # so the human resolves the escalation and re-runs (the drive is resumable).
    if ! lk consort-drive --sprint "$sname" --project-dir "$PROJECT_DIR" --gates proxy ${pause_args[@]+"${pause_args[@]}"} ${only_args[@]+"${only_args[@]}"} ${plan_args[@]+"${plan_args[@]}"}; then
      rc=$?
      echo "[capture-scenario] sprint '${sname}' halted (drive exit ${rc}); stopping before later sprints." >&2
      exit "$rc"
    fi
    # --plan-only: the planning lane is the whole capture; consort-drive --plan-only stops at
    # planning-complete (no per-feature claim/drive inside the orchestrator), so record just the
    # plan turns and move to the next sprint (if any) rather than any feature build.
    [[ -n "$PLAN_ONLY" ]] && echo "[capture-scenario] sprint '${sname}' PLAN-ONLY captured (stopped at planning-complete)" >&2
  done
else
  for FID in "${FEATURES[@]}"; do
    # In --create mode each feature is claimed HERE (from trunk), right before its
    # own drive, so only one feature is ever claimed at a time; the prior feature's
    # drive released its claim. (In --project-dir mode the caller owns claiming.)
    if [[ -n "$CREATE" ]]; then
      git checkout main >/dev/null 2>&1 || git checkout master >/dev/null 2>&1 || true
      lk lakebase-scm-claim-feature-branch "${FID}" --project-dir "$PROJECT_DIR" --json \
        || { echo "capture-scenario: claim ${FID} failed" >&2; exit 2; }
    fi
    if [[ -n "$NO_DRIVE" ]]; then
      # Scaffold + claim only: the optimize lane sweep owns the drive from here, so
      # it can experiment on every design handoff instead of them being driven straight.
      echo "[capture-scenario] --no-drive: ${FID} scaffolded + claimed; drive NOT run (the sweep takes it from here)." >&2
      continue
    fi
    echo "[capture-scenario] recording ${SCENARIO} feature ${FID} into ${SCEN}" >&2
    lk consort-drive --feature "$FID" --project-dir "$PROJECT_DIR" --gates proxy ${pause_args[@]+"${pause_args[@]}"} ${only_args[@]+"${only_args[@]}"}
  done
fi

# Reconstitute stitches a RECORDED design-lane log (agent-log.design.jsonl) onto
# the live build timeline; it only applies to a replay/partial capture that has
# such a corpus. A fully-live capture designs live (straight into the project's
# agent-log.jsonl) and produces no design-lane log, so reconstitute does not
# apply , run it only when the design log exists, else skip cleanly (not as an
# error). The design log lives at the corpus root, matching the replay scripts.
DESIGN_LOG="${SCEN}/agent-log.design.jsonl"
if [ -f "$DESIGN_LOG" ]; then
  echo "[capture-scenario] reconstituting agent-log onto the recorded timeline" >&2
  lk consort-log --reconstitute --design-log "$DESIGN_LOG" --tdd-dir "$SFTDD_DIR" \
    || echo "[capture-scenario] reconstitute skipped" >&2
else
  echo "[capture-scenario] no recorded design-lane log (design ran live); skipping reconstitute" >&2
fi
echo "[capture-scenario] ${SCENARIO} captured -> ${SCEN} (add scenario.json, then commit)" >&2
