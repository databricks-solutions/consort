import { existsSync, readFileSync, writeFileSync } from "fs";
import { createHash } from "crypto";
import { join } from "path";
import { listCycles } from "../../consort/pipeline/run-cycle";
import type { CycleScope, CycleArtifact } from "../../consort/pipeline/run-cycle";
import { storyTestListJson } from "../../consort/config/consort-paths";

export type SmellName =
  | "test-list-drift"
  | "cycle-stall"
  | "api-coherence-drift"
  | "fragility-ratio"
  | "test-cost-spiral"
  | "cross-experiment-divergence"
  | "dead-requirement-signal"
  | "test-deletion-attempt"
  | "boundary-violation"
  | "import-time-build-coupling"
  | "scaffold-defect"
  | "ac-overlap"
  | "layering-violation"
  | "ux-adherence"
  | "ui-style-implementation-test"
  | "e2e-inline-regex-flag"
  | "e2e-row-perma-red"
  | "contract-incompleteness"
  | "migration-app-coupling"
  | "superseded-tests"
  // A test asserts an ABSOLUTE whole-table aggregate (an integrity probe / global
  // COUNT/SUM) without owning the table state, so it passes on the isolated
  // per-cycle build branch but fails the full-feature deploy-verify once other
  // stories' rows share the table. Spec-level, test-strategist-owned: scope the
  // aggregate + assertion to the test's own rows (or a delta), never a global total.
  | "shared-state-aggregate-assertion"
  // Pre-build reflection gate: the Navigator (reflect mode) found a design-time
  // defect in a story's spec or test-list before the build lane. Spec-level +
  // blocking, so it routes to the owning author (bounded one revise) then HITL,
  // reusing the revise-route machinery.
  | "reflect-spec-defect"
  | "reflect-testlist-defect"
  // The deterministic architect-notes projection (FEIP-7902) found a story whose
  // AC layers / architecture dimensions the project canon does not cover: a blind
  // projection would guess, so route to the Architect (re-annotate + amend the
  // canon) via revise-routing. Spec-level, architect-owned. Fail-toward-projection
  // with a reactive fallback: projection is the default, this is the self-heal.
  | "architect-canon-gap";

export interface SmellDefinition {
  name: SmellName;
  description: string;
  proposed_remediation: string;
  /** revise-routing taxonomy. `spec` smells are a design-time
   *  decomposition defect the PO can send back to an owning author and resume
   *  (revise-routing); `build`/undefined smells hard-halt to the HIL (genuine
   *  build thrashing, a missing scaffold, etc.), with no automatic author route. */
  level?: "spec" | "build";
  /** For a `spec`-level smell: the design-lane author whose remediation it is
   *  (the verdict routes here on `revise`). */
  owning_role?: "spec-author" | "test-strategist" | "architect-reviewer";
  /** For a `spec`-level smell: the gate to re-open + re-run (Gate 1 spec / Gate 2
   *  architecture / Gate 3 test_list). The story re-enters the design lane at that
   *  author. */
  gate_to_rerun?: "spec" | "test_list" | "architecture";
}

export const SMELL_CATALOG: SmellDefinition[] = [
  {
    name: "test-list-drift",
    description: "Test list grew by >25% since cycle start without HITL approval.",
    proposed_remediation: "PO refinement on spec.",
    // A drifted/non-orderable test list is a test-strategist decomposition
    // defect: route the remediation back to Gate 3 on `revise`.
    level: "spec",
    owning_role: "test-strategist",
    gate_to_rerun: "test_list",
  },
  {
    name: "superseded-tests",
    description:
      "A new AC intentionally supersedes behavior encoded in PRIOR tests (often from earlier features); the Navigator flagged them in a superseded-tests allowlist. NOT a contradiction to block (that is test-list-drift), the latest AC wins and the accumulated tests must follow it.",
    proposed_remediation:
      "Driver permissively refactors ONLY the flagged tests (and the code) to the new AC, then the honest-GREEN verify re-runs. Bounded to one attempt; an unflagged regression escalates.",
    level: "build",
  },
  {
    name: "cycle-stall",
    description: "N cycles in a row with no GREEN.",
    proposed_remediation: "Re-examine test ordering or spec ambiguity.",
  },
  {
    name: "api-coherence-drift",
    description: "Same concept named differently across two consecutive PASS reviews.",
    proposed_remediation: "Rename refactor before next test.",
  },
  {
    name: "fragility-ratio",
    description: "One behavior change failed >3 tests.",
    proposed_remediation: "Refactor + flag tests-mirror-implementation anti-pattern.",
  },
  {
    name: "test-cost-spiral",
    description: "Each subsequent test takes >2x the lines of the prior one.",
    proposed_remediation: "Reconsider boundary; outer-loop tests probably needed.",
  },
  {
    name: "cross-experiment-divergence",
    description: "Two parallel experiments are solving different problems.",
    proposed_remediation: "Was an opinion gap hidden? Re-run design-spec gate.",
  },
  {
    name: "dead-requirement-signal",
    description: "An AC has had no scenarios written in N cycles while others mature.",
    proposed_remediation: "Deprecate or clarify via PO refinement.",
  },
  {
    name: "test-deletion-attempt",
    description: "Driver or human attempts to remove or weaken an existing test.",
    proposed_remediation: "Hard block. Tests are immutable until the test list itself is renegotiated.",
  },
  {
    name: "boundary-violation",
    description: "Test references a private method or internal helper.",
    proposed_remediation: "Refactor to public boundary or move to inner-loop list.",
  },
  {
    name: "import-time-build-coupling",
    description:
      "The app entry module requires an optional build artifact (e.g. client/dist) at " +
      "module load time, an unconditional StaticFiles mount / asset read at import scope. " +
      "It greens where the artifact happens to exist and crashes at import everywhere it " +
      "does not (backend-only test runs, CI before the client build, fresh clones). Caught " +
      "deterministically by the `consort-imports-clean` gate; the Navigator may also " +
      "flag it in REVIEW.",
    proposed_remediation:
      "Guard the coupling: mount the compiled client ONLY when its directory exists, and " +
      "serve a clear 503 from the SPA route when index.html is absent, so the module imports " +
      "without the artifact. See the dev/prod-parity rule in software-design-principles.",
  },
  {
    name: "scaffold-defect",
    description:
      "A test cannot run because the project scaffold is missing a piece the kit owns " +
      "(e.g. tests/e2e/conftest.py + the live_server fixture for an E2E AC, or an absent " +
      "runner). The role flags it instead of fabricating the missing scaffold itself. " +
      "Blocking: a fabricated fixture diverges from the shipped one + reintroduces the " +
      "CI-parity bugs the kit template prevents.",
    proposed_remediation:
      "Halt + surface to the HIL. Fix the scaffold (re-run the kit's wiring, e.g. " +
      "--enable-e2e for the project's language), never hand-author the missing piece in the build.",
  },
  {
    name: "ac-overlap",
    description:
      "Two acceptance criteria in a story are not independent: satisfying one's `then` " +
      "inherently satisfies (or contradicts) another, so the dependent AC's test can never " +
      "go RED without deleting shipped code. A spec/test-list decomposition defect. Blocking, " +
      "and flagged at the design gate (Gate 3) so it halts BEFORE a build cycle is wasted, " +
      "rather than surfacing mid-build as a cycle-stall.",
    proposed_remediation:
      "Surface to the PO at the gate. Merge the overlapping ACs, differentiate their observable " +
      "behavior, or (PO decision) accept the dependent AC as already-satisfied. Do not order both " +
      "as separate cycles.",
    // An AC overlap is a spec-author decomposition defect: route back to Gate 1.
    level: "spec",
    owning_role: "spec-author",
    gate_to_rerun: "spec",
  },
  {
    name: "reflect-spec-defect",
    description:
      "The pre-build reflection critic (Navigator, reflect mode) found a defect in the story's " +
      "SPEC before the build lane: an internal contradiction between ACs, a spec-vs-architecture " +
      "layer conflict, or an untestable/vacuous AC (no observable outcome). Caught on the cheap " +
      "design artifacts so it is fixed BEFORE any RED/GREEN/REVIEW cycle runs, the reflection " +
      "gate is a speed play (a spec fix is far cheaper than re-running build cycles).",
    proposed_remediation:
      "Route back to the Spec Author (Gate 1): resolve the contradiction, make the AC observable, " +
      "or realign the AC with the architecture. Bounded to one automatic revise per story; if the " +
      "critic still finds the defect after the re-spec, it escalates to the human.",
    // A spec defect the critic surfaces is a spec-author fix: route back to Gate 1.
    level: "spec",
    owning_role: "spec-author",
    gate_to_rerun: "spec",
  },
  {
    name: "reflect-testlist-defect",
    description:
      "The pre-build reflection critic (Navigator, reflect mode) found a defect in the story's " +
      "TEST-LIST before the build lane: a test that contradicts its AC, an AC with no covering " +
      "test (coverage gap), an NFR with no fitness test, or a test that asserts at a layer the " +
      "architecture forbids. Caught on the cheap artifacts so it is fixed BEFORE the build lane.",
    proposed_remediation:
      "Route back to the Test Strategist (Gate 3): align the test with its AC, add the missing " +
      "coverage, or move the assertion to the correct layer. Bounded to one automatic revise per " +
      "story; if the critic still finds the defect after the re-scope, it escalates to the human. " +
      "CROSS-STORY persistence-invariant case: if the uncovered invariant is one whose table is " +
      "realized by THIS story but a DIFFERENT, already-gated story front-loaded its fitness item " +
      "(the invariant-coverage-distinct block), the story-scoped auto-revise CANNOT clear it (it only " +
      "re-runs this story). The fix is to re-anchor the invariant to its REALIZING story (per " +
      "db-design schema_changes): remove the fitness item from the mis-anchored owner and add it here. " +
      "That crosses a gated story boundary, so it escalates to the human with the owning story named " +
      "(reopen it), rather than looping this story to a dead end.",
    // A test-list defect the critic surfaces is a test-strategist fix: route back to Gate 3.
    level: "spec",
    owning_role: "test-strategist",
    gate_to_rerun: "test_list",
  },
  {
    name: "shared-state-aggregate-assertion",
    description:
      "A test asserts an ABSOLUTE aggregate over the WHOLE store (an integrity/consistency " +
      "probe, a global COUNT/SUM – e.g. 'the probe reports exactly 0/2/1 nonconforming rows') " +
      "without owning the table state it asserts. It passes in the per-cycle build verify (an " +
      "ISOLATED ephemeral branch holding only its seeded rows) but the honest-GREEN full-feature " +
      "deploy-verify FAILS it, because that runs the whole suite against the SHARED feature-branch " +
      "DB where other stories' rows (same nullable columns) inflate the count. A real probe over a " +
      "real deployed DB can never assert an exact global total anyway.",
    proposed_remediation:
      "Route back to the Test Strategist (Gate 3): scope BOTH the seed AND the assertion to the " +
      "test's own rows (filter the probe/count by the test's SKUs or a marker column, or assert a " +
      "before-vs-after DELTA), never an absolute whole-table total. Bounded to one automatic revise " +
      "per story; a second escape escalates to the human.",
    // A contamination-fragile aggregate assertion is a test-strategist fix: route back to Gate 3.
    level: "spec",
    owning_role: "test-strategist",
    gate_to_rerun: "test_list",
  },
  {
    name: "architect-canon-gap",
    description:
      "The deterministic architect-notes projection (FEIP-7902) found a story whose AC layers or " +
      "architecture.json dimensions (a persistence-invariant type or an NFR category) the project " +
      "canon does not yet cover. Projecting a blind architectural_note would guess at placement the " +
      "canon cannot justify, so the story is routed to the Architect instead: re-annotate the story " +
      "AND amend the canon so the next feature inherits the new rule. Spec-level + architect-owned; " +
      "the projection is the default path and this is its reactive self-heal.",
    proposed_remediation:
      "Route to the Architect Reviewer (Gate 2 architecture): annotate the uncovered ACs with real " +
      "architectural_notes and declare the new dimension in architecture.json so reconcile amends the " +
      "canon. Bounded to one automatic revise per story; a second escape hard-halts to the human.",
    level: "spec",
    owning_role: "architect-reviewer",
    gate_to_rerun: "architecture",
  },
  {
    name: "layering-violation",
    description:
      "The code breaks the layered-architecture contract the architect declared in " +
      "architecture.json `layers`: a fat controller (the boundary/routes layer calls " +
      "the DB session directly – .query/.add/.commit/.delete – or holds business logic " +
      "instead of delegating to a service + repository); a dependency that does NOT " +
      "point inward (a layer imports another its `may_import` does not permit – e.g. the " +
      "boundary reaching around the service into the repository, or a backward import); " +
      "or leaked persistence (a non-repository layer such as the service touches the ORM " +
      "session). Distinct from `boundary-violation` (which is a TEST reaching a private " +
      "method). Caught deterministically by `consort-layering-clean` (boundary session " +
      "ops, may_import-derived inward-dependency scan, and ORM containment across " +
      "non-repository layers); the Navigator may also flag it in REVIEW.",
    proposed_remediation:
      "Extract a service (business logic) + a repository (the ONLY layer that touches " +
      "the ORM/session); the route handler validates input + delegates. Defended by the " +
      "layering fitness test (tests/architecture/test_layering.py).",
  },
  {
    name: "ux-adherence",
    description:
      "The rendered UI defines the design tokens on :root yet does not USE them at the " +
      "element level: hardcoded hex colors / raw px where a var(--token) belongs, an " +
      "ia.md data-testid seam that was never rendered, or an action surface (form/submit) " +
      "with no feedback affordance (no silent failure / unacknowledged success). Token-level " +
      "adherence (assertDesignAdherence) cannot see this; the element-level checks in " +
      "design-adherence.ts do, and the UX Designer flags it in REVIEW. Distinct from " +
      "`layering-violation` (engineering layering): this is the experience-lens gate.",
    proposed_remediation:
      "Consume tokens via var(--token) (no hardcoded hex/px), render every ia.md screen with " +
      "its data-testid seams, and give every action a perceivable result. Refactor the UI to the " +
      "design guide; do not weaken the guide to match the drift.",
  },
  {
    name: "ui-style-implementation-test",
    description:
      "A test for a design-guide-governed styling property asserts the IMPLEMENTATION in the page " +
      "SOURCE (an inline `style=` attr or raw CSS text, e.g. grepping the HTML for `text-align: right`) " +
      "instead of the rendered SEAM (the element carries the design-guide class / data-testid) or the " +
      "design-adherence gate. It greens only while the style stays inline, so the moment the design lane " +
      "refactors that ad-hoc inline style into a token-driven theme.css class (as the design guide " +
      "requires), the test breaks and the REFACTOR dead-locks with no valid SUPERSEDED-TESTS path (the " +
      "test and the design guide cannot both be satisfied). A test-list decomposition defect the pre-build " +
      "reflection critic flags (routes to the Test Strategist), so it is fixed before a build cycle wastes " +
      "on it.",
    proposed_remediation:
      "Test the SEAM, not the implementation: assert the quantity/styled cell carries its design-guide " +
      "class or data-testid (the stable contract), and leave the visual property (alignment, tabular-nums, " +
      "color) to the design-adherence gate / a rendered-output check. Never assert an inline `style=` string " +
      "the design guide will move into a token-driven class.",
    // A styling test asserting implementation is a test-strategist decomposition
    // defect: route back to Gate 3 (test_list) on `revise`.
    level: "spec",
    owning_role: "test-strategist",
    gate_to_rerun: "test_list",
  },
  {
    name: "e2e-inline-regex-flag",
    description:
      "An E2E Playwright matcher (to_contain_text/to_have_text/to_have_url/get_by_text) is " +
      "built from a Python regex carrying INLINE FLAGS – re.compile(r\"(?i)summary\") and the " +
      "like. Playwright forwards the pattern's `.pattern` string verbatim to the browser's " +
      "JavaScript regex engine, which does NOT support inline-flag syntax `(?i)`/`(?s)`/`(?m)`, " +
      "so the regex is invalid and the assertion can never match the running app. The test is " +
      "structurally un-greenable: the honest-GREEN verify rejects it and the build raises to HIL. " +
      "Caught deterministically + cheaply (no browser run) by the e2e-regex-clean static lint, " +
      "which enriches the GREEN-verify failure with the exact file:line + fix.",
    proposed_remediation:
      "Pass the flag as a kwarg, not inline: re.compile(\"summary\", re.IGNORECASE) emits the " +
      "valid JS regex /summary/i. Or, for a plain case-insensitive substring, use the bare string " +
      "form Playwright already matches loosely. See the E2E rule in the Navigator role.",
  },
  {
    name: "e2e-row-perma-red",
    description:
      "An E2E-tagged test row has failed or had zero recorded runs for N or more consecutive cycles.",
    proposed_remediation:
      "Surface to PO: either fix the runner wiring (BASE_URL, paired-branch endpoint, playwright.config), narrow the failing scenario, or retag the AC to a layer with a working runner.",
  },
  {
    name: "contract-incompleteness",
    description:
      "A migration DROPPED (or renamed) a column the running code still references – the ORM " +
      "model field, a query/repository, a serializer/DTO, or a template/view – so the app emits " +
      "SQL for a column the migrated database no longer has and crashes at runtime (\"column X " +
      "does not exist\") even though the migration itself succeeded. The contract half of " +
      "expand/contract (software-design-principles hard rule 9) was left incomplete: the schema " +
      "shrank but the code did not follow in the SAME change. Caught DETERMINISTICALLY by the " +
      "`consort-contract-clean` gate (it parses the migration's net column drops and greps " +
      "the code tree for residual references), which enriches the GREEN-verify failure with the " +
      "exact file:line list – no model judgment needed to notice OR localize it.",
    proposed_remediation:
      "Driver REPAIR: remove or replace EVERY residual reference (model field, queries, " +
      "serializers/DTOs, templates/views) in the same change so the code matches the migrated " +
      "schema. Never edit the migration or a test to hide it. The green-failure fixDirective " +
      "carries the precise file:line list, so this self-heals without a Navigator assess.",
  },
  {
    name: "migration-app-coupling",
    description:
      "A migration module imports application code at import scope (e.g. `from app.services... " +
      "import parse_x`) to reuse app logic in a data migration. A migration is an IMMUTABLE " +
      "historical artifact; the app is mutable. Coupling the two means a later rename/move/removal " +
      "of that app symbol breaks replaying the migration from base (the historical revision can no " +
      "longer import), and every alembic subcommand that builds the revision map (history/heads, " +
      "not just upgrade) must load the module. It greens under `upgrade` (env.py puts the project " +
      "root on sys.path) yet fails in CI's `alembic history`/`heads`. Caught DETERMINISTICALLY by the " +
      "`consort-migration-clean` gate (it scans the migration files for module-scope app imports), " +
      "which runs proactively at GREEN even when the local verify passes, so it is fixed before the PR; " +
      "the Navigator may also flag it in REVIEW.",
    proposed_remediation:
      "Driver REPAIR: make the migration self-contained: inline a frozen copy of the needed logic in the " +
      "migration file (or express the data change in raw SQL). Do not import from app.* at module scope, so " +
      "the migration stays stable as the app evolves and loads under every alembic subcommand.",
  },
];

export interface DetectorInput {
  scope: CycleScope;
  cycles: CycleArtifact[];
  test_list_size_at_start?: number;
  test_list_size_now?: number;
  /**
   * Cycle counts for ACs in the same story (excluding the scope's own
   * AC). Caller responsibility to populate; detectDeadRequirementSignal
   * uses it to flag this scope's AC as dead when siblings have matured
   * past the configured threshold. Optional; the detector returns []
   * when absent.
   */
  sibling_ac_cycle_counts?: Record<string, number>;
}

export interface SmellHit {
  smell: SmellName;
  cycle_ids: string[];
  detail: string;
  /** Story the smell was flagged against: lets revise-routing know
   *  which story to send back to its owning author. Optional for back-compat. */
  story_id?: string;
  /** AC the smell concerns, when applicable (carried into the revise brief). */
  ac_id?: string;
}

/** The revise-routing taxonomy for a smell, or null if it is build-level
 *  (hard-halt, no automatic author route). */
export function specLevelSmell(
  name: string,
): {
  owning_role: "spec-author" | "test-strategist" | "architect-reviewer";
  gate_to_rerun: "spec" | "test_list" | "architecture";
} | null {
  const def = SMELL_CATALOG.find((s) => s.name === name);
  if (!def || def.level !== "spec" || !def.owning_role || !def.gate_to_rerun) return null;
  return { owning_role: def.owning_role, gate_to_rerun: def.gate_to_rerun };
}

/**
 * The re-authoring brief handed to a story's owning author when a SPEC-level
 * smell is auto-revised (revise-route). The brief is SMELL-AWARE because the two
 * kinds of spec defect demand opposite instructions:
 *
 *   - a reflection COVERAGE defect (reflect-testlist-defect / reflect-spec-defect)
 *     means something REQUIRED is missing (an NFR/AC with no covering test, a
 *     contradiction to resolve). The author MUST add the named coverage; giving
 *     them the redundancy "raise an open question rather than fabricate one"
 *     escape hatch invites them to omit it AGAIN, which is exactly how a coverage
 *     revise "heals nothing" and burns the one-revise budget straight to HIL.
 *   - a redundancy/overlap revise (the PO's generic case) means something is
 *     DUPLICATED; the author must NOT re-emit the overlap and SHOULD raise an open
 *     question rather than fabricate not-already-delivered behavior.
 *
 * Keyed on the smell so the deterministic revise (and any real-human decision
 * path) share ONE brief, instead of the string living in the smoke-only Human
 * Proxy.
 */
export function composeReviseBrief(input: { smell: string; gate: string; reason: string }): string {
  const artifact =
    input.gate === "spec"
      ? "acceptance criteria"
      : input.gate === "architecture"
        ? "architectural annotations + architecture.json"
        : "ordered test list";
  const isCoverageDefect =
    input.smell === "reflect-testlist-defect" || input.smell === "reflect-spec-defect";
  if (isCoverageDefect) {
    return (
      `REVISE (reflection gate): ${input.reason}\n\n` +
      `PRESERVE every ${artifact} item this story ALREADY has – they passed prior gates and MUST remain. ` +
      `This is an ADDITIVE revise: keep all existing files/entries intact (do not delete, rename, ` +
      `renumber, merge, or overwrite them) and ADD the specific coverage named above alongside them. ` +
      `The named coverage is REQUIRED: add the missing test(s)/criterion that assert the exact behavior ` +
      `described – do NOT omit it, weaken it, or defer it to an open question. If the stated behavior ` +
      `genuinely cannot be tested as written, name the concrete blocker; do not punt. After writing, the ` +
      `story's ${artifact} set = every prior item PLUS the added one(s).`
    );
  }
  return (
    `REVISE (Product Owner): ${input.reason}\n\n` +
    `Re-author this story's ${artifact} to address the above. Do NOT re-emit the same overlap/redundancy; ` +
    `if no honest, not-already-delivered behavior remains, say so as an open question rather than fabricating one.`
  );
}

/**
 * Build-quality smells whose remediation is the ordinary REVIEW -> refactor ->
 * Driver loop: the Navigator's REVIEW verdict names the concrete, behavior-
 * preserving refactor (extract a service, move a module into its declared
 * package, guard an import-time coupling), and the Driver's refactor turn applies
 * it. Unlike a `spec`-level smell (routed back to a design author + re-gate) or a
 * genuinely terminal build smell (cycle-stall, scaffold-defect, test-list-drift),
 * these SELF-HEAL in-loop and must not hard-halt to the HIL while a refactor for
 * the owning AC is already pending – the driver could have taken care of it.
 * The post-refactor verify preserves behavior, refactorAc resolves the smell, and
 * the deploy/promote layering/adherence gate is the final deterministic backstop.
 */
const BUILD_REFACTOR_ROUTABLE = new Set<string>([
  "layering-violation",
  "ux-adherence",
  "import-time-build-coupling",
  // A new AC supersedes behavior encoded in PRIOR tests the Navigator flagged
  // (superseded-tests allowlist). The Driver's refactor turn permissively
  // refactors ONLY those flagged tests + the code, then the honest-GREEN verify
  // re-runs. Bounded to one attempt by supersession.refactored; an unflagged
  // regression never reaches here (it escalates), so the backstop stays intact.
  "superseded-tests",
]);

export function isBuildRefactorRoutableSmell(name: string): boolean {
  return BUILD_REFACTOR_ROUTABLE.has(name);
}

/**
 * True iff an OPEN (unresolved) build-refactor-routable smell is recorded for
 * this story (or feature-wide, for a legacy story-less entry). The deterministic
 * gate that raised it (layering-clean, ux-adherence, import-time-build-coupling)
 * IS the refactor signal, so a reviewed AC should be routed to the Driver's
 * REFACTOR even when the Navigator's verdict said refactor:false. The refactor
 * then resolves the smell (refactorAc) and the post-refactor verify preserves
 * behavior; if a residual violation remains it re-surfaces with no refactor
 * pending and escalates (the backstop stays intact).
 */
export function hasOpenBuildRefactorRoutableSmell(consortDir: string, story_id?: string): boolean {
  return readSmellsLog(consortDir).detected.some(
    (d) =>
      !d.resolution &&
      isBuildRefactorRoutableSmell(d.smell) &&
      (story_id === undefined || d.story_id === undefined || d.story_id === story_id),
  );
}

const CYCLE_STALL_THRESHOLD = 3;
const FRAGILITY_RATIO_FAILED_TESTS = 3;
const TEST_COST_SPIRAL_FACTOR = 2;
const DEAD_REQUIREMENT_SIBLING_THRESHOLD = 3;
const E2E_PERMA_RED_THRESHOLD = 3;

export function detectAll(input: DetectorInput): SmellHit[] {
  const hits: SmellHit[] = [];
  hits.push(...detectCycleStall(input));
  hits.push(...detectFragilityRatio(input));
  hits.push(...detectTestCostSpiral(input));
  hits.push(...detectTestDeletionAttempt(input));
  hits.push(...detectBoundaryViolation(input));
  hits.push(...detectTestListDrift(input));
  hits.push(...detectApiCoherenceDrift(input));
  hits.push(...detectCrossExperimentDivergence(input));
  hits.push(...detectDeadRequirementSignal(input));
  hits.push(...detectE2eRowPermaRed(input));
  return hits;
}

export function detectCycleStall(input: DetectorInput): SmellHit[] {
  const { cycles } = input;
  if (cycles.length < CYCLE_STALL_THRESHOLD) return [];
  const recent = cycles.slice(-CYCLE_STALL_THRESHOLD);
  if (recent.every((c) => !c.green_at)) {
    return [
      {
        smell: "cycle-stall",
        cycle_ids: recent.map((c) => c.cycle_id),
        detail: `${CYCLE_STALL_THRESHOLD} consecutive cycles without GREEN`,
      },
    ];
  }
  return [];
}

export function detectFragilityRatio(input: DetectorInput): SmellHit[] {
  // Flag any cycle whose Navigator already marked the fragility-ratio smell.
  return input.cycles
    .filter((c) => (c.smell_flags ?? []).includes("fragility-ratio"))
    .map((c) => ({
      smell: "fragility-ratio" as const,
      cycle_ids: [c.cycle_id],
      detail: `Navigator-flagged: one behavior change failed >${FRAGILITY_RATIO_FAILED_TESTS} tests`,
    }));
}

export function detectTestCostSpiral(input: DetectorInput): SmellHit[] {
  const sized = input.cycles.filter((c) => c.driver_changes);
  if (sized.length < 2) return [];
  const hits: SmellHit[] = [];
  for (let i = 1; i < sized.length; i++) {
    const prev = sized[i - 1].driver_changes!.length;
    const curr = sized[i].driver_changes!.length;
    if (prev > 0 && curr > prev * TEST_COST_SPIRAL_FACTOR) {
      hits.push({
        smell: "test-cost-spiral",
        cycle_ids: [sized[i - 1].cycle_id, sized[i].cycle_id],
        detail: `driver_changes grew from ${prev} → ${curr} chars (>${TEST_COST_SPIRAL_FACTOR}x)`,
      });
    }
  }
  return hits;
}

export function detectTestDeletionAttempt(input: DetectorInput): SmellHit[] {
  return input.cycles
    .filter((c) => (c.smell_flags ?? []).includes("test-deletion-attempt"))
    .map((c) => ({
      smell: "test-deletion-attempt" as const,
      cycle_ids: [c.cycle_id],
      detail: "Navigator-flagged: Driver or human attempted to remove or weaken a test",
    }));
}

export function detectBoundaryViolation(input: DetectorInput): SmellHit[] {
  return input.cycles
    .filter((c) => (c.smell_flags ?? []).includes("boundary-violation"))
    .map((c) => ({
      smell: "boundary-violation" as const,
      cycle_ids: [c.cycle_id],
      detail: "Navigator-flagged: test references a private method or internal helper",
    }));
}

export function detectTestListDrift(input: DetectorInput): SmellHit[] {
  const { test_list_size_at_start, test_list_size_now, scope } = input;
  if (test_list_size_at_start === undefined || test_list_size_now === undefined) return [];
  if (test_list_size_at_start === 0) return [];
  const growth = (test_list_size_now - test_list_size_at_start) / test_list_size_at_start;
  if (growth > 0.25) {
    return [
      {
        smell: "test-list-drift",
        cycle_ids: [],
        detail: `Test list grew ${Math.round(growth * 100)}% since cycle start (>25%) in ${scope.feature_id}/${scope.story_id}/${scope.ac_id}`,
      },
    ];
  }
  return [];
}

/**
 * api-coherence-drift: pass-through Navigator flag. The signal is "same
 * concept named differently across two consecutive PASS reviews," which
 * requires NLP-y judgment of identifier intent. Navigator flags it on
 * the relevant cycle via smell_flags; detector surfaces.
 */
export function detectApiCoherenceDrift(input: DetectorInput): SmellHit[] {
  return input.cycles
    .filter((c) => (c.smell_flags ?? []).includes("api-coherence-drift"))
    .map((c) => ({
      smell: "api-coherence-drift" as const,
      cycle_ids: [c.cycle_id],
      detail: "Navigator-flagged: same concept named differently across consecutive PASS reviews",
    }));
}

/**
 * cross-experiment-divergence: pass-through Navigator/orchestrator flag.
 * The signal is "two parallel experiments are solving different
 * problems," which requires the synthesis-view that the orchestrator holds
 * across /experiments/N/. Detection lives there; this surfaces.
 */
export function detectCrossExperimentDivergence(input: DetectorInput): SmellHit[] {
  return input.cycles
    .filter((c) => (c.smell_flags ?? []).includes("cross-experiment-divergence"))
    .map((c) => ({
      smell: "cross-experiment-divergence" as const,
      cycle_ids: [c.cycle_id],
      detail: "Navigator-flagged: parallel experiments diverging on what they're testing",
    }));
}

/**
 * dead-requirement-signal: AC has 0 cycles while siblings in the same
 * story have matured past the threshold (default 3 cycles each). The
 * caller passes `sibling_ac_cycle_counts: { 'AC2': N, 'AC3': M, ... }`
 * (excluding the scope's own AC); detector compares the scope's
 * `cycles.length` against that map.
 *
 * Returns [] when sibling_ac_cycle_counts is missing or when this AC
 * isn't actually dead.
 */
export function detectDeadRequirementSignal(input: DetectorInput): SmellHit[] {
  const { scope, cycles, sibling_ac_cycle_counts } = input;
  if (!sibling_ac_cycle_counts) return [];
  if (cycles.length > 0) return [];
  const matureSiblings = Object.entries(sibling_ac_cycle_counts).filter(
    ([, n]) => n >= DEAD_REQUIREMENT_SIBLING_THRESHOLD
  );
  if (matureSiblings.length === 0) return [];
  return [
    {
      smell: "dead-requirement-signal",
      cycle_ids: [],
      detail: `${scope.feature_id}/${scope.story_id}/${scope.ac_id} has 0 cycles while ${matureSiblings.length} sibling AC(s) have matured past ${DEAD_REQUIREMENT_SIBLING_THRESHOLD}: ${matureSiblings.map(([k, v]) => `${k}=${v}`).join(", ")}`,
    },
  ];
}

/**
 * Fire when an E2E-tagged AC has accumulated `E2E_PERMA_RED_THRESHOLD`
 * or more consecutive cycles whose `green_at` is undefined. Since
 * markGreen refuses to advance a layer-tagged cycle without a recorded
 * runner outcome, "no green" captures both real failures and the
 * "runner didn't fire" case. One smell hit per offending ac_id; the
 * cycle_ids array carries the offending tail.
 *
 * Detector is scope-local (groups by ac_id within the input cycles),
 * so it operates on a single AC per scope. The orchestrator iterates
 * scopes to cover the whole feature.
 */
export function detectE2eRowPermaRed(input: DetectorInput): SmellHit[] {
  const e2eCycles = input.cycles.filter((c) => c.layer === "E2E");
  if (e2eCycles.length < E2E_PERMA_RED_THRESHOLD) return [];
  const byAc = new Map<string, CycleArtifact[]>();
  for (const c of e2eCycles) {
    const arr = byAc.get(c.ac_id) ?? [];
    arr.push(c);
    byAc.set(c.ac_id, arr);
  }
  const hits: SmellHit[] = [];
  for (const [acId, group] of byAc) {
    if (group.length < E2E_PERMA_RED_THRESHOLD) continue;
    const tail = group.slice(-E2E_PERMA_RED_THRESHOLD);
    if (tail.every((c) => !c.green_at)) {
      hits.push({
        smell: "e2e-row-perma-red",
        cycle_ids: tail.map((c) => c.cycle_id),
        detail:
          `${input.scope.feature_id}/${input.scope.story_id}/${acId}: ` +
          `${E2E_PERMA_RED_THRESHOLD} consecutive E2E cycles ended without GREEN. ` +
          "Check runner wiring (BASE_URL, paired-branch endpoint, playwright.config) " +
          "before tightening the scenario.",
      });
    }
  }
  return hits;
}

export interface SmellsLog {
  detected: Array<
    SmellHit & {
      detected_at: string;
      resolution?: string;
      /** How a resolved smell was resolved: `revised` = the PO sent
       *  it back to the owning author and the loop resumed; `accepted` = the PO
       *  accepted it as-is; `cleared` = the underlying condition is gone (e.g. a
       *  re-run reflect gate now PASSES), an automatic self-resolve that is NOT a
       *  human decision. Only `revised` drives the one-revise-per-(smell,story) bound. */
      resolution_kind?: "revised" | "accepted" | "cleared";
      /** For a reflect `revised` entry: a fingerprint of the story's test-list at
       *  the moment of the revise, so the PROGRESS-BASED budget can tell whether a
       *  later re-design actually changed the list (progress -> keep going) or
       *  produced no change (stuck -> hard halt). Set only on reflect revises. */
      revised_artifact_sha?: string;
    }
  >;
}

export function writeSmellsLog(consortDir: string, hits: SmellHit[]): SmellsLog {
  const file = join(consortDir, "smells.json");
  const existing: SmellsLog = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { detected: [] };
  const ts = new Date().toISOString();
  const newEntries = hits.map((h) => ({ ...h, detected_at: ts }));
  const merged: SmellsLog = { detected: [...existing.detected, ...newEntries] };
  writeFileSync(file, JSON.stringify(merged, null, 2) + "\n");
  return merged;
}

export function readSmellsLog(consortDir: string): SmellsLog {
  const file = join(consortDir, "smells.json");
  if (!existsSync(file)) return { detected: [] };
  return JSON.parse(readFileSync(file, "utf8"));
}

/** Does an entry concern this (smell, story)? story_id matches when both name it,
 *  or when the caller passes no story (feature-wide match). */
function smellMatches(
  entry: SmellHit & { detected_at: string },
  smell: string,
  story_id?: string,
): boolean {
  if (entry.smell !== smell) return false;
  if (story_id === undefined) return true;
  // A scoped lookup matches an entry with the same story, or a legacy entry that
  // carried no story (so a pre-scope smell still resolves).
  return entry.story_id === undefined || entry.story_id === story_id;
}

/** True iff an OPEN (unresolved) entry for this (smell, story) is already
 *  recorded. The idempotency guard shared by every smell writer, so a condition
 *  re-detected across iterations does not pile up duplicate open entries (a
 *  reflect gate that keeps failing, a re-flagged blocking smell). A legacy entry
 *  with no story matches any story (a pre-scope flag is not re-raised). */
export function hasOpenSmell(consortDir: string, smell: string, story_id?: string): boolean {
  return readSmellsLog(consortDir).detected.some((d) => !d.resolution && smellMatches(d, smell, story_id));
}

/**
 * Mark the first OPEN matching smell resolved. `kind` records how:
 * `revised` (sent back to the owning author + resumed) or `accepted` (as-is).
 * Returns true iff an open entry was found + resolved.
 */
export function markSmellResolved(
  consortDir: string,
  smell: string,
  opts: { story_id?: string; kind: "revised" | "accepted" | "cleared"; note?: string },
): boolean {
  const file = join(consortDir, "smells.json");
  if (!existsSync(file)) return false;
  const log: SmellsLog = JSON.parse(readFileSync(file, "utf8"));
  const entry = log.detected.find((d) => !d.resolution && smellMatches(d, smell, opts.story_id));
  if (!entry) return false;
  entry.resolution = opts.note ?? `${opts.kind} by PO`;
  entry.resolution_kind = opts.kind;
  writeFileSync(file, JSON.stringify(log, null, 2) + "\n");
  return true;
}

/**
 * Resolve ALL open entries for a (smell, story) in a single pass, returning how
 * many were cleared. Unlike markSmellResolved (first-match, for the one-revise
 * budget), this drains every duplicate, so a self-resolving condition (e.g. a
 * re-run reflect gate that now PASSES) clears the accumulated entries at once
 * instead of leaving stale open smells that block the gate. `cleared` does not
 * count toward the revise budget (priorReviseCount only counts `revised`).
 */
export function resolveOpenSmells(
  consortDir: string,
  smell: string,
  opts: { story_id?: string; kind: "revised" | "accepted" | "cleared"; note?: string },
): number {
  const file = join(consortDir, "smells.json");
  if (!existsSync(file)) return 0;
  const log: SmellsLog = JSON.parse(readFileSync(file, "utf8"));
  let n = 0;
  for (const d of log.detected) {
    if (!d.resolution && smellMatches(d, smell, opts.story_id)) {
      d.resolution = opts.note ?? opts.kind;
      d.resolution_kind = opts.kind;
      n++;
    }
  }
  if (n) writeFileSync(file, JSON.stringify(log, null, 2) + "\n");
  return n;
}

/**
 * Resolve EVERY open smell scoped strictly to a story (regardless of name), for a
 * clean rebuild of that story (Finding 27). A `rebuild-story` supersedes all prior
 * observations about the story it is re-driving, so any blocking smell (spec OR
 * build level) against it must be cleared or the drive re-blocks at raise-to-hil
 * on a smell for code that no longer exists. Strictly story-scoped: a feature-wide
 * (story_id undefined) smell is left untouched (it is not this story's to clear).
 * Marked `cleared` (never `revised`), so it does not spend the one-revise budget.
 * Returns the resolved smell names.
 */
export function resolveAllOpenSmellsForStory(
  consortDir: string,
  story: string,
  note?: string,
): string[] {
  const file = join(consortDir, "smells.json");
  if (!existsSync(file)) return [];
  const log: SmellsLog = JSON.parse(readFileSync(file, "utf8"));
  const cleared: string[] = [];
  for (const d of log.detected) {
    if (d.resolution || d.story_id !== story) continue;
    d.resolution = note ?? "cleared for rebuild-story";
    d.resolution_kind = "cleared";
    cleared.push(d.smell);
  }
  if (cleared.length) writeFileSync(file, JSON.stringify(log, null, 2) + "\n");
  return cleared;
}

/** How many times this (smell, story) has already been revised: the
 *  count of resolved-as-`revised` entries. The one-revise-per-(smell,story) bound
 *  compares against this so a re-fired-then-revised smell can't loop forever. */
export function priorReviseCount(consortDir: string, smell: string, story_id?: string): number {
  return readSmellsLog(consortDir).detected.filter(
    (d) => d.resolution_kind === "revised" && smellMatches(d, smell, story_id),
  ).length;
}

/** The reflect-gate smell names (the pre-build reflection critic's spec + test-list
 *  defects). Budgeted per-STORY, not per-smell: one full design re-run heals all of
 *  a reflection's coupled findings together. */
const REFLECT_SMELL_NAMES: ReadonlySet<string> = new Set([
  "reflect-spec-defect",
  "reflect-testlist-defect",
]);
export function isReflectSmell(name: string): boolean {
  return REFLECT_SMELL_NAMES.has(name);
}

/** How many times THIS story's reflection has already been auto-revised. Counts
 *  resolved-as-`revised` reflect smells. The reflection critic surfaces defects
 *  one at a time, so a story with several latent findings needs several
 *  re-designs; the budget is PROGRESS-BASED (see the probe): each re-design is
 *  allowed as long as the prior one actually changed the test-list, up to
 *  REFLECT_REVISE_CAP. A revise that produces no change (a genuinely stuck
 *  strategist) and the cap are the two hard halts, so the loop still converges. */
export const REFLECT_REVISE_CAP = 4;
export function priorReflectReviseCount(consortDir: string, story_id: string): number {
  return readSmellsLog(consortDir).detected.filter(
    (d) => d.resolution_kind === "revised" && isReflectSmell(d.smell) && d.story_id === story_id,
  ).length;
}

/** A stable fingerprint of a story's per-story test-list (the artifact a reflect
 *  revise sends the design lane to re-author), or "" when absent. Used by the
 *  progress-based reflect budget to detect whether a re-design actually changed
 *  the list. */
export function storyTestListFingerprint(consortDir: string, featureId: string, story_id: string): string {
  const f = storyTestListJson(consortDir, featureId, story_id);
  if (!existsSync(f)) return "";
  try {
    return createHash("sha1").update(readFileSync(f)).digest("hex");
  } catch {
    return "";
  }
}

/** The test-list fingerprint recorded on the MOST RECENT reflect `revised` entry
 *  for the story, or null if none. The probe compares the CURRENT fingerprint
 *  against this: if a prior revise ran and the list is unchanged since, the
 *  re-design made no progress (a stuck strategist) and must hard-halt rather
 *  than loop. */
export function lastReflectReviseFingerprint(consortDir: string, story_id: string): string | null {
  const reflects = readSmellsLog(consortDir).detected.filter(
    (d) => d.resolution_kind === "revised" && isReflectSmell(d.smell) && d.story_id === story_id,
  );
  if (reflects.length === 0) return null;
  const last = reflects[reflects.length - 1];
  return typeof last.revised_artifact_sha === "string" ? last.revised_artifact_sha : null;
}

/** Co-heal: resolve EVERY open reflect smell for a story as `revised` in one pass,
 *  so a single revise addresses the whole reflection and no sibling reflect smell
 *  immediately re-routes or halts. Returns how many were resolved. */
export function resolveOpenReflectSmellsForStory(
  consortDir: string,
  story_id: string,
  note: string,
  /** The story's test-list fingerprint at revise time, stamped on each resolved
   *  entry so the progress-based budget can later detect a no-change (stuck)
   *  re-design. Omitted only by callers that cannot compute it. */
  artifactSha?: string,
): number {
  const file = join(consortDir, "smells.json");
  if (!existsSync(file)) return 0;
  const log: SmellsLog = JSON.parse(readFileSync(file, "utf8"));
  let n = 0;
  for (const d of log.detected) {
    if (!d.resolution && isReflectSmell(d.smell) && d.story_id === story_id) {
      d.resolution = note;
      d.resolution_kind = "revised";
      if (artifactSha !== undefined) d.revised_artifact_sha = artifactSha;
      n++;
    }
  }
  if (n) writeFileSync(file, JSON.stringify(log, null, 2) + "\n");
  return n;
}

export function runDetectorsForScope(
  consortDir: string,
  scope: CycleScope,
  testListSizeAtStart?: number,
  testListSizeNow?: number
): SmellHit[] {
  const cycles = listCycles(scope);
  return detectAll({
    scope,
    cycles,
    test_list_size_at_start: testListSizeAtStart,
    test_list_size_now: testListSizeNow,
  });
}
