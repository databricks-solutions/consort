// Log ↔ corpus pairing: which recorded turn produced each log event.
//
// This is the fragile part of replay mode, and the plan's §6 names it the top risk. The
// algorithm is Kevin's, transcribed from `_dashboard_template.html:312-325`: walk the log in
// order, and for each `phase.start` carrying a non-orchestrator role, take that role's next
// unconsumed `invoke-role` turn. A per-role cursor, nothing more.
//
// It is correct when the log and the corpus are the same run at the same kit version, and it
// CANNOT DETECT that they aren't. An off-by-one early in a role mis-maps every later turn for
// that role — wrong transcript, wrong code, no error. That is the same failure class as the
// `REPLAY CORPUS MISS` on `dba S1-record-stock` (corpus captured v0.3.0-beta.14 against a
// v0.3.5 pipeline). So this module's real job is not the pairing — it is the REPORT.
//
// `correlate()` therefore returns a `CorrelationReport` the UI can surface, and callers are
// expected to show drift rather than silently render a mis-paired turn.
//
// One structural subtlety, measured rather than assumed (see `STRUCTURAL_ROLES`): a healthy
// corpus has legitimately unpaired events, so "unpaired > 0" is NOT a drift signal on its own.

import type { AgentLogEvent } from "./types";

/**
 * A turn as it appears in `turns/index.json`.
 *
 * Optional fields are optional in the data, not merely nullable — measured across the corpus's
 * 126 entries: `ordinal`/`step`/`label`/`kind`/`dir`/`producedCount`/`deletedCount` are always
 * present, but `role` on 72, `story` on 100, `hasTranscript` on 69, `mode` on 33, `ac` on 11.
 * Only `role` and `kind` matter for pairing; the rest are here so the shape doesn't lie.
 */
export interface TurnIndexEntry {
  ordinal: number;
  step: number;
  label: string;
  kind: string;
  role?: string | null;
  mode?: string | null;
  story?: string | null;
  ac?: string | null;
  dir: string;
  producedCount: number;
  deletedCount: number;
  /** Absent (not false) on the 57 turns with no transcript — treat missing as "no". */
  hasTranscript?: boolean;
}

/**
 * Roles that emit `phase.start` but own NO `invoke-role` turns, by design.
 *
 * `release-engineer` drives deploy and promote, which the corpus models as distinct turn
 * kinds (`deploy`, `deploy-complete`, `prepare-pr`, `wait-ci`, `merge`, `approve-*-gate`)
 * rather than as a role invocation. Measured on stockflow-rerecord: it emits 10
 * `phase.start` events (8 `deploy`, 2 `promote`) and has 0 `invoke-role` turns.
 *
 * Without this, a perfectly healthy corpus reports 10 phantom unpaired rows and any
 * threshold on `unpaired` fires on a good run. These are counted as `structural`, not as
 * `unpairedEvents`.
 */
const STRUCTURAL_ROLES = new Set(["release-engineer"]);

/** An event paired to the turn that produced it. */
export interface Pairing {
  /** Index into the event array passed to `correlate`. */
  eventIndex: number;
  /** `ordinal` of the paired turn, matching `TurnIndexEntry.ordinal`. */
  turnOrdinal: number;
  role: string;
  phase: string | null;
}

/** An event that should have paired but didn't. This is the drift signal. */
export interface UnpairedEvent {
  eventIndex: number;
  role: string;
  phase: string | null;
  /** Why: the role ran out of turns, or the corpus knows no such role at all. */
  reason: "role-exhausted" | "role-absent";
}

export interface CorrelationReport {
  pairings: Pairing[];
  /** Events that wanted a turn and found none — real drift. Empty on a healthy corpus. */
  unpairedEvents: UnpairedEvent[];
  /** `invoke-role` turns no event ever reached. A short log explains this; drift also can. */
  unpairedTurns: { ordinal: number; role: string; label: string }[];
  /**
   * Events skipped on purpose because their role owns no `invoke-role` turns (see
   * STRUCTURAL_ROLES). Reported separately so they never read as drift.
   */
  structural: { eventIndex: number; role: string; phase: string | null }[];
  /** Per-role `consumed / available`, the quickest read on whether a cursor slipped. */
  cursors: Record<string, { consumed: number; available: number }>;
  /**
   * Provenance agreement between the log's first event and the corpus's provenance.json.
   * Null when either side carries no version stamp (an older corpus, say) — which is itself
   * worth surfacing, and is why this is a tri-state rather than a boolean.
   */
  kitVersionMatch: boolean | null;
  /** What each side claimed, so the UI can name the mismatch instead of just flagging it. */
  kitVersion: { log: string | null; corpus: string | null };
  /** True when nothing suggests the log and corpus disagree. The single check for callers. */
  healthy: boolean;
}

/** The version anchor a log carries on its first event's metadata. */
export function kitVersionOfLog(events: AgentLogEvent[]): string | null {
  const md = (events[0]?.metadata ?? {}) as Record<string, unknown>;
  // `kit_commit` is the real anchor; `kit_describe` (v0.3.6) is the human-readable form.
  // `kit_ref` is deliberately NOT used: on this corpus it is `sftdd-capture-local`, a local
  // capture symlink rather than a published version, and provenance.json says so explicitly.
  const commit = md.kit_commit;
  return typeof commit === "string" && commit ? commit : null;
}

/**
 * Pair log events to corpus turns, and report on how well they fit.
 *
 * @param events the run's log, oldest first. May be a PREFIX when scrubbing.
 * @param turns  `turns/index.json`, in ordinal order.
 * @param corpusKitCommit `kit_commit` from provenance.json, if the corpus has one.
 * @param fullLog the complete log, when `events` is a prefix. The kit stamp lives on the
 *        FIRST event, so an empty prefix (`upTo = 0`) carries no version and a genuine
 *        mismatch would report healthy at the left edge of the transport — drift detection
 *        that switches off exactly where a viewer starts. Defaults to `events`.
 */
export function correlate(
  events: AgentLogEvent[],
  turns: TurnIndexEntry[],
  corpusKitCommit: string | null = null,
  fullLog: AgentLogEvent[] = events,
): CorrelationReport {
  // Only `invoke-role` turns participate: they are the ones that represent a role taking a
  // turn, which is what a `phase.start` announces.
  const byRole = new Map<string, TurnIndexEntry[]>();
  for (const t of turns) {
    if (t.kind !== "invoke-role" || !t.role) continue;
    const list = byRole.get(t.role);
    if (list) list.push(t);
    else byRole.set(t.role, [t]);
  }

  const cursor = new Map<string, number>();
  const pairings: Pairing[] = [];
  const unpairedEvents: UnpairedEvent[] = [];
  const structural: CorrelationReport["structural"] = [];

  events.forEach((e, eventIndex) => {
    // The orchestrator dispatches; it never takes a role turn of its own.
    if (e.event !== "phase.start" || !e.role || e.role === "orchestrator") return;
    const md = (e.metadata ?? {}) as Record<string, unknown>;
    const phase = typeof md.phase === "string" ? md.phase : null;
    const role = e.role;

    if (STRUCTURAL_ROLES.has(role)) {
      structural.push({ eventIndex, role, phase });
      return;
    }

    const list = byRole.get(role) ?? [];
    const k = cursor.get(role) ?? 0;
    const turn = list[k];
    if (turn) {
      pairings.push({ eventIndex, turnOrdinal: turn.ordinal, role, phase });
      cursor.set(role, k + 1);
    } else {
      // Distinguish "this role ran out" from "the corpus has never heard of this role" —
      // the second is a much stronger signal that the log and corpus are different runs.
      unpairedEvents.push({
        eventIndex,
        role,
        phase,
        reason: list.length === 0 ? "role-absent" : "role-exhausted",
      });
    }
  });

  const cursors: CorrelationReport["cursors"] = {};
  const unpairedTurns: CorrelationReport["unpairedTurns"] = [];
  for (const [role, list] of byRole) {
    const consumed = cursor.get(role) ?? 0;
    cursors[role] = { consumed, available: list.length };
    for (const t of list.slice(consumed)) {
      unpairedTurns.push({ ordinal: t.ordinal, role, label: t.label });
    }
  }
  unpairedTurns.sort((a, b) => a.ordinal - b.ordinal);

  // From the full log, so the version check holds at every playhead including 0.
  const logKit = kitVersionOfLog(fullLog);
  const kitVersionMatch =
    logKit === null || corpusKitCommit === null ? null : logKit === corpusKitCommit;

  // "Healthy" deliberately ignores `unpairedTurns`: folding a PREFIX of the log legitimately
  // leaves later turns unreached, and correlate() is called with prefixes while scrubbing.
  // An explicit version mismatch is fatal; an absent stamp on either side is not.
  const healthy = unpairedEvents.length === 0 && kitVersionMatch !== false;

  return {
    pairings,
    unpairedEvents,
    unpairedTurns,
    structural,
    cursors,
    kitVersionMatch,
    kitVersion: { log: logKit, corpus: corpusKitCommit },
    healthy,
  };
}

/** `eventIndex → turnOrdinal`, for a UI that wants to jump from a log row to its turn. */
export function turnByEvent(report: CorrelationReport): Map<number, number> {
  return new Map(report.pairings.map((p) => [p.eventIndex, p.turnOrdinal]));
}

/** One-line summary for the UI when a report is unhealthy. Null when healthy. */
export function driftMessage(report: CorrelationReport): string | null {
  if (report.healthy) return null;
  if (report.kitVersionMatch === false) {
    const { log, corpus } = report.kitVersion;
    return `Log and corpus are different kit versions (log ${short(log)} vs corpus ${short(corpus)}) — turn pairing is unreliable.`;
  }
  const absent = report.unpairedEvents.filter((u) => u.reason === "role-absent");
  if (absent.length > 0) {
    const roles = [...new Set(absent.map((u) => u.role))].join(", ");
    return `The corpus has no turns for ${roles} (${absent.length} event${absent.length === 1 ? "" : "s"}) — it may be a different run.`;
  }
  const n = report.unpairedEvents.length;
  return `${n} event${n === 1 ? "" : "s"} found no matching turn — the log is ahead of the corpus, so later turns may be mis-paired.`;
}

function short(commit: string | null): string {
  return commit ? commit.slice(0, 7) : "unstamped";
}
