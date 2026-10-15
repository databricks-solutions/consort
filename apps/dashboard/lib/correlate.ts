// Log ↔ corpus pairing: which recorded turn produced each log event.
//
// This is the fragile part of replay mode, and the plan's §6 names it the top risk. The
// algorithm: walk the log in order, and for each `phase.start` carrying a non-orchestrator role,
// take that role's next unconsumed `invoke-role` turn WITH THE SAME STORY. A per-(role, story)
// cursor — falling back to plain role order for a story-less event or a role whose turns carry
// no story stamp.
//
// The story scope is load-bearing: a phantom `phase.start` (a role turn that started but recorded
// NO `invoke-role` turn — a died/retried turn) would, under a role-ONLY cursor, slide every later
// pairing for that role by one across story boundaries — wrong transcript, wrong code, no error.
// Scoping the cursor to the story confines that off-by-one to the ONE story that actually had the
// phantom (its last `phase.start` reads unpaired, which the report surfaces) instead of cascading
// into every later story. It still CANNOT detect a genuine log/corpus mismatch, so this module's
// real job remains the REPORT. That is the same failure class as the
// `REPLAY CORPUS MISS` on `dba S1-record-stock` (corpus captured v0.3.0-beta.14 against a
// v0.3.5 pipeline). So this module's real job is not the pairing — it is the REPORT.
//
// `correlate()` therefore returns a `CorrelationReport` the UI can surface, and callers are
// expected to show drift rather than silently render a mis-paired turn.
//
// One structural subtlety, measured rather than assumed (see `STRUCTURAL_ROLES`): a healthy
// corpus has legitimately unpaired events, so "unpaired > 0" is NOT a drift signal on its own.

import type { AgentLogEvent } from "./types";
import { laneStepForTurn } from "./topology";

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

/**
 * The HITL gate NAME a gate TURN carries, or null for a non-gate turn. Maps the turn KIND
 * (surface-gate / approve-*-gate / await-acceptance / accept) to the gate name its orchestrator
 * gate.surfaced/gate.approved events carry in `metadata.gate`, so the gate-pairing pass can match an
 * event to its turn. surface-gate + approve-gate are both the "spec" gate (surface THEN approve = two
 * turns); await-acceptance + accept are both "acceptance". The sprint/feature gates
 * (intake/backlog/plan/deploy/promote) are a single approve turn each.
 */
function gateNameOfTurn(kind: string | undefined): string | null {
  switch (kind) {
    case "surface-gate":
    case "approve-gate":
      return "spec";
    case "approve-intake-gate":
      return "intake";
    case "approve-backlog-gate":
      return "backlog";
    case "approve-plan-gate":
      return "plan";
    case "approve-deploy-gate":
      return "deploy";
    case "approve-promote-gate":
      return "promote";
    case "await-acceptance":
    case "accept":
      return "acceptance";
    default:
      return null;
  }
}

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
  /** Gate EVENT → gate TURN pairings (HITL gates: planning / spec / acceptance / deploy / promote),
   *  kept SEPARATE from `pairings` so the invoke-role correlation + its drift detection are unchanged
   *  (pairings stays the per-role sequential cursor the differential/ground-truth tests pin). The event
   *  log merges both for its `#ordinal` markers, so every gate row is numbered — independent of the
   *  correspondence stream, which does not record every gate. */
  gatePairings: Pairing[];
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

  // Whether a role's turns carry story stamps at all. Story-scoped pairing (below) applies ONLY
  // then, so a corpus whose turns predate per-story stamping — or a story-less single-feature run —
  // keeps the pure role-order behaviour byte-identical.
  const roleHasStory = new Map<string, boolean>();
  for (const [role, list] of byRole) roleHasStory.set(role, list.some((t) => !!t.story));

  // Consumed turn INDICES per role (into that role's byRole list), so a turn pairs at most once
  // whether matched by story or by plain order.
  const consumed = new Map<string, Set<number>>();
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

    const story = typeof md.story === "string" ? md.story : null;
    const list = byRole.get(role) ?? [];
    let used = consumed.get(role);
    if (!used) {
      used = new Set<number>();
      consumed.set(role, used);
    }
    // Story-scoped pairing: when the role's turns carry stories AND this event names one, take the
    // next UNCONSUMED turn with the SAME story. A phantom/died phase.start then leaves only ITS OWN
    // story's last phase.start unpaired instead of sliding the cursor into the next story's turns
    // (the off-by-one cascade). A story-less event, or a role whose turns carry no story, falls back
    // to the next unconsumed turn in plain order — the prior per-role behaviour, byte-identical.
    const wantStory = story !== null && roleHasStory.get(role) === true ? story : null;
    let idx = -1;
    for (let i = 0; i < list.length; i++) {
      if (used.has(i)) continue;
      if (wantStory !== null && (list[i].story ?? null) !== wantStory) continue;
      idx = i;
      break;
    }
    if (idx >= 0) {
      used.add(idx);
      pairings.push({ eventIndex, turnOrdinal: list[idx].ordinal, role, phase });
    } else {
      // Distinguish "this role (or its story) ran out" from "the corpus has never heard of this
      // role" — the second is a much stronger signal that the log and corpus are different runs.
      unpairedEvents.push({
        eventIndex,
        role,
        phase,
        reason: list.length === 0 ? "role-absent" : "role-exhausted",
      });
    }
  });

  // ── Gate pairing (HITL gates: planning / spec / acceptance / deploy / promote) ──
  // The loop above pairs only phase.start → invoke-role turns, so a GATE turn (surface-gate /
  // approve-*-gate / await-acceptance / accept — none are invoke-role) and its orchestrator-emitted
  // gate.surfaced / gate.approved event never get a turn ordinal. That left every HITL gate row
  // UN-NUMBERED in the event log (the "#3/#5 skipped" planning gates) and the deploy/promote gates
  // unidentifiable — the symptom the user hit. Pair each gate EVENT to its gate TURN by gate name, in
  // log order, so every gate shows its #ordinal (and lights, since EVENT_LEGEND already purples a
  // `gate*` row). Sourced from the turn index + the agent-log gate events, INDEPENDENT of the
  // correspondence stream — which does NOT record every gate (the planning + ship gates emit no
  // correspondence beat, so a correspondence-only approach drops them). Isolated from the invoke-role
  // pass: a gate event that finds no turn is simply left un-numbered, NOT counted as drift (gates can
  // out-number their recorded turns across a re-plan, e.g. a resumed sprint re-deriving planning).
  const gateTurnsByName = new Map<string, TurnIndexEntry[]>();
  for (const t of turns) {
    const g = gateNameOfTurn(t.kind);
    if (g === null) continue;
    const list = gateTurnsByName.get(g);
    if (list) list.push(t);
    else gateTurnsByName.set(g, [t]);
  }
  const gateConsumed = new Map<string, number>();
  const gatePairings: Pairing[] = [];
  events.forEach((e, eventIndex) => {
    if (e.event !== "gate.surfaced" && e.event !== "gate.approved" && e.event !== "gate.rejected") return;
    const g = ((e.metadata ?? {}) as Record<string, unknown>).gate;
    if (typeof g !== "string") return;
    const list = gateTurnsByName.get(g);
    if (!list) return;
    const next = gateConsumed.get(g) ?? 0;
    if (next >= list.length) return; // more gate events than recorded gate turns (a re-plan): leave un-numbered
    gateConsumed.set(g, next + 1);
    gatePairings.push({ eventIndex, turnOrdinal: list[next].ordinal, role: "orchestrator", phase: null });
  });

  const cursors: CorrelationReport["cursors"] = {};
  const unpairedTurns: CorrelationReport["unpairedTurns"] = [];
  for (const [role, list] of byRole) {
    const used = consumed.get(role) ?? new Set<number>();
    cursors[role] = { consumed: used.size, available: list.length };
    list.forEach((t, i) => {
      if (!used.has(i)) unpairedTurns.push({ ordinal: t.ordinal, role, label: t.label });
    });
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
    gatePairings,
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

/**
 * Each role → its LATEST recorded turn ordinal, over the WHOLE turn index (not just a recent
 * event tail), scoped to the turns the playhead has REACHED. `reached` is the set of turn ordinals
 * paired at/under the current position (from `report.pairings`), so scrubbing back narrows the map
 * to the role's latest turn AS OF the playhead. This is what lets a role/lane card open that role's
 * full turn drill-down (transcript + tools + produced files) even when its turn scrolled out of the
 * aligned `recentTurns` window — the whole point being that EVERY clicked card resolves to a turn,
 * not a bare shell, whenever the role has one. A turn with no `role` is skipped (nothing to key on).
 */
export function latestTurnByRole(
  turns: readonly Pick<TurnIndexEntry, "ordinal" | "role">[],
  reached: ReadonlySet<number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of turns) {
    if (!t.role || !reached.has(t.ordinal)) continue;
    if (out[t.role] === undefined || t.ordinal > out[t.role]) out[t.role] = t.ordinal;
  }
  return out;
}

/**
 * Each lane STEP → its latest reached turn ordinal, keyed `"<stepId>|<story ?? ''>"` over the WHOLE
 * turn index (not just the recent-events window), scoped to the turns the playhead has reached. This is
 * what lets a lane card resolve its OWN step's turn — correctly per story — even when that turn scrolled
 * out of the window (e.g. the "break into stories" breakdown at #0, or an early story's spec from a late
 * playhead). Unlike `latestTurnByRole` (role-keyed → a multi-step role's LATEST turn, which bled a
 * sibling step/round), this is step+story precise: an inner-loop step resolves to ITS round's turn, and
 * the story-less outer-loop breakdown resolves under the `<step>|` key. A turn that maps to no step
 * (gates, revise-route, structural) is skipped.
 */
export function latestTurnByStep(
  turns: readonly Pick<TurnIndexEntry, "ordinal" | "role" | "mode" | "story">[],
  reached: ReadonlySet<number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of turns) {
    if (!reached.has(t.ordinal)) continue;
    const step = laneStepForTurn({ role: t.role, mode: t.mode });
    if (!step) continue;
    const key = `${step}|${t.story ?? ""}`;
    if (out[key] === undefined || t.ordinal > out[key]) out[key] = t.ordinal;
  }
  return out;
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

/**
 * How prominently the UI should surface an unhealthy report. This is a property of the
 * dashboard's corpus PAIRING, not the run's health — the banner it drives never means the
 * orchestrator, build, or deploy is failing.
 *
 *   "ok"      — healthy, no banner.
 *   "warning" — a role the corpus never recorded: the RECORD_DIR likely points at a DIFFERENT
 *               run. This is the one case worth flagging prominently.
 *   "info"    — a benign observability caveat: a kit-version mismatch (an expected-with-caveat
 *               drift) or a plain log-ahead tail. Quiet, non-alarming.
 */
export function driftSeverity(report: CorrelationReport): "ok" | "info" | "warning" {
  if (report.healthy) return "ok";
  if (report.unpairedEvents.some((u) => u.reason === "role-absent")) return "warning";
  return "info";
}

function short(commit: string | null): string {
  return commit ? commit.slice(0, 7) : "unstamped";
}
