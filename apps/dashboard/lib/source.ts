// The dashboard source interface: where a run's data comes from.
//
// The merge plan's central finding is that the event-log reducer is mode-independent — a
// live tail and a finished replay log share an identical event vocabulary, so `fold()`
// works unchanged over either. What differs is only *acquisition*: live mode reads a
// watched `.sftdd/` directory and shells the feature-status CLI; replay mode reads a
// recorded corpus (`turns/index.json`, `recorded-artifacts/**`).
//
// So a source owes the fold exactly two things:
//
//   events()   — the run's event log, oldest first
//   snapshot() — everything the log cannot supply (SnapshotInputs)
//
// After the 2026-08-05 snapshot audit, that second half is much smaller than it first
// looked. The fold reconstructs gates, stories, blockers, feature and lane from the log
// prefix whenever it can, and reconciles the disk snapshot against the log even at the
// live edge (snapshots go stale: `derived_phase` sits at "build" after a run ends). The
// snapshot is genuinely load-bearing for only three things:
//
//   - test COUNTS       (the log carries a handful of test_ids, not the list)
//   - richer story statuses (real Consort statuses + acceptance flags)
//   - gate detail       (approval lands in next.json, not the log)
//
// That is the contract a replay source must satisfy from `workflow-state.json`.
//
// Capabilities describe what a mode can do, so panels degrade instead of disappearing —
// the plan's §2 capability matrix, in code.

import { emptyState, fold } from "./reducer";
// Type-only (erased at runtime), so importing from ./sources/replay here introduces no runtime
// import cycle even though replay.ts imports this module's DashboardSource.
import type { ParsedTranscript, TurnDetail } from "./sources/replay";
import {
  CAPABILITY_NAMES,
  type AgentLogEvent,
  type ArtifactContent,
  type CapabilityName,
  type DashboardState,
  type Planning,
  type SnapshotInputs,
  type SourceMeta,
  type SourceModeName,
  type StepOutputs,
} from "./types";

// One vocabulary, declared in types.ts because DashboardState must reference it too. Both
// names are re-exported here so callers can keep importing them from the source module.
export const CAPABILITIES = CAPABILITY_NAMES;
export type Capability = CapabilityName;
export type SourceMode = SourceModeName;

export interface DashboardSource {
  readonly mode: SourceMode;
  /** What this source can do. Drives capability-aware panels; see plan §2. */
  readonly capabilities: ReadonlySet<Capability>;

  /** Human-readable identifier for the header — a project dir or a corpus name. */
  describe(): string;

  /**
   * True when this source has something to read at all. Live mode returns false when the
   * directory isn't a scaffolded Consort project; the caller turns that into an error
   * state rather than an empty board that looks like a run with no events.
   */
  available(): boolean;
  /** Why `available()` is false, for the UI. Null when available. */
  unavailableReason(): string | null;

  /** The run's event log, oldest first. */
  events(): AgentLogEvent[];

  /**
   * Everything the fold needs that the log cannot supply. Takes the events because the
   * active feature id (needed to key the status CLI and handbacks) is itself partly
   * log-derived.
   *
   * `upTo` is the playhead, and it exists for sources whose snapshot half is genuinely
   * historical. Live must ignore it — there is no way to know what the feature-status CLI
   * would have said 200 events ago, which is the whole §3a constraint. Replay CAN honour it:
   * the corpus snapshots `test-list.json` inside individual turns, so a scrubbed board can
   * read the real test counts as of that point instead of hiding the bar.
   */
  snapshot(events: AgentLogEvent[], generatedAt: string, upTo?: number): SnapshotInputs;

  /**
   * The folded board. Implement with `foldSource(this, upTo, pinnedFeature)` unless the source
   * can do something smarter (e.g. serving a precomputed state).
   *
   * @param upTo event index for time travel; omit for the live edge.
   * @param pinnedFeature scope the board to one feature (FeatureSwitcher); a filter over the
   *        same playhead, not a seek. Source-agnostic — acquisition is unchanged, only which
   *        feature the fold shows — so it lives here rather than in a source's own reads.
   */
  getState(upTo?: number, pinnedFeature?: string | null): DashboardState;

  /**
   * Pairing health, for sources that correlate a log against a recorded corpus.
   *
   * Optional because it is meaningless in live mode — there is no corpus to disagree with.
   * Declared here rather than having the API route reach for `ReplaySource` directly, so the
   * route stays source-agnostic and a future third source can report drift the same way.
   */
  correlationSummary?(upTo?: number, recentCount?: number): NonNullable<SourceMeta["correlation"]>;

  /**
   * The correspondence tail as of the playhead, for folding into the event timeline.
   *
   * Optional and gated on the `correspondence` capability — a corpus without correspondence.jsonl
   * omits it and no rows fold in. Declared here so /api/state stays source-agnostic rather than
   * reaching for ReplaySource. Filtered to the same playhead as the fold so the conversation
   * rewinds with the transport.
   */
  correspondenceSummary?(upTo?: number, recentCount?: number): NonNullable<SourceMeta["correspondence"]>;

  /**
   * Recording fidelity, for sources where "is this capturing a full corpus?" is a real question.
   *
   * Optional and implemented only by the live source: a live build may run with the record lane
   * on (mirroring `turns/` + `correspondence.jsonl` + per-turn snapshots as it goes) or off (only
   * `agent-log.jsonl`). Replay omits it — a corpus is a finished recording, so it always has full
   * fidelity and shows no banner. Declared here so /api/state stays source-agnostic rather than
   * reaching for LiveSource directly.
   */
  fidelity?(): NonNullable<SourceMeta["fidelity"]>;

  /**
   * The run's planning artifacts: proposals + t-shirt estimates, sprint backlog, plan gate.
   *
   * Optional and gated on the `planningBacklog` capability — a source without planning artifacts
   * simply omits it, and the panel does not render. Both real sources implement it identically
   * (live reads `.sftdd/{planning,sprints,features}`, replay reads the mirror under
   * `recorded-artifacts/`), which is why the shape is one type and the route is source-agnostic.
   *
   * NOT part of the fold: planning is a static snapshot of the run's start, not timeline state,
   * so it doesn't rewind with the transport (the plan gate was approved once). Served by
   * /api/planning rather than carried in DashboardState.
   */
  planning?(): Planning;

  /**
   * An artifact named by the log (`artifact.written.path`), read at the project's current HEAD.
   *
   * The live half of the turn drill-down: a live project has no per-turn corpus, so the honest
   * thing it can show for a log row is the file as it is NOW. Optional and gated on
   * `artifactContent` — replay implements richer per-turn snapshots via `turns/` instead, so it
   * does not provide this (its content is per-turn, reached through the turn route). Declared
   * here so /api/artifact stays source-agnostic rather than reaching for LiveSource directly.
   */
  artifactAtHead?(rel: string): ArtifactContent;

  /**
   * The deliverables a lifecycle step produced, for the WorkflowGraph drill-down.
   *
   * Optional and gated on the `stepOutputs` capability. `node` is a `WorkflowNode.id`; `feature`
   * scopes the per-feature entries (see topology's `STEP_OUTPUTS`) and is ignored by run-level
   * ones. Only files that exist on disk are returned, so a node with nothing to show yields an
   * empty `assets` list rather than dead links. Declared here so /api/step-outputs stays
   * source-agnostic rather than reaching for a concrete source.
   */
  stepOutputs?(node: string, feature?: string | null): StepOutputs;

  /**
   * One step-output file's content, by the root-relative path `stepOutputs` handed out.
   *
   * The content half of the drill-down, paired with `stepOutputs` under the same capability.
   * Replay resolves it under `recorded-artifacts/`; a live source would resolve it under the
   * project's `.consort/`. Containment is the implementer's responsibility — the path is
   * attacker-controlled over the API.
   */
  stepOutputContent?(rel: string): ArtifactContent;

  /**
   * A recorded turn's metadata, its transcript, and one produced file's per-turn snapshot — the
   * turn drill-down, gated on the `transcripts` capability.
   *
   * Replay serves these from its own `turns/` corpus. A LIVE source serves them only when a
   * companion record-lane corpus is configured (`CONSORT_RECORD_DIR`), by delegating to a
   * ReplaySource over that dir — which is what upgrades a recording live board to replay-grade
   * drill-down. Declared here (optional) so /api/turn stays source-agnostic and checks the
   * capability + method presence rather than `source instanceof ReplaySource`.
   */
  turn?(ordinal: number): TurnDetail | null;
  transcript?(ordinal: number): ParsedTranscript | null;
  file?(ordinal: number, rel: string): { kind: "code" | "artifact"; content: string | null; reason: string | null };
}

export function hasCapability(source: DashboardSource, cap: Capability): boolean {
  return source.capabilities.has(cap);
}

/**
 * The default `getState`: read once, fold once.
 *
 * This is the whole interface in one line — `fold(events, snapshot)` — and it exists so
 * every source shares one composition root instead of each reimplementing it. It also
 * reads the log exactly once, which matters for a caller that wants both the events and
 * the board (Phase 3's TurnPanel needs `artifact.written` paths alongside the state).
 *
 * Unavailability is handled here rather than in each source, so an unscaffolded project and
 * a missing corpus produce the same shape: an empty board carrying `error`, never a
 * zero-event board that reads as "a run that hasn't started".
 */
export function foldSource(
  source: DashboardSource,
  upTo?: number,
  pinnedFeature?: string | null,
): DashboardState {
  return readSource(source, upTo, pinnedFeature).state;
}

/**
 * Read a source once and return both halves, for callers that need the events themselves
 * (artifact paths, the ticker) as well as the folded board — without paying for two reads.
 * `foldSource` is this, minus the events.
 */
export function readSource(
  source: DashboardSource,
  upTo?: number,
  pinnedFeature?: string | null,
): { events: AgentLogEvent[]; state: DashboardState } {
  const generatedAt = new Date().toISOString();

  if (!source.available()) {
    return {
      events: [],
      state: {
        ...emptyState(source.describe(), generatedAt),
        error: source.unavailableReason() ?? "source unavailable",
      },
    };
  }

  const events = source.events();
  // `upTo` reaches the snapshot as well as the fold, so a source with genuinely historical
  // snapshot data can rewind it. Live ignores the argument by construction. `pinnedFeature`
  // reaches only the fold — it re-scopes which feature is shown, not what is read from disk.
  return {
    events,
    state: fold(events, source.snapshot(events, generatedAt, upTo), upTo, pinnedFeature),
  };
}
