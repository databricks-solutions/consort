// Pure derivations over an event log. No I/O, no module state.
//
// Split out of consort.ts so the reducer can be evaluated at any point in a run
// (see reducer.ts `fold`) and unit-tested without a project on disk. These functions
// were moved verbatim; behavior is unchanged.
import {
  AgentLogEvent,
  AgentState,
  DesignPhase,
  DESIGN_PHASE_NAMES,
  DesignPhaseName,
  FeatureSummary,
  GateInfo,
  Role,
  ROLES,
  StoryProgress,
} from "./types";

const ISSUE_EVENTS = new Set([
  "smell.flagged",
  "concern.flagged",
  "open.question",
  "runner.missing",
  "adherence.failed",
  "verify.failed",
  "escalation.raised",
  "deploy.failed",
  "deploy.unreachable",
]);
const TURN_END = new Set(["turn.usage", "phase.end"]);
export const ROLE_SET = new Set<string>(ROLES);

// Fallback: infer the fixer role from a blocker's source string by keyword. Used only
// when Consort hasn't written an explicit .handback file (see readHandbacks).
export function resolverFor(source: string): Role | null {
  // build-lane escalations (e.g. "driver-green", "driver-refactor") → the driver
  if (source.includes("driver")) return "driver";
  if (source.includes("navigator")) return "navigator";
  if (source.includes("testlist") || source.includes("test-list") || source.includes("test_list")) return "test-strategist";
  if (source.includes("db-design") || source.includes("schema") || source.includes("migration")) return "dba";
  if (source.includes("architecture") || source.includes("nfr") || source.includes("layer")) return "architect-reviewer";
  if (source.includes("adherence") || source.includes("design-system") || source.includes("ux")) return "ux-designer";
  if (source.includes("spec")) return "spec-author";
  return null;
}

// Scan the log for a HITL stop that is still pending: the last gate.surfaced /
// escalation.raised with no matching resolution after it. Returns null if the run
// is actively proceeding (any turn started after the surface counts as "not waiting").
// `variety` distinguishes a design GATE (gate.surfaced) from an ESCALATION
// (escalation.raised — e.g. a GREEN verify failed and the driver kicked it to you).
export function findPendingGate(
  events: AgentLogEvent[],
): { variety: "gate" | "escalation"; gate: string | null; role: Role | null; story: string | null; message: string | null; ts: string } | null {
  let lastSurface = -1;
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].event === "gate.surfaced" || events[i].event === "escalation.raised") {
      lastSurface = i;
      break;
    }
  }
  if (lastSurface < 0) return null;

  // A gate/escalation STOPS the driver — nothing legitimately logs after it until the
  // human resolves it and the run resumes. So ANY event after the surface means the run is
  // alive again and we're no longer waiting. (Earlier we whitelisted only gate.*/phase.start/
  // handoff, which missed resume signals like `reasoning`, leaving the banner stuck.)
  if (lastSurface < events.length - 1) return null;

  const surface = events[lastSurface];
  const md = (surface.metadata || {}) as Record<string, unknown>;
  const role = surface.role;
  return {
    variety: surface.event === "escalation.raised" ? "escalation" : "gate",
    gate: (md.gate as string) ?? null,
    role: ROLE_SET.has(role) ? (role as Role) : null,
    story: (md.story as string) ?? null,
    message: surface.message ?? null,
    ts: surface.timestamp,
  };
}


// Build the design-lane bar (propose→estimate→breakdown→design→reflect) from history.
// A phase is `complete` once a strictly-later phase has run; the newest design-lane
// phase.start is `in-progress`/`current`. reflect loops back into design, so when the
// active phase is design or reflect after at least one reflect has occurred, both are
// marked `looping`. Once the run is past design (lane=build/complete) all are complete.
export function computeDesignPhases(events: AgentLogEvent[], lane: string): DesignPhase[] {
  const order: DesignPhaseName[] = [...DESIGN_PHASE_NAMES];
  const rank = new Map(order.map((p, i) => [p, i] as const));

  let maxRank = -1; // furthest phase reached
  let currentPhase: DesignPhaseName | null = null;
  let reflectSeen = false;
  for (const e of events) {
    if (e.event !== "phase.start") continue;
    const ph = (e.metadata as Record<string, unknown> | undefined)?.phase as DesignPhaseName | undefined;
    if (!ph || !rank.has(ph)) continue;
    currentPhase = ph; // last design-lane phase to start
    maxRank = Math.max(maxRank, rank.get(ph)!);
    if (ph === "reflect") reflectSeen = true;
  }

  const designDone = lane === "build" || lane === "complete";
  const activeLoop = !designDone && reflectSeen && (currentPhase === "design" || currentPhase === "reflect");

  return order.map((name) => {
    const r = rank.get(name)!;
    let status: DesignPhase["status"];
    if (designDone) status = "complete";
    else if (currentPhase === name) status = "in-progress";
    else if (r < maxRank) status = "complete";
    else status = "not-started";
    return {
      name,
      status,
      current: !designDone && currentPhase === name,
      looping: activeLoop && (name === "design" || name === "reflect"),
    };
  });
}

// Map a raw Consort story status to a coarse lifecycle bucket + whether it's mid-design.
// "design" bucket splits into actively-designing vs design-complete (ready = gate approved,
// queued to build) so the UI can show a filled design step even before build starts.
export function storyStage(status: string): "design" | "build" | "done" {
  if (status === "done" || status === "discarded") return "done";
  if (status === "building" || status === "awaiting-acceptance") return "build";
  return "design"; // designing | awaiting-gate | ready
}
export function designComplete(status: string): boolean {
  // "ready" means the story cleared its design/spec gate and is queued for build.
  return status === "ready" || status === "building" || status === "awaiting-acceptance" || status === "done";
}

// Per-story lifecycle for the sub-progress row: authoritative status from feature-status,
// plus the story's current design-lane phase (last design/reflect phase.start seen for it).
export function computeStories(
  events: AgentLogEvent[],
  statusStories: {
    story_id: string;
    status: string;
    gate_status?: string | null;
    accepted?: boolean;
    feature_id?: string | null;
  }[],
  /**
   * The feature the CLI is reporting on (`FeatureStatus.feature_id`). It reports one feature
   * at a time, so this is the authoritative owner of every story in `statusStories`; the
   * log-derived feature is only the fallback when the caller doesn't supply it.
   */
  statusFeature?: string | null,
): StoryProgress[] {
  const rank = new Set<string>(DESIGN_PHASE_NAMES);
  const lastDesignPhase: Record<string, DesignPhaseName> = {};
  let activeStory: string | null = null;
  // The feature in force at the live edge, so CLI-reported stories can be stamped with it.
  // The CLI reports only the ACTIVE feature's stories, so one value is enough here — unlike
  // storiesFromLog, which spans a whole multi-feature run.
  let currentFeature: string | null = null;
  for (const e of events) {
    const f = featureIdOf(e);
    if (f) currentFeature = f;
    if (e.event === "phase.start") {
      const md = (e.metadata || {}) as Record<string, unknown>;
      const st = md.story as string | undefined;
      const ph = md.phase as string | undefined;
      if (st) activeStory = st;
      if (st && ph && rank.has(ph)) lastDesignPhase[st] = ph as DesignPhaseName;
    } else if (e.event === "handoff") {
      const md = (e.metadata || {}) as Record<string, unknown>;
      if (md.story) activeStory = md.story as string;
    }
  }
  // The status CLI can lag the log: in the stockflow run it reports S1 as `ready` (a DESIGN
  // bucket) long after the log recorded cycle.review, cycle.refactored and verify.passed for
  // it — so the board drew a finished story as still designing. next.json disagrees too
  // (`awaiting-acceptance`). Rather than trust one source blindly, take whichever evidence is
  // furthest along: the log cannot un-happen, so a story the log has verified is done.
  // Keyed by (feature, story) so a multi-feature run can't match sprint 1's finished S1
  // against sprint 2's fresh S1 and reconcile a brand-new story straight to "done".
  const fromLog = new Map(storiesFromLog(events).map((s) => [storyKey(s.feature, s.id), s]));

  return statusStories.map((s) => {
    // The CLI's own feature_id wins when it reports one (per-story, else the report's own
    // feature); otherwise the story belongs to the feature the log is currently on.
    const feature = s.feature_id ?? statusFeature ?? currentFeature;
    const logged = fromLog.get(storyKey(feature, s.story_id));
    // Advance the status when the log proves the story got further than the CLI admits.
    const status =
      logged && stageRank(logged.stage) > stageRank(storyStage(s.status)) ? logged.status : s.status;
    const stage = storyStage(status);
    return {
      id: s.story_id,
      feature,
      status,
      stage,
      designComplete: designComplete(status),
      designPhase: stage === "design" && !designComplete(status) ? lastDesignPhase[s.story_id] ?? null : null,
      gateApproved: s.gate_status === "approved" || (logged?.gateApproved ?? false),
      active: s.story_id === activeStory && status !== "done",
    };
  });
}

// design < build < done, for comparing how far two sources think a story has got.
function stageRank(stage: "design" | "build" | "done"): number {
  return stage === "done" ? 2 : stage === "build" ? 1 : 0;
}


// --- feature + story identity -------------------------------------------------
//
// A story is identified by (feature, id), never by id alone: ids are only unique within a
// feature. Both real logs confirm the hazard — the stockflow-rerecord corpus runs two
// sprints whose stories are both numbered S1/S2/S3.

/**
 * The composite key for a story. Exported so the reducer and tests agree on one spelling.
 *
 * The separator is escaped rather than merely chosen. Left unescaped, `("F1/x", "y")` and
 * `("F1", "x/y")` collide into one key, which would silently merge two stories' progress —
 * the same class of bug as the bare-story-id keying this replaced, just rarer.
 *
 * Measured: no feature or story id in either real log contains a `/` (0 of 9 across the
 * 421-event corpus and the 380-event live log), so this is defensive, not a fix for observed
 * data. It is 2 lines and cannot regress, which is a better trade than a comment promising to
 * revisit — ids come from log metadata and nothing constrains their shape.
 */
export function storyKey(feature: string | null, story: string): string {
  // `~` first, so the escapes it introduces aren't re-escaped. The unknown-feature sentinel is
  // `~2` rather than a bare `?` for the same reason the separator is escaped at all: `?` is a
  // legal feature id, so a bare sentinel would let a feature literally named "?" merge with
  // the unknown bucket that `storiesFromLog`'s rekey path builds and looks up.
  const esc = (s: string) => s.replace(/~/g, "~0").replace(/\//g, "~1");
  return `${feature === null ? "~2" : esc(feature)}/${esc(story)}`;
}

/**
 * The feature_id an event names, or null.
 *
 * `reasoning` events are excluded because their feature_id is unreliable: in the corpus
 * three of them carry a STORY id ("S3-sku-detail-view") or a truncated "F1", and in the
 * stockflow log one does too. Every other event type is clean in both logs (0 bogus of 400+),
 * so the rule is structural — skip the one event type that lies — rather than a guess at
 * whether a value looks feature-shaped. `reasoning` carries no state the fold needs, so
 * ignoring its feature_id costs nothing.
 */
export function featureIdOf(e: AgentLogEvent): string | null {
  if (e.event === "reasoning") return null;
  const f = (e.metadata as Record<string, unknown> | undefined)?.feature_id;
  return typeof f === "string" && f ? f : null;
}

// --- log-derived story + gate state (for scrubbed-back views) ----------------
//
// computeStories/gates above take their authority from disk (feature-status + next.json),
// which describes NOW and cannot rewind. But stories and gates ARE knowable from the log:
// a story id first appears in event metadata, and gate.surfaced/gate.approved carry the
// gate name. So when the board is scrubbed back we derive them here instead of showing
// current values under a historical playhead.
//
// Test COUNTS are the genuine exception and are not derivable: the log carries only the
// handful of test_ids that had a cycle.* event (4 in the stockflow run) while the test list
// totals 29. There is no honest historical number, so the UI omits the bar rather than
// inventing one — see BuildLane's `unavailable` branch.

// Story lifecycle reconstructed from the log prefix. A story exists only once the log has
// mentioned it, which is why a scrubbed-back board can legitimately show zero stories.
// Blockers reconstructed from the log prefix.
//
// next.json's `state.blockers` describes NOW, so it survived a scrub to event 0 — the board
// showed a GREEN-verify failure before the run had written a line of code. The log carries
// the same information: escalation.raised has `source` and `story`, the exact fields
// next.json exposes.
//
// An escalation STOPS the driver, so it is only outstanding while it is the last thing that
// happened; any later event means the human resolved it and work resumed. That is the same
// rule findPendingGate uses, applied per-escalation.
// @param feature scope to one feature (carried forward, since not every event stamps a
//   feature_id); omit for the whole run. Only used to keep a divergent FeatureSwitcher pin
//   honest — a blocker on the ACTIVE feature must not appear under a pinned PAST one.
export function blockersFromLog(
  events: AgentLogEvent[],
  feature?: string,
): { source: string; reason: string; story: string | null }[] {
  const open: { source: string; reason: string; story: string | null }[] = [];
  let currentFeature: string | null = null;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const f = featureIdOf(e);
    if (f) currentFeature = f;
    if (e.event !== "escalation.raised") continue;
    const md = (e.metadata || {}) as Record<string, unknown>;
    // Resolved if anything at all follows it in the folded window.
    if (i < events.length - 1) continue;
    if (feature !== undefined && currentFeature !== feature) continue; // out of scope
    open.push({
      source: typeof md.source === "string" ? md.source : e.role,
      reason: e.message || "escalation raised",
      story: typeof md.story === "string" ? md.story : null,
    });
  }
  return open;
}

export function storiesFromLog(events: AgentLogEvent[]): StoryProgress[] {
  // Keyed by `feature/story`, not by story id. Story ids repeat across features — the
  // stockflow-rerecord corpus ships two sprints whose stories are both S1/S2/S3 — so a bare
  // id collapsed six distinct stories into three and carried sprint 1's "done" onto sprint 2.
  const order: string[] = []; // composite keys, in first-seen order
  const featureOf = new Map<string, string | null>();
  const idOf = new Map<string, string>();
  const lastDesignPhase: Record<string, DesignPhaseName> = {};
  const designPhases = new Set<string>(DESIGN_PHASE_NAMES);
  const specApproved = new Set<string>();
  const awaitingGate = new Set<string>();
  const building = new Set<string>();
  const accepted = new Set<string>();
  let activeKey: string | null = null;
  // The feature in force, carried forward: not every event that names a story also stamps a
  // feature_id, so a story would otherwise land under a null feature mid-sprint.
  let currentFeature: string | null = null;

  const evidence = [specApproved, awaitingGate, building, accepted];

  /**
   * Move everything recorded under `from` onto `to`. Used when a story was first seen before
   * the log stamped a feature_id and the feature resolves later: the composite key embeds the
   * feature, so without this the same story would occupy two keys — two UI rows with divergent
   * stages, double-counted in storiesTotal. The unknown-feature key is the one that yields.
   */
  const rekey = (from: string, to: string, story: string, feature: string | null) => {
    order[order.indexOf(from)] = to;
    featureOf.delete(from);
    idOf.delete(from);
    featureOf.set(to, feature);
    idOf.set(to, story);
    if (lastDesignPhase[from] !== undefined) {
      lastDesignPhase[to] = lastDesignPhase[from];
      delete lastDesignPhase[from];
    }
    for (const set of evidence) {
      if (set.delete(from)) set.add(to);
    }
    if (activeKey === from) activeKey = to;
  };

  const note = (story: unknown, feature: string | null): string | null => {
    if (typeof story !== "string" || !story) return null;
    const key = storyKey(feature, story);
    if (order.includes(key)) return key;
    // The same story already seen while its feature was unknown: adopt the resolved feature
    // rather than starting a second row, carrying the earlier evidence across.
    const unknownKey = storyKey(null, story);
    if (feature !== null && order.includes(unknownKey)) {
      rekey(unknownKey, key, story, feature);
      return key;
    }
    order.push(key);
    featureOf.set(key, feature);
    idOf.set(key, story);
    return key;
  };

  for (const e of events) {
    const md = (e.metadata || {}) as Record<string, unknown>;
    const feature = featureIdOf(e);
    if (feature) currentFeature = feature;
    const key = note(md.story, currentFeature);
    if (key) activeKey = key;

    const phase = typeof md.phase === "string" ? md.phase : null;
    if (e.event === "phase.start" && key && phase && designPhases.has(phase)) {
      lastDesignPhase[key] = phase as DesignPhaseName;
    }
    // A story is building once a build-lane phase runs for it.
    if (key && phase && ["red", "green", "refactor", "review", "repair", "assess"].includes(phase)) {
      building.add(key);
    }
    if (e.event.startsWith("cycle.") && key) building.add(key);
    // Its spec gate clearing moves it out of design. Both signals are honoured because the
    // two real logs disagree: `stockflow` only ever surfaces the spec gate (approval happens
    // out-of-band and is never logged), while the stockflow-rerecord corpus DOES log
    // `gate.approved`/spec right after surfacing it. So an explicit approval is used when
    // present, and build work starting remains the fallback evidence that the gate cleared.
    if (e.event === "gate.approved" && key && md.gate === "spec") specApproved.add(key);
    if (e.event === "gate.surfaced" && key && md.gate === "spec") awaitingGate.add(key);
    // verify.passed is the story's completion signal (acceptance approval isn't logged).
    if (e.event === "verify.passed" && key) accepted.add(key);
    if (e.event === "gate.approved" && key && md.gate === "acceptance") accepted.add(key);
  }

  return order.map((key) => {
    // building implies the spec gate cleared, whether or not an approval was ever logged.
    const status = accepted.has(key)
      ? "done"
      : building.has(key)
        ? "building"
        : specApproved.has(key)
          ? "ready"
          : awaitingGate.has(key)
            ? "awaiting-gate"
            : "designing";
    const stage = storyStage(status);
    return {
      id: idOf.get(key)!,
      feature: featureOf.get(key) ?? null,
      status,
      stage,
      designComplete: designComplete(status),
      designPhase: stage === "design" && !designComplete(status) ? lastDesignPhase[key] ?? null : null,
      gateApproved: specApproved.has(key),
      active: key === activeKey && status !== "done",
    };
  });
}

/**
 * Every feature the folded window has touched, in first-seen order — the FeatureSwitcher's list.
 *
 * `done` is driven by the same signal `reduceAgents` uses for `runEnded`: `phase.end`/`workflow`
 * fires once PER FEATURE (events 213 and 420 in the stockflow-rerecord corpus), carrying that
 * feature's `feature_id`. `active` here is provisional (last feature seen); the reducer
 * re-derives it against `playheadFeature` so it agrees with the board's `feature` even when
 * next.json's feature differs from the last log-stamped one. `reasoning` events are skipped via
 * `featureIdOf`, whose feature_id is unreliable (it would otherwise name a story as a feature).
 *
 * `done` is CLEARED when a feature's work resumes, mirroring `runEnded`'s reset — a feature is
 * done only if its most recent feature-stamped event is the workflow-end, not merely if one ever
 * fired. Both real logs never resume a feature after its end (0 F1 events after event 213), so
 * this is defensive and byte-identical today; it keeps the flag from lying if a corpus ever
 * re-opens a sprint, which would otherwise force lane='complete' on live work via `pinnedDone`.
 */
export function featuresFromLog(events: AgentLogEvent[]): FeatureSummary[] {
  const order: string[] = [];
  const done = new Set<string>();
  let last: string | null = null;
  for (const e of events) {
    const f = featureIdOf(e);
    if (f) {
      if (!order.includes(f)) order.push(f);
      last = f;
      const md = (e.metadata || {}) as Record<string, unknown>;
      // Clear first, then set, so the workflow-end event (which carries this feature_id) leaves
      // the feature done, while any LATER stamped event for it reopens the feature.
      done.delete(f);
      if (e.event === "phase.end" && md.phase === "workflow") done.add(f);
    }
  }
  return order.map((id) => ({ id, done: done.has(id), active: id === last }));
}

// Gate state reconstructed from the log prefix: surfaced → open, then approved.
//
// @param feature scope to one feature (carried forward); omit for the whole run. Only used for
//   a divergent FeatureSwitcher pin, so the OTHER feature's open gate does not surface under the
//   pinned one. Gate events carry feature_id in the corpus (30 of 32); a gate event that somehow
//   lacks one inherits the feature in force, which is the right owner for an unstamped approval.
export function gatesFromLog(events: AgentLogEvent[], feature?: string): GateInfo[] {
  const state = new Map<string, string>();
  let currentFeature: string | null = null;
  for (const e of events) {
    const f = featureIdOf(e);
    if (f) currentFeature = f;
    const md = (e.metadata || {}) as Record<string, unknown>;
    const gate = typeof md.gate === "string" ? md.gate : null;
    if (!gate) continue;
    if (feature !== undefined && currentFeature !== feature) continue; // out of scope
    if (e.event === "gate.surfaced") state.set(gate, state.get(gate) === "approved" ? "approved" : "open");
    else if (e.event === "gate.approved") state.set(gate, "approved");
  }
  return [...state.entries()].map(([name, status]) => ({ name, status }));
}

export function reduceAgents(events: AgentLogEvent[]): { agents: AgentState[]; onDeck: string | null; totalCost: number; runEnded: boolean } {
  const agents: Record<string, AgentState> = {};
  for (const r of ROLES) {
    agents[r] = { role: r, status: "idle", work: null, phase: null, story: null, model: null, cost: 0, turns: 0, lastTs: null, issues: [], turnStartTs: null, sessionActive: null };
  }
  const openTurns: Record<string, boolean> = {};
  let onDeck: string | null = null;
  let runEnded = false;

  // Consort's orchestrator is SEQUENTIAL — it drives one role at a time. So when a role becomes
  // active (dispatched via handoff, or its own phase.start), every OTHER role that still looks
  // "working" has actually finished; its turn just never got a closing event. Close every open
  // turn except the now-active role.
  //
  // For MOST roles in a LIVE run the closing event is turn.usage, so their turns are already
  // shut and this only matters for replays — a REPLAY never spawns the model, emits NO
  // turn.usage, and design/build roles emit no phase.end either, so without this they stay
  // pinned "working" until the terminal phase.end/workflow, showing ghost concurrency (e.g.
  // navigator "working" while release-engineer promotes). But note it is NOT a strict no-op on
  // live runs: some roles emit no turn.usage even live (product-owner only ever emits
  // intake.supplied / phase.start / gate.approved), so this is what closes their turn in both
  // modes. That is correct — a product-owner whose gate the run has moved past IS idle.
  const closeOtherTurns = (activeRole: string | null) => {
    for (const r of Object.keys(openTurns)) {
      if (r === activeRole) continue;
      delete openTurns[r];
      if (agents[r] && agents[r].status === "working") {
        agents[r].status = "idle";
        agents[r].turnStartTs = null;
      }
    }
  };

  for (const e of events) {
    const md = (e.metadata || {}) as Record<string, unknown>;
    const a = ROLE_SET.has(e.role) ? agents[e.role] : null;
    if (a) a.lastTs = e.timestamp;

    // The workflow-terminal event: the orchestrator emits phase.end with phase "workflow"
    // as the run's very last event. The last roles to run never get a closing turn event
    // and there's no later handoff/phase.start to clear them, so without this they stay in
    // openTurns and the finalize step pins them "working" forever (a completed run must show
    // calm bubbles, not 8 spinners). Clear every open turn + any dangling on-deck now.
    // A new PHASE STARTING means the workflow is going again, so an earlier END is no longer
    // the last word. This matters on multi-feature runs: `phase.end`/`workflow` fires once PER
    // FEATURE (twice in the stockflow-rerecord corpus, at 213 and 420), and while the flag was
    // sticky, sprint 1 finishing retired the board for the remaining 200 events — lane frozen
    // at "complete" and every bubble calm while sprint 2 was still designing and building.
    //
    // A handoff counts only when it DISPATCHES INTO A PHASE. Every handoff in both real logs
    // carries one (71/71 in the corpus, 89/89 in stockflow) — event 214 is sprint 2's genuine
    // dispatch into `author-requests`, so ignoring handoffs outright would leave the board
    // "complete" through the start of sprint 2. But treating a bare handoff as a resume let a
    // single trailing wind-down handoff revive a shipped run, reinstating the exact
    // "Build · in progress" / spinning-bubble bug that motivated `runEnded`. Requiring the
    // phase keeps both: work being dispatched resumes the run, mere role-naming does not.
    if (e.event === "phase.start" || (e.event === "handoff" && md.phase)) runEnded = false;

    if (e.event === "phase.end" && md.phase === "workflow") {
      runEnded = true;
      for (const r of Object.keys(openTurns)) {
        delete openTurns[r];
        if (agents[r] && agents[r].status === "working") {
          agents[r].status = "idle";
          agents[r].turnStartTs = null;
        }
      }
      onDeck = null;
    }

    if (e.event === "handoff") {
      const toRole = (md.to_role as string) ?? null;
      onDeck = toRole ?? onDeck;
      // Dispatching the next role proves any other still-"working" role has finished (see
      // closeOtherTurns) — including the orchestrator, which code-emits phase.start but never a
      // closing turn.usage/phase.end and would otherwise look "working" forever. The incoming
      // role isn't working yet (it's on-deck until its own phase.start), so exclude it.
      // Guard on toRole: a handoff with no to_role must NOT pass null here, or closeOtherTurns
      // would idle every open turn including the genuinely-active role.
      if (toRole) closeOtherTurns(toRole);
    }

    if (e.event === "phase.start" && a) {
      // the dispatched role has started — it's no longer merely "on deck"
      if (onDeck === e.role) onDeck = null;
      // A role starting proves the previous one finished (sequential orchestrator). Not every
      // handoff precedes a phase.start in a replay log (e.g. navigator's cycle.review flows
      // straight into release-engineer's phase.start with no handoff between), so close other
      // open turns here too. See closeOtherTurns for why this matters mostly, but not only, to
      // replays.
      closeOtherTurns(e.role);
      openTurns[e.role] = true;
      a.status = "working";
      a.phase = (md.phase as string) ?? null;
      a.story = (md.story as string) ?? null;
      a.model = e.model ?? a.model;
      a.work = e.message ?? (md.phase as string) ?? "working";
      a.turnStartTs = e.timestamp; // when this still-open turn began (for "working for Nm")
      // Starting a new phase means any issue this role previously flagged has been resolved
      // (the run moved on). Issues are otherwise append-only, which would pin a role red on a
      // long-since-resolved escalation. A genuinely-open issue is one with no later phase.start
      // for its role — it survives because nothing clears it. Mirrors findPendingGate's
      // "any later activity = resolved" rule, applied per role.
      a.issues = [];
    }

    if (TURN_END.has(e.event) && a) {
      delete openTurns[e.role];
      if (a.status === "working") a.status = "idle";
      a.turnStartTs = null; // turn closed — no longer an open, in-progress turn
      if (e.event === "turn.usage") {
        a.cost += Number(md.cost_usd || 0);
        a.turns += 1;
      }
    }

    if ((e.event.startsWith("cycle.") || e.event === "progress" || e.event === "artifact.written") && a && openTurns[e.role]) {
      a.work = e.message ?? a.work;
    }

    if (ISSUE_EVENTS.has(e.event) && a) {
      a.issues.push({
        event: e.event,
        detail: String(md.detail ?? md.note ?? md.reason ?? e.message ?? ""),
        story: (md.story as string) ?? null,
      });
    }
  }

  // finalize: open turns win; a dispatched-but-not-started role is on-deck. Skip entirely
  // once the run has ended — a completed workflow leaves nothing working or on-deck.
  if (!runEnded) {
    for (const r of Object.keys(openTurns)) if (agents[r]) agents[r].status = "working";
    if (onDeck && agents[onDeck] && agents[onDeck].status === "idle") agents[onDeck].status = "on-deck";
  }

  const totalCost = Object.values(agents).reduce((s, a) => s + a.cost, 0);
  // runEnded is exported because it is the log's own statement that the workflow finished —
  // more trustworthy than a `derived_phase` snapshot, which can sit at "build" indefinitely
  // after the run is over (it does in the stockflow run).
  return { agents: Object.values(agents), onDeck, totalCost, runEnded };
}
