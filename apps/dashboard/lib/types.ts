// Shared types for the Consort observability dashboard.

export type AgentStatus = "working" | "on-deck" | "issue" | "waiting" | "idle";

export const ROLES = [
  "orchestrator",
  "spec-author",
  "ux-designer",
  "architect-reviewer",
  "dba",
  "test-strategist",
  "navigator",
  "driver",
  "product-owner",
  "release-engineer",
] as const;
export type Role = (typeof ROLES)[number];

export interface AgentIssue {
  event: string; // e.g. "smell.flagged"
  detail: string; // human-readable
  story: string | null;
}

export interface AgentState {
  role: Role;
  status: AgentStatus;
  work: string | null; // one-line "what it's doing now"
  phase: string | null;
  story: string | null;
  model: string | null;
  cost: number; // cumulative USD across turns
  turns: number;
  lastTs: string | null;
  issues: AgentIssue[];
  // For a "working" agent: when its current (still-open) phase started, so the UI can show
  // "working for Nm". Consort only logs at turn boundaries, so a long turn otherwise looks
  // frozen; pair this with sessionActive to distinguish a live long turn from a hang. null
  // when the agent isn't working. `sessionActive` = a Claude session wrote its transcript
  // very recently (an agent really is executing), null when unknown/not applicable.
  turnStartTs: string | null;
  sessionActive: boolean | null;
}

export interface GateInfo {
  name: string; // spec | plan | test_list | promote | deploy
  status: string; // open | approved | ...
}

export interface Blocker {
  source: string;
  reason: string;
  story: string | null;
  resolverRole: Role | null; // who must fix it (arrow target)
  resolverHint: string | null;
}

export interface WaitingOnHuman {
  // "gate" = a Consort HITL design gate; "escalation" = a role kicked a problem up to you
  // (e.g. a GREEN verify failed), Consort parked at raise-to-hil; "permission" = a Claude
  // Code approval prompt in the driving session (a tool_use awaiting your OK) — a different layer.
  kind: "gate" | "escalation" | "permission";
  gate: string | null; // gate awaiting a decision (gate kind)
  role: Role | null; // agent that surfaced it (gate kind)
  prompt: string | null; // the message to show the user
  options: { id: string; title: string }[];
  permission?: { tool: string; command: string | null; description: string | null };
  // Liveness (gate/escalation only): true when a Claude Code session in the project wrote
  // its transcript very recently — i.e. an agent is ACTIVELY working this escalation/gate
  // (e.g. auto-diagnosing a deploy failure), as opposed to it sitting idle, waiting on a
  // human. Lets the banner say "being worked on" vs "waiting on you". null = unknown.
  sessionActive?: boolean;
  sessionActiveAgeSec?: number | null; // seconds since the most recent session activity
}

// The design lane, in order. propose/estimate/breakdown are feature-level (~/plan);
// design & reflect iterate per story (reflect loops back into design).
export const DESIGN_PHASE_NAMES = ["propose", "estimate", "breakdown", "design", "reflect"] as const;
export type DesignPhaseName = (typeof DESIGN_PHASE_NAMES)[number];

export interface DesignPhase {
  name: DesignPhaseName;
  status: "not-started" | "in-progress" | "complete";
  current: boolean; // the phase running right now (highlighted)
  looping: boolean; // part of the active design⇄reflect loop
}

// Per-story lifecycle, so the board can show "S1 done · S2 building · S3 in design"
// rather than only the feature-aggregate lanes. `stage` is the coarse position;
// `designPhase` is the story's current design-lane phase while it's still designing.
export interface StoryProgress {
  id: string;
  // The feature this story belongs to. Story ids are unique only WITHIN a feature — the
  // stockflow-rerecord corpus runs two sprints whose stories are both numbered S1/S2/S3 —
  // so `feature` is what makes a story identifiable. Null when the log never stamped a
  // feature_id (an early playhead, or the CLI reporting stories without one).
  feature: string | null;
  status: string; // raw Consort status: designing|awaiting-gate|ready|building|awaiting-acceptance|done|discarded
  stage: "design" | "build" | "done"; // coarse lifecycle bucket for the UI
  designComplete: boolean; // design/spec gate cleared (ready or later)
  designPhase: DesignPhaseName | null; // the design phase this story is in (while designing)
  gateApproved: boolean;
  active: boolean; // the story currently being worked (design or build)
}

// One entry per feature a run has touched, in first-seen (log) order. Powers the header's
// FeatureSwitcher so a multi-feature run — the stockflow-rerecord corpus ships two sprints —
// can reach an earlier feature that the playhead has scrolled past. `active` is the feature
// the playhead is currently on; `done` is a feature whose `phase.end`/`workflow` has fired.
// A feature can be neither (started, not yet finished, not the active one).
export interface FeatureSummary {
  id: string;
  done: boolean;
  active: boolean;
}

// The capability vocabulary. Declared here (not in source.ts) because DashboardState must
// reference it and source.ts already imports this module — source.ts derives its own
// `Capability` type from this, so there is one list, not two that can drift.
export const CAPABILITY_NAMES = [
  "timeline", // fold events to any index
  "transport", // scrub / play over the log
  "liveness", // session-active detection; meaningless for a finished corpus
  "featureStatus", // the feature-status CLI's authoritative %
  "artifactPaths", // artifact.written paths from the log
  "artifactContent", // file contents (HEAD in live, per-turn snapshot in replay)
  "transcripts", // per-turn transcript.md — replay only
  "planningBacklog", // proposals, t-shirt sizes, plan gate
  "stepOutputs", // per-lifecycle-step deliverables (recorded-artifacts in replay, .consort at HEAD live)
  "correspondence", // the HIL↔orchestrator message stream (correspondence.jsonl), folded into the timeline
] as const;
export type CapabilityName = (typeof CAPABILITY_NAMES)[number];

export type SourceModeName = "live" | "replay";

// Which source produced a board, attached by /api/state rather than by the fold (the fold is
// source-agnostic). `capabilities` is the typed union, NOT string[]: a UI panel gating on
// `capabilities.includes("artifactContent")` must fail to compile on a typo, since a silent
// miss would disable the panel forever with no test failure.
export interface SourceMeta {
  mode: SourceModeName;
  describe: string;
  capabilities: CapabilityName[];
  availableModes: SourceModeName[];
  note: string | null;
  /**
   * Log↔corpus pairing health, for sources that correlate (replay only; null in live).
   *
   * The §6 risk table promises log↔turn pairing is treated as "validated-and-fallible" and
   * that drift is surfaced rather than mis-mapped silently. `correlate()` produces the full
   * report, but only this summary crosses the wire: the board needs to know whether to trust
   * a turn, not the 71 individual pairings.
   */
  correlation?: {
    healthy: boolean;
    /**
     * How loudly to surface the pairing caveat — this is ALWAYS about the dashboard's ability to
     * pair the run to a recorded corpus, never about the run's own health:
     *   "ok"      — paired cleanly; the banner never renders.
     *   "info"    — a benign observability caveat (kit-version drift, or the live edge running
     *               ahead of the corpus). Turn drill-downs may be approximate; the run is fine.
     *   "warning" — a role the corpus never recorded, i.e. the RECORD_DIR likely points at a
     *               DIFFERENT run. Worth a look, but still not a run/deploy failure.
     * From `driftSeverity()`.
     */
    severity: "ok" | "info" | "warning";
    /** One-line explanation when unhealthy; null when fine. From `driftMessage()`. */
    message: string | null;
    paired: number;
    /** Legitimately unpaired (roles owning no invoke-role turns) — NOT drift. */
    structural: number;
    unpairedEvents: number;
    /** null = one side carries no kit stamp, which is unknown rather than mismatched. */
    kitVersionMatch: boolean | null;
    /**
     * Turn ordinal for each entry of `recentEvents`, positionally aligned, null where an event
     * begins no turn (most of them).
     *
     * Aligned server-side on purpose. `recentEvents` is a 40-event tail of a window whose size
     * the client doesn't own, so having the client derive absolute indices to look up pairings
     * would be off-by-one bait — and a wrong turn ordinal shows the wrong transcript and the
     * wrong code, which is the exact failure this module exists to prevent.
     */
    recentTurns: (number | null)[];
  } | null;

  /**
   * The HIL ↔ orchestrator conversation, folded into the event timeline (replay only; null when
   * the corpus ships no correspondence.jsonl).
   *
   * A compact, render-ready tail rather than the full parse — it rides on the 1 Hz poll, and the
   * ticker only needs enough to draw a row. Filtered to the playhead like everything else on the
   * board, so scrubbing rewinds the conversation too. The `progress`/`gate` rows carry an
   * `outcome`, which is the per-action completion signal the agent-log's turn-boundary logging
   * lags on — an authoritative "this action finished" the ticker marks with a ✓.
   */
  correspondence?: {
    recent: {
      at: string;
      direction: string;
      phase: string | null;
      kind: string | null;
      by: string | null;
      /** Rendered markdown of the exchange (request, or response when that's the substance). */
      text: string;
      /** The turn this exchange concerns, when it names one — 1:1 with the log's turn ordinals. */
      ordinal: number | null;
      /** Completion signal: approved (a gate/HIL decision) or validated (an action finished). */
      outcome: "approved" | "validated" | null;
    }[];
  } | null;

  /**
   * Recording fidelity, for live sources — whether the watched build is capturing the full
   * record-lane corpus (`turns/` + `correspondence.jsonl` + per-turn file snapshots) or only the
   * append-only `agent-log.jsonl`.
   *
   * Null where the question is meaningless: a replay corpus IS a finished recording by
   * definition, so it never shows the fidelity banner. When present and `recording` is false, the
   * live board can open produced files at HEAD and rewind the timeline, but it has no prompts,
   * no inputs, and no point-in-time per-step snapshots — the FidelityBanner says so out loud and
   * names the env var that turns capture on, so a silently-missing capability becomes an
   * actionable message instead of a "where did the drill-down go?".
   */
  fidelity?: { recording: boolean } | null;
}

export interface AgentLogEvent {
  timestamp: string;
  level: "debug" | "info" | "warn" | "error";
  role: string;
  model?: string;
  effort?: string;
  event: string;
  message: string;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Disk-sourced inputs to the fold.
//
// These describe the project as it is RIGHT NOW: next.json is regenerated when the
// driver stops, and FeatureStatus comes from shelling `lk lakebase-feature-status`.
// Neither has history, so the fold only trusts them at the live edge — scrubbed back it
// reconstructs the same facts from the log prefix instead (see reducer.ts). They can also
// go STALE at the live edge: derived_phase sits at "build" after a run ends, and the status
// CLI reported a story as `ready` long after the log verified it. The fold reconciles both
// against the log, which is append-only and cannot lie about the past.
export interface NextJson {
  feature?: string;
  state?: {
    derived_phase?: string | null;
    stories?: Record<string, string>;
    open_gates?: string[];
    blockers?: {
      source: string;
      reason: string;
      story?: string | null;
      resolver_hint?: string | null;
    }[];
  };
  options?: { id: string; title: string; hil_prompt?: string; kind?: string }[];
  primary_action?: { kind?: string; describe?: string };
  generated_at?: string;
}

export interface FeatureStatus {
  feature_id: string;
  derived_phase?: string | null;
  stories?: { story_id: string; status: string; gate_status?: string | null; accepted?: boolean }[];
  test_list?: { total: number; by_status: Record<string, number>; completion_pct: number } | null;
  gates?: Record<string, { status: string }> | null;
}

export interface PendingPermission {
  tool: string;
  command: string | null;
  description: string | null;
}

// Everything the fold needs that does NOT come from the event log. Gathering these
// behind one struct is what makes `fold()` a pure function: the caller does the I/O,
// the reducer does the deriving. Tests construct these directly.
export interface SnapshotInputs {
  projectDir: string;
  next: NextJson | null;
  status: FeatureStatus | null;
  // Authoritative issue→resolver routing, read from .sftdd/features/<id>/.handback/.
  handbacks: { role: Role; story: string | null }[];
  // Age of the most recent Claude session transcript write, in ms. Infinity when unknown.
  sessionAgeMs: number;
  pendingPermission: PendingPermission | null;
  generatedAt: string;
  /**
   * True when `status` describes the playhead rather than "now" — i.e. the source rewound
   * its snapshot half to match the folded window.
   *
   * Live can never set this: there is no way to know what the feature-status CLI would have
   * reported 200 events ago (plan §3a). Replay can, because the corpus snapshots
   * `test-list.json` inside individual turns, so it supplies the real counts as of the
   * playhead and the test bar becomes scrubbable instead of hidden.
   *
   * Optional so live and every existing test keep their current meaning by omission.
   */
  statusIsHistorical?: boolean;
}

export interface DashboardState {
  ok: boolean;
  error: string | null;
  projectDir: string;
  feature: string | null;
  // Every feature the folded window has touched, first-seen order — the FeatureSwitcher's list.
  features: FeatureSummary[];
  // Set when the board is FILTERED to a feature that is not the one the playhead sits on. It is
  // a filter, not a seek: `atEventIndex` is unchanged, so the transport still points where it
  // did. The UI uses this to say "showing F1 · run is on F6" rather than implying a rewind, and
  // the fold uses it to omit the test bar (snapshot counts describe the playhead's feature, not
  // this one — labelling a wrong number doesn't make it honest). Null when the pin coincides
  // with the playhead's feature, or when nothing is pinned.
  pinnedFeature: string | null;
  phase: string | null; // derived_phase: design | build | complete
  agents: AgentState[];
  gates: GateInfo[];
  blockers: Blocker[];
  waiting: WaitingOnHuman | null;
  progress: {
    testTotal: number;
    testDone: number;
    testPct: number;
    storiesTotal: number;
    storiesDone: number;
    // segmented test bar: RED = test written & failing, GREEN = code makes it pass
    testByStatus: { pending: number; red: number; green: number; refactored: number; skipped: number };
    // False when the board is scrubbed back: test counts come from the feature-status CLI
    // and are NOT reconstructable from the log (it carries only the handful of test_ids that
    // had a cycle.* event — 4 of 29 in the stockflow run). There is no honest historical
    // number, so the UI must omit the bar rather than show a current or zeroed one.
    testsHistorical: boolean;
  };
  designPhases: DesignPhase[]; // the propose→…→reflect lane
  stories: StoryProgress[]; // per-story lifecycle for the sub-progress row
  lane: "design" | "build" | "complete"; // which top bar to emphasize
  totalCost: number;
  eventCount: number;
  recentEvents: AgentLogEvent[]; // tail, newest last
  generatedAt: string;

  // --- time travel -------------------------------------------------------
  // The fold can be evaluated at any point in the event log, so the board can be
  // scrubbed back through a run's history. Two fields keep that honest:
  //
  //   atEventIndex — how many events were folded (always ≤ totalEventCount).
  //   atLive       — true when that is the whole log, i.e. this IS the present.
  //
  // When atLive is false, everything the log can support IS reconstructed from the log
  // prefix: agents, costs, designPhases, gates, stories, blockers, feature, lane, ticker.
  // The one exception is test COUNTS — the log records only the test_ids that had a
  // cycle.* event — so `progress.testsHistorical` goes false and the UI omits that bar.
  atEventIndex: number;
  totalEventCount: number;
  atLive: boolean;
  // next.json's generated_at (else generatedAt); null when no snapshot. Describes when the
  // disk snapshot was taken, which is only meaningful at the live edge.
  snapshotAsOf: string | null;

  // --- source metadata ---------------------------------------------------
  // Attached by /api/state, not by the fold: which source produced this board and what it
  // can do. Optional because `fold()` itself is source-agnostic — it is the same fold over
  // a live tail or a replay corpus, which is the whole point of the source interface.
  source?: SourceMeta;

  // --- workflow topology -------------------------------------------------
  // Graph lighting, folded server-side. `recentEvents` is only a 40-event tail, but the
  // graph needs the whole prefix to know which nodes a run has reached — so derive it here
  // rather than shipping the full log to the client on every poll. Pure timeline data, so
  // it rewinds honestly when scrubbed back.
  topology: {
    passedNodes: string[]; // lifecycle nodes reached by atEventIndex
    activeNode: string | null; // node the playhead sits in
    laneSteps: Record<string, string[]>; // laneId → sub-steps reached
    laneCurrent: { lane: string; step: string } | null; // sub-step lit at the playhead
    atTimestamp: string | null; // timestamp of the event at the playhead, for the clock
  };
}

// ---------------------------------------------------------------------------
// Planning / backlog (the BacklogPanel).
//
// Both modes read the SAME shape — live from `.sftdd/planning|sprints|features`, replay from
// `recorded-artifacts/{planning,sprints,features}` — so this is not a mode-specific type. It is
// served by /api/planning rather than folded into DashboardState: it is a static snapshot of the
// run's planning artifacts, not timeline state, so it does not rewind with the transport and
// there is no honest per-playhead version of it (the plan gate was approved once, at the start).

// A proposed candidate feature, joined with its t-shirt estimate. `committed` is true when the
// candidate was carried into a sprint backlog. FP-numbered candidates live only in the proposal
// pool; committed features (F1, F6, …) get their title/summary from their feature dir.
export interface PlanningCandidate {
  id: string;
  title: string;
  ask: string;
  size: string | null; // t-shirt estimate (S/M/L/…), null when unsized
  rationale: string;
  committed: boolean;
}

// One committed feature inside a sprint backlog, with title/summary resolved from its dir.
export interface SprintFeature {
  id: string;
  title: string;
  summary: string;
  size: string | null;
  rationale: string;
}

// A sprint: its committed feature ids, resolved features, and the plan-gate status.
export interface PlanningSprint {
  sprint: string;
  featureIds: string[];
  features: SprintFeature[];
  planGate: string | null; // gate.status, e.g. "approved"
  approver: string | null;
  approvedAt: string | null;
  // A later sprint fed by the SAME single proposal round is a re-plan (author-requests + gate
  // re-approve), not a fresh proposal. Faithful to this corpus's two-sprint / one-propose shape.
  isReplan: boolean;
}

export interface Planning {
  sprints: PlanningSprint[];
  candidates: PlanningCandidate[];
  committed: string[]; // sorted committed feature ids
  proposeRounds: number; // count of spec-author `propose` phase.starts in the log
}

// ---------------------------------------------------------------------------
// Live artifact content (the live-mode turn-panel variant).
//
// Live mode has no per-turn corpus, so it cannot show a transcript or a per-turn file snapshot
// (plan §2). What it CAN show is what `artifact.written` names — a path — read at the project's
// current HEAD. That is strictly less than replay (it is "now", not "as of that turn"), which the
// panel says out loud. `kind` classifies the path the same way replay's file view does.
export interface ArtifactContent {
  path: string;
  kind: "code" | "artifact";
  content: string | null;
  // Why content is null when it is: the file no longer exists at HEAD, was too large, was
  // binary, or escaped containment. Null reason with null content should not happen.
  reason: string | null;
}

// One deliverable a lifecycle step produced, as listed by /api/step-outputs. `path` is the
// root-relative id the content endpoint (`?path=`) round-trips; `name` is its display basename.
export interface StepOutputAsset {
  path: string;
  name: string;
  kind: "code" | "artifact";
}

// The deliverables for one lifecycle node, scoped to the feature in force (null on run-level
// nodes / when no feature is pinned). `assets` lists only files that exist on disk.
export interface StepOutputs {
  node: string;
  feature: string | null;
  assets: StepOutputAsset[];
}
