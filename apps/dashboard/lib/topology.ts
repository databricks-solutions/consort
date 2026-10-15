// The Consort workflow topology: the lifecycle graph and the per-lane inter-agent
// sub-workflows (the honest-GREEN cycle).
//
// This is pure data + pure functions over events: no I/O, no corpus, no React. It is
// mode-independent — the same topology lights up from a live tail or a finished replay log.
// The orchestrator drives the design and build lanes in this step order; the gates are
// human-decided and fail closed.

import type { AgentLogEvent, LaneStepMeta, Role } from "./types";
import { GATE_KEY_BY_NODE, GATE_STEP_BY_KEY } from "./gates";
// One definition of "which feature does this event belong to", shared with the story
// derivation. derive.ts does not import this module, so there is no cycle.
import { featureIdOf } from "./derive";

// --------------------------------------------------------------------------- types

export type NodeKind = "phase" | "gate";
export type LaneId = "plan" | "design" | "build" | "deploy";

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
  // Exact event-name equality (`e.event === m.event`), decided alone like `eventPrefix`. Used by
  // the deploy lane, whose deterministic steps light off specific orchestrator events
  // (deploy.start / deploy.verified) rather than a role+phase the way the LLM-agent lanes do.
  event?: string;
  // Like `event` but a SET: the event name must equal one of these (decided alone). An exact-event
  // match (event / eventAny) is MORE SPECIFIC than a role match, so laneStepForEvent prefers it — e.g.
  // the driver's `cycle.verified` (the build-cycle GREEN verify) lights the Verify step (b-verify) over
  // the Driver step (b-green, role:driver) that also matches a bare driver event.
  eventAny?: string[];
  // Additional AND-constraint: the event MESSAGE must contain this substring. The promote sub-steps
  // (prepare-pr / wait-ci / merge) emit no distinct event NAME — only the orchestrator's per-action
  // `reasoning` narration ("orchestrator: <kind>") — so they share phaseAny:["promote"] and are
  // told apart by the narration. Combined with phaseAny it scopes to the promote phase, so a
  // build-lane "merge" can't light dp-merge.
  messageIncludes?: string;
  // AND-constraint (exclusion): reject when the message contains ANY of these. dp-pr uses it to own
  // the promote phase.start + the prepare-pr narration while yielding wait-ci/merge to dp-ci/dp-merge.
  messageNotIncludes?: string[];
}

export interface LaneStep {
  id: string;
  role: Role | null; // null for gates/verify — no single agent owns them
  label: string;
  sub: string; // one-line description of what happens here
  gate?: boolean;
  branch?: boolean; // a fail/side path rather than the happy path
  escalation?: boolean; // a terminal raise-to-HIL node (critical, no single owner)
  // A STORY-LESS step: its turn is per-feature or per-sprint, NOT per story — the design lane's "break
  // into stories" breakdown, AND every sprint-PLANNING step (propose / estimate / intake / establish /
  // author-requests), which all run before any story exists. Because the turn is story-less, the per-story
  // round scoping (reachedThisPass + the active-story turn filter in stepTurnOrdinal) must NOT apply — its
  // result resolves + shows regardless of which story's round is in view. Without this flag, once a story
  // goes active the card looks up `<step>|<story>` and misses its real `<step>|` turn, so the early plan
  // cards open empty while a later story is designing (the breakdown card worked only because it set it).
  outerLoop?: boolean;
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

export const LANE_IDS: readonly LaneId[] = ["plan", "design", "build", "deploy"] as const;

// Which lifecycle node each log phase (metadata.phase) belongs to.
//
// `assess` / `assess-refactor` map to "build": every `assess*` event is a navigator or
// orchestrator turn carrying `buildMode: assess*` — the honest-GREEN "regression or
// supersession?" decision inside the build lane (see b-assess below, which matches it there).
// There is no whitespace- or casing-variant key (e.g. `"estimate "`, `"RED"`): nodeForPhase
// normalizes the phase first, which covers those and anything similar.
export const PHASE_TO_NODE: Record<string, string> = {
  // intake: the metered Product Owner intake turn (phase="intake") drafts product-overview/nfrs/
  // design-brief. Maps to the Intake lifecycle node so the current-sprint graph lights the Intake
  // box while the PO drafts. The seed's event-driven intake.supplied lights the same node.
  intake: "intake",
  // plan: feature proposal, sizing, request authoring, backlog breakdown
  propose: "plan",
  estimate: "plan",
  "estimate-committed": "plan",
  "author-requests": "plan",
  // breakdown is a DESIGN-lane construct: the kit runs it per-feature at the design entry (after the
  // plan gate), so it lights the design node + lane, not plan.
  breakdown: "design",
  // establish: the UX Designer's one-time style + IA bootstrap runs UNDER the intake gate in
  // planning, so it lights the plan lane. ia: the per-story IA refinement runs in the design lane.
  establish: "plan",
  ia: "design",
  feature: "plan",
  workflow: "plan",
  // design: spec-first, per story. `reflect` is the Navigator's critique of the ASSEMBLED design
  // (the design→reflect→revise loop before the spec gate); `reconcile` is its FEATURE-complete symmetric
  // cross-story pass (once every story is designed, before the gated approval). Both light the DESIGN
  // node/lane — the design lane's d-nav step matches the same {navigator, buildMode:reflect|reconcile}
  // turn. They are navigator buildModes like assess/review, but run in DESIGN, not the honest-GREEN cycle.
  design: "design",
  reflect: "design",
  reconcile: "design",
  // build: the honest-GREEN cycle
  build: "build",
  red: "build",
  green: "build",
  refactor: "build",
  review: "build",
  repair: "build",
  assess: "build",
  "assess-refactor": "build",
  // ship
  deploy: "deploy",
  promote: "promote",
};

// Which gate node reflects which gate name in the run's gate state. Derived from the ONE gate
// registry (lib/gates.ts) rather than hand-listed here, so the lane node, lifecycle node, and
// orchestrator bubble can never disagree about a gate's key.
export const GATE_NODE_TO_GATE: Record<string, string> = GATE_KEY_BY_NODE;

// --------------------------------------------------------------------------- step outputs

/**
 * A deliverable a lifecycle step produces, as it appears on disk.
 *
 * `path` is ROOT-RELATIVE — no `.consort/` prefix — so a source joins it against whichever root
 * it reads from: replay against `recorded-artifacts/`, live against the project's `.consort/`
 * (or the legacy `.sftdd/`). It may carry a `<F>` placeholder a source substitutes with the
 * feature id in scope; a `perFeature` spec is simply skipped when no feature is in scope.
 *
 * `perStory` additionally carries an `<S>` placeholder the source expands across EVERY story dir
 * of the feature (`features/<F>/stories/*`), so one spec surfaces a per-story artifact for all
 * stories at once — the way the design lane's reflect verdicts / per-story test lists / breakdowns
 * exist once per story. `perStory` implies a feature is in scope (skipped otherwise).
 *
 * `dir` marks a directory whose files are listed rather than a single file — the honest-GREEN
 * cycle writes many files under `cycles/<F>/`, and deploy under `deploy/`, so those are browsed
 * rather than named one by one. `dir` + `perStory` lists a per-story directory (e.g. each story's
 * `acs/`) across all stories.
 */
export interface StepOutputSpec {
  path: string;
  perFeature?: boolean;
  perStory?: boolean;
  dir?: boolean;
}

/**
 * Which deliverables each lifecycle node produced, for the WorkflowGraph drill-down.
 *
 * Keyed by `WorkflowNode.id`. Paths mirror the Consort artifact layout (verified against a full
 * stockflow capture's `recorded-artifacts/`). A source lists only the entries that actually exist on
 * disk, so naming a file here that a given run didn't produce is harmless — it just doesn't appear.
 * Every lifecycle node has an entry so all of them are clickable.
 *
 * Gates open their DECISION record, but that lives in different files: the feature `gates.json` holds
 * only { spec, plan, test_list, deploy, promote }, so the plan/spec/deploy/promote gates open it; the
 * INTAKE gate (its decision predates the feature) opens the intake docs it reviews; and the
 * ACCEPTANCE gate (per-story) opens `pipeline.json`, where each story's acceptance decision is
 * recorded. The terminal `shipped` shows the promoted sprint (as `promote` does).
 *
 * Per-story artifacts are surfaced via `perStory` specs (an `<S>` the source expands across every
 * story dir), so the design lane's per-story breakdowns / reflect verdicts, the spec gate's per-story
 * test lists + acceptance criteria, and per-story deploy evidence are all inspectable — nothing on
 * disk is left unreachable.
 */
export const STEP_OUTPUTS: Record<string, StepOutputSpec[]> = {
  intake: [
    { path: "product-overview.md" },
    { path: "nfrs.md" },
    { path: "design/design-brief.md" },
  ],
  // The intake gate reviews the drafted intake — the feature gates.json has no `intake` key (intake
  // precedes feature selection), so it opens the docs the human approves here.
  intakegate: [
    { path: "product-overview.md" },
    { path: "nfrs.md" },
    { path: "design/design-brief.md" },
  ],
  plan: [
    { path: "planning/feature-proposals.md" },
    { path: "planning/estimates.json" },
    { path: "selection-log.md" },
    // The Product Owner's authored request per committed feature (the author-requests plan step).
    { path: "features/<F>/feature-request.md", perFeature: true },
  ],
  plangate: [{ path: "features/<F>/gates.json", perFeature: true }],
  design: [
    { path: "design/design-guide.md" },
    { path: "design/design-guide.json" },
    { path: "design/ia.md" },
    // Project architecture canon the first service-backed feature establishes in the design lane and
    // later features conform to — authored here, surfaced nowhere else.
    { path: "architecture/canon.json" },
    { path: "architecture/conventions.json" },
    { path: "features/<F>/feature-spec.md", perFeature: true },
    { path: "features/<F>/feature-spec.json", perFeature: true },
    { path: "features/<F>/architecture.md", perFeature: true },
    { path: "features/<F>/architecture.json", perFeature: true },
    { path: "features/<F>/db-design.md", perFeature: true },
    { path: "features/<F>/db-design.json", perFeature: true },
    // The Test Strategist authors the test list in the design lane (the spec gate then reviews it).
    { path: "features/<F>/test-list.md", perFeature: true },
    { path: "features/<F>/test-list.json", perFeature: true },
    // Per-story design outputs: the Spec Author's breakdown (story.md/json) and the Navigator's
    // pre-build reflect verdict, one of each per story.
    { path: "features/<F>/stories/<S>/story.md", perFeature: true, perStory: true },
    { path: "features/<F>/stories/<S>/story.json", perFeature: true, perStory: true },
    { path: "features/<F>/stories/<S>/reflect-verdict.json", perFeature: true, perStory: true },
  ],
  // The spec + test-list gate reviews the SPEC and the TEST LIST, so it opens both — each in its
  // human (.md) and machine (.json) form — plus its decision record. feature-spec also appears under
  // the design node (where it is authored); here it is what the gate is deciding on.
  specgate: [
    { path: "features/<F>/feature-spec.md", perFeature: true },
    { path: "features/<F>/feature-spec.json", perFeature: true },
    { path: "features/<F>/test-list.md", perFeature: true },
    { path: "features/<F>/test-list.json", perFeature: true },
    { path: "features/<F>/gates.json", perFeature: true },
    // Per-story: the per-story test list the test-list gate reviews, and each story's acceptance
    // criteria (acs/), the spec the gate is deciding on.
    { path: "features/<F>/stories/<S>/test-list-per-story.json", perFeature: true, perStory: true },
    { path: "features/<F>/stories/<S>/acs", perFeature: true, perStory: true, dir: true },
  ],
  build: [
    { path: "features/<F>/pipeline.json", perFeature: true },
    { path: "cycles/<F>", perFeature: true, dir: true },
    // The bad-smell catalog the review/assess turns maintain (project-level).
    { path: "smells.json" },
  ],
  // Acceptance is PER-STORY, recorded in pipeline.json (stories[].acceptance) — the feature
  // gates.json has no `acceptance` key — so the acceptance gate opens pipeline.json.
  acceptancegate: [{ path: "features/<F>/pipeline.json", perFeature: true }],
  deploy: [
    { path: "features/<F>/deploy-evidence.json", perFeature: true },
    { path: "deploy", dir: true },
    // Each story carries its own deploy evidence (per-story deploy-verify).
    { path: "features/<F>/stories/<S>/deploy-evidence.json", perFeature: true, perStory: true },
  ],
  deploygate: [{ path: "features/<F>/gates.json", perFeature: true }],
  promote: [{ path: "sprints", dir: true }],
  promgate: [{ path: "features/<F>/gates.json", perFeature: true }],
  // The terminal shows the promoted sprint — what actually shipped (mirrors promote).
  shipped: [{ path: "sprints", dir: true }],
};

const NODES: WorkflowNode[] = [
  // intake carries the product-owner (its role dot): the metered PO intake turn drafts the intake.
  { id: "intake", label: "Intake", roles: ["product-owner"], type: "phase" },
  // The intake gate diamond, between intake and plan: the HITL review of the drafted intake before
  // planning.
  { id: "intakegate", label: "intake gate", roles: [], type: "gate" },
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
  // The acceptance gate diamond, between build and deploy: the PO accepts each story's experiment
  // (the per-story acceptance gate) before the feature deploys. Represented as one spine diamond the
  // way specgate stands in for the per-story spec gates.
  { id: "acceptancegate", label: "acceptance gate", roles: [], type: "gate" },
  { id: "deploy", label: "Deploy", roles: ["release-engineer"], type: "phase" },
  { id: "deploygate", label: "deploy gate", roles: [], type: "gate" },
  { id: "promote", label: "Promote", roles: ["release-engineer"], type: "phase" },
  { id: "promgate", label: "promote gate", roles: [], type: "gate" },
  { id: "shipped", label: "Shipped", roles: [], type: "phase" },
];

// The lifecycle spine. `shipped → plan` closes the loop for the next sprint.
const EDGES: readonly WorkflowEdge[] = [
  ["intake", "intakegate"],
  ["intakegate", "plan"],
  ["plan", "plangate"],
  ["plangate", "design"],
  ["design", "specgate"],
  ["specgate", "build"],
  ["build", "acceptancegate"],
  ["acceptancegate", "deploy"],
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
      id: "p-intake",
      outerLoop: true, // story-less (sprint-planning turn): resolve under `p-intake|`, not `p-intake|<story>`
      role: "product-owner",
      label: "Product owner",
      sub: "intake: overview/nfrs",
      // Lights on EITHER the metered PO intake turn (phase="intake" on its phase.start/turn.usage)
      // OR the seed's intake.supplied/refused events (eventPrefix). matchesStep ORs eventPrefix with
      // role+phase, so both the live drafting turn AND the headless/replay seed light this step.
      match: { role: "product-owner", eventPrefix: "intake", phaseAny: ["intake"] },
    },
    {
      // The UX Designer ESTABLISH runs UNDER the intake gate: after the PO drafts the brief +
      // product-overview, before the human approves intake — so the project style system
      // (design-guide.json) + the initial ia.md skeleton are approved WITH the brief they derive
      // from. A planning-lane step (no new gate); its sibling is the per-story d-ux-ia refinement.
      id: "p-ux-establish",
      outerLoop: true, // story-less (project-level establish): resolve under `p-ux-establish|`
      role: "ux-designer",
      label: "UX designer",
      sub: "establish style + IA",
      match: { role: "ux-designer", phase: "establish" },
    },
    {
      // The intake gate: the HITL checkpoint AFTER the PO drafts product-overview/nfrs/design-brief
      // and BEFORE the Spec Author proposes. Human reviews / edits / approves. Lights (purple) from
      // the run's intake gate state, like p-gate does for the plan gate. Closes the INTAKE side of
      // the split lane.
      id: "p-intake-gate",
      role: null,
      label: "Intake gate",
      sub: "human approves intake",
      gate: true,
      match: null,
    },
    {
      id: "p-propose",
      outerLoop: true, // story-less (sprint-planning turn): resolve under `p-propose|`, not `p-propose|<story>`
      role: "spec-author",
      label: "Spec author",
      sub: "propose features",
      match: { role: "spec-author", phase: "propose" },
    },
    {
      id: "p-size",
      outerLoop: true, // story-less (sprint-planning turn): resolve under `p-size|`, not `p-size|<story>`
      role: "architect-reviewer",
      label: "Architect",
      sub: "t-shirt sizing (estimate)",
      match: { role: "architect-reviewer", phaseAny: ["estimate", "estimate-committed"] },
    },
    {
      // The Backlog gate: after sizing, the human picks WHICH proposed features enter the sprint (the
      // drive surfaces gate.surfaced(backlog); the human commits). A gate step that lights purple
      // from the run's backlog gate state — exactly like p-intake-gate. Distinct from the PO
      // authoring turn below: this is the SELECTION.
      id: "p-backlog-gate",
      role: null,
      label: "Backlog gate",
      sub: "human selects features",
      gate: true,
      match: null,
    },
    {
      // The Product Owner authors a feature-request.md per COMMITTED feature — a metered product-owner
      // turn (phase author-requests), which is why it reads in the PO's colour and shows its elapsed.
      // It lights from the author-requests turn.
      id: "p-req",
      outerLoop: true, // story-less (per-feature author-requests turn): resolve under `p-req|`
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
    ["p-intake", "p-ux-establish"],
    ["p-ux-establish", "p-intake-gate"],
    ["p-intake-gate", "p-propose"],
    ["p-propose", "p-size"],
    ["p-size", "p-backlog-gate"],
    ["p-backlog-gate", "p-req"],
    ["p-req", "p-gate"],
  ] as const,
  // No raise-to-HIL: the escalate outcome fires only on a failed run, a build-level smell, or a
  // spec smell with its revise budget spent (step.ts route()) — all of which live in build/design,
  // not planning. A bad backlog surfaces as the human HOLDING at the plan gate, not a mid-lane
  // escalation; and the product-owner IS the human, so it has no one to escalate to.
  backEdges: [] as const,
};

const DESIGN_LANE: Lane = {
  title: "Design lane  ·  spec-first (per story)",
  steps: [
    {
      // Breakdown is a DESIGN-lane construct: after the plan gate, the Spec Author breaks the
      // committed feature into its stories as the ENTRY to design (the kit runs it per-feature via
      // nextDesignAction, before the UX guide). Its own agent bubble — a spec-author turn that
      // decomposes the feature into stories — sitting BEFORE the UX designer.
      id: "d-breakdown",
      role: "spec-author",
      label: "Spec author",
      sub: "break into stories",
      // OUTER LOOP: runs once per feature (decomposes it into stories) BEFORE the per-story rounds, so
      // its result is shown regardless of the story in view — not scoped/hidden by the per-story round.
      outerLoop: true,
      match: { role: "spec-author", phase: "breakdown" },
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
      // The UX Designer IA refinement runs PER STORY, after the ACs and BEFORE the architect, so
      // E2E layers land against surfaces the IA already names. The establish is a planning-lane
      // step (p-ux-establish); this is the per-story normal state (projectable→no-turn when the
      // feature's surfaces are already named, else a live turn).
      id: "d-ux-ia",
      role: "ux-designer",
      label: "UX designer",
      sub: "refine IA (per story)",
      match: { role: "ux-designer", phase: "ia" },
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
      // Lights on the per-story reflect/critique turn AND the feature-complete symmetric cross-story
      // reconcile turn (both are navigator design-lane turns; no build turn carries these buildModes).
      // The card label stays "reflect / critique" — the reconcile turn lights the SAME step without
      // adding a word to the card.
      match: { role: "navigator", buildModeAny: ["reflect", "reconcile"], phaseAny: ["reflect", "reconcile"] },
    },
    { id: "d-gate", role: null, label: "Spec gate", sub: "human approves", gate: true, match: null },
    {
      id: "d-hil",
      role: null,
      label: "Raise to HIL",
      sub: "escalate to human",
      escalation: true,
      match: null,
    },
  ],
  edges: [
    ["d-breakdown", "d-spec"],
    ["d-spec", "d-ux-ia"],
    ["d-ux-ia", "d-arch"],
    ["d-arch", "d-dba"],
    ["d-dba", "d-ts"],
    ["d-ts", "d-nav"],
    ["d-nav", "d-gate"],
  ] as const,
  // reflect findings route back to the owning author (bounded revise) — the spec-author (an
  // AC/spec defect), the UX designer (an E2E/client AC whose surface the IA does not name, the
  // reflect-ia-defect route), or the architect — shown generically as one "revise on findings"
  // back-edge; or, when it can't be auto-resolved, escalate to the human.
  backEdges: [
    ["d-nav", "d-spec", "revise on findings"],
    ["d-nav", "d-hil", "escalate"],
  ] as const,
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
        // b-green is declared BEFORE b-repair/b-perm and matches any driver event whose buildMode is
        // not excluded here, so every driver GREEN-outcome variant with its OWN step must be listed
        // or it gets shadowed onto b-green (first-match). `green-superseded` was missing, so a
        // permissive-green/supersession turn lit b-green and b-perm never lit; `refactor-superseded`
        // (b-perm) + `refactor`/`repair`/`refactor-deploy` (their own steps) were already excluded.
        role: "driver",
        buildModeNot: ["refactor", "repair", "refactor-superseded", "refactor-deploy", "green-superseded"],
      },
    },
    {
      id: "b-verify",
      // The build-cycle GREEN VERIFY — the honest-GREEN check that runs BETWEEN the Driver's GREEN and
      // the Navigator's REVIEW, logged as the Driver's `cycle.verified`. VERIFY is release work, so the
      // card takes the release-engineer's light-blue (role is for COLOUR only; `isHumanGate` stays false
      // — no gate KEY — so it never goes purple). It matches `cycle.verified` ALONE via `eventAny` (so the
      // exact-event match wins over b-green/role:driver, which was swallowing it). It deliberately does
      // NOT match the release-engineer's SEPARATE pre-acceptance deploy `verify.passed` (a later stage,
      // after REVIEW, at await-acceptance) — that must not light this between-green-and-review card.
      role: "release-engineer",
      label: "Verify",
      sub: "run vs real branch",
      gate: true,
      match: { eventAny: ["cycle.verified"] },
    },
    {
      id: "b-review",
      role: "navigator",
      label: "Navigator",
      sub: "review",
      match: { role: "navigator", buildMode: "review" },
    },
    {
      id: "b-refactor",
      role: "driver",
      label: "Driver",
      sub: "refactor (structure)",
      match: { role: "driver", buildModeAny: ["refactor"] },
    },
    {
      id: "b-assess",
      role: "navigator",
      label: "Navigator",
      sub: "assess: regression or supersession?",
      branch: true,
      // NOT "assess-deploy": that is the DEPLOY lane's assess (dp-assess) — a deploy-verify
      // contamination check, not a build-cycle regression. Claiming it here anchored the deploy
      // self-heal to the wrong lane's Navigator bubble. `assess` + `assess-refactor` are the
      // build-cycle assesses that belong here.
      match: { role: "navigator", buildModeAny: ["assess", "assess-refactor"] },
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
      match: { role: "driver", buildModeAny: ["green-superseded", "refactor-superseded"] },
    },
    {
      id: "b-hil",
      role: null,
      label: "Raise to HIL",
      sub: "genuine regression → escalate",
      escalation: true,
      match: null,
    },
    {
      id: "b-accept",
      role: null,
      label: "Acceptance gate",
      sub: "human accepts the story",
      gate: true,
      match: null,
    },
  ],
  edges: [
    ["b-red", "b-green"],
    ["b-green", "b-verify"],
    ["b-verify", "b-review"],
    ["b-review", "b-refactor"],
    ["b-refactor", "b-red"],
    ["b-refactor", "b-accept"],
  ] as const,
  backEdges: [
    ["b-verify", "b-assess", "verify fails"],
    ["b-assess", "b-repair", "regression"],
    ["b-assess", "b-perm", "supersession"],
    ["b-assess", "b-hil", "genuine"],
  ] as const,
};

// The combined ship lane. Unlike the plan/design/build lanes, deploy and promote are DETERMINISTIC
// CLI effects run by the orchestrator, not an LLM agent, so this lane has no inter-agent
// sub-workflow. The dashboard attributes every deterministic step to the `release-engineer` role
// (light-blue) for labelling; the two human gates carry `match: null` so `isHumanGate` keeps them
// purple.
//
// It reads as two phases — a Deploy section (deploy → verify → deploy gate) and a Promote section
// (prepare-pr → wait-ci → promote gate → merge), which LaneGraph draws with a separator between
// them. Deploy/verify light from the orchestrator's `deploy.start` / `deploy.verified` events; the
// promote sub-steps emit no per-step events (only the promote phase.start + the promote gate), so
// they share a `phaseAny:["promote"]` predicate — structural, faithful to what the kit logs.
//
// The self-heal arm (deploy-verify contamination) mirrors the build lane's assess fan-out. Both
// deploy-heal build modes are OWNED here, so they light the Navigator/Driver bubbles in THIS lane,
// not the build lane's: `assess-deploy` -> `dp-assess` (the build lane's `b-assess` no longer
// matches it), and `refactor-deploy` -> `dp-refactor` (never had a build-lane claimant).
const DEPLOY_LANE: Lane = {
  title: "DEPLOY / PROMOTE",
  steps: [
    {
      id: "dp-deploy",
      role: "release-engineer",
      label: "Deploy",
      sub: "deploy to feature branch",
      match: { event: "deploy.start" },
    },
    {
      id: "dp-verify",
      role: "release-engineer",
      label: "Verify",
      sub: "reachable + verify.passed",
      match: { event: "deploy.verified" },
    },
    { id: "dp-gate", role: null, label: "deploy gate", sub: "human check", gate: true, match: null },
    // The three promote sub-steps emit no distinct event NAME — only the orchestrator's per-action
    // `reasoning` narration ("orchestrator: prepare-pr" / "wait-ci" / "merge"). They all sit in the
    // `promote` phase, so each is told apart by that narration (AND-scoped to the phase so a
    // build-lane "merge" can't light dp-merge). Before this they shared phaseAny:["promote"] and
    // first-match kept the playhead pinned on dp-pr through wait-ci AND merge (the bug: dp-pr lit
    // while the run was already merging). dp-pr owns the promote phase.start + the prepare-pr
    // narration (it EXCLUDES wait-ci/merge); dp-ci/dp-merge claim their own narration.
    {
      id: "dp-pr",
      role: "release-engineer",
      label: "Prepare PR",
      sub: "open PR",
      match: { phaseAny: ["promote"], messageNotIncludes: ["wait-ci", "merge"] },
    },
    {
      id: "dp-ci",
      role: "release-engineer",
      label: "Wait CI",
      sub: "CI green",
      match: { phaseAny: ["promote"], messageIncludes: "wait-ci" },
    },
    { id: "dp-promgate", role: null, label: "promote gate", sub: "human check", gate: true, match: null },
    {
      id: "dp-merge",
      role: "release-engineer",
      label: "Merge",
      sub: "release to parent tier",
      match: { phaseAny: ["promote"], messageIncludes: "merge" },
    },
    {
      id: "dp-assess",
      role: "navigator",
      label: "Assess-deploy",
      sub: "confirm fragile set",
      branch: true,
      match: { buildModeAny: ["assess-deploy"] },
    },
    {
      id: "dp-refactor",
      role: "driver",
      label: "Scope-deploy",
      sub: "tests own their state",
      branch: true,
      match: { buildModeAny: ["refactor-deploy"] },
    },
    {
      id: "dp-hil",
      role: null,
      label: "Raise to HIL",
      sub: "genuine failure",
      escalation: true,
      match: null,
    },
    {
      // The promote-side raise-to-HIL. The deterministic SCM steps (prepare-pr / wait-ci / merge)
      // have no self-heal: a non-zero exit (CI red, a merge conflict/ETIMEDOUT, a PR-prep error)
      // throws a CliEffectError and the drive's top-level catch records a resumable escalation +
      // a "RAISED TO HIL" halt naming the failing step.
      id: "dp-promote-hil",
      role: null,
      label: "Raise to HIL",
      sub: "SCM step fails",
      escalation: true,
      match: null,
    },
  ],
  edges: [
    ["dp-deploy", "dp-verify"],
    ["dp-verify", "dp-gate"],
    ["dp-gate", "dp-pr"],
    ["dp-pr", "dp-ci"],
    ["dp-ci", "dp-promgate"],
    ["dp-promgate", "dp-merge"],
  ] as const,
  backEdges: [
    ["dp-verify", "dp-assess", "verify fails"],
    ["dp-assess", "dp-refactor", ""],
    ["dp-refactor", "dp-deploy", "re-deploy"],
    ["dp-assess", "dp-hil", "genuine"],
    ["dp-pr", "dp-promote-hil", "fails"],
    ["dp-ci", "dp-promote-hil", "CI red"],
    ["dp-merge", "dp-promote-hil", "conflict"],
  ] as const,
};

export const WORKFLOW: WorkflowTopology = {
  nodes: NODES,
  edges: EDGES,
  phaseToNode: PHASE_TO_NODE,
  lanes: { plan: PLAN_LANE, design: DESIGN_LANE, build: BUILD_LANE, deploy: DEPLOY_LANE },
};

// --------------------------------------------------------------------------- lookups

export function nodeById(id: string): WorkflowNode | null {
  return NODES.find((n) => n.id === id) ?? null;
}

/** True for an OUTER-LOOP lane step (currently the design lane's "break into stories" breakdown): a
 *  per-feature step whose result must NOT be hidden by the per-story round scoping. Keyed off the lane
 *  defs so it can't drift from where `outerLoop` is declared. */
export function isOuterLoopStep(stepId: string): boolean {
  for (const lane of Object.values(WORKFLOW.lanes)) {
    const s = lane.steps.find((st) => st.id === stepId);
    if (s) return s.outerLoop === true;
  }
  return false;
}

// The lifecycle node whose recorded deliverables a role AUTHORS — the first node (in lifecycle
// order) that both lists `role` and has a STEP_OUTPUTS entry. Used by the role drill-down: on a live
// board (no per-turn transcript corpus) clicking a role opens WHAT IT PRODUCED — e.g. the
// product-owner → the `intake` node's product-overview/nfrs/design-brief — via the same
// step-outputs panel the node itself opens. Returns null for a role that authors no output-bearing
// node (e.g. a gate-only or terminal role), so the caller can fall back to the empty role shell.
export function primaryOutputNodeForRole(role: string): string | null {
  const n = NODES.find((node) => node.roles.includes(role as Role) && Object.hasOwn(STEP_OUTPUTS, node.id));
  return n?.id ?? null;
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
//   event        — decided alone: the event name must equal it exactly (deploy.start /
//                  deploy.verified light the deploy lane's deterministic steps).
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

  // Exact event-name match, decided alone (the deploy lane lights dp-deploy / dp-verify off specific
  // orchestrator events).
  if (m.event) return e.event === m.event;
  // Exact event-name in a SET, decided ALONE (never falls through to a role check): b-verify lights off
  // the Driver's build-cycle GREEN verify `cycle.verified` ONLY — NOT the release-engineer's deploy
  // `verify.passed`, which must not re-match it via b-verify's role:release-engineer (that role is for
  // COLOUR only here, not matching).
  if (m.eventAny) return m.eventAny.includes(e.event);

  // eventPrefix: the event NAME starts with it. When the step ALSO declares a role/phase, treat the
  // two as an OR – the step matches by event name (e.g. p-intake on the seed's `intake.supplied`) OR
  // by role+phase (e.g. p-intake on the metered PO intake turn's `phase.start`/`turn.usage`, which
  // carry phase="intake" but an event name that does not start with "intake"). An eventPrefix-ONLY
  // step (e.g. b-verify, `eventPrefix:"verify"` with no role/phase) stays NAME-ALONE – a name miss is
  // a miss, never a fall-through to the always-true tail.
  if (m.eventPrefix) {
    if (typeof e.event === "string" && e.event.startsWith(m.eventPrefix)) return true;
    const hasRoleOrPhase =
      m.role !== undefined || m.phase !== undefined || m.phaseAny !== undefined ||
      m.buildMode !== undefined || m.buildModeAny !== undefined;
    if (!hasRoleOrPhase) return false;
    // else fall through to the role/phase checks below (the OR's second arm).
  }

  if (m.role && e.role !== m.role) return false;

  // AND-constraints on the message (the promote sub-steps' narration). Applied before the phaseAny
  // early-return so they combine with it rather than being skipped.
  const msg = typeof e.message === "string" ? e.message : "";
  if (m.messageIncludes && !msg.includes(m.messageIncludes)) return false;
  if (m.messageNotIncludes && m.messageNotIncludes.some((s) => msg.includes(s))) return false;

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

/** Roles that own MORE THAN ONE lane step (navigator → red/review/assess, plus reflect in design;
 *  spec-author → propose/breakdown/author; product-owner → intake/feature; …). A topology card click
 *  for such a role MUST resolve to the CLICKED step's own turn and never fall back to the role's
 *  latest turn — that latest turn could belong to a SIBLING step (e.g. clicking navigator-red at
 *  build start would otherwise surface the earlier navigator-reflect turn). Single-step roles are
 *  safe to resolve by role. Derived once from WORKFLOW so it can't drift from the lane definitions. */
export const MULTI_STEP_ROLES: ReadonlySet<string> = (() => {
  const count: Record<string, number> = {};
  for (const lane of Object.values(WORKFLOW.lanes)) {
    for (const step of lane.steps) {
      if (step.role) { count[step.role] = (count[step.role] ?? 0) + 1; }
    }
  }
  return new Set(Object.keys(count).filter((r) => count[r] > 1));
})();

export interface LaneHit {
  lane: LaneId;
  step: string;
}

// Every gate step id, across all lanes. A gate is a HITL/verify checkpoint, not agent work, so it
// must never be the actively-running `current` step (a gate.approved carries the surfacing role +
// its phase and would otherwise re-light that role's step after the phase is done). The gate's own
// glow comes from the run's parked-gate focus, not from being `current`.
const GATE_STEP_IDS: ReadonlySet<string> = new Set(
  LANE_IDS.flatMap((lane) => WORKFLOW.lanes[lane].steps.filter((s) => s.gate).map((s) => s.id)),
);

// First sub-step (lanes in plan→design→build order, steps in declared order) that this
// event lights, or null. First match wins.
export function laneStepForEvent(e: AgentLogEvent | null | undefined): LaneHit | null {
  if (!e) return null;
  // PASS 1 — exact-event matches (m.event / m.eventAny) win regardless of lane/step order, because an
  // exact event name is MORE SPECIFIC than a role/phase match. This is why the driver's `cycle.verified`
  // (the build-cycle GREEN verify) lights the Verify step (b-verify, eventAny) rather than the Driver
  // step (b-green, role:driver, declared earlier) that also matches a bare driver event.
  for (const lane of LANE_IDS) {
    for (const s of WORKFLOW.lanes[lane].steps) {
      const m = s.match;
      if (m && (m.event === e.event || (m.eventAny && m.eventAny.includes(e.event)))) return { lane, step: s.id };
    }
  }
  // PASS 2 — the general first-match (eventPrefix / role / phase / buildMode).
  for (const lane of LANE_IDS) {
    for (const s of WORKFLOW.lanes[lane].steps) {
      if (matchesStep(s.match, e)) return { lane, step: s.id };
    }
  }
  return null;
}

/** Map a recorded TURN (from turns/index.json: role + `mode` = its phase) to its lane step, so a
 *  WHOLE-CORPUS step→turn map can be built from the index (not just the recent-events window). A turn's
 *  `mode` is the phase a step matches on (breakdown → d-breakdown, ia → d-ux-ia; a null mode on a design
 *  spec/architect turn still matches its phaseNot step). Synthesizes the minimal phase.start the step
 *  matcher reads, reusing `laneStepForEvent` so turn→step and event→step cannot disagree. */
export function laneStepForTurn(turn: { role?: string | null; mode?: string | null; label?: string | null }): string | null {
  if (!turn.role) return null;
  // A build BASE turn records NO `mode` (the navigator RED turn, the driver GREEN turn); only the VARIANT
  // turns record their buildMode as `mode` (reflect/reconcile in design; review/refactor/assess/repair in
  // build). Derive the base buildMode from the role so RED/GREEN still correlate — a mode-less navigator is
  // RED (its only mode-less turn; reflect/reconcile always carry a mode), a mode-less driver is GREEN.
  const mode = turn.mode ?? (turn.role === "navigator" ? "red" : turn.role === "driver" ? "green" : null);
  const synthetic: AgentLogEvent = {
    timestamp: "",
    level: "info",
    role: turn.role,
    event: "phase.start",
    message: turn.label ?? "",
    // Feed `mode` as BOTH phase and buildMode: design steps match on `phase`, build steps match on
    // `buildMode` (b-review/b-refactor/b-assess), and a turn record carries only one `mode` field — so
    // without this, a build VARIANT turn (mode="review") never matched its buildMode-keyed step. The
    // step's own role gate keeps this from cross-lighting (b-* require navigator/driver).
    metadata: mode ? { phase: mode, buildMode: mode } : {},
  };
  return laneStepForEvent(synthetic)?.step ?? null;
}

// Per-step agent metrics for the step cards, folded over the whole event stream: model + effort from
// each step's phase.start, and the cost + turn count of the turns credited to it. A turn.usage carries
// cost but not buildMode, so it cannot be matched to a build step directly — instead each role's
// most-recent phase.start fixes the step its next turn.usage is credited to. First-match wins across
// lanes (laneStepForEvent), so each buildMode maps to exactly one step (e.g. assess-deploy -> the
// deploy lane's dp-assess), counted once there, exactly as the lane lighting resolves it.
export function laneStepMeta(events: AgentLogEvent[]): Record<string, LaneStepMeta> {
  const meta: Record<string, LaneStepMeta> = {};
  const lastStepForRole: Record<string, string> = {};
  const ensure = (id: string): LaneStepMeta => (meta[id] ??= { model: null, effort: null, cost: 0, turns: 0 });
  for (const e of events) {
    if (e.event === "phase.start") {
      const hit = laneStepForEvent(e);
      if (!hit) continue;
      lastStepForRole[e.role] = hit.step;
      const m = ensure(hit.step);
      if (e.model) m.model = e.model;
      if (e.effort) m.effort = e.effort;
    } else if (e.event === "turn.usage") {
      const id = lastStepForRole[e.role];
      if (!id) continue;
      const m = ensure(id);
      const md = (e.metadata || {}) as Record<string, unknown>;
      m.cost += Number(md.cost_usd || 0);
      m.turns += 1;
    }
  }
  return meta;
}

/**
 * The turn ordinal of the LATEST turn credited to a given lane step within the folded window —
 * so clicking a step card opens THAT step's most recent activity (at/before the playhead), not the
 * role's latest turn overall (a role spans several steps: navigator does red/review/assess/reflect).
 *
 * `recentTurns[i]` is the turn ordinal event i begins (aligned to `recentEvents`, null where none),
 * the same array `latestTurnOrdinalForRole` reads. Attribution mirrors `laneStepMeta`: a role's
 * most-recent `phase.start` fixes its current step, and the turn it begins is credited there. Forward
 * scan, last match wins (= latest in the window). Returns null when the step owns no turn in the
 * window, so the caller falls back to the role shell rather than opening the wrong step's turn. Bounded
 * by RECENT_EVENT_TAIL (the window the client holds); an older step's turn is not resolvable here.
 */
export function latestTurnOrdinalForStep(
  recentEvents: AgentLogEvent[],
  recentTurns: (number | null)[],
  stepId: string,
  // STORY SCOPE: when given, credit ONLY turns taken for THIS story. The resolver is otherwise
  // role→step keyed and story-blind, so a per-story step (ux-designer-ia, test-strategist) would
  // resolve to that role's LATEST turn in ANY story — e.g. clicking S3's ux card (a no-turn
  // project-ia-notes projection) returned S2's ux turn. Scoping to the round's story makes a step
  // the current round did not actually invoke resolve to null → "not invoked this round".
  story?: string | null,
): number | null {
  const stepForRole: Record<string, string> = {};
  const storyForRole: Record<string, string> = {};
  let latest: number | null = null;
  for (let i = 0; i < recentEvents.length; i++) {
    const e = recentEvents[i];
    if (e.event === "phase.start") {
      const hit = laneStepForEvent(e);
      if (hit) stepForRole[e.role] = hit.step;
      const st = (e.metadata as Record<string, unknown> | undefined)?.story;
      if (typeof st === "string" && st) storyForRole[e.role] = st;
    }
    const ord = recentTurns[i];
    if (ord != null) {
      // Credit this turn-begin event to the role's current step (or the event's own match, if it
      // carries enough to map on its own — e.g. a phase.start that IS the turn-begin).
      const step = stepForRole[e.role] ?? laneStepForEvent(e)?.step ?? null;
      const matchesStory = story == null || (storyForRole[e.role] ?? null) === story;
      if (step === stepId && matchesStory) latest = ord;
    }
  }
  return latest;
}

// --------------------------------------------------------------------------- progress

/**
 * Walk events[0..upTo), reporting which feature AND which phase each one belongs to.
 *
 * Both are carried forward: not every event stamps a feature_id (5 `phase.start`s in the corpus
 * carry `""`) or a phase (a role's `turn.usage` / `artifact.written` / `reasoning` events carry
 * NONE — only the preceding `handoff` / `phase.start` names the phase), so the value in force is
 * the last one seen. `featureIdOf` skips `reasoning` events, whose feature_id is unreliable — see
 * its docstring. Carrying the phase forward is what stops a spec-author breakdown artifact (phase
 * absent) from looking identical to a design spec-author turn and lighting the DESIGN lane during
 * PLANNING: with the enclosing `breakdown` phase attached it maps to plan's p-breakdown, not d-spec.
 *
 * Shared by `passedNodes` and `laneProgress` so the two cannot disagree about which feature/phase
 * an event belongs to, which would light a node in one view and not the other.
 */
function* eventsWithFeature(
  events: AgentLogEvent[],
  upTo?: number,
): Generator<{ e: AgentLogEvent; feature: string | null; phase: string | null; buildMode: string | null }> {
  const end = upTo === undefined ? events.length : Math.max(0, Math.min(upTo, events.length));
  let feature: string | null = null;
  let phase: string | null = null;
  let buildMode: string | null = null;
  for (let i = 0; i < end; i++) {
    const e = events[i];
    const f = featureIdOf(e);
    if (f) feature = f;
    const p = phaseOf(e);
    if (p) phase = p;
    // buildMode identifies the CURRENT build turn (refactor / review / assess / repair — a base GREEN
    // turn has none). RESET it at each phase.start (a new turn begins) so a base-green turn never
    // inherits the prior refactor turn's mode; BETWEEN phase.starts carry it forward to the turn's
    // phase-less narration (`reasoning` / `turn.usage`) so those events map to the SAME build step as
    // the turn, not to the base green step. This is the ONE place the active step's turn-identity is
    // carried — the central rule that keeps a `reasoning` line from jumping the highlight.
    if (e.event === "phase.start") buildMode = buildModeOf(e);
    else {
      const bm = buildModeOf(e);
      if (bm) buildMode = bm;
    }
    yield { e, feature, phase, buildMode };
  }
}

/** The event as seen with its effective (carried-forward) phase AND buildMode attached, so a
 *  phase/mode-less narration event (`reasoning` / `turn.usage`) is disambiguated by the TURN the run
 *  is actually in — otherwise a driver `reasoning` during a REFACTOR turn matches the base GREEN step
 *  and jumps the highlight. A no-op when the event already carries them. */
function withCarried(e: AgentLogEvent, phase: string | null, buildMode: string | null): AgentLogEvent {
  const needPhase = !!phase && phaseOf(e) !== phase;
  const needMode = !!buildMode && buildModeOf(e) !== buildMode;
  if (!needPhase && !needMode) return e;
  return {
    ...e,
    metadata: { ...(e.metadata ?? {}), ...(needPhase ? { phase } : {}), ...(needMode ? { buildMode } : {}) },
  };
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
  for (const { e, feature: f, phase } of eventsWithFeature(events, upTo)) {
    if (feature !== undefined && f !== feature) continue;
    const node = nodeForPhase(phase);
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
  // The GATE/checkpoint step the playhead is parked AT (step id), for lane-card glow — distinct from
  // `current` (which excludes gate steps for the focus=step path). This is what the run has ARRIVED at:
  //   (a) the playhead IS a gate.surfaced/approved/rejected event → the gate it names (GATE_STEP_BY_KEY);
  //   (b) the playhead maps to a gate STEP that `current` nulled (the per-story release-engineer verify
  //       `b-verify`, whose deploy/verify work IS the current locus).
  // It glows the right card for the ship/verify gates that never become a parked `pendingGate` (the
  // one-turn deploy/promote gates emit no surface→approve window; the per-story verify runs while the
  // acceptance gate stays open), and it TAKES PRECEDENCE over the lingering pendingGate glow so the
  // open-but-not-current acceptance gate doesn't steal the glow from the step the run is actually at.
  currentGate: string | null;
}

/**
 * Fold events[0..upTo) into per-lane sub-step progress, for done-shading the lane graphs.
 *
 * @param feature scope to one feature; omit for the whole run. Unscoped, a multi-feature run
 *   accumulates: at event 230 of the stockflow-rerecord corpus, sprint 2 has only just begun
 *   designing, yet all seven build sub-steps read as reached because sprint 1 lit them.
 */
export function laneProgress(events: AgentLogEvent[], upTo?: number, feature?: string): LaneProgress {
  const done: Record<LaneId, Set<string>> = { plan: new Set(), design: new Set(), build: new Set(), deploy: new Set() };
  const last: Record<LaneId, string | null> = { plan: null, design: null, build: null, deploy: null };

  // The playhead event with its effective phase — tracked here (before the feature filter) because
  // `current` is deliberately NOT feature-filtered, while the done-set below is.
  let playhead: AgentLogEvent | null = null;
  for (const { e, feature: f, phase, buildMode } of eventsWithFeature(events, upTo)) {
    // Attach BOTH the carried phase and buildMode, so a phase-less breakdown artifact maps to plan's
    // p-breakdown (not design's d-spec), a phase-less design artifact still maps into design, AND a
    // driver `reasoning` during a refactor turn stays on b-refactor instead of falling to b-green.
    const carried = withCarried(e, phase, buildMode);
    playhead = carried;
    if (feature !== undefined && f !== feature) continue;
    const hit = laneStepForEvent(carried);
    if (!hit) continue;
    done[hit.lane].add(hit.step);
    last[hit.lane] = hit.step;
  }

  // `current` reflects the event AT the playhead, not the last event that happened to match
  // something — otherwise a stale step stays lit across unmatched events. It reads the SAME
  // carried phase+buildMode event as the done-set (via `eventsWithFeature` → `withCarried`), so the
  // two views agree; a gate.surfaced/handoff still maps to no role step (wrong role), so a gate park stays
  // step-less.
  //
  // `current` is never a HITL boundary. TWO guards: (1) a gate.surfaced/gate.approved event is not
  // agent work — and a gate.approved carries the surfacing role + phase, so it matches THAT role's
  // step (e.g. the PO's p-intake at intake approval) and would re-light it after the phase is done;
  // (2) a GATE step (e.g. the backlog commit, which lights from author-requests events) is a
  // checkpoint, not work. The gate's glow comes from the run's parked-gate focus, not from `current`.
  const hit =
    playhead && playhead.event !== "gate.surfaced" && playhead.event !== "gate.approved"
      ? laneStepForEvent(playhead)
      : null;
  const current: LaneHit | null = hit && !GATE_STEP_IDS.has(hit.step) ? hit : null;

  // The gate/checkpoint step the playhead is parked AT (see LaneProgress.currentGate). (a) a
  // gate.surfaced/approved/rejected event names its gate → that gate's lane step; (b) otherwise a
  // work event that maps to a gate step (`hit` above, which `current` nulled) — the per-story verify.
  let currentGate: string | null = null;
  if (playhead) {
    if (
      playhead.event === "gate.surfaced" ||
      playhead.event === "gate.approved" ||
      playhead.event === "gate.rejected"
    ) {
      const gname = (playhead.metadata as Record<string, unknown> | undefined)?.gate;
      if (typeof gname === "string") currentGate = GATE_STEP_BY_KEY[gname] ?? null;
    } else {
      const gateHit = laneStepForEvent(playhead);
      if (gateHit && GATE_STEP_IDS.has(gateHit.step)) currentGate = gateHit.step;
    }
  }

  return { done, last, current, currentGate };
}

// An edge is complete when both of its endpoints have been reached.
export function edgeDone(lane: LaneId, edge: WorkflowEdge, progress: LaneProgress): boolean {
  const reached = progress.done[lane];
  return reached.has(edge[0]) && reached.has(edge[1]);
}

// --------------------------------------------------------------------------- pass-scoped reach

/** Each lane's FIRST declared step — the node whose RE-entry marks a new pass through that lane
 *  (the build loop's `b-refactor → b-red`, or a new story's cycle). Derived from WORKFLOW. */
const LANE_FIRST_STEP: Record<LaneId, string | null> = LANE_IDS.reduce(
  (acc, lane) => {
    acc[lane] = WORKFLOW.lanes[lane].steps[0]?.id ?? null;
    return acc;
  },
  {} as Record<LaneId, string | null>,
);

/** Every step id grouped by its lane — so a pass reset can clear exactly the looping lane's nodes
 *  (and nothing upstream). */
const LANE_STEP_IDS: Record<LaneId, ReadonlySet<string>> = LANE_IDS.reduce(
  (acc, lane) => {
    acc[lane] = new Set(WORKFLOW.lanes[lane].steps.map((s) => s.id));
    return acc;
  },
  {} as Record<LaneId, ReadonlySet<string>>,
);

/**
 * The steps actually TRAVERSED to reach the playhead, scoped to the CURRENT pass — NOT the
 * monotonic done-set. This is "what the DAG followed, this iteration": fold events[0..upTo),
 * light each step, and when a lane's FIRST step is re-entered (the `b-refactor → b-red` loop
 * edge, or a new story's red) CLEAR that lane's accumulated steps and start the pass fresh. A
 * verify-fail branch (b-assess/b-repair) that ran THIS pass stays reached; one that didn't is
 * absent. Upstream lanes never re-enter their first step, so their steps stay reached (a build
 * playhead keeps design full). This is the single source for every node-state surface — reveal,
 * the per-step cards, and the lane shading — so a node can never read "done" in one and
 * "not yet run" in another.
 *
 * `upTo`/`feature` match laneProgress exactly (live edge or scrubber playhead; feature-scoped),
 * so live and scrubber share this one computation.
 */
export function reachedThisPass(events: AgentLogEvent[], upTo?: number, feature?: string): Set<string> {
  const reached = new Set<string>();
  for (const { e, feature: f, phase, buildMode } of eventsWithFeature(events, upTo)) {
    if (feature !== undefined && f !== feature) continue;
    const hit = laneStepForEvent(withCarried(e, phase, buildMode));
    if (!hit) continue;
    // A new pass through this lane: its first step is lit AGAIN. Drop everything this lane
    // accumulated in the prior pass so a later step from last cycle no longer reads as reached.
    if (hit.step === LANE_FIRST_STEP[hit.lane] && reached.has(hit.step)) {
      for (const id of LANE_STEP_IDS[hit.lane]) reached.delete(id);
    }
    reached.add(hit.step);
  }
  return reached;
}
