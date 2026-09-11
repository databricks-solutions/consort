// response-formatter: the AGENT-SIDE deterministic precheck.
//
// A role runs this on its OWN output BEFORE it returns, so it catches its own
// nonconformance locally (it "knows where it got it wrong from its side")
// instead of handing back null/garbage and forcing an orchestrator retry. It is
// the type-checker for a role's artifact: given the role + scope, it validates
// the artifact the role just wrote against that role's contract and reports the
// SPECIFIC violations. The CLI (response-formatter.cli) THROWS (non-zero) on any
// violation, so a role that runs it cannot silently return a malformed result.
//
// This is the upstream complement to the orchestrator-side expectation queue
// (orchestrator-expect.ts): the queue is the SAFETY NET that hands back + retries
// + aborts when a bad result still escapes; response-formatter is the PRIMARY
// defense that stops most bad results at the source. The two share the same
// contracts, e.g. the test-strategist owes a non-empty per-story test list whose
// every item maps to one of the story's ACs (the S2 live-stall bug).

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname } from "node:path";
import { storyAcIds, readAcLayer, readAcArchitecturalNotes, storyTestListJson, acsDir, designGuideJson, designAssetsDir, architectureJson, dbDesignJson, featureSpecJson, storiesDir } from "../../consort/config/consort-paths.js";
import { checkArtifactConformance, canonicalArtifactName, checkDbDesign, checkStoryIndependence } from "../../consort/orchestrator/validators/conformance/artifact-conformance.js";
import { checkE2eRouteCollision } from "../../consort/architecture/e2e-route-adherence.js";

export interface FormatViolation {
  /** The artifact (relative-ish path / name) that failed. */
  artifact: string;
  /** What is wrong, specifically + actionably. */
  problem: string;
}

export interface FormatResult {
  role: string;
  story?: string;
  ok: boolean;
  violations: FormatViolation[];
}

export interface FormatArgs {
  role: string;
  consortDir: string;
  featureId: string;
  /** Required for the per-story roles (spec-author / architect-reviewer / test-strategist). */
  story?: string;
}

/** Roles whose output this precheck knows how to type-check. Others are a no-op
 *  PASS (nothing to deterministically validate yet), extend as contracts grow. */
export const FORMATTED_ROLES = new Set([
  "spec-author",
  "architect-reviewer",
  "dba",
  "test-strategist",
  "ux-designer",
  "navigator",
]);

function needStory(role: string, story: string | undefined, violations: FormatViolation[]): story is string {
  if (!story) {
    violations.push({ artifact: role, problem: `--story is required to validate ${role} output` });
    return false;
  }
  return true;
}

/** spec-author (per story): >=1 AC, and every acs/<AC>.json conforms to ac.schema
 *  (AC<n> id pattern, required fields). The malformed-AC / slug-id source. */
/** Breakdown-mode self-check: feature-spec.json present + non-empty stories[],
 *  and every story stub after the first records its independence determination
 *  (checkStoryIndependence). Run when the spec-author formatter is invoked with
 *  no --story (the feature-level breakdown turn). */
function checkSpecAuthorBreakdown(consortDir: string, featureId: string, v: FormatViolation[]): void {
  const specPath = featureSpecJson(consortDir, featureId);
  if (!existsSync(specPath)) {
    v.push({ artifact: "feature-spec.json", problem: "breakdown deliverable missing (write feature-spec.json with a non-empty stories[] array of the story ids)" });
    return;
  }
  try {
    const spec = JSON.parse(readFileSync(specPath, "utf8")) as { stories?: unknown };
    if (!Array.isArray(spec.stories) || spec.stories.length === 0) {
      v.push({ artifact: "feature-spec.json", problem: "stories[] is missing or empty (the breakdown must enumerate >=1 story id)" });
    }
  } catch (err) {
    v.push({ artifact: "feature-spec.json", problem: `not valid JSON: ${err instanceof Error ? err.message : String(err)}` });
    return;
  }
  // Story independence across the breakdown's stubs: a later story missing its
  // determination fails HERE (self-correct at breakdown) rather than at the gate.
  const sdir = storiesDir(consortDir, featureId);
  if (!existsSync(sdir)) return;
  const storyJsons: Array<{ name: string; content: string }> = [];
  for (const s of readdirSync(sdir)) {
    const p = `${sdir}/${s}/story.json`;
    if (!existsSync(p)) continue;
    try {
      storyJsons.push({ name: s, content: readFileSync(p, "utf8") });
    } catch {
      continue;
    }
  }
  const indep = checkStoryIndependence(storyJsons);
  if (!indep.ok) {
    for (const problem of indep.violations) v.push({ artifact: "stories/*/story.json", problem });
  }
}

function checkSpecAuthor(args: FormatArgs, v: FormatViolation[]): void {
  const { consortDir, featureId, story } = args;
  // Breakdown mode (no story): the spec-author's feature-level self-check. The
  // breakdown deliverable is feature-spec.json with a non-empty stories[], and
  // every story after the first must record its independence determination.
  // Enforcing it HERE (the check the spec-author runs before returning) makes a
  // missing independence self-correct at breakdown, not slip to the ship gate.
  if (story === undefined) {
    checkSpecAuthorBreakdown(consortDir, featureId, v);
    return;
  }
  const dir = acsDir(consortDir, featureId, story);
  const ids = storyAcIds(consortDir, featureId, story);
  if (ids.length === 0) {
    v.push({ artifact: `stories/${story}/acs`, problem: "no acceptance criteria written (expected >=1 AC<n>.json)" });
    return;
  }
  if (!existsSync(dir)) return;
  // Collect normalized `then` clauses to backstop the AC-independence contract:
  // two ACs in a story with an identical `then` are a literal overlap (the
  // semantic case, one AC's `then` implied by another's, is the test-strategist's
  // ac-overlap judgment, this only catches the exact-duplicate defect).
  const thenById = new Map<string, string>();
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    let content: string;
    try {
      content = readFileSync(`${dir}/${f}`, "utf8");
    } catch {
      continue;
    }
    const r = checkArtifactConformance(canonicalArtifactName(`${dir}/${f}`), content);
    if (!r.ok) v.push({ artifact: `stories/${story}/acs/${f}`, problem: r.violations.join("; ") });
    try {
      const ac = JSON.parse(content) as { id?: string; then?: string };
      if (typeof ac.id === "string" && typeof ac.then === "string") {
        const norm = ac.then.trim().replace(/\s+/g, " ").toLowerCase();
        if (norm) thenById.set(ac.id, norm);
      }
    } catch {
      /* conformance above already flags unparseable JSON */
    }
  }
  // Flag exact-duplicate `then` clauses: each pair is a non-independent AC.
  const byThen = new Map<string, string[]>();
  for (const [id, norm] of thenById) (byThen.get(norm) ?? byThen.set(norm, []).get(norm)!).push(id);
  for (const ids of byThen.values()) {
    if (ids.length > 1) {
      v.push({
        artifact: `stories/${story}/acs`,
        problem: `ACs ${ids.sort().join(", ")} share an identical \`then\`, each AC must be an independent observable behavior. Merge them or differentiate (ac-overlap).`,
      });
    }
  }
}

/** architect-reviewer (per story): every AC has a valid layer annotation. */
function checkArchitect(args: FormatArgs, v: FormatViolation[]): void {
  const { consortDir, featureId, story } = args;
  if (!needStory("architect-reviewer", story, v)) return;
  const ids = storyAcIds(consortDir, featureId, story);
  if (ids.length === 0) {
    v.push({ artifact: `stories/${story}/acs`, problem: "no ACs to annotate (spec-author output missing)" });
    return;
  }
  for (const ac of ids) {
    if (readAcLayer(consortDir, featureId, ac) === undefined) {
      v.push({ artifact: `stories/${story}/acs/${ac}.json`, problem: "missing/invalid `layer` (expected API | E2E | Infra)" });
    }
    // The GATE requires a non-empty `architectural_notes` on EVERY AC (the
    // architect's distinctive per-AC product; the spec-author's bare `layer`
    // does not count). The self-check must enforce the same, or the architect
    // sees green here, returns, and the design gate then rejects the story for
    // an AC without notes (a PROTOCOL VIOLATION halt after the fact).
    if (readAcArchitecturalNotes(consortDir, featureId, ac) === undefined) {
      v.push({
        artifact: `stories/${story}/acs/${ac}.json`,
        problem: "missing non-empty `architectural_notes` (annotate EVERY AC with its layer rationale + how it realizes the design; the spec-author's `layer` field does NOT satisfy this)",
      });
    }
  }
  // Every DECLARED NFR must NAME the fitness function that defends it
  // (architect-reviewer.md: "every architectural constraint names the fitness
  // function that defends it, recorded so the Test Strategist authors them as RED
  // tests"). The schema DEFINES fitness_function but cannot make it conditionally
  // required per NFR, so enforce it HERE, or a cheap model silently drops it +
  // still passes every gate (the regression the architect optimize-sweep surfaced:
  // a semantic-gate-passing architecture.json with 0 fitness_functions).
  checkNfrFitnessFunctions(consortDir, featureId, v);
}

/** Every NFR in the feature's architecture.json must carry a non-empty
 *  `fitness_function`. No architecture.json yet (per-story ordering) or no NFRs =
 *  no-op. Feature-scoped, run from the per-story architect self-check. */
function checkNfrFitnessFunctions(consortDir: string, featureId: string, v: FormatViolation[]): void {
  const archFile = architectureJson(consortDir, featureId);
  if (!existsSync(archFile)) return;
  let nfrs: Array<{ id?: string; fitness_function?: string }>;
  try {
    nfrs = (JSON.parse(readFileSync(archFile, "utf8")) as { nfrs?: Array<{ id?: string; fitness_function?: string }> }).nfrs ?? [];
  } catch {
    return; // architecture.json schema conformance is checked elsewhere
  }
  for (const [i, n] of nfrs.entries()) {
    if (typeof n.fitness_function !== "string" || n.fitness_function.trim() === "") {
      v.push({
        artifact: "architecture.json",
        problem: `NFR ${n.id ?? `#${i}`} is missing a non-empty \`fitness_function\` (name the concrete real-branch test that defends this NFR, so the Test Strategist authors it as a RED test). "N/A – reason" is allowed only when the NFR genuinely has no machine-checkable defense.`,
      });
    }
  }
}

/** dba (per feature): db-design.json conforms + realizes every architecture.json
 *  persistence_invariant. Uses the same checkDbDesign the spec gate does. */
function checkDba(args: FormatArgs, v: FormatViolation[]): void {
  const { consortDir, featureId } = args;
  const archFile = architectureJson(consortDir, featureId);
  if (!existsSync(archFile)) {
    v.push({ artifact: "architecture.json", problem: "architecture.json missing (the architect owns the contract the DBA realizes)" });
    return;
  }
  const archContent = readFileSync(archFile, "utf8");
  const dbFile = dbDesignJson(consortDir, featureId);
  const dbContent = existsSync(dbFile) ? readFileSync(dbFile, "utf8") : undefined;
  // Schema conformance first (a malformed db-design.json), then invariant realization.
  if (dbContent !== undefined) {
    const conf = checkArtifactConformance("db-design.json", dbContent);
    if (!conf.ok) v.push({ artifact: "db-design.json", problem: conf.violations.join("; ") });
  }
  const r = checkDbDesign(dbContent, archContent);
  if (!r.ok) v.push({ artifact: "db-design.json", problem: r.violations.join("; ") });
}

/** test-strategist (per story): the per-story test list exists, parses, has >=1
 *  item, and EVERY item's ac_id maps to one of the story's ACs. The S2 live
 *  stall was exactly this: items with ac_id:null / unmapped -> empty scope. */
function checkTestStrategist(args: FormatArgs, v: FormatViolation[]): void {
  const { consortDir, featureId, story } = args;
  if (!needStory("test-strategist", story, v)) return;
  const file = storyTestListJson(consortDir, featureId, story);
  if (!existsSync(file)) {
    v.push({ artifact: `stories/${story}/test-list-per-story.json`, problem: "per-story test list not written" });
    return;
  }
  let parsed: { items?: unknown };
  try {
    parsed = JSON.parse(readFileSync(file, "utf8")) as { items?: unknown };
  } catch (e) {
    v.push({ artifact: `stories/${story}/test-list-per-story.json`, problem: `invalid JSON: ${e instanceof Error ? e.message : String(e)}` });
    return;
  }
  const items = Array.isArray(parsed.items)
    ? (parsed.items as Array<{ id?: unknown; ac_id?: unknown; kind?: unknown; scenario_file?: unknown }>)
    : [];
  if (items.length === 0) {
    v.push({ artifact: `stories/${story}/test-list-per-story.json`, problem: "empty `items` (expected >=1 test mapped to the story's ACs)" });
    return;
  }
  const acIds = new Set(storyAcIds(consortDir, featureId, story));
  const covered = new Set<string>();
  items.forEach((item, i) => {
    // A `kind:"fitness"` item is a plain architectural/DB test, NOT a Gherkin
    // scenario, so it must not carry a .feature scenario_file (the two are
    // mutually exclusive per canon; a fitness item pointing at a pytest-bdd
    // .feature gives the Navigator contradictory instructions). The reflection
    // gate raises this as a reflect-testlist-defect; enforce it in-turn.
    if (item.kind === "fitness" && typeof item.scenario_file === "string" && /\.feature$/.test(item.scenario_file)) {
      v.push({
        artifact: `stories/${story}/test-list-per-story.json`,
        problem: `items[${i}] (${String(item.id)}) is kind:"fitness" but its scenario_file "${item.scenario_file}" is a Gherkin .feature (mutually exclusive). A fitness item is a plain test (drop scenario_file), or make it kind:"behavior".`,
      });
    }
    const acId = item.ac_id;
    if (typeof acId !== "string" || acId.length === 0) {
      v.push({ artifact: `stories/${story}/test-list-per-story.json`, problem: `items[${i}] (${String(item.id)}) has null/empty ac_id` });
    } else if (acIds.size > 0 && !acIds.has(acId)) {
      v.push({
        artifact: `stories/${story}/test-list-per-story.json`,
        problem: `items[${i}] ac_id "${acId}" is not one of the story's ACs [${[...acIds].join(", ")}]`,
      });
    } else if (typeof acId === "string") {
      covered.add(acId);
    }
  });
  // REVERSE coverage: every AC of the story must carry >=1 test item. The
  // reflection gate enforces this downstream (an uncovered AC is a
  // `reflect-testlist-defect` that burns a revise budget and can hard-halt a
  // headless run); pulling it into the self-check makes the Test Strategist fix
  // the gap WITHIN its own turn, deterministically, instead of shipping a
  // half-covered list the critic rejects turns later. An AC whose
  // architectural_notes assign it to the client harness is covered only by a
  // client item; the self-check does not police WHICH kind, just that the AC is
  // not silently dropped.
  const uncovered = [...acIds].filter((id) => !covered.has(id));
  if (uncovered.length > 0) {
    v.push({
      artifact: `stories/${story}/test-list-per-story.json`,
      problem: `AC(s) with no covering test: [${uncovered.join(", ")}]. Every AC needs >=1 item (a client AC needs a kind:client item; see the reflect gate).`,
    });
  }
}

/** Whether the project's design-guide.json exists AND conforms to its schema.
 *  The one place that reads-and-conforms the guide, shared by the ux-designer
 *  self-check (below) and the design-lane gate (orchestrator-effects
 *  `designGuideReady`), so the agent's self-check and the deterministic gate can
 *  never disagree. `problem` is the specific violation string when not ok. */
export function designGuideConformance(consortDir: string): { ok: boolean; problem?: string } {
  const file = designGuideJson(consortDir);
  if (!existsSync(file)) {
    return { ok: false, problem: "design-guide.json not written (the machine-checkable token source of truth)" };
  }
  let content: string;
  try {
    content = readFileSync(file, "utf8");
  } catch (e) {
    return { ok: false, problem: `unreadable: ${e instanceof Error ? e.message : String(e)}` };
  }
  const r = checkArtifactConformance(canonicalArtifactName(file), content);
  return r.ok ? { ok: true } : { ok: false, problem: r.violations.join("; ") };
}

/** Whether the guide names a non-empty component-class vocabulary (`components`).
 *  Separate from designGuideConformance (which also gates replay's designGuideReady,
 *  so it must stay permissive for older recorded corpora): this stricter check is
 *  the LIVE ux-designer self-check only. A guide is authored only on a UI project,
 *  so it MUST name the classes feature pages apply, else the build hand-rolls bare
 *  markup (the "unstyled feature page" gap checkTokenConsumption then catches). */
export function designGuideHasComponents(consortDir: string): { ok: boolean; problem?: string } {
  const file = designGuideJson(consortDir);
  if (!existsSync(file)) return { ok: true }; // absence is designGuideConformance's job
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as { components?: Record<string, unknown> };
    const comps = parsed.components;
    if (!comps || typeof comps !== "object" || Object.keys(comps).length === 0) {
      return {
        ok: false,
        problem:
          "design-guide.json is missing a non-empty `components` object – name the standard components (page, card, button, form_input, table, status_badge, empty_state, toast) each with its CSS `class`, so feature pages apply the design vocabulary instead of bare HTML",
      };
    }
  } catch {
    return { ok: true }; // malformed JSON is designGuideConformance's job to report
  }
  return { ok: true };
}

/** Whether a brand asset was STAGED (an image under `.consort/design/assets/`) but the
 *  design-guide omits `app_icon`. The staged asset is the ONLY thing that wires the brand
 *  mark in: the kit copies its real bytes to `install_to` (installBrandAsset) and the
 *  ux-adherence gate enforces the app shell (favicon + navbar) references it – BOTH keyed
 *  on the guide's `app_icon`. Omitting the declaration means the icon SILENTLY never ships
 *  (it only lands if some AC happens to reference it, the "built app doesn't incorporate
 *  warehouse.png" gap). This catches it at the UX Designer's self-check – the source ,
 *  rather than shipping a placeholder. Ok when nothing is staged (no obligation). */
export function brandAssetDeclared(consortDir: string): { ok: boolean; problem?: string } {
  const assetsDir = designAssetsDir(consortDir);
  if (!existsSync(assetsDir)) return { ok: true };
  let staged: string[];
  try {
    staged = readdirSync(assetsDir).filter((f) => /\.(png|jpe?g|svg|webp|ico|gif|avif)$/i.test(f));
  } catch {
    return { ok: true };
  }
  if (staged.length === 0) return { ok: true }; // nothing staged – the guide need not declare an icon
  const file = designGuideJson(consortDir);
  if (existsSync(file)) {
    try {
      const guide = JSON.parse(readFileSync(file, "utf8")) as { app_icon?: { source?: string; install_to?: string } };
      if (guide.app_icon?.source && guide.app_icon?.install_to) return { ok: true };
    } catch {
      return { ok: true }; // malformed JSON is designGuideConformance's job to report
    }
  }
  const first = staged[0];
  return {
    ok: false,
    problem:
      `a brand asset is staged (.consort/design/assets/${first}) but design-guide.json omits \`app_icon\` – ` +
      `declare it so the brand mark actually ships: ` +
      `"app_icon": { "source": ".consort/design/assets/${first}", "install_to": "client/public/${first}" }. ` +
      `Without it the kit never installs the real bytes and the ux-adherence gate never enforces the favicon/navbar reference – the icon ships only by luck.`,
  };
}

/** ux-designer (project-level, UI track): the machine-checkable design-guide.json
 *  exists and conforms to design-guide.schema.json. The model is told NOT to read
 *  the schema, so it drifts on shape (camelCase keys, nested spacing, extra
 *  typography props) unless it self-checks; this catches that at the source
 *  instead of at the final feature drain. */
function checkUxDesigner(args: FormatArgs, v: FormatViolation[]): void {
  const r = designGuideConformance(args.consortDir);
  if (!r.ok) {
    v.push({ artifact: "design/design-guide.json", problem: r.problem ?? "design-guide.json is non-conformant" });
    return; // no point checking components on a guide that failed the schema
  }
  const c = designGuideHasComponents(args.consortDir);
  if (!c.ok) v.push({ artifact: "design/design-guide.json", problem: c.problem ?? "design-guide.json is missing components" });
  // A staged brand asset with no `app_icon` declaration is a design-guide defect: the
  // brand mark would silently never ship. Fail the self-check at the source.
  const b = brandAssetDeclared(args.consortDir);
  if (!b.ok) v.push({ artifact: "design/design-guide.json", problem: b.problem ?? "a staged brand asset is not declared as app_icon" });
}

/** navigator (build lane, UI track): the RED Playwright E2E specs the navigator just
 *  authored must not mock an API with a broad glob that also matches a `client/src` module's
 *  Vite dev URL. That collision fulfills the module request with JSON, breaks SPA boot, and
 *  dead-locks the cycle on a CORRECT app (stockflow-3-88 T20) — no product change makes it
 *  GREEN, so the navigator must fix the spec in-turn, not ship it to a stalled verify.
 *  Project-level scan; a backend-only project (no `client/`) is a clean no-op. */
function checkNavigator(args: FormatArgs, v: FormatViolation[]): void {
  const r = checkE2eRouteCollision(dirname(args.consortDir));
  for (const x of r.violations) v.push({ artifact: x.spec, problem: x.remediation });
}

const CHECKERS: Record<string, (a: FormatArgs, v: FormatViolation[]) => void> = {
  "spec-author": checkSpecAuthor,
  "architect-reviewer": checkArchitect,
  dba: checkDba,
  "test-strategist": checkTestStrategist,
  "ux-designer": checkUxDesigner,
  navigator: checkNavigator,
};

/**
 * Type-check a role's just-produced output against its contract. Returns the
 * specific violations (empty => conformant). A role NOT in CHECKERS passes (no
 * deterministic contract yet). The CLI turns a non-ok result into a throw.
 */
export function formatRoleResponse(args: FormatArgs): FormatResult {
  const violations: FormatViolation[] = [];
  const checker = CHECKERS[args.role];
  if (checker) checker(args, violations);
  return { role: args.role, ...(args.story ? { story: args.story } : {}), ok: violations.length === 0, violations };
}
