// Step: the GENERIC StepContract, driven entirely by a step manifest (DATA) + the
// validator registry (CODE) + an injected agent. This is the NORM – a step is one JSON
// manifest + (only if a new output type appears) one registered validator fn. A bespoke
// StepContract class is the escape hatch, for a step whose run() logic is genuinely custom.
//
// Containment is unchanged from SpecAuthorBreakdownStep: the ORCHESTRATOR owns .consort,
// resolves + PROVIDES the input contents + the workspace, and VALIDATES + persists the
// produced output. This step is dumb: it declares its logical inputs/outputs (from the
// manifest), forwards the provided instructions to its injected agent pointed at the
// provided workspace, and reports what appeared THERE. Neither it nor its agent resolves
// .consort or reaches outside what it was handed.
//
//   inputs()  -> manifest.inputs (logical ids; the orchestrator resolves + provides).
//   outputs() -> manifest.outputs, each with check = resolveValidator(name).
//   conformanceValidators() -> the same validators, with a docstring, exposed to the agent.
//   route()   -> manifest.routing[outcome] (a produced proposal by default).
//   run()     -> verify provided inputs (fail loud), invoke the agent contained to the
//                workspace, report the produced path(s) at the declared output locations.

import { join } from "node:path";
import { existsSync } from "node:fs";
import { resolveValidator } from "../validators/conformance/validator-registry.js";
import { escalationPreempt, type WorkflowAction } from "../workflow/workflow-vocabulary.js";
import type { StepManifest } from "./manifest.js";
import type {
  StepContract,
  StepInputSpec,
  StepPrecondition,
  StepOutputSpec,
  RouteProposal,
  StepRouteContext,
  StepOutcome,
  ConformanceValidator,
  PostTurnHook,
  AgentOptions,
} from "./step-contract.js";
import type { StepAgent } from "../agents/agent-types.js";
import type { ProvidedStepRun, ProvidedStepResult, ExistsFn } from "./step-run-types.js";
import { resolveChannelRoot, type Channel } from "../provisioning/channels.js";
import { TURN_EVENTS, type TurnEventKind, type TurnEventSpec } from "./turn-events.js";

/** Which output id is the PRIMARY artifact (the one that must be present for produced:true).
 *  Convention: the first declared output. */
function primaryOutputId(manifest: StepManifest): string | undefined {
  return manifest.outputs[0]?.id;
}

export class Step implements StepContract {
  private readonly exists: ExistsFn;

  constructor(
    private readonly manifest: StepManifest,
    private readonly agent: StepAgent,
    exists?: ExistsFn,
  ) {
    this.exists = exists ?? existsSync;
  }

  /** WHAT this step needs (logical), from the manifest. The orchestrator resolves these.
   *  `schema:`-sourced inputs are EXCLUDED here: they are kit-resolved contract context (the exact
   *  JSON schema the output is gated against), always available (the kit ships the schema file), not
   *  an orchestrator-provided artifact — so they must not appear in the LOGICAL-input contract nor
   *  trip run()'s `spec.id in inputs` presence gate. The live resolveInputs (executor-dispatch /
   *  manifest-runner) iterates `manifest.inputs` directly, so it still resolves + hands the schema to
   *  the agent; this filter only governs the logical-input contract + the presence gate. */
  inputs(_action: WorkflowAction): StepInputSpec[] {
    return this.manifest.inputs
      .filter((i) => !i.source.startsWith("schema:"))
      .map((i) => ({
        id: i.id,
        description: i.description ?? `${i.id} (from ${i.source})`,
        // Carry `optional` through so run()'s presence re-check honors it (an optional-absent input
        // is skipped by resolveInputs and MUST NOT trip run's `spec.id in inputs` gate).
        ...(i.optional ? { optional: true } : {}),
      }));
  }

  /** WHAT this step needs PRE-CONDITIONED (logical), from the manifest. The orchestrator's
   *  PREPARE-PRECONDITIONS phase runs the matching preparer + appends the projected block.
   *  Absent on the manifest = an affirmative "nothing" (empty). The preparer `options` ride
   *  along on the spec so a preparer (e.g. context-pack's skipTestLoop) can read them. */
  preconditions(_action: WorkflowAction): StepPrecondition[] {
    return (this.manifest.preconditions ?? []).map((p) => ({
      id: p.id,
      kind: p.kind,
      description: p.description ?? p.id,
      ...(p.position ? { position: p.position } : {}),
      ...(p.options ? { options: p.options } : {}),
    }));
  }

  /** WHAT this step produces (logical), from the manifest. Each output's in-code validator is
   *  resolved from the registry by NAME (an unknown name throws loud). */
  outputs(_action: WorkflowAction): StepOutputSpec[] {
    return this.manifest.outputs.map((o) => ({
      id: o.id,
      description: o.description ?? o.id,
      filename: o.filename,
      ...(o.channel ? { channel: o.channel } : {}),
      ...(o.optional ? { optional: true } : {}),
      validate: resolveValidator(o.validator),
    }));
  }

  /** WHAT deterministic hooks the orchestrator runs AROUND this turn (not the agent), from the
   *  manifest. Absent on the manifest = an affirmative "no hooks" (empty). A hook with no `when`
   *  defaults to "after" (the manifest convention). */
  postTurn(_action: WorkflowAction): PostTurnHook[] {
    return (this.manifest.postTurn ?? []).map((h) => ({
      bin: h.bin,
      args: h.args,
      when: h.when ?? "after",
    }));
  }

  /** The per-step agent-spawn levers, from the manifest. The orchestrator reads these to
   *  configure the spawn; the optimize sweep patches them per candidate. */
  agentOptions(_action: WorkflowAction): AgentOptions {
    const o = this.manifest.agentOptions;
    return {
      ...(o.model ? { model: o.model } : {}),
      ...(o.effort ? { effort: o.effort } : {}),
      session: o.session,
      ...(o.resumeKeyFrom ? { resumeKeyFrom: o.resumeKeyFrom } : {}),
    };
  }

  /** The process EVENTS this step may RAISE, from the manifest (`raises`: a list of event kinds).
   *  Each kind resolves to its full spec through TURN_EVENTS (the one scope-truth). Absent on the
   *  manifest = an affirmative "raises nothing" (empty). */
  raises(_action: WorkflowAction): TurnEventSpec[] {
    return (this.manifest.raises ?? []).map((kind) => TURN_EVENTS[kind]);
  }

  /** The process EVENTS a ROUTE to this step depends on, from the manifest (`requiresEvents`: a
   *  list of event kinds). Declared as kinds; the route-satisfiable check resolves scope through
   *  TURN_EVENTS. Absent = an affirmative "requires no event" (the plain RED/GREEN turns). */
  requiresEvents(_action: WorkflowAction): TurnEventKind[] {
    return this.manifest.requiresEvents ?? [];
  }

  /** The conformance validators EXPOSED TO THE AGENT, so it self-checks its draft in-turn.
   *  Same deterministic fn the orchestrator runs; the docstring names the output + validator. */
  conformanceValidators(_action: WorkflowAction): ConformanceValidator[] {
    return this.manifest.outputs.map((o) => ({
      outputId: o.id,
      docstring:
        `check ${o.filename} (validator "${o.validator}"): ${o.description ?? o.id}. ` +
        `Returns {ok, violations[]}. Run it on your written ${o.filename} and fix every ` +
        `violation before returning – no orchestrator round-trip.`,
      fn: resolveValidator(o.validator),
    }));
  }

  /**
   * Run the step within the PROVIDED workspace – identical contract to SpecAuthorBreakdownStep:
   * verify every declared input was provided (fail loud, name the missing one, no agent call),
   * invoke the injected agent contained to the workspace, report the produced artifact path(s)
   * found at the orchestrator-declared output locations (fall back to the bare filename).
   */
  async run(provided: ProvidedStepRun): Promise<ProvidedStepResult> {
    const { action, workspaceDir, inputs, instructions } = provided;

    for (const spec of this.inputs(action)) {
      // An OPTIONAL input that resolveInputs skipped (absent source on the live lane, e.g. review's
      // `code` project-tree input) is legitimately NOT in the map – skipping it is correct, not a
      // failure. Only a REQUIRED input absent from the map is a fail-loud missing input. (Before this,
      // an optional-absent input tripped this gate -> {produced:false, missingInput} -> phase-5
      // violation -> blocked -> retry -> abort: the SYSTEMIC navigator-review PROTOCOL VIOLATION,
      // because review declares required `acs` + optional `code` and `code` is always absent live.)
      if (!(spec.id in inputs) && !spec.optional) {
        return { produced: false, missingInput: spec.id };
      }
    }

    await this.agent.invoke({ action, workspaceDir, inputs, instructions });

    // Resolve each output under its channel's root via the shared channel model (product ->
    // workspaceDir; artifact/meta -> their contained root, falling back to workspaceDir).
    const rootFor = (channel?: Channel): string =>
      resolveChannelRoot(channel, { workspaceDir, artifactDir: provided.artifactDir, metaDir: provided.metaDir });

    const specs = this.outputs(action);
    // A turn with NO declared outputs (a self-heal / judgment turn – assess / review / reflect ,
    // whose correctness is its @build-cycle record + state-derived route, not a static artifact)
    // has NO required primary: it PRODUCES by completing. Report produced:true so the executor's
    // phase 5 does not flag a nonexistent "primary output" and the turn routes on its cycle record.
    // (Distinct from a declared-but-OPTIONAL primary, which phase 5 still validates when present.)
    if (specs.length === 0) {
      return { produced: true, producedPaths: [] };
    }
    const primary = primaryOutputId(this.manifest);
    const producedPaths: string[] = [];
    let primaryPresent = false;
    for (const spec of specs) {
      const rel = provided.outputPaths?.[spec.id] ?? spec.filename;
      const p = join(rootFor(spec.channel), rel);
      if (this.exists(p)) {
        producedPaths.push(p);
        if (spec.id === primary) primaryPresent = true;
      }
    }
    // A declared-but-OPTIONAL primary that is ABSENT is still a clean produce (the executor's
    // phase 5 owns the optional-absent=pass rule); only a REQUIRED absent primary is not produced.
    const primarySpec = specs[0];
    if (!primaryPresent && !primarySpec.optional) {
      return { produced: false, producedPaths: producedPaths.length ? producedPaths : undefined };
    }
    return { produced: true, producedPaths };
  }

  /**
   * The injected agent's result for its most recent turn (usage tokens/cost/num_turns + final
   * text), read duck-typed – a live ClaudeStepAgent sets `lastResult` after each invoke; a
   * mock/replay agent has none (returns undefined). The executor calls this in phase 6 so the
   * turn's telemetry travels on the StepRecord + survives the (thrown-away) workspace. Read-only,
   * never affects routing or validation.
   */
  lastAgentResult(): { usage?: import("../../session/claude-usage.js").TurnUsage; finalText?: string } | undefined {
    const lr = (this.agent as { lastResult?: { usage?: import("../../session/claude-usage.js").TurnUsage; finalText?: string } }).lastResult;
    return lr ? { ...(lr.usage ? { usage: lr.usage } : {}), ...(lr.finalText ? { finalText: lr.finalText } : {}) } : undefined;
  }

  /**
   * Routing: emit the routing proposal the executor's validateAndBound reconciles. The step
   * only reports intent; the orchestrator holds authority (validateAndBound bounds the move).
   *
   * The full route space out of a completed step (matching the legacy nextTransition):
   *   - escalate: an unresolved BLOCKING problem the turn surfaced (a failed run, a
   *     build-level smell, an explicit escalation file, or a spec smell with its revise budget
   *     spent) -> raise-to-hil.
   *   - revise:   a ROUTABLE spec-level smell (revise budget left) -> revise-route back to the
   *     owning author at its gate, re-gate, resume.
   *   - produced: no escalation -> the manifest's mapped `next` (a concrete WorkflowAction),
   *     or "state-derived" to defer entirely to the pure transition.
   *
   * The escalate/revise split is NOT re-derived here – it reuses the real machine's
   * escalationPreempt(state) (the same authority nextTransition uses), so the manifest path
   * and the legacy transition agree by construction. A manifest MAY still declare explicit
   * `routing.revise` / `routing.escalate` targets to override where those outcomes point; when
   * absent the escalationPreempt result is used verbatim.
   */
  route(_completed: WorkflowAction, ctx: StepRouteContext): RouteProposal {
    // 1. Escalation pre-empt: reuse the pure state machine's authority. A routable spec smell
    //    becomes a revise-route; anything else blocking becomes raise-to-hil.
    const preempt = escalationPreempt(ctx.state);
    if (preempt) {
      if (preempt.kind === "revise-route") {
        const target = this.manifest.routing.revise;
        const next = (target?.next as WorkflowAction | undefined) ?? preempt;
        return { outcome: "revise", proposedNext: next, reason: this.escalationReason(ctx) };
      }
      // raise-to-hil (or any non-revise pre-empt): a hard escalation.
      const target = this.manifest.routing.escalate;
      const next = (target?.next as WorkflowAction | undefined) ?? preempt;
      return { outcome: "escalate", proposedNext: next, reason: this.escalationReason(ctx) };
    }

    // 2. No escalation: the produced route from the manifest map (or state-derived).
    const outcome: StepOutcome = "produced";
    const producedNext = this.manifest.routing.produced?.next;
    if (producedNext && producedNext !== "state-derived") {
      return { outcome, proposedNext: producedNext as WorkflowAction };
    }
    return { outcome, proposedNext: { kind: "state-derived" } as unknown as WorkflowAction };
  }

  /** The escalation's own reason, when the state carries one (fed into the revise/hil move). */
  private escalationReason(ctx: StepRouteContext): string | undefined {
    const e = (ctx.state as { escalation?: { reason?: string } }).escalation;
    return e?.reason;
  }
}
