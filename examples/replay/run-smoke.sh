#!/usr/bin/env bash
# TDD-workflow smoke.
#
# Drives a real bug-tracker project through 2 evolution iterations
# (v1..v2), grouped into TWO SPRINTS, to exercise the TDD substrate:
# /plan + /design + /build + /deploy + HITL gates (spec / plan /
# test_list / promote / deploy) + per-iteration local tests. The
# human-proxy replaces a human approver so the smoke runs headless.
#
# Scope: this smoke validates TDD-workflow behavior. The SCM workflow
# CLIs (lakebase-scm-prepare-pr / wait-ci / merge --wait-migrate) are
# tested separately by tests/integration/scm-workflow-e2e-live.test.ts,
# discovered by scripts/run-all-live-tests.sh.
#
# Sprints (the /plan cadence; features are NOT pre-planned all at once):
#   sprint-1 = v1   sprint-2 = v2
# /plan runs once per sprint (run_plan_sprint), ABOVE the per-feature loop:
# the Spec Author proposes the candidate breakdown and the Product Owner commits
# the backlog. (The Architect's t-shirt-sizing step is skipped via --no-sizing:
# each sprint is a single feature, so there is no capacity tradeoff to size.)
# Headless, the human-proxy SUPPLIES the recorded backlog (the PO's commitment). sprint-2 is
# planned only AFTER sprint-1's features have shipped working software (their
# /deploy gates), modeling the feedback loop: the PO folds what they saw into
# the next sprint's requests. The sprint backlog is committed to trunk (main) so
# each feature branch (forked from main HEAD by /design Step 0) inherits its
# feature-request.md.
#
# What /plan does per sprint (run_plan_sprint):
#   a. Enforce the project-intake precondition (consort-intake, no
#      --feature: product-overview.md + nfrs.md + design-brief.md present).
#   b. Stage the PO's committed backlog: the human-proxy places each sprint
#      item's recorded feature-request.md. Sprint membership is the orchestrator's
#      call, so the requests are present before the drive; the driver's PO
#      author-requests step affirms them and sync-backlog projects backlog.json.
#   c. Drive planning via consort-drive --plan-only --gates proxy --no-sizing
#      (the same CLI the scaffolded /plan command runs): propose (Spec Author ->
#      feature-proposals.md), author-requests (PO affirms), sync-backlog
#      (-> backlog.json), then the Human Proxy approves the sprint plan gate. The
#      Architect estimate step is skipped (--no-sizing; single-feature sprints).
#      Called directly (not via claude -p) so gate mode + env are deterministic.
#   d. Commit the sprint backlog + planning artifacts to trunk.
#
# What each iteration does (the per-feature loop, after its request exists):
#   1. Abandon prior feature (substrate CLI) if state is mid-flight.
#   3. Claim the feature branch (lakebase-scm-claim-feature-branch).
#   4. consort-drive --feature <id>: the deterministic orchestrator drives
#      the WHOLE feature in one process (design -> build -> accept each story ->
#      deploy), spawning the role agents + surfacing every gate to the Human
#      Proxy (--gates proxy headless). The release-engineer's deploy phase polls
#      reachable + runs the feature verify and records the PO deploy gate.
#   5. Local tests (./scripts/run-tests.sh).
#   6. Generic deploy-gate verify (assertions/verify-deploy-gate.sh).
#   6.5 Stop the local app before the next iteration (idempotent teardown).
#   7. Commit the iteration's work on the feature branch.
#   8. SCM doctor (advisory cross-check; warning-only).
#
# Project intake (product-overview.md + nfrs.md + design-brief.md) is staged
# once before the sprints via human-proxy (stage_project_intake) and committed
# to trunk; the UX track is on via create-project --ui-track.
#
# Other flags:
#   --resume <iter>      skip earlier iterations + start at <iter>
#                        (v1 / v2). Useful when iterating on the smoke itself.
#   --project-dir <dir>  override the scaffold target. Default:
#                        $SMOKE_ROOT_DEFAULT/bug-tracker
#   --skip-scaffold      assume bug-tracker is already scaffolded; jump
#                        straight to the iteration loop.
#   --keep-on-failure    leave the project + Lakebase branches in place
#                        on failure (default: yes; tear-down is manual).
#   -h, --help           print this help.
#
# Prerequisites:
#   - lakebase-create-project on PATH (npx with the kit pin works)
#   - claude CLI on PATH (for /design + /build skill invocations)
#   - DATABRICKS_HOST + DATABRICKS_TOKEN env vars set (or a CLI profile)
#
# Exit codes:
#   0  smoke completed
#   1  scaffold failed
#   2  an iteration's design/build/tests/verify failed
#  10  prereq missing (CLI not found, env var unset)

set -e
set -u
set -o pipefail

# ─── defaults + arg parse ────────────────────────────────────────

SMOKE_ROOT_DEFAULT="${HOME}/code/tdd-workflow-smoke"
RESUME_AT=""
# Unique per-run project name so every smoke scaffolds a FRESH project and can
# never silently reuse a stale dir / collide with a prior run's Lakebase project
# + GitHub repo. Override with --project-name for --resume / --skip-scaffold.
RUN_ID="$(date +%Y%m%d-%H%M%S)"
PROJECT_NAME="bug-tracker-${RUN_ID}"
PROJECT_DIR=""
SKIP_SCAFFOLD=0
KEEP_ON_FAILURE=1
TIERS=""                      # 2 or 3; required architectural choice, no default
# Default to kit @ main; smoke can validate a feature branch via --kit-ref.
# Exported so the kit's templated /design + /design.pre-hook (which both
# invoke `npx ... lakebase-scm-claim-feature-branch`) can read the same ref.
KIT_REF="${LAKEBASE_KIT_REF:-}"
ITERATIONS=(v1-file-bug v2-transition-status)
# Sprints are slices of ITERATIONS (DRY: the canonical order lives in one place).
# sprint-1 = v1, sprint-2 = v2. sprint-2 is planned only after sprint-1 ships
# working software, modeling the PO folding feedback into the next sprint.
SPRINT1_ITERS=("${ITERATIONS[@]:0:1}")
SPRINT2_ITERS=("${ITERATIONS[@]:1:1}")

ORCHESTRATOR_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FEATURE_REQ_DIR="${ORCHESTRATOR_DIR}/feature-requests"
ASSERT_DIR="${ORCHESTRATOR_DIR}/assertions"

print_help() {
  sed -n '2,/^set -e/p' "${BASH_SOURCE[0]}" | sed -E 's/^# ?//' | head -n -1
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --fast|--standard|--full)
      # Legacy run-mode flags. Accepted-but-ignored for backwards-compat
      # with prior invocations. The smoke is TDD-only now; SCM workflow
      # validation lives in tests/integration/scm-workflow-e2e-live.test.ts.
      echo "smoke: '$1' is deprecated and ignored (smoke is TDD-only; SCM workflow is tested separately)" >&2
      shift ;;
    --resume)            RESUME_AT="$2"; shift 2 ;;
    --project-name)      PROJECT_NAME="$2"; shift 2 ;;
    --project-dir)       PROJECT_DIR="$2"; shift 2 ;;
    --tiers)             TIERS="$2"; shift 2 ;;
    --kit-ref)           KIT_REF="$2"; shift 2 ;;
    --skip-scaffold)     SKIP_SCAFFOLD=1; shift ;;
    --keep-on-failure)   KEEP_ON_FAILURE=1; shift ;;
    --no-keep-on-failure) KEEP_ON_FAILURE=0; shift ;;
    -h|--help)           print_help ;;
    *) echo "Unknown arg: $1" >&2; print_help ;;
  esac
done

PROJECT_DIR="${PROJECT_DIR:-${SMOKE_ROOT_DEFAULT}/${PROJECT_NAME}}"
# Ensure the scaffold root exists; the scaffolder clones into PROJECT_DIR and
# needs its parent present (a fresh checkout / renamed default may not have it).
mkdir -p "$(dirname "$PROJECT_DIR")"

# Turn recording (code asset): the deterministic driver records EVERY state-
# machine turn (design + build + gates + deploy + promote) into a replayable
# corpus when LAKEBASE_CONSORT_RECORD_DIR is set. The test runner turns it on by
# default, one corpus dir beside the project, surviving --keep-on-failure:
#   <RECORD_DIR>/turns/<NNNN>-<label>/   per-turn manifest + the .tdd/code delta
#   <RECORD_DIR>/turns/index.json        the ordered timeline of every step
#   <RECORD_DIR>/recorded-artifacts/     cumulative .tdd mirror (replayDesignTurn)
#   <RECORD_DIR>/recorded-build/         per-turn code corpus (replayBuildTurn)
# Override LAKEBASE_CONSORT_RECORD_DIR to relocate, or set it empty to disable.
if [[ -z "${LAKEBASE_CONSORT_RECORD_DIR+x}" ]]; then
  export LAKEBASE_CONSORT_RECORD_DIR="$(dirname "$PROJECT_DIR")/_recorded-${PROJECT_NAME}"
fi
if [[ -n "${LAKEBASE_CONSORT_RECORD_DIR}" ]]; then
  : "${LAKEBASE_CONSORT_RECORD_BUILD_DIR:=${LAKEBASE_CONSORT_RECORD_DIR}/recorded-build}"
  export LAKEBASE_CONSORT_RECORD_BUILD_DIR
  mkdir -p "$LAKEBASE_CONSORT_RECORD_DIR"
  echo "smoke: recording every state-machine turn -> $LAKEBASE_CONSORT_RECORD_DIR" >&2
fi

# The kit npx URL. When KIT_REF is set, suffix the GitHub ref so npx
# clones that branch / tag / sha. Empty KIT_REF means "kit main" (the
# default-published-pin behavior). Exported so any subprocess + the
# templated /design pre-hook can pick the same ref.
KIT_PACKAGE_BASE="github:databricks-solutions/consort"
if [[ -n "$KIT_REF" ]]; then
  KIT_NPX="${KIT_PACKAGE_BASE}#${KIT_REF}"
  export LAKEBASE_KIT_REF="$KIT_REF"
else
  KIT_NPX="$KIT_PACKAGE_BASE"
fi
# Exported so the per-iteration assertions/*.sh scripts use the same
# kit pin. Without this they would default to "main", which has no
# dist/ committed and yields "command not found" when invoking bins.
export LAKEBASE_KIT_NPX="$KIT_NPX"

# Deterministic bootstrap: the create-project scaffold runs through the kit's OWN
# committed lk resolver (the same one the scaffolded project + every drive turn
# use), NOT `npx --package=github#ref`. lk resolves via `npm install <committish>`
# (content-addressed for a SHA; never the `npx pack` path that throws "GitFetcher
# requires an Arborist constructor" on a SHA committish) and honors a pre-built
# $LAKEBASE_KIT_DIR install when set. One resolution path => identical bits on
# every step of every run.
# ONE kit resolution (split-brain-safe), via the shared resolver: with no published --kit-ref it
# pins a LOCAL ref + cache symlink to THIS checkout instead of exporting LAKEBASE_KIT_DIR (which
# redirects only the orchestrator, leaving the env-less claude -p agents on the ref cache = split-
# brain). assert_kit_single_source (after scaffold) writes the ref into the project so the agents
# resolve the same bits. --kit-ref is the PUBLISHED escape hatch (github-resolved, no local pin).
# shellcheck source=/dev/null
source "${ORCHESTRATOR_DIR}/lib/pin-local-kit.sh"
resolve_kit_single_source "${ORCHESTRATOR_DIR}" "${KIT_REF}" || exit 1
KIT_ROOT="${KIT_SINGLE_ROOT}"
KIT_LK="$(kit_lk_path "$KIT_ROOT")" || exit 1

# Headless run: the human reviewer at each HITL gate is performed by
# human-proxy, which validates the gate's artifacts exist + carry their
# expected elements (format-conformant) and approves only then. This lets
# /design run through to test-list.json (and /build) without a human, while
# conformance still hard-blocks a missing/malformed artifact. See SKILL
# "Headless / Human Proxy mode".
export LAKEBASE_SFTDD_HUMAN_PROXY=1

# Where the Human Proxy reads pre-recorded HIL intake answers in headless mode.
# /design's intake precondition (consort-intake) facilitates from here when
# an artifact is missing; this smoke also pre-supplies them (stage_project_intake)
# for determinism. Same directory the recorded product-overview.md / nfrs.md live in.
export LAKEBASE_SFTDD_RECORDED_INTAKE_DIR="${ORCHESTRATOR_DIR}"

# This smoke is a UI project (every feature is a browser-facing capability:
# filing a bug, transitioning its status). It is scaffolded with `--ui-track`
# above, which persists project.uiTrack into consort-config.json (the SINGLE source
# the drive reads to run the UX Designer + require design-brief.md at intake +
# exercise the design-guide/IA/token-adherence track). no UI env door:
# that was a second door for the same setting.

# The smoke drives the deterministic orchestrator (`consort-drive`) CLI
# directly for every phase (planning + per-feature design/build/deploy); it does
# not boot a top-level `claude -p` slash-command session. The driver owns its own
# role-agent invocation: it spawns each role with `claude -p --agent <role>` at
# the resolved per-role model (from .lakebase/agent-config.json, set at scaffold
# via --agent-model) and applies its own MCP-isolation flags. Driving the CLI
# directly (rather than a claude -p "/plan" session) keeps gate mode + env
# deterministic: a claude -p Bash tool does not reliably inherit
# LAKEBASE_SFTDD_HUMAN_PROXY, which silently flipped the plan gate to interactive.

log_kit_ref() { echo "smoke: kit ref = ${KIT_REF:-main} (npx package: ${KIT_NPX})"; }

# --tiers is required when scaffolding (architectural choice). This smoke is
# opinionated 2-tier (prod + staging): features fork from staging, so each
# iteration's work lands on a staging-parented feature branch. --tiers 1
# (prod only) and --tiers 3 (prod + staging + dev) are rejected because
# either would break the staging-as-parent assumption.
#
# Tier semantics (features are NOT tiers; they are branches):
#   1 = prod only        (features fork from prod)
#   2 = prod + staging   (features fork from staging)
#   3 = prod + staging + dev (features fork from dev)
if [[ "$SKIP_SCAFFOLD" -eq 0 ]]; then
  if [[ "$TIERS" != "2" ]]; then
    echo "smoke: --tiers 2 is required for this smoke. Got: '${TIERS:-<unset>}'." >&2
    echo "       The bug-tracker is 2-tier (prod + staging): features fork from" >&2
    echo "       staging. 1-tier would have features forking from prod; 3-tier" >&2
    echo "       would add a dev layer and change the staging-as-parent assumption." >&2
    exit 10
  fi
fi

# ─── prereqs ──────────────────────────────────────────────────

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "smoke: required command '$cmd' not found on PATH." >&2
    exit 10
  fi
}

require_cmd git
require_cmd npx
require_cmd claude
require_cmd jq
if [[ "${DATABRICKS_HOST:-}" == "" && ! -f "${HOME}/.databrickscfg" ]]; then
  echo "smoke: DATABRICKS_HOST not set + no ~/.databrickscfg found." >&2
  exit 10
fi

# ─── helpers ──────────────────────────────────────────────────

log() { printf '\n\033[1;34m[smoke]\033[0m %s\n' "$*" >&2; }
err() { printf '\n\033[1;31m[smoke ERROR]\033[0m %s\n' "$*" >&2; }

iteration_branch() {
  # v1-initial-domain -> feature/initial-domain
  local iter="$1"
  echo "feature/${iter#*-}"
}

iteration_spec() {
  local iter="$1"
  echo "${FEATURE_REQ_DIR}/${iter}.md"
}

iteration_verify() {
  # One generic, feature-agnostic deploy-gate verify for every iteration
  # (replaces the bespoke per-vN scripts): it asserts the feature reached its
  # deploy gate (migration + routes + tests + an E2E AC + approved PO deploy
  # gate) rather than a hand-coded per-feature schema/endpoint shape.
  echo "${ASSERT_DIR}/verify-deploy-gate.sh"
}

# Feature id used by /design + /build. The kit's TDD workflow expects
# .tdd/features/<feature-id>/feature-request.md (the Feature Requester's
# original ask) to exist as /design's Spec Author input; we stage
# feature-request.md from the iteration spec and let /design's Spec Author
# produce feature-spec.{md,json} + downstream artifacts. F<N>-<slug>
# matches the kit's example id shape ("F1-partner-submits-assets").
iteration_feature_id() {
  # v1-initial-domain -> F1-initial-domain
  local iter="$1"
  local num="${iter%%-*}"   # v1
  num="${num#v}"            # 1
  echo "F${num}-${iter#*-}"
}

# ─── scaffold ─────────────────────────────────────────────────

scaffold_project() {
  if [[ "$SKIP_SCAFFOLD" -eq 1 ]]; then
    log "skipping scaffold (--skip-scaffold)."
    return 0
  fi
  if [[ -d "$PROJECT_DIR/.git" ]]; then
    # Hard stop: never silently reuse a stale scaffold (an older kit's project
    # dir lacks the current commands/agents and fails mid-run with confusing
    # "Unknown command: /design"). The default project name is unique per run,
    # so this only fires on an explicit --project-name collision; the operator
    # must pass --skip-scaffold to intentionally reuse it.
    err "project dir already exists with a .git/ subdir at $PROJECT_DIR. Pass --skip-scaffold to reuse it intentionally, or remove it / use a fresh --project-name."
    exit 1
  fi

  : "${DATABRICKS_HOST:?smoke: DATABRICKS_HOST env var required for scaffold (or pass --skip-scaffold)}"
  : "${GITHUB_OWNER:?smoke: GITHUB_OWNER env var required for scaffold (or pass --skip-scaffold)}"

  log "scaffolding $PROJECT_NAME into $PROJECT_DIR via lakebase-create-project..."
  # Headless scaffold: language=python, self-hosted runner (kit default),
  # e2e enabled. Self-hosted is required because the Databricks workspace
  # IP ACL blocks github-hosted runners; the kit's setupRunner registers
  # a runner on this machine which can reach the workspace.
  # /design + /build commands scaffold by default (no --skip-commands).
  # Subshell-isolated so a non-zero exit surfaces our scaffold-failed code.
  #
  # Project name collision note: Lakebase keeps deleted projects in a
  # soft-delete state for 7 days (until purge_time), and rejects creates
  # against the same name during that window. If a smoke run fails after
  # the Lakebase project is created, re-run with --project-name <other>
  # rather than waiting for the purge.
  # Warm the resolver once so the bootstrap (and a moving-branch ref) resolve the
  # ref's CURRENT commit before scaffolding; a no-op under $LAKEBASE_KIT_DIR.
  bash "$KIT_LK" --warm || { err "could not resolve the kit via lk (ref=${KIT_REF:-main})"; exit 1; }
  (
    bash "$KIT_LK" \
      lakebase-create-project \
      --project-name "$PROJECT_NAME" \
      --parent-dir "$(dirname "$PROJECT_DIR")" \
      --databricks-host "$DATABRICKS_HOST" \
      --github-owner "$GITHUB_OWNER" \
      --language python \
      --runner self-hosted \
      --tiers "$TIERS" \
      `# Models: kit DEFAULTS, no per-role pins. The deterministic gates`\
      `# (contract-clean, layering-clean, conformance) + the honest-GREEN backstop`\
      `# carry the quality the old opus pins used to backstop, so the smoke runs on`\
      `# each role's recommended model. Override per run via --agent-model / the`\
      `# AGENT_MODELS env if a specific experiment needs it. effort=low for all`\
      `# roles except the two design-gate gatekeepers is patched in below.` \
      `# --ui-track is the single source for the UX lane: it persists`\
      `# project.uiTrack (the drive reads it, no UI env door) AND`\
      `# derives the e2e harness. One way in.` \
      --ui-track
  ) || { err "scaffold failed"; exit 1; }

  # create-project seeds .lakebase/consort-config.json with models but no effort
  # (it takes only --agent-model). The smoke wants effort=low for speed/cost on
  # MOST roles, but the two DESIGN-GATE gatekeepers for AC independence, the
  # spec-author (runs the per-pair independence test + outcome-vs-mechanism
  # delineation) and the test-strategist (flags ac-overlap semantically at Gate 3),
  # need full default effort: their judgment is subtle and effort=low undercuts it.
  # So patch effort=low on every role EXCEPT those two (left unset -> default
  # effort). Models from --agent-model + the kit defaults are preserved.
  local _tdc="$PROJECT_DIR/.lakebase/sftdd-config.json"
  if [[ -f "$_tdc" ]]; then
    local _tmp; _tmp="$(mktemp)"
    if jq '.roles |= with_entries(if (.key == "spec-author" or .key == "test-strategist") then . else .value.effort = "low" end)' "$_tdc" > "$_tmp" 2>/dev/null; then
      mv "$_tmp" "$_tdc"
      log "patched sftdd-config.json: effort=low for all roles except spec-author + test-strategist (default effort; models: kit defaults)"
    else
      rm -f "$_tmp"; log "WARNING: could not patch effort into $_tdc (jq failed); using config defaults"
    fi
  else
    log "WARNING: $_tdc absent after scaffold; could not set effort=low"
  fi

  # Write the kit-ref hint into the project (so the env-less claude -p agents resolve the SAME ref)
  # + assert the shim resolves THIS working tree; fail loud on drift. No-op under a published --kit-ref.
  assert_kit_single_source "$PROJECT_DIR" || { err "kit single-source assertion failed"; exit 1; }

  log "scaffold complete. Project at $PROJECT_DIR."
}

# ─── per-iteration loop ───────────────────────────────────────

run_iteration() {
  local iter="$1"
  local branch
  branch="$(iteration_branch "$iter")"
  local spec
  spec="$(iteration_spec "$iter")"
  local verify
  verify="$(iteration_verify "$iter")"

  log "▸ iteration $iter  (branch: $branch)"

  if [[ ! -f "$spec" ]]; then
    err "missing iteration spec: $spec"
    exit 2
  fi

  cd "$PROJECT_DIR"

  local feature_id
  feature_id="$(iteration_feature_id "$iter")"

  # 0.5. If a prior feature is mid-flight (state past scaffold-complete
  # and not merged), abandon it so the kit's claim CLI lets us start a
  # fresh feature. The SCM state machine refuses concurrent claims by
  # design; in this TDD-only smoke iterations are local-only (never merged), so
  # without an abandon step v2 would fail to claim F2.
  current_state_before_iter="$(
    "$PROJECT_DIR/scripts/lk" \
      lakebase-scm-state --project-dir "$PROJECT_DIR" --json 2>/dev/null \
    | jq -r '.state.state // ""' 2>/dev/null || echo ""
  )"
  if [[ "$current_state_before_iter" != "" \
        && "$current_state_before_iter" != "scaffold-complete" \
        && "$current_state_before_iter" != "merged" ]]; then
    log "  step 0.5: abandon prior feature (state=$current_state_before_iter)"
    "$PROJECT_DIR/scripts/lk" \
      lakebase-scm-abandon-feature --project-dir "$PROJECT_DIR" \
      || { err "abandon-feature failed; cannot start $iter on top of $current_state_before_iter"; exit 2; }
  fi

  # 1. Return to trunk before staging the feature spec. The orchestrator
  # does NOT do branch creation itself: that's the kit's responsibility
  # via /design's mandatory Step 0 (see
  # templates/project/common/.claude/commands/design.md). /design's
  # body enforces the substrate-only-path invariant at the kit level;
  # the smoke just invokes /design and trusts the contract.
  log "  step 1: return to trunk; /design's Step 0 claims the paired branch via substrate"
  git checkout main >/dev/null 2>&1 || git checkout master >/dev/null 2>&1
  git pull --ff-only origin "$(git branch --show-current)" || true

  # 2. feature-request.md is NOT staged here: it was authored at /plan
  # (run_plan_sprint) and committed to trunk, so /design's Step 0 branch
  # (forked from main HEAD) already carries .tdd/features/<id>/feature-request.md.
  # /design's Spec Author reads it as input and produces feature-spec.{md,json}.

  # 3. The deterministic orchestrator driver drives the WHOLE
  # feature in one process: it claims the feature branch (the /design Step 0
  # job, which the driver does not own, so we claim explicitly first), then
  # breaks the feature down + designs + builds + accepts each story + deploys.
  # The per-story pipeline streams (build starts on a story the moment its gate
  # is approved) and routing is code, not an LLM orchestrator. The driver is the
  # ONLY orchestration path: the same consort-drive runs headless here and
  # under real human interaction; the sole difference is who answers the gates
  # (the Human Proxy here vs the actual human live).
  log "  step 3: claim ${feature_id} + consort-drive (design + build + deploy, gates via Human Proxy)"
  "$PROJECT_DIR/scripts/lk" \
    lakebase-scm-claim-feature-branch "${feature_id}" --project-dir "$PROJECT_DIR" --json \
    || { err "claim-feature-branch failed for ${feature_id}"; exit 2; }

  # 3.5 (phase A+): assert the SCM workflow state advanced to
  # feature-claimed, catching a silent claim failure before the driver runs.
  log "  step 3.5: verify-workflow-state feature-claimed ${feature_id}"
  "${ASSERT_DIR}/verify-workflow-state.sh" "$PROJECT_DIR" feature-claimed "$feature_id"

  # 4. Drive the feature to done (design -> build -> accept -> deploy).
  log "  step 4: consort-drive ${feature_id}"
  "$PROJECT_DIR/scripts/lk" \
    consort-drive --feature "${feature_id}" --project-dir "$PROJECT_DIR" \
    || { err "consort-drive failed for ${feature_id}"; exit 2; }

  # 4.5: advisory per-story pipeline check. If the orchestrator
  # drove the streaming per-story pipeline (feature decomposed into >1 story),
  # confirm it ended clean: single build lane idle, ready queue drained, every
  # story done with an approved spec gate. Advisory (WARNINGs, never aborts):
  # the hard per-story guarantees are unit-tested (tdd-per-story-pipeline-e2e);
  # a single-story feature is a no-op.
  log "  step 4.5: verify-story-pipeline ${feature_id} (advisory)"
  "${ASSERT_DIR}/verify-story-pipeline.sh" "$PROJECT_DIR" "$feature_id" || \
    log "  WARNING: verify-story-pipeline reported anomalies (advisory; smoke continues)."

  # 5. local tests
  log "  step 5: ./scripts/run-tests.sh"
  if [[ -x "./scripts/run-tests.sh" ]]; then
    ./scripts/run-tests.sh
  else
    uv run pytest || python -m pytest
  fi

  # 6. deploy-gate verification (generic: migration + routes + tests + an E2E AC
  #    + the approved PO deploy gate). Feature-agnostic, so it survives changes
  #    to the seed feature-requests without a per-feature assertion rewrite.
  if [[ -x "$verify" ]]; then
    log "  step 6: $verify ${feature_id}"
    "$verify" "$PROJECT_DIR" "$feature_id"
  else
    log "  step 6: no verify script for $iter (skipping)."
  fi

  # 6.5 The deploy ("working software" check the product overview asks for) is
  # the driver's deploy phase, run in step 4: consort-drive invokes the
  # Release Engineer (deploy to target + poll reachable + run the feature verify
  # against the running app) and records the PO deploy gate via the Human Proxy.
  # There is no separate /deploy. We only ensure the app is stopped before the
  # next iteration (idempotent teardown).
  "$PROJECT_DIR/scripts/lk" consort-deploy --target local --project-dir "$PROJECT_DIR" --stop >/dev/null 2>&1 || true

  # 7. local commit on the feature branch. The TDD-workflow smoke is a
  # TDD-workflow validation harness; the SCM-workflow CLIs
  # (prepare-pr / wait-ci / merge --wait-migrate) belong to the SCM
  # workflow live tests in tests/integration/scm-workflow-e2e-live.test.ts
  # (discovered by scripts/run-all-live-tests.sh). Iterations stay at
  # feature-claimed locally; step 0.5 of the next iteration abandons
  # this feature so the SCM state machine lets the next claim proceed.
  log "  step 7: local commit on feature branch (TDD-only smoke; SCM cycle lives in scm-workflow-e2e-live)"
  git add -A
  git commit -m "smoke $iter: local commit"

  # 8. SCM doctor check at iteration end. Advisory: doctor failures
  # surface as warnings rather than aborting the smoke (the per-state
  # asserts above are the hard gates).
  log "  step 8: lakebase-scm-doctor (advisory cross-check)"
  local doctor_exit=0
  "$PROJECT_DIR/scripts/lk" \
    lakebase-scm-doctor --project-dir "$PROJECT_DIR" --json --pretty \
    || doctor_exit=$?
  if [[ "$doctor_exit" -ne 0 ]]; then
    log "  WARNING: doctor exited $doctor_exit (1=warn, 2=fail). Findings above. Smoke continues."
  fi

  log "✓ $iter complete"
}

# ─── HIL intake supply (Human Proxy) ──────────────────────────
#
# In the orchestrated pipeline the /design intake interviews capture the HIL's
# intent into product-overview.md / nfrs.md / design-brief.md. Headless, there
# is no human to interview, so the Human Proxy SUPPLIES the pre-recorded answers
# (the md files committed next to this script): it validates each against its
# declared format and places it under .tdd/, refusing a missing/malformed one.
# This is the identical path a real run takes, with the proxy standing in for
# the human at the intake step.
proxy_supply() {
  local from="$1" to="$2" artifact="$3" feature="${4:-}"
  local feat_flag=()
  [[ -n "$feature" ]] && feat_flag=(--feature "$feature")
  # Expand the optional array bash-3.2-safe: on macOS /bin/bash (3.2) with
  # `set -u`, "${arr[@]}" on an EMPTY array throws "unbound variable". The
  # ${arr[@]+...} guard yields nothing when empty. (stage_project_intake calls
  # this with no feature, so feat_flag is empty for project-level intake.)
  "$PROJECT_DIR/scripts/lk" consort-human-proxy supply \
    --from "$from" --to "$to" --artifact "$artifact" \
    --tdd-dir "${PROJECT_DIR}/.tdd" ${feat_flag[@]+"${feat_flag[@]}"}
}

# Project-level intake, staged once before the iteration loop. product-overview.md
# and nfrs.md are project-scoped (refined across features in a real run; recorded
# here). design-brief.md is also supplied: this smoke is a UI project (every
# feature is browser-facing), so the UX track is on via create-project --ui-track and the intake
# precondition requires the brief.
stage_project_intake() {
  log "staging project HIL intake via human-proxy (product-overview.md + nfrs.md + design-brief.md)"
  cd "$PROJECT_DIR"
  git checkout main >/dev/null 2>&1 || git checkout master >/dev/null 2>&1 || true
  proxy_supply "${ORCHESTRATOR_DIR}/product-overview.md" "${PROJECT_DIR}/.tdd/product-overview.md" "product-overview.md" \
    || { echo "smoke: human-proxy refused product-overview.md (missing/non-conformant)" >&2; exit 2; }
  proxy_supply "${ORCHESTRATOR_DIR}/nfrs.md" "${PROJECT_DIR}/.tdd/nfrs.md" "nfrs.md" \
    || { echo "smoke: human-proxy refused nfrs.md (missing/non-conformant)" >&2; exit 2; }
  proxy_supply "${ORCHESTRATOR_DIR}/design-brief.md" "${PROJECT_DIR}/.tdd/design/design-brief.md" "design-brief.md" \
    || { echo "smoke: human-proxy refused design-brief.md (missing/non-conformant)" >&2; exit 2; }
  # Commit project intake to trunk so every feature branch (forked from main
  # HEAD by /design Step 0) inherits the HIL's project-level intent. The
  # .tdd/ planning corpus is version-controlled on trunk; product code +
  # migrations are what the SCM workflow keeps OFF main, not these artifacts.
  git add .tdd/product-overview.md .tdd/nfrs.md .tdd/design/design-brief.md 2>/dev/null || true
  git commit -m "intake: project product-overview + nfrs + design-brief" >/dev/null 2>&1 \
    || log "  project intake already committed (nothing new)"
}

# ─── /plan: sprint planning (Human Proxy) ─────────────────────
#
# /plan is the precursor to each dev loop, run once per sprint ABOVE the
# per-feature loop. The Spec Author proposes how to divide the work into
# features and the Product Owner prioritizes + authors the sprint's
# feature-requests. Headless, there is no human: the Human Proxy SUPPLIES the
# recorded backlog (the iteration specs ARE the PO's groomed sprint). The
# backlog is committed to trunk so each feature branch inherits its request.
# This is the identical path a real run takes, with the proxy standing in for
# the PO at the authoring step.
run_plan_sprint() {
  local sprint_name="$1"; shift
  local iters=("$@")
  log "▸ /plan ${sprint_name}: sprint planning (Spec Author proposes; PO authors requests; human-proxy supplies headless)"
  cd "$PROJECT_DIR"
  git checkout main >/dev/null 2>&1 || git checkout master >/dev/null 2>&1 || true

  # a. /plan Step 0: project intake must be present + conformant (no --feature
  # means project-level only: product-overview.md + nfrs.md + design-brief.md).
  # Retry the cold npx call: npx-from-github occasionally flakes on resolution
  # (it re-resolves the branch ref each call), and the intake docs were just
  # supplied above, so a non-zero here is far likelier a transient npx hiccup
  # than a genuine unsatisfied intake. Only fail after the call fails 3x.
  local _intake_ok=""
  for _attempt in 1 2 3; do
    if "$PROJECT_DIR/scripts/lk" consort-intake; then _intake_ok=1; break; fi
    log "    intake precondition attempt ${_attempt} failed (likely transient npx); retrying..."
    sleep 3
  done
  [ -n "$_intake_ok" ] \
    || { err "/plan ${sprint_name}: project-intake precondition failed after 3 attempts"; exit 2; }

  # b. Record the PO's committed backlog for THIS sprint as (feature_id, recorded
  # source) pairs the Human Proxy supplies WHEN the state machine asks (at the
  # author-requests step), NOT before. Sprint membership is the orchestrator's
  # call (the iteration specs ARE the PO's groomed sprint). We do NOT place any
  # feature-request.md into the project here: the driver's author-requests step is
  # where the PO's artifacts are provided, and headless the Human Proxy supplies
  # them then (logging each). The recorded file is named independently of the
  # feature id (v1-initial-domain.md -> F1-initial-domain), so each pair is
  # `<feature_id>\t<recorded source>`, passed via LAKEBASE_CONSORT_SPRINT_REQUESTS.
  # This is the identical state machine a human runs; only the provider differs.
  local iter feature_id spec _pairs=""
  for iter in "${iters[@]}"; do
    feature_id="$(iteration_feature_id "$iter")"
    spec="$(iteration_spec "$iter")"
    [[ -f "$spec" ]] || { err "missing iteration spec: $spec"; exit 2; }
    _pairs+="$(printf '%s\t%s' "$feature_id" "$spec")"$'\n'
  done
  export LAKEBASE_CONSORT_SPRINT_REQUESTS="$_pairs"

  # c. Drive planning through the deterministic orchestrator (the same CLI the
  # scaffolded /plan command runs). The smoke calls the driver DIRECTLY (as it
  # does for the per-feature loop), not through `claude -p "/plan"`: a claude -p
  # session's Bash tool does not reliably inherit LAKEBASE_SFTDD_HUMAN_PROXY, so the
  # command's gate-mode check fell through to `interactive` headless and the plan
  # gate was never approved. Calling the driver here (in this shell, where the env
  # is correct) with an explicit `--gates proxy` is deterministic. The driver runs
  # propose (Spec Author -> feature-proposals.md), author-requests (the Human Proxy
  # supplies the recorded feature-requests from LAKEBASE_CONSORT_SPRINT_REQUESTS + logs
  # each), sync-backlog (projects backlog.json from them), then the Human Proxy
  # approves the sprint plan gate (teeth: feature-proposals.md exists + conforms)
  # and it stops at planning-complete.
  #
  # --no-sizing: each sprint is a SINGLE feature, so the Architect's t-shirt-sizing
  # (planning-poker) step adds nothing the PO needs to fit capacity. Skipping it
  # drops one estimate turn per sprint and goes straight propose -> author-requests.
  log "  ${sprint_name}: consort-drive --sprint ${sprint_name} --plan-only --gates proxy --no-sizing"
  "$PROJECT_DIR/scripts/lk" consort-drive \
    --sprint "${sprint_name}" --plan-only --gates proxy --no-sizing --project-dir "$PROJECT_DIR" \
    || { err "/plan ${sprint_name}: planning driver failed"; exit 2; }

  # d. Commit the sprint backlog + planning artifacts to trunk so each feature
  # branch inherits its request. Idempotent on resume: nothing new to commit.
  git add .tdd/features .tdd/planning .tdd/sprints 2>/dev/null || true
  git commit -m "plan ${sprint_name}: commit backlog (${iters[*]})" >/dev/null 2>&1 \
    || log "  ${sprint_name}: backlog already committed (nothing new)"

  # Record the planning activity (the PO authored the sprint's requests).
  "$PROJECT_DIR/scripts/lk" consort-log \
    --role orchestrator --level info --event phase.end \
    --tdd-dir "$PROJECT_DIR/.tdd" \
    --slot phase=plan --slot outcome=complete \
    --data "{\"sprint\":\"${sprint_name}\",\"requests\":${#iters[@]}}" >/dev/null 2>&1 || true
}

# ─── main ─────────────────────────────────────────────────────

log "TDD-workflow smoke starting (project=$PROJECT_DIR)"
scaffold_project
stage_project_intake

# A sprint = /plan (author the sprint's requests) then the per-feature loop
# over that sprint's iterations. sprint-2 is planned only after sprint-1's
# features have shipped working software (their /deploy gates), so the PO's
# sprint-2 requests can fold in what sprint-1 revealed (the feedback loop).
started=0
run_sprint() {
  local sprint_name="$1"; shift
  local sprint_iters=("$@")
  run_plan_sprint "$sprint_name" "${sprint_iters[@]}"
  local iter
  for iter in "${sprint_iters[@]}"; do
    if [[ -n "$RESUME_AT" && "$started" -eq 0 ]]; then
      if [[ "$iter" == "$RESUME_AT"* ]]; then
        started=1
      else
        log "skipping $iter (--resume $RESUME_AT)"
        continue
      fi
    fi
    run_iteration "$iter"
  done
}

run_sprint "sprint-1" "${SPRINT1_ITERS[@]}"
run_sprint "sprint-2" "${SPRINT2_ITERS[@]}"

log "TDD-workflow smoke COMPLETED"
exit 0
