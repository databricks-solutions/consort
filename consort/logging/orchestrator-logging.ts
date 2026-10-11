// Orchestrator-as-code logging (deterministic-driver observability).
//
// The deterministic driver emits its lifecycle log itself, as CODE, so the
// run's structured trail (handoff / phase.start / gate.surfaced / experiment.cut
// / phase.end) is guaranteed on every run and never depends on an LLM role
// remembering to emit (the prior failure: a haiku role hand-wrote malformed JSON
// with a bare "timestamp" + a local clock instead of calling the logger).
//
// There is ONE logging function, emitAgentLogEvent (agent-log.ts), with role as
// a parameter. This module is a PURE action->event(s) mapper plus a thin hook
// that feeds those events through that one function. Roles emit their own
// in-flight judgment events (reasoning / smell.flagged / gate decisions) through
// the SAME function via the consort-log CLI, appending to the shared
// .tdd/agent-log.jsonl; the orchestrator owns the skeleton, the roles add detail.

import type { WorkflowAction } from "../../consort/orchestrator/workflow/workflow-vocabulary.js";
import { emitAgentLogEvent, type AgentLogEvent, type AgentLogEventInput, type AgentLogIoOpts } from "./agent-log.js";
import { renderEventMessage } from "./agent-log-events.js";

export interface OrchestratorLogContext {
  featureId?: string;
  /** Resolve the model a role's turn runs with (tdd-config). When given, the
   *  per-turn `phase.start` event carries `model` (right after `role`). */
  modelForRole?(role: string): string | undefined;
  /** Resolve the --effort a role+turn runs with ("" / "default" => omit). When
   *  given, the per-turn `phase.start` event carries `effort`. */
  effortForTurn?(role: string, turn?: "red" | "green" | "review" | "refactor"): string | undefined;
}

/** The build turns whose effort can differ; design/deploy phases have no turn. */
const BUILD_TURNS = new Set(["red", "green", "review", "refactor"]);

/** model + effort fields for a role's per-turn event (omitted when unresolved /
 *  "default"), so each turn's log line shows what it ran with, right after role. */
function turnSettings(
  ctx: OrchestratorLogContext,
  role: string,
  phase: string,
): { model?: string; effort?: string } {
  const turn = BUILD_TURNS.has(phase) ? (phase as "red" | "green" | "review" | "refactor") : undefined;
  const model = ctx.modelForRole?.(role);
  const effort = ctx.effortForTurn?.(role, turn);
  return {
    ...(model ? { model } : {}),
    ...(effort && effort !== "default" ? { effort } : {}),
  };
}

/** The story an action targets, if any (most build/design-lane actions carry one). */
function storyOf(action: WorkflowAction): string | undefined {
  return "story" in action ? (action as { story?: string }).story : undefined;
}

/**
 * Map one workflow action to the canonical log event(s) the orchestrator emits
 * BEFORE performing it. Pure: depends only on the action + context. role,
 * level, event, and message are always set, so what is emitted is correct by
 * construction.
 */
export function orchestratorLogEvents(
  action: WorkflowAction,
  ctx: OrchestratorLogContext = {},
): AgentLogEventInput[] {
  const feature_id = ctx.featureId;
  const story = storyOf(action);
  const base = { role: "orchestrator" as const, level: "info" as const, feature_id };

  // Every emit names an event from the CLOSED vocabulary (agent-log-events.ts)
  // and supplies that event's required SLOTS. The logger renders the message from
  // the template + slots and THROWS on an off-vocabulary event or a missing slot,
  // so the orchestrator trail conforms by construction. The event NAME carries
  // the phase; slots carry the specifics (story / ac / gate / ...).
  const withStory = story ? { story } : {};

  switch (action.kind) {
    case "invoke-role": {
      const role = action.role;
      const mode = "mode" in action ? action.mode : undefined;
      const buildMode = "buildMode" in action ? action.buildMode : undefined;
      const ac = "ac" in action ? action.ac : undefined;
      // `phase` slot = the concrete activity token (NOT prose): the planning mode,
      // the buildMode (review/refactor), or the cycle half (red/green), else design.
      const phase = mode ?? buildMode ?? (role === "navigator" ? "red" : role === "driver" ? "green" : "design");
      const detail = { ...withStory, ...(mode ? { mode } : {}), ...(buildMode ? { buildMode } : {}), ...(ac ? { ac } : {}) };
      return [
        { ...base, event: "handoff", slots: { to_role: role, phase, ...detail } },
        { role, level: "info", feature_id, ...turnSettings(ctx, role, phase), event: "phase.start", slots: { phase, ...detail } },
      ];
    }
    case "surface-gate":
      return [{ ...base, event: "gate.surfaced", slots: { gate: "spec", subject: `story ${story}`, ...withStory } }];
    case "await-acceptance":
      // Deploy is a DETERMINISTIC phase, not an inter-agent handoff: the
      // orchestrator itself runs the deploy + verify (the deploy CLI emits the
      // deploy.* events with the real outcome), logged under the release-engineer
      // label. Modeled as a phase.start (like the build-lane dispatch below),
      // never a handoff to a spawnable agent (there is no release-engineer agent).
      // The orchestrator then surfaces the acceptance gate.
      return [
        { role: "release-engineer", level: "info", feature_id, event: "phase.start", slots: { phase: "deploy", ...withStory } },
        { ...base, event: "gate.surfaced", slots: { gate: "acceptance", subject: `story ${story}`, ...withStory } },
      ];
    case "approve-gate":
      return [{ ...base, event: "gate.approved", slots: { gate: "spec", ...withStory } }];
    case "approve-intake-gate":
      // The HITL intake gate (the human approved the drafted product-overview/nfrs/design-brief).
      // Previously fell through to the default reasoning marker — a latent gap that left the intake
      // approval unlogged on the orchestrator skeleton; now it emits gate.approved like every gate.
      return [{ ...base, event: "gate.approved", slots: { gate: "intake" } }];
    case "approve-backlog-gate":
      // The HITL backlog gate (the human selected + committed the sprint's features).
      return [{ ...base, event: "gate.approved", slots: { gate: "backlog" } }];
    case "approve-plan-gate":
      return [{ ...base, event: "gate.approved", slots: { gate: "plan" } }];
    case "approve-deploy-gate":
      return [{ ...base, event: "gate.approved", slots: { gate: "deploy" } }];
    case "approve-promote-gate":
      // The HITL PR acceptance (the `promote` gate), before the merge.
      return [{ ...base, event: "gate.approved", slots: { gate: "promote" } }];
    case "deploy-complete":
      // Entering the promote phase: the Release Engineer takes the accepted
      // feature through PR review + merge up to the parent tier. (prepare-pr /
      // wait-ci / merge fall through to the default reasoning marker, which keeps
      // each a distinct, timestamped span for the timing report.)
      return [{ role: "release-engineer", level: "info", feature_id, event: "phase.start", slots: { phase: "promote" } }];
    case "accept":
      // The drive-action narration. NOTE the gate.approved("acceptance") that CLEARS the gate is NOT
      // emitted here — this case only fires when the drive DISPATCHES a standalone accept action, but
      // the acceptance/merge also resolves via the headless proxy / a direct CLI, where this never
      // runs. The clearing is emitted at the ONE funnel every path reaches: mergeAndAcceptStory (which
      // is the sole caller of acceptStory). See consort/experiment/experiment-merge.ts.
      return [{ ...base, event: "experiment.accepted", slots: { ...withStory } }];
    case "cut-experiment":
      return [{ ...base, event: "experiment.cut", slots: { ...withStory } }];
    case "dispatch":
      // Opening the per-story build lane is a PHASE ENTRY, not an inter-agent
      // handoff: the build lane is the orchestrator's own pipeline, not a
      // spawnable agent. (The first real handoff is the navigator dispatch that
      // follows, via invoke-role.) Emitting a `handoff to build-lane` would be
      // the orchestrator handing off to itself; model it as phase.start instead.
      return [{ ...base, event: "phase.start", slots: { phase: "build", ...withStory } }];
    case "deploy":
      return [{ role: "release-engineer", level: "info", feature_id, event: "phase.start", slots: { phase: "deploy" } }];
    case "complete":
      return [{ ...base, event: "phase.end", slots: { phase: "story", outcome: "complete", ...withStory } }];
    case "planning-complete":
      return [{ ...base, event: "phase.end", slots: { phase: "planning", outcome: "complete" } }];
    case "design-complete":
      return [{ ...base, event: "phase.end", slots: { phase: "design", outcome: "complete" } }];
    case "feature-complete":
      return [{ ...base, event: "phase.end", slots: { phase: "feature", outcome: "complete" } }];
    case "raise-to-hil":
      return [
        {
          ...base,
          level: "error",
          event: "escalation.raised",
          slots: { source: action.source, reason: action.reason, ...withStory },
        },
      ];
    case "revise-route":
      // A reflect/smell finding sent a story back to its owning author to re-run a gate. Previously
      // logged as a bare "orchestrator: revise-route" with NO reason, so a material correction (e.g. a
      // test-list re-authored, items dropped) happened invisibly. Record WHO re-runs WHICH gate, the
      // triggering source, and the verdict text — so the revise is auditable, not a silent re-do.
      return [
        {
          ...base,
          level: "warn",
          event: "reasoning",
          slots: {
            note:
              `orchestrator: revise-route -> ${action.role} re-runs the ${action.gate} gate for ` +
              `${action.story} (source: ${action.source}): ${action.reason}`,
            ...withStory,
          },
        },
      ];
    case "done":
      return [{ ...base, event: "phase.end", slots: { phase: "workflow", outcome: "complete" } }];
    default: {
      // Total over the union: any future action still gets an in-vocabulary event.
      const k = (action as { kind: string }).kind;
      return [{ ...base, event: "reasoning", slots: { note: `orchestrator: ${k}` } }];
    }
  }
}

/** The HITL gate name a parked approve-* action awaits (intake/plan/spec/deploy/
 *  promote/acceptance), or null for a non-gate action. Shared by
 *  parkedGateSurfacedEvent + the idempotency guard so the two never drift on which
 *  actions are gates. The `subject` slot is computed by the caller (it needs the
 *  sprint/feature scope), so this stays a pure name lookup. */
function parkedGateName(gate: WorkflowAction): string | null {
  switch (gate.kind) {
    case "approve-intake-gate":
      return "intake";
    case "approve-backlog-gate":
      return "backlog";
    case "approve-plan-gate":
      return "plan";
    case "approve-gate":
      return "spec";
    case "approve-deploy-gate":
      return "deploy";
    case "approve-promote-gate":
      return "promote";
    case "accept":
      return "acceptance";
    default:
      return null;
  }
}

/**
 * The `gate.surfaced` event for a HITL gate the drive PARKED at in interactive mode,
 * or null for a non-gate action. Distinct from orchestratorLogEvents' approve-*
 * cases, which emit gate.APPROVED – the outcome of PERFORMING a gate (the Human
 * Proxy approves headless). When the driver instead STOPS before a gate for a live
 * human, `onAction` never fires (orchestrator-run halts at stopWhen, before the
 * perform), so the gate is never surfaced to the log – the dashboard can't show
 * "waiting on you" and the gate never flashes. The spec gate (surface-gate) +
 * acceptance (await-acceptance) pre-surface via a preceding NON-HITL action, but the
 * intake / plan / deploy / promote gates park directly and had no surfacing at all.
 * This is the SINGLE surfacing for a parked gate, its slots mirroring surface-gate's
 * (gate + subject + story). Emitted at the interactive park (drive.cli reportGate),
 * guarded by `gateAlreadySurfaced` so a re-run at the same park – and the two gates
 * that already pre-surface – never double-log.
 */
export function parkedGateSurfacedEvent(
  gate: WorkflowAction,
  ctx: OrchestratorLogContext & { sprint?: string } = {},
): AgentLogEventInput | null {
  const name = parkedGateName(gate);
  if (!name) return null;
  const story = storyOf(gate);
  // gate.surfaced REQUIRES a non-empty `subject` (the template renders it). Story-
  // scoped gates (spec/acceptance) name their story; the sprint gates (intake/backlog/plan)
  // name the sprint; the feature gates (deploy/promote) name the feature. Each falls
  // back to the gate scope word when the id is unknown, so `subject` is never empty.
  const subject = story
    ? `story ${story}`
    : name === "intake" || name === "backlog" || name === "plan"
      ? `sprint ${ctx.sprint ?? name}`
      : `feature ${ctx.featureId ?? name}`;
  return {
    role: "orchestrator",
    level: "info",
    feature_id: ctx.featureId,
    event: "gate.surfaced",
    slots: { gate: name, subject, ...(story ? { story } : {}) },
  };
}

/**
 * Has the parked `gate` ALREADY been surfaced-and-not-yet-approved in the log? True
 * when the most recent gate.surfaced/gate.approved for this gate (matched by name,
 * and by story for the story-scoped spec/acceptance gates) is a gate.surfaced – so
 * a repeated drive re-run at the same park, and the spec/acceptance gates that
 * pre-surface via surface-gate/await-acceptance, do not re-emit a duplicate. A prior
 * cycle's gate.approved (or no gate event at all) is NOT "already surfaced", so a
 * genuinely new park still surfaces.
 */
export function gateAlreadySurfaced(events: AgentLogEvent[], gate: WorkflowAction): boolean {
  const name = parkedGateName(gate);
  if (!name) return false;
  const story = storyOf(gate);
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.event !== "gate.surfaced" && e.event !== "gate.approved") continue;
    const md = (e.metadata ?? {}) as Record<string, unknown>;
    if (md.gate !== name) continue;
    // Story-scoped gates (spec/acceptance) only match their own story; sprint/feature
    // gates (intake/plan/deploy/promote) carry no story and match on name alone.
    if (story && typeof md.story === "string" && md.story !== story) continue;
    return e.event === "gate.surfaced";
  }
  return false;
}

/**
 * A one-line human-readable description of an action, for the driver's stdout
 * trace. Reuses orchestratorLogEvents' canonical message (DRY: one source of
 * narration for both the structured log + the console) so the smoke/console shows
 * "dispatch driver (story S1)" / "RAISED TO HIL (...)" instead of raw JSON.
 */
export function describeAction(action: WorkflowAction, ctx: OrchestratorLogContext = {}): string {
  const ev = orchestratorLogEvents(action, ctx)[0];
  if (!ev) return (action as { kind: string }).kind;
  // Render the same template the logger will, so the console trace matches the log.
  const renderCtx: Record<string, unknown> = {
    role: ev.role,
    ...(ev.feature_id !== undefined ? { feature_id: ev.feature_id } : {}),
    ...(ev.phase !== undefined ? { phase: ev.phase } : {}),
    ...(ev.slots ?? {}),
  };
  try {
    return renderEventMessage(ev.event, renderCtx);
  } catch {
    return ev.event;
  }
}

/**
 * Build the driver's `onAction` hook: code-emit each mapped event through the
 * one common logger. Wired into DriveEffects.onAction (fires before each
 * perform + before the terminal `done`), so the orchestrator trail is written
 * on every run with no LLM in the loop.
 */
export function makeOnAction(
  opts: AgentLogIoOpts & {
    featureId?: string;
    modelForRole?(role: string): string | undefined;
    effortForTurn?(role: string, turn?: "red" | "green" | "review" | "refactor"): string | undefined;
  },
): (action: WorkflowAction, iteration: number) => void {
  const { featureId, modelForRole, effortForTurn, ...io } = opts;
  return (action) => {
    for (const event of orchestratorLogEvents(action, { featureId, modelForRole, effortForTurn })) {
      // Best-effort: a logging failure must never abort the workflow.
      try {
        emitAgentLogEvent(event, io);
      } catch {
        /* swallow: observability is not load-bearing for the run */
      }
    }
  };
}

/** A concrete kit-CLI invocation (bin + argv), for programmatic enactment. */
export interface EnactCommand {
  bin: string;
  args: string[];
}

/** Context for resolving a gate's enact command: the feature/sprint it targets
 *  and (optionally) the approver to fill in for the `<you>` placeholder. */
export interface GateEnactContext {
  featureId?: string;
  sprint?: string;
  approver?: string;
  /** The feature's canonical branch, the promote gate's REQUIRED `--promote-ref`
   *  (what is being promoted). Falls back to the feature id when unknown. */
  featureBranch?: string;
}

/**
 * The EXACT substrate command that clears a given HITL gate stop (FEIP-8008),
 * as STRUCTURED bin + args. Each gate is recorded by a DIFFERENT substrate, so a
 * single generic command sent the human to the wrong door, e.g. the feature-level
 * `gates.json` spec gate for a PER-STORY spec stop, which recorded the wrong gate
 * and never advanced. Name the door that actually clears THIS stop:
 *   - plan gate      -> consort-approve-gate --sprint
 *   - per-story spec -> consort-approve-gate --feature --story
 *   - deploy/promote -> consort-approve-gate --feature --gate <name>
 *   - PO acceptance  -> consort-pipeline accept --feature --story
 * Returns null for a non-gate action. Pure (no I/O); the SINGLE gate->CLI mapping
 * shared by approveHint (the drive's stdout hint) and consort-next (the
 * authoritative decision menu), so the two can never drift (FEIP-8017).
 */
export function gateEnactCommand(
  gate: WorkflowAction,
  ctx: GateEnactContext = {},
): EnactCommand | null {
  const you = ctx.approver ?? "<you>";
  const f = ctx.featureId ?? "<feature-id>";
  switch (gate.kind) {
    case "approve-intake-gate":
      return { bin: "consort-approve-gate", args: ["--sprint", ctx.sprint ?? "<sprint>", "--gate", "intake", "--approver", you] };
    case "approve-backlog-gate":
      return { bin: "consort-approve-gate", args: ["--sprint", ctx.sprint ?? "<sprint>", "--gate", "backlog", "--approver", you] };
    case "approve-plan-gate":
      return { bin: "consort-approve-gate", args: ["--sprint", ctx.sprint ?? "<sprint>", "--approver", you] };
    case "approve-gate": // the per-story spec gate (pipeline.json), NOT feature gates.json
      return { bin: "consort-approve-gate", args: ["--feature", f, "--story", gate.story, "--approver", you] };
    case "approve-deploy-gate":
      return { bin: "consort-approve-gate", args: ["--feature", f, "--gate", "deploy", "--approver", you] };
    case "approve-promote-gate":
      // The promote gate REQUIRES a non-empty --promote-ref (what is being
      // promoted); without it the approval SKIPS as a silent no-op and the drive
      // re-surfaces the same gate (FEIP-8019). The value is the feature's
      // canonical branch (what the merge releases into the parent tier), the same
      // promote_ref the engine's own internal approval supplies (orchestrator-
      // effects `approve-promote-gate`: cfg.featureBranch ?? feature).
      return {
        bin: "consort-approve-gate",
        args: ["--feature", f, "--gate", "promote", "--promote-ref", ctx.featureBranch ?? f, "--approver", you],
      };
    case "accept": // per-story PO acceptance (experiment merge), a pipeline action
      return { bin: "consort-pipeline", args: ["accept", "--feature", f, "--story", gate.story, "--approver", you] };
    default:
      return null;
  }
}

/**
 * The EXACT human approval command for a HITL gate stop, as a one-line string for
 * the drive's stdout. A thin projection of `gateEnactCommand` (the one structured
 * mapping) so the console hint and the `next` decision menu never diverge.
 */
export function approveHint(
  gate: WorkflowAction,
  ctx: { featureId?: string; sprint?: string; featureBranch?: string } = {},
): string {
  const cmd = gateEnactCommand(gate, ctx);
  if (cmd) return `${cmd.bin} ${cmd.args.join(" ")}`;
  // Non-gate fallthrough (never a gate in practice): the generic feature door.
  const f = ctx.featureId ?? "<feature-id>";
  return `consort-approve-gate --feature ${f} --approver <you>`;
}
