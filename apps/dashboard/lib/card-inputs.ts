// The input→card MAP, first-class and enforced (DASHBOARD-SPEC §5/§7 as code, not prose).
//
// Every DashboardState field is tagged with its KIND, and every card DECLARES the fields it reads and
// whether it is bound to the LIVE run or to the VIEWED feature. `cardInputs()` is the one seam a card
// gets its data through: it projects the state to exactly the declared fields and, for a viewed-bound
// card whose viewed feature DIVERGES from the live run, WRAPS the live-kind fields so a live value can
// never render as if it were the viewed feature's. `guardedProjection()` (dev/test) throws if a card
// reads a field it did not declare — so the map cannot silently drift from what the cards actually use.
//
// WHY: the defect class (feature/story/phase/gate flipping to a stale or wrong feature) was always a
// surface rendering a wrong-KIND value. Making the map load-bearing + enforced is what stops it
// recurring, rather than fixing each surface by hand.

import type { DashboardState, RunPosition } from "./types";

// live    = Kind-1: a current-run / current-branch fact; must never render BARE on a viewed-bound card.
// durable = Kind-2: per-feature/story, fold-reconstructed per playhead/pin — safe for the viewed feature.
// view    = playhead / mode / request meta — neutral, safe anywhere.
export type FieldKind = "live" | "durable" | "view";

// Exhaustive: a new DashboardState field fails to compile until it is tagged here.
export const FIELD_KIND = {
  ok: "view",
  error: "view",
  projectDir: "view",
  feature: "live", // active feature at the playhead; for a divergent pin it's the run's, not the viewed one
  features: "durable", // featuresFromLog
  pinnedFeature: "view", // filter arg
  phase: "live", // playhead phase (not re-scoped to a divergent pin)
  agents: "durable", // reduceAgents (run-level, reconstructable from the prefix)
  gates: "durable", // gatesFromLog when scrubbed/pinned; snapshot-reconciled only at the live edge
  blockers: "durable", // blockersFromLog, feature-scoped per pin
  waiting: "live", // the current HITL/gate/permission wait
  progress: "live", // Kind-1 counts; `testsHistorical` governs honesty when scrubbed
  designPhases: "durable", // log-derived
  stories: "durable", // computeStories/storiesFromLog, honest per pin
  orchestratorActivity: "live", // latest run narration
  laneStepMeta: "durable", // per-step, log-derived
  pendingGate: "live", // the frontier gate awaiting now
  focus: "live", // the ONE locus now (the playhead's)
  runPosition: "live", // the authoritative current-run position — the SOURCE of the `live:` wrapper
  lane: "live", // emphasized lane at the playhead
  totalCost: "durable", // run aggregate, reconstructable from the prefix
  totalTokens: "durable",
  eventCount: "view",
  recentEvents: "durable", // log slice ≤ playhead
  generatedAt: "view",
  atEventIndex: "view",
  totalEventCount: "view",
  atLive: "view",
  snapshotAsOf: "view",
  source: "view",
  topology: "durable", // pure timeline, slice-scoped
} satisfies Record<keyof DashboardState, FieldKind>;

export type CardBinding = "live" | "viewed";
export interface CardSpec {
  binding: CardBinding;
  reads: (keyof DashboardState)[];
}

export type CardId =
  | "header"
  | "orchestrator"
  | "vitals"
  | "costBar"
  | "workflowGraph"
  | "laneGraph"
  | "transport"
  | "activityDock"
  | "eventTicker"
  | "agentLogReplay"
  | "driftBanner"
  | "drilldownPanel"
  | "storyTestsLightbox"
  | "featureStatusSection"
  | "backlogPanel";

// `reads` is grounded in each component's actual `state.X` usage (graph cards expand foldViewOf:
// focus/gates/topology). binding "viewed" = a card scoped to the pinned/selected feature/story; every
// other card shows the run itself ("live").
export const CARD_INPUTS = {
  header: {
    binding: "live",
    // The Header COMPONENT's own reads (the page shell, not the header, reads ok/error/waiting).
    reads: ["projectDir", "feature", "phase", "pinnedFeature", "features", "lane", "atLive", "atEventIndex", "totalEventCount", "source"],
  },
  orchestrator: { binding: "live", reads: ["focus", "orchestratorActivity", "runPosition", "blockers", "recentEvents"] },
  // The right-hand run-vitals card = BuildLane (progress/pinnedFeature/source) + inline metrics
  // (progress/agents/totalCost/totalTokens) + the mount's `lane` active/complete test.
  vitals: { binding: "live", reads: ["progress", "lane", "agents", "totalCost", "totalTokens", "pinnedFeature", "source"] },
  costBar: { binding: "live", reads: ["agents", "totalCost", "totalTokens"] },
  // These two expand foldViewOf(state), which also reads atLive (+ phase, via `complete`): the graphs'
  // locus/glow derive from it, so those fields are part of each card's real input set.
  workflowGraph: { binding: "live", reads: ["feature", "features", "focus", "gates", "phase", "pinnedFeature", "stories", "topology", "atLive"] },
  laneGraph: { binding: "live", reads: ["agents", "focus", "gates", "lane", "laneStepMeta", "topology", "atLive", "phase"] },
  transport: { binding: "live", reads: ["focus", "totalEventCount", "atLive", "source", "topology"] },
  activityDock: { binding: "live", reads: ["eventCount", "recentEvents", "source"] },
  eventTicker: { binding: "live", reads: ["eventCount", "recentEvents", "source"] },
  agentLogReplay: { binding: "live", reads: [] },
  driftBanner: { binding: "live", reads: ["source"] },
  drilldownPanel: { binding: "viewed", reads: ["feature"] },
  storyTestsLightbox: { binding: "viewed", reads: ["runPosition", "atLive", "stories", "source"] },
  featureStatusSection: { binding: "viewed", reads: ["features", "stories"] },
  backlogPanel: { binding: "viewed", reads: ["source"] },
} satisfies Record<CardId, CardSpec>;

// What the selector needs to decide live-vs-viewed divergence — all already on DashboardState.
export interface ViewCtx {
  atLive: boolean;
  pinnedFeature: string | null;
  runPosition: RunPosition;
  viewedFeature?: string | null; // the feature a viewed-bound card is showing (e.g. the open story's)
  branch?: string | null; // the live lakebase branch (for the wrapper label)
}

export function viewCtxOf(state: DashboardState, opts?: { viewedFeature?: string | null; branch?: string | null }): ViewCtx {
  return {
    atLive: state.atLive,
    pinnedFeature: state.pinnedFeature,
    runPosition: state.runPosition,
    viewedFeature: opts?.viewedFeature ?? null,
    branch: opts?.branch ?? null,
  };
}

// True when a viewed-bound card is showing something OTHER than the live run's current position —
// scrubbed back, a divergent pin, or an open story whose feature isn't the live one.
export function diverges(vc: ViewCtx): boolean {
  return (
    !vc.atLive ||
    vc.pinnedFeature != null ||
    (vc.viewedFeature != null && vc.viewedFeature !== vc.runPosition.feature)
  );
}

// A live (Kind-1) value handed to a DIVERGING viewed-bound card, wrapped so it can only render labelled
// as the LIVE run's, never as the viewed feature's.
export type Wrapped<T> = { value: T; live: { feature: string | null; branch: string | null } };
export function isWrapped<T>(x: unknown): x is Wrapped<T> {
  return typeof x === "object" && x !== null && "live" in x && "value" in x;
}

/**
 * The ONE seam a card gets its data through: a projection of the state containing ONLY the fields the
 * card declared in CARD_INPUTS. For a `viewed`-bound card that DIVERGES from the live run, each `live`-
 * kind field is returned WRAPPED ({value, live:{feature,branch}}) so the component is forced to render
 * it labelled — a live value can never masquerade as the viewed feature's. `live`-bound cards (and the
 * non-diverging case) pass every field through bare.
 */
export function cardInputs(state: DashboardState, cardId: CardId, vc: ViewCtx): Record<string, unknown> {
  const spec = CARD_INPUTS[cardId];
  const wrapLive = spec.binding === "viewed" && diverges(vc);
  const out: Record<string, unknown> = {};
  for (const key of spec.reads) {
    const value = state[key];
    out[key] = wrapLive && FIELD_KIND[key] === "live"
      ? { value, live: { feature: vc.runPosition.feature, branch: vc.branch ?? null } }
      : value;
  }
  return out;
}

/**
 * The map IN THE DATA PATH: the projection a card mount passes in place of `state`. At runtime it is
 * exactly the fields the card declared (+ the live wrap for a diverging viewed card), so a card can
 * only ever see what the map grants it — remove a field from CARD_INPUTS and that card stops receiving
 * it. Typed as DashboardState so it drops into the existing `state:` props with no sub-component type
 * cascade; `guardedProjection()` (the render-test guard, below) is what statically enforces that a card
 * reads nothing OUTSIDE its declared `reads`.
 */
export function cardState(state: DashboardState, cardId: CardId, vc: ViewCtx): DashboardState {
  return cardInputs(state, cardId, vc) as unknown as DashboardState;
}

/**
 * Dev/test guard: wrap the state so any read of a field the card did NOT declare throws. Enabled under
 * test / non-production — rendering a card through this in the render-test harness fails the suite the
 * moment a card reads outside its declared `reads`, so CARD_INPUTS can't drift from real usage.
 */
export function guardedProjection(state: DashboardState, cardId: CardId): DashboardState {
  const allowed = new Set<string>(CARD_INPUTS[cardId].reads as string[]);
  return new Proxy(state, {
    get(target, prop: string | symbol) {
      // Guard against reading any KNOWN DashboardState field (FIELD_KIND is the full key set) that the
      // card did not declare — independent of whether this particular object carries it, so a card's
      // undeclared read fails even against a partial test fixture. Non-field accesses (symbols, methods)
      // pass through untouched.
      if (typeof prop === "string" && prop in FIELD_KIND && !allowed.has(prop)) {
        throw new Error(`card "${cardId}" read undeclared field "${prop}" — add it to CARD_INPUTS[${cardId}].reads or stop reading it`);
      }
      return (target as unknown as Record<string | symbol, unknown>)[prop];
    },
  }) as DashboardState;
}
