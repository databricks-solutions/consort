// The Consort workflow topology: the lifecycle graph (Figure 1) and the per-lane
// inter-agent sub-workflows (Figure 2, honest-GREEN).
//
// Ported from Kevin Hartman's build_dashboard.py:384-485 (WORKFLOW) plus the matching
// predicate evaluator in _dashboard_template.html:539-573. This is pure data + pure
// functions over events: no I/O, no corpus, no React. It is mode-independent — the same
// topology lights up from a live tail or a finished replay log.
//
// The authoritative order comes from scripts/sftdd/orchestrator-drive.ts
// (deriveDesignAction / deriveBuildAction) and papers/introducing-consort.md. Gates are
// human-decided and fail closed.

import type { AgentLogEvent, Role } from "./types";
// One definition of "which feature does this event belong to", shared with the story
// derivation. derive.ts does not import this module, so there is no cycle.
import { featureIdOf } from "./derive";

// --------------------------------------------------------------------------- types

export type NodeKind = "phase" | "gate";
export type LaneId = "plan" | "design" | "build";

export interface WorkflowNode {
  id: string;
  label: string;
  roles: Role[]; // roles responsible for this node; empty for gates and terminals
  type: NodeKind;
}

// [from, to]
export type WorkflowEdge = readonly [string, string];
// [from, to, label] — a fail/side path drawn as a back-edge
export type BackEdge = readonly [string, string, string];

// Predicate that decides whether an event lights a given sub-step. Every field is
// optional; the fields that are present must all hold (see `matchesStep` for the exact
// semantics, which are subtler than plain AND for the buildMode pair).
export interface StepMatch {
  role?: Role;
  phase?: string;
  phaseAny?: string[];
  phaseNot?: string[];
  buildMode?: string;
  buildModeAny?: string[];
  buildModeNot?: string[];
  eventPrefix?: string;
}

export interface LaneStep {
  id: string;
  role: Role | null; // null for gates/verify — no single agent owns them
  label: string;
  sub: string; // one-line description of what happens here
  gate?: boolean;
  branch?: boolean; // a fail/side path rather than the happy path
  match: StepMatch | null; // null = never lit from an event (human-decided gates)
}

export interface Lane {
  title: string;
  steps: LaneStep[];
  edges: readonly WorkflowEdge[];
  backEdges: readonly BackEdge[];
}

export interface WorkflowTopology {
  nodes: WorkflowNode[];
  edges: readonly WorkflowEdge[];
  phaseToNode: Record<string, string>;
  lanes: Record<LaneId, Lane>;
}

// --------------------------------------------------------------------------- the graph

export const LANE_IDS: readonly LaneId[] = ["plan", "design", "build"] as const;

// Which lifecycle node each log phase (metadata.phase) belongs to.
//
// Two deliberate departures from the Python original, both evidence-driven — verified
// against the 421-event stockflow-rerecord corpus log and the 380-event live log:
//
//   1. `assess` / `assess-refactor` map to "build", not "plan". Kevin's table sent
//      `assess` to "plan". Every `assess*` event in both logs is navigator or
//      orchestrator carrying `buildMode: assess*` — it is the honest-GREEN
//      "regression or supersession?" decision inside the build lane (see b-assess
//      below, which already matched it there). Mapping it to "plan" made the top-level
//      graph jump back to Plan mid-build. `assess-refactor` was absent entirely.
//   2. No `"estimate "` (trailing space) or `"RED"` key. Those were spelling defenses;
//      `nodeForPhase` normalizes instead, which covers them and anything similar.
export const PHASE_TO_NODE: Record<string, string> = {
  // plan: feature proposal, sizing, request authoring, backlog breakdown
  propose: "plan",
  estimate: "plan",
  "estimate-committed": "plan",
  "author-requests": "plan",
  breakdown: "plan",
  feature: "plan",
  workflow: "plan",
  // design: spec-first, per story
  design: "design",
  // build: the honest-GREEN cycle
  build: "build",
  red: "build",
  green: "build",
  refactor: "build",
  review: "build",
  reflect: "build",
  repair: "build",
  assess: "build",
  "assess-refactor": "build",
  // ship
  deploy: "deploy",
  promote: "promote",
};

// Which gate node reflects which gate name in the run's gate state.
export const GATE_NODE_TO_GATE: Record<string, string> = {
  plangate: "plan",
  specgate: "spec",
  deploygate: "deploy",
  promgate: "promote",
};

// --------------------------------------------------------------------------- step outputs

/**
 * A deliverable a lifecycle step produces, as it appears on disk.
 *
 * `path` is ROOT-RELATIVE — no `.consort/` prefix — so a source joins it against whichever root
 * it reads from: replay against `recorded-artifacts/`, live against the project's `.consort/`
 * (or the legacy `.sftdd/`). It may carry a `<F>` placeholder a source substitutes with the
 * feature id in scope; a `perFeature` spec is simply skipped when no feature is in scope.
 *
 * `dir` marks a directory whose files are listed rather than a single file — the honest-GREEN
 * cycle writes many files under `cycles/<F>/`, and deploy under `deploy/`, so those are browsed
 * rather than named one by one.
 */
export interface StepOutputSpec {
  path: string;
  perFeature?: boolean;
  dir?: boolean;
}

/**
 * Which deliverables each lifecycle node produced, for the WorkflowGraph drill-down.
 *
 * Keyed by `WorkflowNode.id`. Paths mirror the Consort artifact layout (verified against the
 * stockflow-full corpus's `recorded-artifacts/`). A source lists only the entries that actually
 * exist on disk, so naming a file here that a given run didn't produce is harmless — it just
 * doesn't appear. Nodes with no durable output (`shipped`, `promgate`) are absent.
 */
export const STEP_OUTPUTS: Record<string, StepOutputSpec[]> = {
  intake: [
    { path: "product-overview.md" },
    { path: "nfrs.md" },
    { path: "design/design-brief.md" },
  ],
  plan: [
    { path: "planning/feature-proposals.md" },
    { path: "planning/estimates.json" },
    { path: "selection-log.md" },
  ],
  plangate: [{ path: "features/<F>/gates.json", perFeature: true }],
  design: [
    { path: "design/design-guide.md" },
    { path: "design/ia.md" },
    { path: "features/<F>/feature-spec.md", perFeature: true },
    { path: "features/<F>/architecture.md", perFeature: true },
    { path: "features/<F>/db-design.md", perFeature: true },
  ],
  specgate: [
    { path: "features/<F>/test-list.md", perFeature: true },
    { path: "features/<F>/gates.json", perFeature: true },
  ],
  build: [
    { path: "features/<F>/pipeline.json", perFeature: true },
    { path: "cycles/<F>", perFeature: true, dir: true },
  ],
  deploy: [
    { path: "features/<F>/deploy-evidence.json", perFeature: true },
    { path: "deploy", dir: true },
  ],
  deploygate: [{ path: "features/<F>/gates.json", perFeature: true }],
  promote: [{ path: "sprints", dir: true }],
};

const NODES: WorkflowNode[] = [
  { id: "intake", label: "Intake", roles: [], type: "phase" },
  { id: "plan", label: "Plan", roles: ["spec-author", "architect-reviewer", "product-owner"], type: "phase" },
  { id: "plangate", label: "plan gate", roles: [], type: "gate" },
  {
    id: "design",
    label: "Design lane",
    roles: ["spec-author", "architect-reviewer", "dba", "test-strategist", "ux-designer"],
    type: "phase",
  },
  { id: "specgate", label: "spec + test-list gates", roles: [], type: "gate" },
  { id: "build", label: "Build lane", roles: ["navigator", "driver"], type: "phase" },
  { id: "deploy", label: "Deploy", roles: ["release-engineer"], type: "phase" },
  { id: "deploygate", label: "deploy gate", roles: [], type: "gate" },
  { id: "promote", label: "Promote", roles: ["release-engineer"], type: "phase" },
  { id: "promgate", label: "promote gate", roles: [], type: "gate" },
  { id: "shipped", label: "Shipped", roles: [], type: "phase" },
];

// The lifecycle spine. `shipped → plan` closes the loop for the next sprint.
const EDGES: readonly WorkflowEdge[] = [
  ["intake", "plan"],
  ["plan", "plangate"],
  ["plangate", "design"],
  ["design", "specgate"],
  ["specgate", "build"],
  ["build", "deploy"],
  ["deploy", "deploygate"],
  ["deploygate", "promote"],
  ["promote", "promgate"],
  ["promgate", "shipped"],
  ["shipped", "plan"],
] as const;

const PLAN_LANE: Lane = {
  title: "Plan  ·  sprint planning",
  steps: [
    {
      id: "p-propose",
      role: "spec-author",
      label: "Spec author",
      sub: "propose features",
      match: { role: "spec-author", phase: "propose" },
    },
    {
      id: "p-size",
      role: "architect-reviewer",
      label: "Architect",
      sub: "t-shirt sizing (estimate)",
      match: { role: "architect-reviewer", phaseAny: ["estimate", "estimate-committed"] },
    },
    {
      id: "p-req",
      role: "product-owner",
      label: "Product owner",
      sub: "author requests",
      match: { role: "product-owner", phaseAny: ["author-requests", "feature"] },
    },
    {
      id: "p-gate",
      role: null,
      label: "Plan gate",
      sub: "human approves backlog",
      gate: true,
      match: null,
    },
  ],
  edges: [
    ["p-propose", "p-size"],
    ["p-size", "p-req"],
    ["p-req", "p-gate"],
  ] as const,
  backEdges: [] as const,
};

const DESIGN_LANE: Lane = {
  title: "Design lane  ·  spec-first (per story)",
  steps: [
    {
      id: "d-ux",
      role: "ux-designer",
      label: "UX designer",
      sub: "design guide (once)",
      match: { role: "ux-designer" },
    },
    {
      id: "d-spec",
      role: "spec-author",
      label: "Spec author",
      sub: "acceptance criteria",
      // spec-author also acts in the plan lane; exclude those phases so its design
      // work doesn't light both lanes.
      match: { role: "spec-author", phaseNot: ["propose", "estimate", "author-requests", "breakdown"] },
    },
    {
      id: "d-arch",
      role: "architect-reviewer",
      label: "Architect",
      sub: "annotate layers",
      match: { role: "architect-reviewer", phaseNot: ["estimate"] },
    },
    { id: "d-dba", role: "dba", label: "DBA", sub: "realize schema", match: { role: "dba" } },
    {
      id: "d-ts",
      role: "test-strategist",
      label: "Test strategist",
      sub: "test list",
      match: { role: "test-strategist" },
    },
    {
      id: "d-nav",
      role: "navigator",
      label: "Navigator",
      sub: "reflect / critique",
      match: { role: "navigator", buildMode: "reflect", phase: "reflect" },
    },
    { id: "d-gate", role: null, label: "Spec gate", sub: "human approves", gate: true, match: null },
  ],
  edges: [
    ["d-ux", "d-spec"],
    ["d-spec", "d-arch"],
    ["d-arch", "d-dba"],
    ["d-dba", "d-ts"],
    ["d-ts", "d-nav"],
    ["d-nav", "d-gate"],
  ] as const,
  // reflect findings route back to the owning author (bounded revise)
  backEdges: [["d-nav", "d-spec", "revise on findings"]] as const,
};

const BUILD_LANE: Lane = {
  title: "Build lane  ·  honest-GREEN cycle (Branched-Database TDD)",
  steps: [
    {
      id: "b-red",
      role: "navigator",
      label: "Navigator",
      sub: "write failing test (RED)",
      match: {
        role: "navigator",
        phase: "red",
        buildModeNot: ["reflect", "review", "assess", "assess-refactor", "assess-deploy"],
      },
    },
    {
      id: "b-green",
      role: "driver",
      label: "Driver",
      sub: "minimal honest code (GREEN)",
      match: {
        role: "driver",
        buildModeNot: ["refactor", "repair", "refactor-superseded", "refactor-deploy"],
      },
    },
    {
      id: "b-verify",
      role: null,
      label: "Verify",
      sub: "run vs real branch",
      gate: true,
      match: { eventPrefix: "verify" },
    },
    {
      id: "b-review",
      role: "navigator",
      label: "Navigator",
      sub: "review / refactor",
      match: { role: "navigator", buildMode: "review" },
    },
    {
      id: "b-assess",
      role: "navigator",
      label: "Navigator",
      sub: "assess: regression or supersession?",
      branch: true,
      match: { role: "navigator", buildModeAny: ["assess", "assess-refactor", "assess-deploy"] },
    },
    {
      id: "b-repair",
      role: "driver",
      label: "Driver",
      sub: "repair code, never tests",
      branch: true,
      match: { role: "driver", buildModeAny: ["repair"] },
    },
    {
      id: "b-perm",
      role: "driver",
      label: "Driver",
      sub: "permissive-green (superseded only)",
      branch: true,
      match: { role: "driver", buildModeAny: ["refactor-superseded", "refactor", "refactor-deploy"] },
    },
  ],
  edges: [
    ["b-red", "b-green"],
    ["b-green", "b-verify"],
    ["b-verify", "b-review"],
    ["b-review", "b-red"],
  ] as const,
  backEdges: [
    ["b-verify", "b-assess", "verify fails"],
    ["b-assess", "b-repair", "regression"],
    ["b-assess", "b-perm", "supersession"],
    ["b-repair", "b-green", "re-verify"],
    ["b-perm", "b-green", "re-verify"],
  ] as const,
};

export const WORKFLOW: WorkflowTopology = {
  nodes: NODES,
  edges: EDGES,
  phaseToNode: PHASE_TO_NODE,
  lanes: { plan: PLAN_LANE, design: DESIGN_LANE, build: BUILD_LANE },
};

// --------------------------------------------------------------------------- lookups

export function nodeById(id: string): WorkflowNode | null {
  return NODES.find((n) => n.id === id) ?? null;
}

// Look up a key in one of the maps above without inheriting from Object.prototype.
// A bare `table[key]` resolves "constructor"/"toString"/"valueOf" to a function, which
// would flow into a Set<string> in passedNodes and serialize to null over the API — and
// would slip past a truthiness guard, since a function is truthy. Phase names come from
// log metadata, so they are effectively untrusted input.
function lookup(table: Record<string, string>, key: string): string | null {
  return Object.hasOwn(table, key) ? table[key] : null;
}

// Lifecycle node for a log phase. Tolerates the surrounding whitespace and casing
// variants seen in real logs (`"estimate "`, `"RED"`) instead of enumerating them.
export function nodeForPhase(phase: string | null | undefined): string | null {
  if (!phase) return null;
  const trimmed = phase.trim();
  if (!trimmed) return null;
  return lookup(PHASE_TO_NODE, trimmed) ?? lookup(PHASE_TO_NODE, trimmed.toLowerCase());
}

// The gate name whose state a gate node displays (plangate → "plan").
export function gateForNode(nodeId: string): string | null {
  return lookup(GATE_NODE_TO_GATE, nodeId);
}

// --------------------------------------------------------------------------- matching

function phaseOf(e: AgentLogEvent): string | null {
  const md = (e.metadata || {}) as Record<string, unknown>;
  const p = md.phase;
  return typeof p === "string" ? p : null;
}

function buildModeOf(e: AgentLogEvent): string | null {
  const md = (e.metadata || {}) as Record<string, unknown>;
  const bm = md.buildMode;
  return typeof bm === "string" ? bm : null;
}

// Does this event light this sub-step?
//
// Field semantics, preserved from the template's evaluator:
//   eventPrefix  — decided alone: the event name must start with it, and nothing else
//                  is consulted (this is how `verify.*` lights b-verify regardless of role).
//   role         — must be equal.
//   phaseAny     — phase must be a member. Decides on its own once role has passed.
//   phaseNot     — excluded when the phase is present and listed. A missing phase does
//                  NOT exclude, which is what lets a role's non-phase events still match.
//   buildModeNot — likewise for buildMode.
//   buildMode /
//   buildModeAny — buildMode must be in the set, OR the phase equals `phase` as a
//                  fallback. Some phases (`reflect`) are logged without a buildMode on
//                  the phase.start, so requiring buildMode alone would miss them.
//   phase        — required equality, but only when no buildMode constraint is present
//                  (otherwise it acts as the fallback above rather than a requirement).
export function matchesStep(m: StepMatch | null, e: AgentLogEvent): boolean {
  if (!m) return false;

  if (m.eventPrefix) return typeof e.event === "string" && e.event.startsWith(m.eventPrefix);

  if (m.role && e.role !== m.role) return false;

  const phase = phaseOf(e);
  const bm = buildModeOf(e);

  if (m.phaseAny) return phase !== null && m.phaseAny.includes(phase);

  if (m.phaseNot && phase !== null && m.phaseNot.includes(phase)) return false;
  if (m.buildModeNot && bm !== null && m.buildModeNot.includes(bm)) return false;

  const bmSet = m.buildModeAny ?? (m.buildMode ? [m.buildMode] : null);
  if (bmSet) {
    const bmHit = bm !== null && bmSet.includes(bm);
    const phaseFallback = m.phase !== undefined && phase === m.phase;
    return bmHit || phaseFallback;
  }

  if (m.phase !== undefined && phase !== m.phase) return false;

  return true;
}

export interface LaneHit {
  lane: LaneId;
  step: string;
}

// First sub-step (lanes in plan→design→build order, steps in declared order) that this
// event lights, or null. First match wins, as in the original.
export function laneStepForEvent(e: AgentLogEvent | null | undefined): LaneHit | null {
  if (!e) return null;
  for (const lane of LANE_IDS) {
    for (const s of WORKFLOW.lanes[lane].steps) {
      if (matchesStep(s.match, e)) return { lane, step: s.id };
    }
  }
  return null;
}

// --------------------------------------------------------------------------- progress

/**
 * Walk events[0..upTo), reporting which feature each one belongs to.
 *
 * A feature_id is carried forward: not every event stamps one (5 `phase.start`s in the corpus
 * carry `""`), so the feature in force is the last one seen. `featureIdOf` skips `reasoning`
 * events, whose feature_id is unreliable — see its docstring.
 *
 * Shared by `passedNodes` and `laneProgress` so the two cannot disagree about which feature an
 * event belongs to, which would light a node in one view and not the other.
 */
function* eventsWithFeature(
  events: AgentLogEvent[],
  upTo?: number,
): Generator<{ e: AgentLogEvent; feature: string | null }> {
  const end = upTo === undefined ? events.length : Math.max(0, Math.min(upTo, events.length));
  let feature: string | null = null;
  for (let i = 0; i < end; i++) {
    const f = featureIdOf(events[i]);
    if (f) feature = f;
    yield { e: events[i], feature };
  }
}

/**
 * Lifecycle nodes reached by folding events[0..upTo). `intake.supplied` is the one node
 * established by an event name rather than a phase.
 *
 * @param feature scope to one feature; omit for the whole run. Scoping matters on
 *   multi-feature runs: unscoped, the second sprint of the stockflow-rerecord corpus inherits
 *   sprint 1's spine, so at event 230 a feature that has not built anything reads as having
 *   reached `deploy` and `promote` — drawing a shipped lifecycle for work that hasn't started.
 */
export function passedNodes(events: AgentLogEvent[], upTo?: number, feature?: string): Set<string> {
  const seen = new Set<string>();
  for (const { e, feature: f } of eventsWithFeature(events, upTo)) {
    if (feature !== undefined && f !== feature) continue;
    const node = nodeForPhase(phaseOf(e));
    if (node) seen.add(node);
    if (e.event === "intake.supplied") seen.add("intake");
  }
  return seen;
}

export interface LaneProgress {
  // sub-steps reached in each lane
  done: Record<LaneId, Set<string>>;
  // last sub-step reached in each lane, null if the lane was never entered
  last: Record<LaneId, string | null>;
  // the step the final folded event lights — the "playhead" step
  current: LaneHit | null;
}

/**
 * Fold events[0..upTo) into per-lane sub-step progress, for done-shading the lane graphs.
 *
 * @param feature scope to one feature; omit for the whole run. Unscoped, a multi-feature run
 *   accumulates: at event 230 of the stockflow-rerecord corpus, sprint 2 has only just begun
 *   designing, yet all seven build sub-steps read as reached because sprint 1 lit them.
 */
export function laneProgress(events: AgentLogEvent[], upTo?: number, feature?: string): LaneProgress {
  const end = upTo === undefined ? events.length : Math.max(0, Math.min(upTo, events.length));
  const done: Record<LaneId, Set<string>> = { plan: new Set(), design: new Set(), build: new Set() };
  const last: Record<LaneId, string | null> = { plan: null, design: null, build: null };

  for (const { e, feature: f } of eventsWithFeature(events, upTo)) {
    if (feature !== undefined && f !== feature) continue;
    const hit = laneStepForEvent(e);
    if (!hit) continue;
    done[hit.lane].add(hit.step);
    last[hit.lane] = hit.step;
  }

  // `current` reflects the event AT the playhead, not the last event that happened to
  // match something — otherwise a stale step stays lit across unmatched events. It is
  // deliberately NOT feature-filtered: the playhead event is where the run actually is, and
  // suppressing it when scoped to another feature would claim nothing is happening.
  const current = end > 0 ? laneStepForEvent(events[end - 1]) : null;

  return { done, last, current };
}

// An edge is complete when both of its endpoints have been reached.
export function edgeDone(lane: LaneId, edge: WorkflowEdge, progress: LaneProgress): boolean {
  const reached = progress.done[lane];
  return reached.has(edge[0]) && reached.has(edge[1]);
}
