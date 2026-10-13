// route-scenarios: the CATALOGUE of route pathways out of a spec-author breakdown, each an
// isolated scenario the suite runs in its own throwaway `.consort` workspace (LEAN – no cloud
// project). One entry per outcome of the StepOutcome space:
//   produced  -> the honest next hop (ux-designer) – the happy path.
//   revise    -> a routable spec smell routes back to the spec-author at Gate 1.
//   escalate  -> a non-routable blocking escalation halts to the HIL.
//
// Every scenario shares the demo's PO-seed + spec-author-breakdown manifests + intake; they
// differ only in whether an escalation is injected before the step under test and what route is
// expected. No env/cloud needed – the route depends on `.consort` state, which the driver builds
// on a temp dir.

import { join } from "node:path";
import type { RouteScenario } from "./route-scenario.js";
import type { LifecycleOp } from "../provisioning/lifecycle-types.js";
import type { WorkflowAction } from "../workflow/workflow-vocabulary.js";

const KIT = process.cwd();
// The demo manifests + recorded intake live in the integration-test corpus (a manifest dropped
// there participates in the folder-discovery integration runner). See tests/integration/.
const CORPUS = join(KIT, "tests/integration");
// The route-scenario manifest set lives in its own subdir (manifests/ now holds only per-purpose
// subdirs). loadStepManifests is non-recursive, so this loads exactly that set.
const MANIFEST_DIR = join(CORPUS, "manifests", "route-scenarios");
const INTAKE = join(CORPUS, "intake");
const FEATURE = "F1-stock-visibility";
const STORY = "S1-stock-list";

const PO_SEED: WorkflowAction = { kind: "invoke-role", role: "product-owner", mode: "author-requests" };
const SPEC_AUTHOR: WorkflowAction = { kind: "invoke-role", role: "spec-author", mode: "breakdown" };
// The two OTHER spec-author invocations the orchestrator emits (see orchestrator-drive.ts):
//   per-story ACs (mode absent) – produced -> the architect-reviewer for that story.
//   sprint-planning propose      – produced -> the architect-reviewer estimate turn.
const SPEC_AUTHOR_STORY: WorkflowAction = { kind: "invoke-role", role: "spec-author", story: STORY } as WorkflowAction;
const SPEC_AUTHOR_PROPOSE: WorkflowAction = { kind: "invoke-role", role: "spec-author", mode: "propose" };
// The UX Designer turn (UI track, once, after breakdown). Its route SPACE is only 3: it is NEVER
// a revise owning_role (only spec-author/test-strategist/architect-reviewer are; its ux-adherence
// smell is a build-lane driver refactor, not a design revise-route back to it). So: produced ->
// the first story's design (spec-author ACs), escalate -> raise-to-hil, blocked -> bounded retry.
const UX_DESIGNER: WorkflowAction = { kind: "invoke-role", role: "ux-designer", mode: "establish" };
// The OTHER two revise-owning design roles (owning_role = spec-author | test-strategist |
// architect-reviewer). Each per-story action's produced next-hop is the next design step; each
// has its OWN revise smell routing back to it at its OWN gate.
const TEST_STRATEGIST: WorkflowAction = { kind: "invoke-role", role: "test-strategist", story: STORY } as WorkflowAction;
const ARCHITECT_REVIEWER: WorkflowAction = { kind: "invoke-role", role: "architect-reviewer", story: STORY } as WorkflowAction;

/** An inject-escalation op scoped to the demo story – the config-driven mechanism that plants a
 *  real escalation on disk so a scenario deterministically drives revise/escalate. */
function inject(source: string, reason: string): LifecycleOp {
  return { kind: "inject-escalation", config: { source, reason, feature_id: FEATURE, story_id: STORY } };
}

/** Base scenario shell shared by all three pathways (same manifests/intake). */
function base(id: string, description: string): Pick<RouteScenario, "id" | "description" | "feature" | "manifestDir" | "intakeDir"> {
  return { id, description, feature: FEATURE, manifestDir: MANIFEST_DIR, intakeDir: INTAKE };
}

/** The route-scenario catalogue. */
export const ROUTE_SCENARIOS: RouteScenario[] = [
  {
    ...base("produced-uxdesigner", "clean breakdown routes forward to the UX Designer (produced)"),
    seedActions: [PO_SEED],
    stepUnderTest: SPEC_AUTHOR,
    expectedRoute: { kind: "invoke-role", role: "ux-designer" },
  },
  {
    ...base("revise-specauthor", "a routable spec smell routes the breakdown back to the Spec Author (revise -> Gate 1)"),
    seedActions: [PO_SEED, SPEC_AUTHOR],
    injectEscalation: inject("smell:reflect-spec-defect", "AC2 is untestable as written (no observable outcome)"),
    stepUnderTest: SPEC_AUTHOR,
    expectedRoute: { kind: "revise-route", role: "spec-author", gate: "spec", story: STORY },
  },
  {
    ...base("escalate-hil", "a non-routable blocking escalation halts the breakdown to the HIL (escalate)"),
    seedActions: [PO_SEED, SPEC_AUTHOR],
    injectEscalation: inject("honest-green", "verify failed on main – not recoverable by a re-spec"),
    stepUnderTest: SPEC_AUTHOR,
    expectedRoute: { kind: "raise-to-hil" },
  },
  {
    // The 4th outcome: a nonconformant primary output fails validate-outputs -> the step is
    // BLOCKED (a bounded retry of the SAME action). No escalation involved.
    ...base("blocked-retry", "a nonconformant output blocks the breakdown into a bounded retry of itself"),
    seedActions: [PO_SEED],
    stepUnderTest: SPEC_AUTHOR,
    nonconformantPrimary: true,
    expectedRoute: SPEC_AUTHOR, // bounded retry re-issues the same action.
  },
  {
    // The per-story ACs invocation – its distinct produced next-hop is the architect for the
    // story. (revise/escalate/blocked are the SAME shared machinery proven via breakdown.)
    ...base("story-produced-architect", "per-story ACs route forward to the Architect for that story (produced)"),
    seedActions: [],
    stepUnderTest: SPEC_AUTHOR_STORY,
    expectedRoute: { kind: "invoke-role", role: "architect-reviewer", story: STORY },
  },
  {
    // The sprint-planning propose invocation – its distinct produced next-hop is the architect
    // estimate turn.
    ...base("propose-produced-estimate", "sprint-planning propose routes forward to the Architect estimate (produced)"),
    seedActions: [],
    stepUnderTest: SPEC_AUTHOR_PROPOSE,
    expectedRoute: { kind: "invoke-role", role: "architect-reviewer", mode: "estimate" },
  },
  // ── UX Designer route space (3 outcomes; ux-designer is never a revise target) ──────────────
  {
    // produced: once the design guide exists, the lane advances to the first story's design ,
    // the per-story spec-author (ACs). (nextDesignAction after uxDesignerPending clears.)
    ...base("uxdesigner-produced-story", "the UX Designer's guide routes forward to the first story's design (produced)"),
    seedActions: [],
    stepUnderTest: UX_DESIGNER,
    expectedRoute: { kind: "invoke-role", role: "spec-author", story: STORY },
  },
  {
    // escalate: a non-routable blocking escalation halts the UX turn to the HIL.
    ...base("uxdesigner-escalate-hil", "a non-routable blocking escalation halts the UX Designer turn to the HIL (escalate)"),
    seedActions: [],
    injectEscalation: inject("honest-green", "verify failed on main – not recoverable by a re-design"),
    stepUnderTest: UX_DESIGNER,
    expectedRoute: { kind: "raise-to-hil" },
  },
  {
    // blocked: a nonconformant design-guide.json fails validate-outputs -> bounded retry of the
    // SAME ux-designer turn (ux-designer has no revise owning_role, so a bad artifact re-issues).
    ...base("uxdesigner-blocked-retry", "a nonconformant design-guide blocks the UX Designer turn into a bounded retry of itself"),
    seedActions: [],
    stepUnderTest: UX_DESIGNER,
    nonconformantPrimary: true,
    expectedRoute: UX_DESIGNER,
  },
  // ── Test Strategist (the 2nd revise-owning role): revise -> test_list gate + produced ───────
  {
    ...base("teststrategist-revise", "a routable test-list smell routes back to the Test Strategist (revise -> test_list gate)"),
    seedActions: [],
    injectEscalation: inject("smell:reflect-testlist-defect", "the test list asserts shared aggregate state (not story-isolated)"),
    stepUnderTest: TEST_STRATEGIST,
    expectedRoute: { kind: "revise-route", role: "test-strategist", gate: "test_list", story: STORY },
  },
  {
    ...base("teststrategist-produced-reflect", "the Test Strategist's test-list routes forward to the Navigator reflect gate (produced)"),
    seedActions: [],
    stepUnderTest: TEST_STRATEGIST,
    expectedRoute: { kind: "invoke-role", role: "navigator", story: STORY, buildMode: "reflect" },
  },
  // ── Architect Reviewer (the 3rd revise-owning role): revise -> architecture gate + produced ─
  {
    ...base("architect-revise", "a routable architecture smell routes back to the Architect Reviewer (revise -> architecture gate)"),
    seedActions: [],
    injectEscalation: inject("smell:architect-canon-gap", "the story maps to no project canon layer; the architecture needs amending"),
    stepUnderTest: ARCHITECT_REVIEWER,
    expectedRoute: { kind: "revise-route", role: "architect-reviewer", gate: "architecture", story: STORY },
  },
  {
    ...base("architect-produced-dba", "the Architect Reviewer's annotations route forward to the DBA (produced)"),
    seedActions: [],
    stepUnderTest: ARCHITECT_REVIEWER,
    expectedRoute: { kind: "invoke-role", role: "dba", story: STORY },
  },
];
