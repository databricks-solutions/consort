#!/usr/bin/env bash
# Shared core for the two REPLAY smokes (sourced, not run directly , like
# assertions/_assert-lib.sh). It scaffolds a REAL project, stages intake, claims
# the paired feature branch, replays the DESIGN lane from recorded-artifacts/,
# optionally restores the recorded BUILD, then drives the deterministic
# orchestrator to a chosen handoff and STOPS just before it.
#
# The two entry scripts set three vars, then call `replay_smoke "$@"`:
#   SMOKE_NAME    label for logs + the usage line (e.g. run-to-navigator.sh)
#   PAUSE_BEFORE  navigator | release-engineer  (consort-drive --pause-before)
#   REPLAY_BUILD  0 | 1  (1 also restores the recorded code tree + green cycles,
#                 so the run skips the live build and reaches the RE handoff)
#
# At the handoff the driver PAUSES (a HITL [Y/n] gate), waits for the human, and
# RESUMES the same run on Y , it never bails out of the state machine. Set
# LAKEBASE_CONSORT_AUTO_CONTINUE=1 to auto-confirm (non-interactive / CI).
#
# Determinism (in code): the create-project bootstrap, the scaffolded project's
# scripts/lk, and every drive turn all resolve the kit through the SAME committed
# lk resolver via the ONE shared resolver (lib/pin-local-kit.sh resolve_kit_single_source).
# With no explicit --kit-ref, a plain run pins a LOCAL ref whose cache slot symlinks THIS
# checkout AND writes that ref into the project (assert_kit_single_source), so the orchestrator
# AND the env-less claude -p agents resolve IDENTICAL bits (no LAKEBASE_KIT_DIR split-brain).
# Pass --kit-ref <ref> for the PUBLISHED escape hatch (resolved from github, no local pin).
#
# Env: DATABRICKS_HOST, GITHUB_OWNER, a CLI profile (same as run-smoke.sh).
# Exit: 0 ok (incl. the clean stop-before-handoff); 1 scaffold; 2 a step failed.

replay_smoke() {
  set -euo pipefail

  local REPLAY_DIR ASSERT_DIR CORPUS_DIR BUILD_CORPUS_DIR INTAKE_DIR
  # Resolve from the ENGINE's own path (BASH_SOURCE[0]), not the caller's
  # (BASH_SOURCE[1]): the engine self-locates to examples/replay/ regardless of the
  # current directory. In a multi-feature scenario the earlier feature's drive
  # cd'd into the project, so cwd is no longer where the run was launched; a
  # cwd-relative caller path would then break on feature N+1. Both callers place
  # their entry script in examples/replay/ alongside this engine, so [0] and [1]
  # resolve to the same dir , [0] is just cwd-independent.
  REPLAY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  # ASSERT_DIR + the DEFAULT corpus/intake are the bug-tracker smoke's, which lives
  # under this machinery dir at corpora/bug-tracker/. A generic caller
  # (replay-scenario.sh) OVERRIDES them (REPLAY_ASSERT_DIR / REPLAY_INTAKE_DIR /
  # --corpus / LAKEBASE_CONSORT_REPLAY_BUILD_DIR) to point at its own corpora/<name>/.
  ASSERT_DIR="${REPLAY_ASSERT_DIR:-${REPLAY_DIR}/assertions}"
  INTAKE_DIR="${REPLAY_INTAKE_DIR:-${REPLAY_DIR}/corpora/bug-tracker}"
  CORPUS_DIR="${REPLAY_DIR}/corpora/bug-tracker/recorded-artifacts"
  BUILD_CORPUS_DIR="${LAKEBASE_SFTDD_REPLAY_BUILD_DIR:-${REPLAY_DIR}/corpora/bug-tracker/recorded-build}"

  local FEATURE_ID="F1-file-bug"
  local REPLAY_SPRINT="${REPLAY_SPRINT:-}"   # when set (once per project), replay the PLANNING lane
  local PLAN_ONLY="${PLAN_ONLY:-0}"          # when 1, STOP after planning-complete (no feature drive)
  local TIERS="${TIERS:-}"
  local KIT_REF="${LAKEBASE_KIT_REF:-}"
  local PROJECT_NAME="bug-tracker-ff-$(date +%Y%m%d-%H%M%S)"
  local PROJECT_DIR=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --tiers)        TIERS="$2"; shift 2 ;;
      --kit-ref)      KIT_REF="$2"; shift 2 ;;
      --project-name) PROJECT_NAME="$2"; shift 2 ;;
      --project-dir)  PROJECT_DIR="$2"; shift 2 ;;
      --feature)      FEATURE_ID="$2"; shift 2 ;;
      --sprint)       REPLAY_SPRINT="$2"; shift 2 ;;
      --plan-only)    PLAN_ONLY=1; shift ;;   # capture/replay the PLANNING lane, then STOP (no feature drive)
      --corpus)       CORPUS_DIR="$2"; shift 2 ;;
      -h|--help)      sed -n '1,40p' "${BASH_SOURCE[1]}"; return 0 ;;
      *) echo "${SMOKE_NAME}: unknown arg: $1" >&2; return 2 ;;
    esac
  done

  PROJECT_DIR="${PROJECT_DIR:-$HOME/code/tdd-workflow-smoke/${PROJECT_NAME}}"
  # The scaffolder lands the project at <parent-dir>/<project-name>, so the project
  # NAME must equal PROJECT_DIR's basename , else create-project writes to a
  # different dir than the one we cd into next. Derive it from PROJECT_DIR (a no-op
  # when --project-dir was omitted, since PROJECT_DIR was built from PROJECT_NAME).
  PROJECT_NAME="$(basename "$PROJECT_DIR")"
  # Ensure the scaffold root exists; the scaffolder clones into PROJECT_DIR and
  # needs its parent present (a fresh checkout / renamed default may not have it).
  mkdir -p "$(dirname "$PROJECT_DIR")"
  [[ -n "$TIERS" ]] || { echo "${SMOKE_NAME}: --tiers 2 is required (bug-tracker is prod+staging)." >&2; return 2; }
  [[ -d "$CORPUS_DIR/features/$FEATURE_ID" ]] || { echo "${SMOKE_NAME}: corpus missing $CORPUS_DIR/features/$FEATURE_ID" >&2; return 2; }

  local KIT_ROOT KIT_LK
  # ONE kit resolution (split-brain-safe): defer to the shared resolver so orchestrator AND the
  # env-less claude -p agents load IDENTICAL bits. It computes KIT_ROOT one way (git toplevel of
  # REPLAY_DIR, fallback 2-up), and , with no published --kit-ref , pins a local ref + cache symlink
  # instead of exporting LAKEBASE_KIT_DIR (which redirects only the orchestrator = split-brain). An
  # explicit --kit-ref is the PUBLISHED escape hatch (resolved from github, no local pin).
  # shellcheck source=/dev/null
  source "${REPLAY_DIR}/lib/pin-local-kit.sh"
  resolve_kit_single_source "${REPLAY_DIR}" "${KIT_REF}" || return 1
  KIT_ROOT="${KIT_SINGLE_ROOT}"
  KIT_LK="$(kit_lk_path "$KIT_ROOT")" || return 1

  # UI track is a PROJECT setting (project.uiTrack, set at create by --ui-track
  # below), not an env door. Only the run-mode Human Proxy is env here.
  export LAKEBASE_SFTDD_HUMAN_PROXY=1

  # When recording a run (LAKEBASE_CONSORT_RECORD_DIR set), capture the BUILD corpus
  # too, not just the design mirror: default the per-turn build-record dir under
  # the same record root so recordBuildTurn fires for every Navigator/Driver turn.
  # Without this a capture produces recorded-artifacts/ but NOT recorded-build/,
  # so the build-replay (run-to-release-engineer) has nothing to restore. Mirrors
  # run-smoke.sh. Honor an explicit override.
  if [[ -n "${LAKEBASE_CONSORT_RECORD_DIR:-}" ]]; then
    export LAKEBASE_CONSORT_RECORD_BUILD_DIR="${LAKEBASE_CONSORT_RECORD_BUILD_DIR:-${LAKEBASE_CONSORT_RECORD_DIR}/recorded-build}"
  fi

  local C='\033[1;34m' R='\033[1;31m' Z='\033[0m'
  log() { printf "\n${C}[%s]${Z} %s\n" "$SMOKE_NAME" "$*" >&2; }
  err() { printf "\n${R}[%s ERROR]${Z} %s\n" "$SMOKE_NAME" "$*" >&2; }
  lk()  { "$PROJECT_DIR/scripts/lk" "$@"; }

  # ─── 1. scaffold a REAL project via the committed lk resolver ──
  # A multi-feature scenario reuses ONE project: only the FIRST feature scaffolds
  # + stages project intake; feature 2+ finds the project already there and goes
  # straight to its feature-request + claim + drive, so it builds on the earlier
  # features' MERGED state (the recorded DB + git lineage the capture recorded).
  log "kit = ref ${KIT_SINGLE_REF:-${KIT_REF:-main}} -> ${KIT_ROOT}  (pause-before: ${PAUSE_BEFORE}, replay-build: ${REPLAY_BUILD})"
  : "${DATABRICKS_HOST:?${SMOKE_NAME}: DATABRICKS_HOST required}"
  : "${GITHUB_OWNER:?${SMOKE_NAME}: GITHUB_OWNER required}"
  local FRESH=1
  [[ -d "$PROJECT_DIR/.git" ]] && FRESH=0
  if [[ "$FRESH" == 1 ]]; then
    log "scaffolding ${PROJECT_NAME} (tiers=${TIERS})..."
    bash "$KIT_LK" --warm || { err "could not resolve the kit via lk"; return 1; }
    # Per-role models: kit DEFAULTS by default (no per-role pins). Design is
    # REPLAYED here so the design roles' model is moot anyway; the build roles run
    # on their recommended model, backed by the deterministic gates + honest-GREEN.
    # A caller that runs design LIVE (run-capture) or wants a perf experiment sets
    # AGENT_MODELS (space-separated role=model pairs) to override; empty = defaults.
    local AGENT_MODELS="${AGENT_MODELS:-}"
    local AGENT_MODEL_FLAGS="" _pair
    for _pair in $AGENT_MODELS; do AGENT_MODEL_FLAGS="$AGENT_MODEL_FLAGS --agent-model $_pair"; done
    log "agent models: ${AGENT_MODELS:-kit defaults}"
    (
      bash "$KIT_LK" lakebase-create-project \
        --project-name "$PROJECT_NAME" --parent-dir "$(dirname "$PROJECT_DIR")" \
        --databricks-host "$DATABRICKS_HOST" --github-owner "$GITHUB_OWNER" \
        --language python --runner self-hosted --tiers "$TIERS" \
        $AGENT_MODEL_FLAGS \
        --ui-track
    ) || { err "scaffold failed"; return 1; }
  else
    log "reusing existing project ${PROJECT_DIR} (multi-feature scenario , skip scaffold + intake)"
  fi
  cd "$PROJECT_DIR"

  # Write the kit-ref hint into the project (so the env-less claude -p agents resolve the SAME ref as
  # the orchestrator) + assert the shim resolves THIS working tree , fail loud on drift. Idempotent, so
  # a reused multi-feature project re-verifies. A no-op under a published --kit-ref (no local cache).
  assert_kit_single_source "$PROJECT_DIR" || { err "kit single-source assertion failed"; return 1; }

  # ─── 2. project intake on trunk (REAL precondition, once per project) ──
  # Resolve the runtime artifact dir through the kit's SINGLE point of entry,
  # never a hardcoded name: lakebase-resolve-consort-dir prints resolveTddDir() (the
  # one rule , prefer .sftdd, fall back to legacy .tdd). Defined ONCE + reused;
  # the CLIs below also default --tdd-dir to resolveTddDir, so we never pass it.
  # Onto the PARENT TIER before staging intake + the feature-request. The claim
  # (scm-claim-feature resolveParentBranch) forks the feature from the tier the topology dictates:
  # tier-2 -> "staging", tier-3 -> "dev", tier-1 -> the default branch (VERIFIED in scm-utils). So
  # intake committed on `main` never reaches a tier-2 feature branch (which forks from staging) ->
  # spec-author breakdown fails "missing input nfrs" at turn 0. Check out the staging tier when it
  # exists (tier 2/3), else main (tier 1), so intake lands on the branch the feature actually forks
  # from. (Proven git-only: intake-on-staging -> nfrs.md present on the claimed feature branch.)
  git checkout staging >/dev/null 2>&1 \
    || git checkout main >/dev/null 2>&1 \
    || git checkout master >/dev/null 2>&1 || true
  local SFTDD_DIR SFTDD_REL
  SFTDD_DIR="$(lk lakebase-resolve-consort-dir --project-dir "$PROJECT_DIR")" || { err "could not resolve the runtime artifact dir"; return 2; }
  SFTDD_REL="$(basename "$SFTDD_DIR")"
  proxy_supply() {
    lk consort-human-proxy supply --from "$1" --to "$2" --artifact "$3"
  }
  if [[ "$FRESH" == 1 ]]; then
    log "staging project intake (product-overview + nfrs + design-brief) via human-proxy"
    proxy_supply "${INTAKE_DIR}/product-overview.md" "${SFTDD_DIR}/product-overview.md" "product-overview.md" \
      || { err "human-proxy refused product-overview.md"; return 2; }
    proxy_supply "${INTAKE_DIR}/nfrs.md" "${SFTDD_DIR}/nfrs.md" "nfrs.md" \
      || { err "human-proxy refused nfrs.md"; return 2; }
    # The design brief + brand assets live under the corpus intake/ mirror. finalize-corpus mirrors
    # the LIVE .consort/ layout (design-brief at .consort/design/design-brief.md, assets under
    # design/assets/), so a newer corpus stores them NESTED at intake/design/{design-brief.md,assets/}.
    # Older hand-built corpora stored them FLAT at intake/{design-brief.md,assets/}. Prefer the nested
    # mirror, fall back to flat, so every corpus (old + new) replays.
    local _brief="${INTAKE_DIR}/design/design-brief.md"
    [[ -f "$_brief" ]] || _brief="${INTAKE_DIR}/design-brief.md"
    proxy_supply "$_brief" "${SFTDD_DIR}/design/design-brief.md" "design-brief.md" \
      || { err "human-proxy refused design-brief.md"; return 2; }
    # Brand assets (icon, etc.): the design-brief references the brand asset (e.g. warehouse.png) and
    # the build copies it to client/src/assets + wires the navbar/favicon. proxy_supply reads UTF-8
    # (would corrupt a PNG), so stage the assets dir with a BINARY-SAFE cp into the project's
    # design/assets/ (the HIL "hands over" the brand asset at /sprint, same as the brief). Best-effort:
    # absent assets dir is fine (a text-only intake). Nested (design/assets) preferred, flat fallback.
    local _assets="${INTAKE_DIR}/design/assets"
    [[ -d "$_assets" ]] || _assets="${INTAKE_DIR}/assets"
    if [[ -d "$_assets" ]]; then
      mkdir -p "${SFTDD_DIR}/design/assets"
      cp -R "${_assets}/." "${SFTDD_DIR}/design/assets/" 2>/dev/null || true
      log "human-proxy: supplied brand assets -> ${SFTDD_DIR}/design/assets/ ($(ls "$_assets" 2>/dev/null | tr '\n' ' '))"
      git add "${SFTDD_REL}/design/assets" 2>/dev/null || true
    fi
    git add "${SFTDD_REL}/product-overview.md" "${SFTDD_REL}/nfrs.md" "${SFTDD_REL}/design/design-brief.md" 2>/dev/null || true
    git commit -m "intake: project product-overview + nfrs + design-brief + brand assets" >/dev/null 2>&1 || true
  fi

  # ─── 2.5 PLANNING lane replay (optional, once per project) ──
  # When --sprint <name> is given, replay the recorded PLANNING lane through the SAME
  # executor path a live sprint uses (drivePlanning now builds effects via
  # buildDriveEffects, so spec-author propose + architect estimate dispatch through
  # performViaExecutor). Exporting LAKEBASE_CONSORT_REPLAY_DIR=<recorded-artifacts> makes those
  # design turns RESTORE their recorded output from the corpus (the executor swaps the manifest's
  # agent kind claude->replay) instead of spawning a live agent; author-requests is deterministic
  # (the Human Proxy supplies the recorded requests via SPRINT_REQUESTS, exactly as capture does).
  # This proves the planning lane on the unified path. Runs ONCE PER SPRINT: gated on whether THIS
  # sprint has already been planned (sprints/<sprint>/requested.json present, written by the
  # author-requests turn), NOT on FRESH. A multi-SPRINT capture reuses ONE project (FRESH=0 on sprint
  # 2+), but each sprint still needs its own planning (propose its features + author their requests),
  # so gating on FRESH would skip sprint 2's planning entirely (it would reach the claim with no
  # feature-request). The project INTAKE above stays FRESH-gated (product-overview/nfrs are
  # project-level, refined across sprints, supplied once); planning is per-sprint.
  #
  # The REPLAY env var MUST be exported HERE, before the planning drive , the design-lane export
  # below (step 4) runs AFTER this block, so without setting it here the planning turns would
  # resolve the manifest's live claude agent and SPAWN (the J2-run symptom: the markers read
  # `(propose, live)` not `(propose, replay)`). Gated on REPLAY_DESIGN=1 (the replay direction); a
  # capture (REPLAY_DESIGN=0) leaves it unset so planning runs live. (CORPUS_DIR is the recorded-
  # artifacts subdir; the local REPLAY_DIR shell var above is the MACHINERY dir , different thing.)
  local _sprint_planned=0
  [[ -n "${REPLAY_SPRINT}" && -f "${SFTDD_DIR}/sprints/${REPLAY_SPRINT}/requested.json" ]] && _sprint_planned=1
  if [[ -n "${REPLAY_SPRINT}" && "$_sprint_planned" == 0 ]]; then
    local FR="${CORPUS_DIR}/features/${FEATURE_ID}/feature-request.md"
    [[ -f "$FR" ]] || { err "planning replay needs the recorded feature-request at ${FR}"; return 2; }
    [[ "${REPLAY_DESIGN:-1}" == "1" ]] && export LAKEBASE_CONSORT_REPLAY_DIR="${CORPUS_DIR}"
    export LAKEBASE_CONSORT_SPRINT_REQUESTS="${FEATURE_ID}"$'\t'"${FR}"$'\n'
    local _plan_mode; [[ "${REPLAY_DESIGN:-1}" == "1" ]] && _plan_mode="REPLAYED from corpus" || _plan_mode="LIVE (recording)"
    local _plan_flag=""; [[ "$PLAN_ONLY" == "1" ]] && _plan_flag="--plan-only"
    log "PLANNING lane , sprint '${REPLAY_SPRINT}' (propose + estimate ${_plan_mode} via the executor; author-requests deterministic)${_plan_flag:+ , STOP after planning-complete}"
    lk consort-drive --sprint "$REPLAY_SPRINT" --project-dir "$PROJECT_DIR" --gates proxy $_plan_flag \
      || { err "planning-lane ${_plan_flag:-drive} (--sprint ${REPLAY_SPRINT}) failed"; return 2; }
    unset LAKEBASE_CONSORT_SPRINT_REQUESTS
    # --plan-only: the planning lane IS the whole run (capture the plan turns, then stop). Skip the
    # per-feature request/claim/drive below , there is no feature to build here.
    if [[ "$PLAN_ONLY" == "1" ]]; then
      log "✓ ${SMOKE_NAME} PLAN-ONLY complete (planning-complete reached${LAKEBASE_CONSORT_RECORD_DIR:+; recorded -> ${LAKEBASE_CONSORT_RECORD_DIR}}). Project: ${PROJECT_DIR}"
      return 0
    fi
  fi

  # ─── 3. feature-request on trunk, then claim the paired branch ─
  # The feature-request is the PO's ask. When the PLANNING lane ran (--sprint), the human-proxy
  # ALREADY authored it THROUGH the author-requests turn (the PO stand-in answering the orchestrator,
  # via SPRINT_REQUESTS) , IDENTICAL to interactive. Re-copying it here would be the out-of-band
  # side-channel that breaks that equivalence. So the bare-cp fallback runs ONLY when planning did
  # NOT author it (no --sprint): a request-less quick path. featureRequestMd() (consort-paths.ts)
  # puts it at features/<F>/feature-request.md , the SAME path spec-author-breakdown's input reads.
  if [[ -z "${REPLAY_SPRINT}" ]]; then
    log "no planning lane (--sprint unset): staging feature-request.md directly (fallback path)"
    mkdir -p "${SFTDD_DIR}/features/${FEATURE_ID}"
    cp "${CORPUS_DIR}/features/${FEATURE_ID}/feature-request.md" "${SFTDD_DIR}/features/${FEATURE_ID}/feature-request.md"
    git add "${SFTDD_REL}/features/${FEATURE_ID}/feature-request.md"
    git commit -m "plan: feature-request for ${FEATURE_ID}" >/dev/null 2>&1 || true
  else
    log "planning lane authored the feature-request via author-requests (proxy PO stand-in); no side-channel copy"
  fi

  # PUSH the PARENT TIER (with intake + feature-request) to origin BEFORE claiming. The claim's git
  # fork point is resolveFeatureStartPoint(parentBranch), which PREFERS origin/<parentBranch>. For a
  # tier-2 project (stockflow-rerecord) resolveParentBranch => "staging", so the feature forks from
  # origin/staging. Intake + feature-request were committed on the parent tier (checked out above);
  # this push makes origin/<parent> carry them. Without it, origin/<parent> stays at the scaffold
  # commit, the feature forks WITHOUT intake, and spec-author breakdown fails "missing input nfrs"
  # at turn 0 (after cloud provisioning). HEAD is the parent tier here (staging on tier-2/3, main on
  # tier-1), so pushing HEAD pushes the right branch.
  local _PARENT; _PARENT="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)"
  git push -q origin "$_PARENT" 2>/dev/null || log "  (warn: could not push ${_PARENT} to origin; claim may fork from a stale tip)"

  log "claim the paired feature branch for ${FEATURE_ID} (REAL substrate)"
  local _CLAIM_JSON
  _CLAIM_JSON="$(lk lakebase-scm-claim-feature-branch "${FEATURE_ID}" --project-dir "$PROJECT_DIR" --json)" \
    || { err "claim-feature-branch failed"; return 2; }
  echo "$_CLAIM_JSON"
  "${ASSERT_DIR}/verify-workflow-state.sh" "$PROJECT_DIR" feature-claimed "$FEATURE_ID"

  # CRITICAL , put HEAD on the CLAIMED FEATURE BRANCH before driving. Steps 2/2.5/3
  # checked out the PARENT TIER (staging) to stage intake + push the fork point, and a
  # FRESH claim's createPairedBranch does `git checkout -b <feature>` for us , but a
  # RESUME (alreadyClaimed:true) SHORT-CIRCUITS that checkout, leaving HEAD on staging.
  # cut-experiment then git-branches the experiment off the CURRENTLY-CHECKED-OUT branch
  # (Lakebase forks from the explicit --parent, so the two DIVERGE): the git experiment
  # is cut off staging (or none is created) and driver-green commits GREEN onto staging ,
  # an unprotected parent tier by default , irreversibly polluting it. So ALWAYS check out
  # the claimed feature branch here (idempotent when the fresh claim already did), then
  # sync .env/Lakebase to it (checkout-paired = the post-checkout hook). Parse the branch
  # from the claim JSON so it tracks the kit's naming, not a shell re-derivation.
  local _FEATURE_BRANCH
  _FEATURE_BRANCH="$(printf '%s' "$_CLAIM_JSON" | sed -n 's/.*"branch":"\([^"]*\)".*/\1/p' | head -1)"
  [[ -n "$_FEATURE_BRANCH" ]] || { err "could not parse claimed feature branch from claim JSON"; return 2; }
  # Force the checkout. On a RESUME (alreadyClaimed) HEAD is on the parent tier and
  # the per-run .consort/.lakebase metadata (workflow-state.json, pipeline.json,
  # smells.json, ...) is dirty + tracked, so a plain `git checkout` ABORTS ("local
  # changes would be overwritten") and wedges the whole resume. That churn is
  # disposable here , the feature branch carries its OWN committed state, and landing
  # on it is the whole point , so -f discards the parent-tier churn and switches.
  # Mirrors the deterministic force-checkout the orchestrator's `done` phase uses for
  # the identical condition (orchestrator-effects.ts) and the fork-guard's tolerance
  # of the same metadata.
  git -C "$PROJECT_DIR" checkout -f "$_FEATURE_BRANCH" >/dev/null 2>&1 \
    || { err "could not checkout claimed feature branch ${_FEATURE_BRANCH}"; return 2; }
  lk lakebase-branch checkout-paired --project-dir "$PROJECT_DIR" >/dev/null 2>&1 \
    || log "  (warn: checkout-paired .env sync for ${_FEATURE_BRANCH} reported an issue; continuing)"
  local _HEAD_NOW; _HEAD_NOW="$(git -C "$PROJECT_DIR" rev-parse --abbrev-ref HEAD)"
  [[ "$_HEAD_NOW" == "$_FEATURE_BRANCH" ]] \
    || { err "HEAD is '${_HEAD_NOW}', expected feature branch '${_FEATURE_BRANCH}' before drive (cut would mis-fork)"; return 2; }
  log "on feature branch ${_FEATURE_BRANCH} (HEAD verified) , cut-experiment will fork from it"

  # ─── 4. drive, PAUSE just before the chosen handoff ─
  # By default LAKEBASE_CONSORT_REPLAY_DIR replays each DESIGN-lane role turn from the
  # corpus. With REPLAY_DESIGN=0 the design lane runs LIVE (real role agents) , the
  # CAPTURE path , and (when LAKEBASE_CONSORT_RECORD_DIR is set) every turn is recorded.
  # Live design needs an approver for its per-story spec/test_list gates: the Human
  # Proxy approves them headless (--gates proxy), the same path run-smoke uses.
  # When REPLAY_BUILD=1 the recorded code tree + GREEN cycles are restored too
  # (the build skips to the Release Engineer). --pause-before makes the driver
  # PAUSE at the handoff (a [Y/n] gate) so the human reviews, then RESUME the
  # same run on Y , it does NOT bail out of the state machine. The pause is
  # INTERNAL to this one drive process, so recording + the turn timeline span
  # design and build continuously (as if there were no pause).
  # This harness is headless BY CONSTRUCTION (it exports LAKEBASE_SFTDD_HUMAN_PROXY=1
  # and its callers set LAKEBASE_CONSORT_AUTO_CONTINUE=1), so it ALWAYS runs the
  # proxy gate policy: the Human Proxy approves each per-story spec gate without a
  # human, in both the capture and replay directions. This is a deliberate,
  # explicit opt-in , the project's declared gate policy is now interactive
  # (HITL-first), and a run-scoped --gates never rewrites it. Before that flip this
  # relied on proxy being the global default; declaring it here is the correct,
  # self-describing behavior for an automated run.
  local GATES_FLAG="--gates proxy"
  if [[ "${REPLAY_DESIGN:-1}" == "1" ]]; then
    export LAKEBASE_CONSORT_REPLAY_DIR="${CORPUS_DIR}"
  fi
  if [[ "$REPLAY_BUILD" == "1" ]]; then
    [[ -d "$BUILD_CORPUS_DIR" ]] || { err "build corpus missing: $BUILD_CORPUS_DIR"; return 2; }
    export LAKEBASE_SFTDD_REPLAY_BUILD_DIR="$BUILD_CORPUS_DIR"
  fi
  local DESIGN_MODE; [[ "${REPLAY_DESIGN:-1}" == "1" ]] && DESIGN_MODE="REPLAYED" || DESIGN_MODE="LIVE (recording)"
  local BUILD_NOTE=""; [[ "$REPLAY_BUILD" == "1" ]] && BUILD_NOTE=" + build RESTORED"
  log "design ${DESIGN_MODE}${BUILD_NOTE}; pausing at the ${PAUSE_BEFORE} handoff${LAKEBASE_CONSORT_RECORD_DIR:+ (recording -> ${LAKEBASE_CONSORT_RECORD_DIR})}"
  lk consort-drive --feature "${FEATURE_ID}" --project-dir "$PROJECT_DIR" --pause-before "$PAUSE_BEFORE" $GATES_FLAG \
    || { err "consort-drive failed for ${FEATURE_ID}"; return 2; }

  log "✓ ${SMOKE_NAME} complete (paused at the ${PAUSE_BEFORE} handoff, resumed on your Y). Project: ${PROJECT_DIR}"
}
