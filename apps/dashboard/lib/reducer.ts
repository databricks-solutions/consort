// The mode-independent fold: (events, snapshot inputs) -> DashboardState.
//
// This file does NO I/O. Everything it needs arrives as arguments, which is what makes
// the board evaluable at any point in a run's event log (`upTo`) and what makes the
// whole derivation unit-testable without a scaffolded project on disk.
//
// The same fold serves both dashboard modes: a live tail and a finished replay log use
// an identical event vocabulary (phase.start / handoff / turn.usage / artifact.written /
// gate.surfaced / ...), so nothing here is live-specific.
//
// Time-travel: at the live edge, disk snapshots (next.json + the feature-status CLI) are
// authoritative. Scrubbed back they would be a lie — they describe *now* — so gates,
// stories and the lane are reconstructed from the log prefix instead, which genuinely can
// rewind. Test COUNTS are the one exception: the log carries only the test_ids that had a
// cycle.* event, so there is no honest historical total. `progress.testsHistorical` goes
// false and the UI omits the bar rather than showing a current or invented number.
import {
  AgentLogEvent,
  DashboardState,
  DESIGN_PHASE_NAMES,
  GateInfo,
  Role,
  ROLES,
  SnapshotInputs,
  WaitingOnHuman,
  Blocker,
} from "./types";
import {
  computeDesignPhases,
  computeStories,
  findPendingGate,
  gatesFromLog,
  reduceAgents,
  resolverFor,
  storiesFromLog,
  blockersFromLog,
  featureIdOf,
  featuresFromLog,
} from "./derive";
import { LANE_IDS, laneProgress, nodeForPhase, passedNodes } from "./topology";

// A Claude session that wrote its transcript within this window counts as "actively
// working" — Consort only logs at turn boundaries, so a long turn otherwise looks frozen.
export const SESSION_ACTIVE_MS = 15_000;

/**
 * How many trailing events the board ships as `recentEvents`.
 *
 * Exported because a source aligning per-event data to that tail (replay's `recentTurns`) must
 * use the SAME length — a mismatch would shift every row's turn ordinal by the difference, and
 * a wrong ordinal silently shows the wrong transcript and the wrong code.
 */
export const RECENT_EVENT_TAIL = 40;

// Transcript-based permission detection proved too flaky to ship; the gate and escalation
// banners stay on and reliable. Flip to re-enable.
export const ENABLE_PERMISSION_BANNER = false;
export const ENABLE_WAITING_BANNER = false;

// An empty board, used for the error paths and as the shape reference.
export function emptyState(projectDir: string, generatedAt: string): DashboardState {
  return {
    ok: false,
    error: null,
    projectDir,
    feature: null,
    features: [],
    pinnedFeature: null,
    phase: null,
    agents: ROLES.map((role) => ({
      role,
      status: "idle",
      work: null,
      phase: null,
      story: null,
      model: null,
      cost: 0,
      turns: 0,
      lastTs: null,
      issues: [],
      turnStartTs: null,
      sessionActive: null,
    })),
    gates: [],
    blockers: [],
    waiting: null,
    progress: {
      testTotal: 0,
      testDone: 0,
      testPct: 0,
      storiesTotal: 0,
      storiesDone: 0,
      testByStatus: { pending: 0, red: 0, green: 0, refactored: 0, skipped: 0 },
      testsHistorical: true,
    },
    designPhases: DESIGN_PHASE_NAMES.map((name) => ({
      name,
      status: "not-started" as const,
      current: false,
      looping: false,
    })),
    stories: [],
    lane: "design" as const,
    totalCost: 0,
    eventCount: 0,
    recentEvents: [],
    generatedAt,
    atEventIndex: 0,
    totalEventCount: 0,
    atLive: true,
    snapshotAsOf: null,
    topology: {
      passedNodes: [],
      activeNode: null,
      laneSteps: { plan: [], design: [], build: [] },
      laneCurrent: null,
      atTimestamp: null,
    },
  };
}

// Graph lighting for the folded window: which lifecycle nodes were reached, which node the
// playhead sits in, and the same for lane sub-steps. Derived here rather than on the client
// because the client only receives a 40-event tail, while this needs the whole prefix.
function deriveTopology(
  slice: AgentLogEvent[],
  /**
   * The feature the playhead is on. Scopes graph lighting to it, so a multi-feature run does
   * not inherit an earlier sprint's progress: at event 230 of the stockflow-rerecord corpus,
   * sprint 2 has only begun designing, but unscoped `passedNodes` reached `promote` and all
   * seven build sub-steps were lit — the lifecycle graph drew a shipped feature that had not
   * written a line of code. Null (a log that never stamps a feature) means whole-run, which is
   * the single-feature behavior this preserves exactly.
   */
  feature: string | null,
  /**
   * True when the scoped feature has already shipped (`phase.end`/`workflow` fired for it). A
   * done feature has nothing running, full stop. This is load-bearing only when a PAST feature
   * is pinned: the feature_id carry-forward attributes the next sprint's dispatch events (which
   * carry no id yet) to the feature before them, so a shipped F1 pinned mid-F6 would otherwise
   * borrow F6's opening `plan` as its active node. At the natural playhead the walk's own
   * `phase.end` handling already covers this, so it is a no-op there.
   */
  featureDone: boolean,
): DashboardState["topology"] {
  const scope = feature ?? undefined;
  const progress = laneProgress(slice, undefined, scope);
  const laneSteps: Record<string, string[]> = {};
  for (const lane of LANE_IDS) laneSteps[lane] = [...progress.done[lane]];

  // The active node is the most recent event carrying a mappable phase — but `phase.end`
  // means that phase FINISHED, so it must not light anything. Without this the last event
  // of a completed run (`phase.end` for `workflow`, which maps to plan) would leave a
  // finished run showing "active in Plan". A trailing phase.end therefore ends the walk:
  // nothing is running now.
  //
  // Scoped to `feature` the same way `passedNodes`/`laneProgress` are: a feature_id is carried
  // forward (not every event stamps one), and events outside the scope are skipped. Without this
  // a pin onto a FINISHED feature borrowed the active node of whatever the playhead's own feature
  // was doing — a shipped F1 pinned at event 300 showed F6's "design" as active. Tag each index's
  // feature in a forward pass, then walk back within scope.
  //
  // Built only when there is a feature to scope to AND the walk will run — a single-feature run
  // (`feature === null`) or a pinned-done feature (`featureDone`, walk skipped) never reads it,
  // so the common poll path pays nothing for this extra pass.
  let featureAt: (string | null)[] = [];
  if (feature !== null && !featureDone) {
    featureAt = new Array(slice.length);
    let f: string | null = null;
    for (let i = 0; i < slice.length; i++) {
      const id = featureIdOf(slice[i]);
      if (id) f = id;
      featureAt[i] = f;
    }
  }
  let activeNode: string | null = null;
  for (let i = slice.length - 1; !featureDone && i >= 0; i--) {
    if (feature !== null && featureAt[i] !== feature) continue; // out of scope
    const e = slice[i];
    const md = (e.metadata || {}) as Record<string, unknown>;
    const phase = typeof md.phase === "string" ? md.phase : null;
    if (e.event === "phase.end") {
      if (phase !== null) break; // this phase closed and nothing reopened after it
      continue; // no phase to reason about; keep looking back
    }
    const node = nodeForPhase(phase);
    if (node) {
      activeNode = node;
      break;
    }
    if (e.event === "intake.supplied") {
      activeNode = "intake";
      break;
    }
  }

  return {
    passedNodes: [...passedNodes(slice, undefined, scope)],
    activeNode,
    laneSteps,
    laneCurrent: progress.current,
    atTimestamp: slice.length > 0 ? slice[slice.length - 1].timestamp : null,
  };
}

// Which lane a scrubbed-back playhead is in.
//
// Prefer the node the playhead sits in; when nothing is active — the last folded event was a
// `phase.end`, so a phase just closed and the next hasn't opened — fall back to the furthest
// node REACHED. Defaulting to "design" there was wrong: at event 372 the stockflow run has
// just finished deploying, and the board claimed it was back in design.
//
// Note this uses activeNode first precisely because `passedNodes` alone is too generous:
// `reflect` maps to the build node, so a design-lane reflect would otherwise read as "build".
function laneFromPlayhead(topology: DashboardState["topology"]): "design" | "build" | "complete" {
  const laneOf = (node: string | null): "design" | "build" | "complete" | null => {
    if (node === "shipped" || node === "promote") return "complete";
    if (node === "build" || node === "deploy") return "build";
    if (node === "design" || node === "plan" || node === "intake") return "design";
    return null;
  };

  const active = laneOf(topology.activeNode);
  if (active) return active;

  // Nothing running: use the furthest point the run got to, most advanced first.
  const passed = new Set(topology.passedNodes);
  if (passed.has("shipped") || passed.has("promote")) return "complete";
  if (passed.has("deploy")) return "build";
  return "design";
}

/**
 * Fold an event log into a dashboard state.
 *
 * @param events all events read from agent-log.jsonl, oldest first.
 * @param snap   disk-sourced inputs the log cannot supply (see SnapshotInputs).
 * @param upTo   how many events to fold. Omitted/undefined = the whole log ("live").
 *               Clamped to [0, events.length], so callers may pass raw user input.
 * @param pinnedFeature scope the board to this feature instead of the playhead's own. A FILTER,
 *               not a seek: `upTo` (the playhead) is untouched, only which feature the board
 *               shows changes. Ignored when it names a feature the window hasn't seen, so a
 *               stale pin degrades to the playhead's feature rather than emptying the board.
 *
 * Pure: same arguments always yield the same state. Monotonic in `upTo` for the
 * cumulative measures (cost, turn counts, event count).
 */
export function fold(
  events: AgentLogEvent[],
  snap: SnapshotInputs,
  upTo?: number,
  pinnedFeature?: string | null,
): DashboardState {
  const total = events.length;
  const at = upTo === undefined ? total : Math.max(0, Math.min(Math.floor(upTo), total));
  const atLive = at === total;
  // The window being folded. Everything below derives from `slice`, never `events`,
  // so a scrubbed-back board cannot leak state from the future.
  const slice = at === total ? events : events.slice(0, at);

  const base = emptyState(snap.projectDir, snap.generatedAt);
  const { next, status } = snap;

  // Agents and totalCost are deliberately RUN-level, not feature-scoped — a FeatureSwitcher pin
  // does not narrow them. The agent bubbles answer "who is on the run and what are they doing",
  // which is a property of the run, not of whichever feature you are inspecting; and cost is a
  // cumulative run total everywhere else in the UI (the cost bar sums the whole run), so scoping
  // it to a pinned past feature would make one number silently mean something different from the
  // same number unpinned. Gates, blockers, stories, topology and the test bar ARE scoped, because
  // those describe a feature's state; agents/cost describe the run around it.
  const { agents, totalCost, runEnded } = reduceAgents(slice);

  // Liveness for working agents. Only meaningful at the live edge: mid-run history is not
  // "active now", so a scrubbed-back board leaves sessionActive null rather than claiming
  // a past turn is live.
  if (atLive && agents.some((a) => a.status === "working")) {
    const live = snap.sessionAgeMs < SESSION_ACTIVE_MS;
    for (const a of agents) if (a.status === "working") a.sessionActive = live;
  }

  // Active feature. The newest folded event wins when scrubbed back: next.json names the
  // feature being worked on NOW, which for a multi-feature run is not the one that was
  // active 200 events ago. At the live edge next.json is preferred — it is authoritative
  // and survives a log that hasn't stamped feature_id recently.
  // featureIdOf skips `reasoning` events, whose feature_id is unreliable — in the corpus
  // three of them hold a story id or a truncated "F1", which would otherwise make the newest
  // -event-wins rule name a story as the active feature.
  const featureFromLog = (): string | null => {
    for (let i = slice.length - 1; i >= 0; i--) {
      const f = featureIdOf(slice[i]);
      if (f) return f;
    }
    return null;
  };
  // The feature the playhead naturally sits on, before any pin.
  const playheadFeature =
    atLive ? next?.feature ?? featureFromLog() : featureFromLog() ?? next?.feature ?? null;

  // Every feature the window has touched — the switcher's list, and the validity check for a
  // pin. A pin naming a feature not in this window is stale (scrubbed before it appears, or a
  // different run) and is dropped, so the board falls back to the playhead's feature.
  //
  // `active` is re-derived against `playheadFeature`, NOT left at featuresFromLog's last-seen
  // guess: at the live edge playheadFeature prefers next.json's feature, which can differ from
  // the last feature_id stamped in the log. Divergence below is computed against playheadFeature
  // too, so the header's "run is on <active>" label and the "is this pin divergent" decision now
  // read one source and can't contradict each other (was: label from the active flag, divergence
  // from playheadFeature — a pin on the last-log feature could render "showing X · run is on X").
  const features = featuresFromLog(slice).map((f) => ({ ...f, active: f.id === playheadFeature }));
  const pinValid = pinnedFeature != null && features.some((f) => f.id === pinnedFeature);
  // The feature the board is SCOPED to. A valid pin wins; otherwise the playhead's own.
  const feature = pinValid ? pinnedFeature! : playheadFeature;
  // Surface the pin only when it actually diverges from the playhead — the UI's cue to say
  // "showing X · run is on Y" and the fold's cue to omit the (playhead-scoped) test bar.
  const pinnedDivergent = pinValid && pinnedFeature !== playheadFeature ? pinnedFeature! : null;

  // --- gates ---
  // At the live edge the disk snapshot is authoritative. Scrubbed back it would be a lie —
  // it describes now — and gates ARE reconstructable from the log (gate.surfaced →
  // gate.approved), so derive them instead of showing current values under a past playhead.
  const snapshotGates: GateInfo[] = status?.gates
    ? Object.entries(status.gates).map(([name, g]) => ({ name, status: g.status }))
    : [];
  // A divergent pin cannot use the snapshot — it describes the ACTIVE feature, not the pinned
  // past one — so derive from the log, scoped to the pinned feature. This is the same honesty
  // rule the test bar obeys, extended to gates: the OTHER feature's open gate must not surface
  // under this one. At the natural playhead behavior is unchanged.
  const gates: GateInfo[] =
    pinnedDivergent !== null
      ? gatesFromLog(slice, feature ?? undefined)
      : atLive && snapshotGates.length > 0
        ? snapshotGates
        : gatesFromLog(slice);

  // Blockers + resolver routing. Prefer the AUTHORITATIVE .handback file (Consort names the
  // exact role that must fix a failed contract); fall back to a keyword guess from the
  // blocker source only when no handback matches.
  const handbacks = snap.handbacks;
  const handbackRoleFor = (story: string | null): Role | null =>
    handbacks.find((h) => h.story === story)?.role ?? // exact story match
    handbacks.find((h) => h.story === null)?.role ?? // feature-scoped handback
    (handbacks.length === 1 ? handbacks[0].role : null); // sole handback, story unknown

  // next.json's blockers describe NOW, so they leaked into every scrubbed view — a
  // GREEN-verify failure showed at event 0, before any code existed. The log records the
  // same escalations, so reconstruct them when scrubbed back.
  // A divergent pin derives blockers from the log scoped to the pinned feature, for the same
  // reason as gates: next.json's blockers describe the ACTIVE feature. Otherwise unchanged.
  const rawBlockers =
    pinnedDivergent !== null
      ? blockersFromLog(slice, feature ?? undefined).map((b) => ({ ...b, resolver_hint: null }))
      : atLive
        ? (next?.state?.blockers ?? []).map((b) => ({
            source: b.source,
            reason: b.reason,
            story: b.story ?? null,
            resolver_hint: b.resolver_hint ?? null,
          }))
        : blockersFromLog(slice).map((b) => ({ ...b, resolver_hint: null }));

  const blockers: Blocker[] = rawBlockers.map((b) => {
    const resolverRole = handbackRoleFor(b.story ?? null) ?? resolverFor(b.source);
    if (resolverRole) {
      const a = agents.find((x) => x.role === resolverRole);
      if (a && a.status === "idle") a.status = "issue";
    }
    return {
      source: b.source,
      reason: b.reason,
      story: b.story ?? null,
      resolverRole,
      resolverHint: b.resolver_hint,
    };
  });

  // Mark agents that flagged issues (and aren't currently working) as issue-state.
  for (const a of agents) {
    if (a.issues.length > 0 && a.status === "idle") a.status = "issue";
  }

  const waiting = deriveWaiting(slice, snap, agents, atLive);

  // --- stories ---
  // Same reasoning as gates: story ids and their lifecycle are in the log, so a scrubbed
  // board reconstructs them. A story the log hasn't mentioned yet simply does not exist at
  // that point — which is why an early playhead legitimately shows none.
  // Prefer the disk snapshot at the live edge — it is authoritative and richer (real Consort
  // statuses, acceptance flags). Fall back to the log when scrubbed back, OR when there is no
  // status on disk at all: the log knows the stories either way, and showing none while the
  // log plainly names three would make the live view worse informed than a scrubbed one.
  const snapshotStories = status?.stories ?? [];
  const allStories =
    atLive && snapshotStories.length > 0
      ? computeStories(slice, snapshotStories, status?.feature_id ?? null)
      : storiesFromLog(slice);

  // Scope to the feature in force (the playhead's, or a pin). A multi-feature run (the
  // stockflow-rerecord corpus ships two sprints) otherwise accumulates every story ever run: at
  // the sprint boundary the board showed three COMPLETED sprint-1 stories with no sign a second
  // feature had started, and the counts read 3/6 instead of 0/3.
  //
  // Scoping is STRICT: a null-feature story is no longer passed through to every feature. That
  // was the PR #12 finding — it traded mis-scoped for silently-hidden, and once the switcher
  // makes per-feature scoping user-visible, a story bleeding into the wrong feature's view is
  // the worse failure. Measured across every prefix of both real logs (421-event corpus,
  // 380-event live): 0 produce a null-feature story, so this is byte-identical on real data —
  // it closes a latent leak rather than changing observed behavior. When NO feature is in force
  // at all (a log that never stamps one), everything shows, unchanged.
  const stories = feature ? allStories.filter((s) => s.feature === feature) : allStories;

  // --- test counts ---
  // In LIVE mode this is the one genuinely unrewindable panel: the log carries only the
  // test_ids that had a cycle.* event (4 in the stockflow run) while the list totals 29, so
  // there is no honest historical count. Report testsHistorical=false when scrubbed and let
  // the UI omit the bar rather than invent one.
  //
  // A source can override that by rewinding its own snapshot and setting
  // `statusIsHistorical` — replay does, from the corpus's per-turn `test-list.json`
  // snapshots. Then the counts describe the playhead and the bar is honest at any position.
  // The distinction lives in the data, not in a mode check, so the fold stays source-agnostic.
  // A divergent pin makes the test bar dishonest: `status` counts describe the playhead's
  // feature (live) or the snapshot taken at the playhead (replay), never the pinned one. There
  // is no per-feature historical count to substitute — the corpus snapshots test-list.json by
  // playhead position, not by feature — so omit the bar rather than show the wrong feature's
  // numbers under this feature's name. Same §3a honesty rule scrubbing already obeys: a wrong
  // number labelled correctly is still a wrong number.
  const statusHistorical = snap.statusIsHistorical === true;
  const testsUsable = (atLive || statusHistorical) && pinnedDivergent === null;
  const testsHistorical = testsUsable;
  const testTotal = testsUsable ? status?.test_list?.total ?? 0 : 0;
  const byStatus = testsUsable ? status?.test_list?.by_status ?? {} : {};
  const testByStatus = {
    pending: byStatus.pending ?? 0,
    red: byStatus.red ?? 0,
    green: byStatus.green ?? 0,
    refactored: byStatus.refactored ?? 0,
    skipped: byStatus.skipped ?? 0,
  };
  const testDone = testByStatus.green + testByStatus.refactored;
  const testPct = !testsUsable
    ? 0
    : status?.test_list?.completion_pct ?? (testTotal ? Math.round((testDone / testTotal) * 100) : 0);
  const storiesDone = stories.filter((s) => s.status === "done").length;

  // --- lane / phase ---
  // derived_phase is a snapshot fact. Scrubbed back, take the lane from where the topology
  // says the playhead is, so the design/build emphasis matches the rest of the board.
  const derivedSnapshot = status?.derived_phase ?? next?.state?.derived_phase ?? null;
  // Is a PAST, shipped feature pinned while a later one is still running? Only then does the
  // scoped feature's own completion override the playhead's lifecycle. At the natural playhead
  // the existing runEnded / laneFromPlayhead logic already gives the right answer (and the
  // sprint-boundary events, which carry no feature_id yet, must not be forced complete just
  // because the carried-forward feature has ended — that is the F1→F6 handoff at event 214).
  const pinnedDone = pinnedDivergent !== null && (features.find((f) => f.id === feature)?.done ?? false);
  const topology = deriveTopology(slice, feature, pinnedDone);
  // Use where the playhead IS, not what the run has ever touched. `passedNodes` is wrong
  // here: `reflect` maps to the build node, so any design-lane reflect would make an
  // early-design playhead claim "build". The lane the current phase belongs to is the
  // honest answer, and it correctly flips back to design when design resumes for story 2.
  // A finished run is `complete`, whatever the snapshot claims. The log's phase.end/workflow
  // is definitive — in the stockflow run derived_phase sits at "build" forever after the
  // workflow ended, which made the Build lane render "· in progress" on a run that had
  // already promoted and shipped. A pinned-and-shipped past feature is complete for the same
  // reason: its own workflow ended, even though the run at large has moved on.
  const derived =
    runEnded || pinnedDone ? "complete" : atLive ? derivedSnapshot : laneFromPlayhead(topology);
  const lane: DashboardState["lane"] =
    derived === "complete" ? "complete" : derived === "build" ? "build" : "design";

  return {
    ...base,
    ok: true,
    error: null,
    feature,
    features,
    pinnedFeature: pinnedDivergent,
    phase: derived,
    agents,
    gates,
    blockers,
    // Banner disabled (ENABLE_WAITING_BANNER): the derivation above still ran, so agent
    // bubble states (waiting/issue) and the blockers list stay populated — we just don't
    // surface the top banner. Flip the flag to bring it back.
    waiting: ENABLE_WAITING_BANNER ? waiting : null,
    progress: {
      testTotal,
      testDone,
      testPct,
      storiesTotal: stories.length,
      storiesDone,
      testsHistorical,
      testByStatus,
    },
    // `lane` is what tells computeDesignPhases to mark every phase complete. At the live
    // edge that comes from the snapshot; scrubbed back it now comes from the playhead, so
    // the design lane stops claiming "all complete" while the run is still designing.
    designPhases: computeDesignPhases(slice, lane),
    stories,
    lane,
    totalCost,
    eventCount: slice.length,
    recentEvents: slice.slice(-RECENT_EVENT_TAIL),
    atEventIndex: at,
    totalEventCount: total,
    atLive,
    snapshotAsOf: next?.generated_at ?? (status ? snap.generatedAt : null),
    topology,
  };
}

// The "Consort is waiting on you" derivation. Two distinct layers, in priority order:
//   (1) a Claude Code PERMISSION prompt in the driving session (freshest, most immediate);
//   (2) a Consort HITL GATE or ESCALATION (from the log, reconciled against next.json).
// Mutates `agents` to mark the surfacing role as waiting, matching prior behavior.
function deriveWaiting(
  events: AgentLogEvent[],
  snap: SnapshotInputs,
  agents: DashboardState["agents"],
  atLive: boolean,
): WaitingOnHuman | null {
  const { next } = snap;
  const nextGeneratedAt = next?.generated_at ?? null;

  let pendingGate = findPendingGate(events);
  // Stale-gate reconcile: if next.json was regenerated AFTER a named GATE was surfaced and
  // no longer lists it open, the human already answered (gate.approved lands in next.json,
  // not the log). Escalations have no gate name and are cleared by a following handoff/
  // phase.start instead, so this applies only to real named gates.
  //
  // Only at the live edge. next.json describes now, so applying it to a past playhead would
  // erase a gate that genuinely WAS pending then — the whole point of scrubbing to it.
  if (
    atLive &&
    pendingGate &&
    pendingGate.variety === "gate" &&
    pendingGate.gate &&
    nextGeneratedAt &&
    pendingGate.ts < nextGeneratedAt
  ) {
    const stillOpen = (next?.state?.open_gates ?? []).includes(pendingGate.gate);
    if (!stillOpen) pendingGate = null;
  }

  const openGates = next?.state?.open_gates ?? [];
  const gateOption = (next?.options ?? []).find((o) => o.kind === "gate");
  const pendingPermission = ENABLE_PERMISSION_BANNER ? snap.pendingPermission : null;

  if (pendingPermission) {
    // Permission prompt wins — it's the live, immediate blocker in the driver session.
    const cmd = pendingPermission.command?.split("\n")[0]?.slice(0, 100) ?? null;
    const article = /^[aeiou]/i.test(pendingPermission.tool) ? "an" : "a";
    return {
      kind: "permission",
      gate: null,
      role: null,
      prompt:
        `Claude Code is asking permission to run ${article} ${pendingPermission.tool} command in the Consort session. ` +
        `Approve it in that terminal to continue.`,
      options: [],
      permission: {
        tool: pendingPermission.tool,
        command: cmd,
        description: pendingPermission.description,
      },
    };
  }

  if (pendingGate?.variety === "escalation") {
    // A role kicked a problem up to you (e.g. a GREEN verify failed). Consort is parked
    // (next.json primary_action = raise-to-hil) until you resolve it and resume.
    const story = pendingGate.story ?? null;
    if (pendingGate.role) {
      const a = agents.find((x) => x.role === pendingGate!.role);
      if (a && a.status === "idle") a.status = "waiting";
    }
    // Prefer next.json's raise-to-hil description (fuller) over the log one-liner.
    const raiseDesc =
      next?.primary_action?.kind === "raise-to-hil" ? next?.primary_action?.describe ?? null : null;
    const ageMs = snap.sessionAgeMs;
    return {
      kind: "escalation",
      gate: null,
      role: pendingGate.role,
      prompt:
        raiseDesc ??
        pendingGate.message ??
        `Consort escalated a problem${story ? ` on ${story}` : ""} and needs you to resolve it before it can proceed.`,
      options: (next?.options ?? []).map((o) => ({ id: o.id, title: o.title })),
      sessionActive: ageMs < SESSION_ACTIVE_MS,
      sessionActiveAgeSec: Number.isFinite(ageMs) ? Math.round(ageMs / 1000) : null,
    };
  }

  if (pendingGate || openGates.length > 0 || gateOption) {
    const gateName = pendingGate?.gate ?? openGates[0] ?? null;
    const surfacedRole = pendingGate?.role ?? null;
    const story = pendingGate?.story ?? null;
    if (surfacedRole) {
      const a = agents.find((x) => x.role === surfacedRole);
      if (a && a.status === "idle") a.status = "waiting";
    }
    const gateLabel = gateName ? `${gateName} gate${story ? ` · ${story}` : ""}` : "a decision";
    const prompt = gateName
      ? `Consort is paused at the ${gateLabel} and needs your review to proceed.`
      : gateOption?.hil_prompt ??
        (next?.options ?? []).find((o) => o.hil_prompt)?.hil_prompt ??
        "Consort is paused and needs your input to proceed.";
    const ageMs = snap.sessionAgeMs;
    return {
      kind: "gate",
      gate: gateName,
      role: surfacedRole,
      prompt,
      options: (next?.options ?? []).map((o) => ({ id: o.id, title: o.title })),
      sessionActive: ageMs < SESSION_ACTIVE_MS,
      sessionActiveAgeSec: Number.isFinite(ageMs) ? Math.round(ageMs / 1000) : null,
    };
  }

  return null;
}
