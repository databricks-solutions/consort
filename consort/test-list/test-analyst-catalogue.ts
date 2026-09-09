// The test-analyst catalogue: the CONFIGURABLE roster of per-kind test analysts the test-strategist
// SUPERVISOR fans out to (behavior / fitness / client), each with its own focus prompt. This is the
// SINGLE SOURCE OF TRUTH for the analyst kinds – adding a kind = adding an entry here (+ its prompt).
// Mirrors the kit's other catalogues (agent-catalogue, lifecycle-catalogue, validator-registry): a
// Record<kind, entry> + a fail-loud resolveTestAnalystKind that lists the known kinds.
//
// WHY it exists: the single-shot test-strategist systematically under-covers when it must reason about
// behavior + fitness + client all in one turn (the design-equivalence live runs showed it consistently
// drops the fitness-contract tests T6/T9/T15 and the client-render tests T16/T17). Splitting into
// single-concern analysts – each fed only its slice's inputs and its focus prompt – removes that
// contention. The supervisor Task-spawns one general-purpose subagent per ENABLED analyst (a
// preconditions preparer renders this catalogue's enabled roster + focus prompts into the turn), then
// reconciles + assembles + orders the master. Analysts are ephemeral subagents, NOT first-class roles,
// so a new kind never touches AgentRole / RECOMMENDED_MODELS / the laid-down .md set.
//
// Each analyst emits an UNORDERED slice with kind-local ids; the SUPERVISOR owns ordering
// (ordered_for) and assigns the final feature-flat T-ids on merge. Load-bearing invariant: the FITNESS
// analyst is the SOLE emitter of invariant_id (so checkInvariantCoverageDistinct can't be tripped by
// two owners) – that ownership is stated in every focus prompt.

/** The inputs an analyst consumes (the supervisor hands it exactly these slices). */
export type AnalystInput = "story-acs" | "architecture-invariants" | "db-design" | "design-guide";

/** The context the enablement predicate evaluates against – the resolved project config. */
export interface AnalystEnablementContext {
  projectDir: string;
  /** project.uiTrack (resolveProjectSettings). A no-frontend project is uiTrack:false. */
  uiTrack: boolean;
}

/** One catalogue entry: a test-analyst kind, its focus prompt (injected VERBATIM into the analyst's
 *  Task spawn – the source of truth for what it authors), the inputs it needs, its recommended model,
 *  and an OPTIONAL enablement predicate (absent = always enabled). */
export interface TestAnalystCatalogueEntry {
  /** The kind; matches the test-list item `kind` this analyst emits (behavior|fitness|client|...). */
  kind: string;
  /** One-line human summary (docs / diagnostics / the roster's human-readable header). */
  description: string;
  /** Short "what it produces" summary for the rendered roster. */
  configSummary: string;
  /** The focus prompt injected verbatim into the analyst subagent's Task spawn. Single-concern. */
  focusPrompt: string;
  /** Recommended model for this analyst's subagent turn (a roster hint). This one IS enforced:
   *  it is passed as the Task spawn's `model` parameter. */
  model: string;
  /** ADVISORY effort for this analyst's Task turn. The Task tool has no effort parameter, so the
   *  supervisor RESTATES this in the spawn prompt ("think at <effort> effort") and the subagent
   *  self-paces – it is guidance, not an enforced sandbox lever. A per-analyst optimize lever:
   *  the densest-reasoning analyst (fitness) can run high while cheaper slices run default/low. */
  effort?: "low" | "default" | "high";
  /** ADVISORY tool scope: the tools this analyst SHOULD confine itself to. Like effort, the Task
   *  tool has no allowedTools parameter, so the supervisor RESTATES this in the spawn prompt
   *  ("confine your work to: <tools>") and the subagent self-limits – guidance, not a hard sandbox
   *  (an enforced boundary needs analysts promoted to real manifest steps). A tuning lever. */
  toolScope?: string[];
  /** The input slices the supervisor hands this analyst. */
  inputs: AnalystInput[];
  /** OPTIONAL enablement predicate. Absent = always enabled. `client` gates on uiTrack. */
  enabledWhen?: (ctx: AnalystEnablementContext) => boolean;
}

/** Shared contract every analyst honors (folded into each focus prompt): emit an UNORDERED slice of
 *  test-list items, each `{ id, description, ac_id, status:"pending", kind }` where `id` is a
 *  KIND-LOCAL id (the supervisor assigns final feature-flat T-ids on merge); `ac_id` is the EXACT id
 *  of an existing story AC; one observable behavior per item (no "and"); do NOT order; do NOT set
 *  `ordered_for`. Return the slice as a fenced JSON array in your final message. */
const SLICE_CONTRACT =
  "Return an UNORDERED JSON array of test-list items as the LAST thing in your reply, fenced as " +
  "```json ... ```. Each item is { \"id\": \"<kind-local id, e.g. bhv-1>\", \"description\": " +
  "\"<one observable behavior, no 'and'>\", \"ac_id\": \"<EXACT id of an existing story AC file>\", " +
  "\"status\": \"pending\", \"kind\": \"<your kind>\" }. Do NOT order the items and do NOT set " +
  "ordered_for – the supervisor orders the merged master and assigns the final T-ids. Map every item " +
  "to a real story AC id (copy it verbatim, never re-slug).";

export const TEST_ANALYST_CATALOGUE: Record<string, TestAnalystCatalogueEntry> = {
  behavior: {
    kind: "behavior",
    description: "Backend behavior/API scenarios: one observable behavior per AC through the API boundary.",
    configSummary: "Per AC: >=1 behavior item through the API boundary (pytest-bdd .feature).",
    model: "sonnet",
    effort: "default",
    toolScope: ["Read"],
    inputs: ["story-acs", "architecture-invariants"],
    focusPrompt:
      "You are the BEHAVIOR test analyst. Cover every BACKEND-layer AC (API / service / data / INFRA) " +
      "whose outcome is observable through the API boundary with at least one `kind:\"behavior\"` item – " +
      "one observable behavior verified through the API boundary (for Python, a pytest-bdd scenario; set " +
      "`scenario_file` to `tests/features/<story>.feature`). An `Infra`-layer AC (e.g. 'distinct " +
      "(sku,location) coexist', 'refile updates in place') still has an observable API behavior – it is " +
      "YOURS, do not skip it as 'DB-only'. ASSERT THE AC'S CORE PROMISED OUTCOME – the actual result the " +
      "AC guarantees (a refile leaves the stored quantity == the NEW value AND exactly ONE row for the " +
      "pair; filing the same SKU at two DIFFERENT locations yields TWO independently-retrievable coexisting " +
      "rows), NOT merely a peripheral aspect (a preserved timestamp, atomicity). For a uniqueness / " +
      "multi-key invariant, cover BOTH sides: the COLLISION (same key -> rejected / stays one row) AND the " +
      "DISTINCT-keys-COEXIST positive (different keys -> independent rows). A test that checks only the " +
      "peripheral aspect or only the collision lets a Driver go green without the real behavior – the " +
      "recurring reflect-testlist-defect. " +
      "**DO NOT author a behavior item for an E2E / UI-presentation AC** (e.g. a \"filing form\" / \"home " +
      "screen\" AC whose `layer` is `E2E`): those are the CLIENT analyst's Playwright job, NOT a backend " +
      "pytest-bdd test. Set each item's `ac_id` ONLY to an AC whose layer permits a backend test; anchoring " +
      "a 2xx / response-shape check to a UI AC (instead of the API-layer AC) is the recurring mis-route the " +
      "reflect gate rejects – if an AC's observable outcome is an HTTP response shape, it belongs on the " +
      "API-layer AC, never the form/screen AC. Test at the OUTERMOST public boundary matching the AC's " +
      "layer. One test per scenario, never an " +
      "\"and\". EVERY write-bearing test (POST/insert/seed) MUST own its state – use a per-run-unique " +
      "key suffixed with the platform's BUILT-IN UUID (Python `uuid.uuid4()` from the stdlib; JS/TS " +
      "`crypto.randomUUID()`; Java `java.util.UUID`) OR delete/upsert the fixed key before writing, never " +
      "assume an empty table. NEVER add a UUID dependency: in JS/TS do NOT `import ... from \"uuid\"` – the " +
      "`uuid` npm package is not a scaffolded dependency and fails CI with \"Cannot find package 'uuid'\". " +
      "Do NOT emit fitness or client items, and do NOT set `invariant_id` (the fitness " +
      "analyst owns persistence invariants). COVER THE NEGATIVE/BOUNDARY-VALIDATION PATH a constraint " +
      "implies on your ACs: you are given architecture.json (NFRs + persistence_invariants), so when an " +
      "AC's field is required / NOT NULL (a `not_null` invariant or a field-named-validation NFR names it), " +
      "emit a behavior item that OMITS (or sends invalid) that field through the API boundary and asserts " +
      "a field-named rejection – this is the boundary guard, DISTINCT from the DB constraint the fitness " +
      "analyst tests. A required-field/CHECK/overcommit rejection with only a happy-path test is the " +
      "recurring reflect-testlist-defect. " + SLICE_CONTRACT,
  },
  fitness: {
    kind: "fitness",
    description: "Architectural fitness tests + a real-branch test per declared persistence invariant.",
    configSummary: "Per architectural constraint + per persistence_invariant: a fitness item (invariant_id).",
    model: "sonnet",
    effort: "high",
    toolScope: ["Read"],
    inputs: ["architecture-invariants", "db-design"],
    focusPrompt:
      "You are the FITNESS test analyst – the SOLE owner of `invariant_id`. Two duties: (1) Walk the " +
      "architecture (layers, service_backed, ORM-only, config-in-env, each accepted NFR budget) and " +
      "emit >=1 `kind:\"fitness\"` item per architectural constraint the story touches THAT IS NOT " +
      "ALREADY DEFENDED DETERMINISTICALLY. The INWARD-DEPENDENCY layering (boundary -> service -> " +
      "repository -> models, per layers[].may_import) and the ORM-CONTAINMENT contract (ONLY the " +
      "repository/infrastructure touches the ORM/session) are defended DETERMINISTICALLY by the " +
      "`consort-layering-clean` gate (a source scan at REVIEW) – do NOT author import-scan fitness " +
      "items for them. A hand-authored 'no module under app/ imports the session' / 'no layer imports " +
      "a layer its may_import forbids' test is redundant with the gate AND error-prone: it routinely " +
      "forgets to exclude the infrastructure session-factory module (app/database.py), is then " +
      "unsatisfiable on a correctly-layered tree, and the reflect gate bounces it lap after lap. DO " +
      "emit fitness items for constraints the gate does NOT cover: config-from-env, and any " +
      "service-layer guard an NFR demands (e.g. a write-time rejection of an overcommitting / " +
      "negative-quantity write at the SERVICE layer – distinct from a DB CHECK constraint). A " +
      "CLIENT-render NFR fitness function (SPA rendering of null/optional/empty/loading/error states) is " +
      "NOT yours – the CLIENT analyst owns those; emit NO fitness item for a client-render NFR. When an NFR " +
      "declares the ATOMIC `fitness_functions` ARRAY (one obligation per entry), emit ONE `kind:\"fitness\"` " +
      "item PER ARRAY ENTRY, each with `nfr_id` set to that NFR's `id` (checkFitnessClauseCoverage hard-blocks " +
      "the test_list gate unless every clause is covered) – never one item for the whole array. A COMPOUND " +
      "singular `fitness_function` (an `and`/`+`/comma joining two checkable claims) likewise needs ONE item " +
      "PER conjunct, never one for the pair. (2) Walk architecture.json `persistence_invariants[]` and emit AT LEAST ONE " +
      "`kind:\"fitness\"` item per invariant with `invariant_id` set to that invariant's id, verified " +
      "DIRECTLY against the real branch database (never a mock, never a generic ORM round-trip). COVER " +
      "EVERY LEG the invariant NAMES: when one invariant names MULTIPLE columns/constraints (e.g. two " +
      "NOT NULL audit columns `filed_by`+`filed_at`, a multi-column CHECK, or an FK set), cover EACH named " +
      "leg – a parametrised sub-case per column/constraint (or a sibling item), all sharing that " +
      "`invariant_id`. A single item exercising only ONE of the named columns leaves the others uncovered " +
      "(the reflect gate rejects the un-covered leg). E.g. a NOT-NULL invariant over {filed_by, filed_at} " +
      "needs a direct INSERT with EACH column NULL asserting its own constraint violation, not just one. " +
      "ANCHOR BY REALIZING STORY, NOT KEYWORD PROXIMITY: emit an invariant's item ONLY when THIS story " +
      "realizes that invariant's table – i.e. db-design.json `schema_changes[]` has an entry for THIS " +
      "story_id (create_table, else the earliest add_column/alter/constraint) on the invariant's " +
      "`table` (architecture.json `persistence_invariants[].table`). If the invariant's table is created " +
      "by a LATER story, DO NOT emit its fitness item on this story – it belongs to that write story, and " +
      "its test is un-buildable here (the table does not exist yet). A display/read-only story whose " +
      "migrations create NO table an invariant names emits NO invariant fitness items, even if its ACs " +
      "mention a related record (e.g. an AC 'shows the record' does NOT own the record's not-null/FK/" +
      "reversibility invariants – the story that MIGRATES the table does). A " +
      "migration reversibility is ALWAYS one item: reversibility (single-step downgrade/upgrade, " +
      "@pytest.mark.migration, NEVER downgrade base) asserting the SCHEMA is recreated – the table + its " +
      "columns/constraints are present again after downgrade-then-upgrade (NOT that data survives). " +
      "Data-preservation (seed rows, migrate, assert they survive with expected values) is a SEPARATE " +
      "item that applies ONLY to an ADDITIVE migration on a PRE-EXISTING table (a later story adding a " +
      "column/constraint, where single-step downgrade removes only that addition and prior rows persist). " +
      "NEVER author a data-preservation item for an INITIAL create-table migration: single-step downgrade " +
      "drops the whole table, so 'rows survive' is UNSATISFIABLE and no code can make it pass (it dead-locks " +
      "the assess/repair loop). If the story's migration is the table's FIRST (create-table), emit ONLY the " +
      "schema-recreation reversibility item, not data-preservation. The created_at/audit immutability on an in-place upsert is " +
      "its OWN item. Whole-table aggregate assertions must scope to the test's own rows (a delta), " +
      "never an absolute total. Fitness items MUST NOT carry a `.feature` `scenario_file`. Seed " +
      "idempotently with a per-run-unique key. " + SLICE_CONTRACT +
      " Set `invariant_id` on each item that covers a declared persistence invariant.",
  },
  client: {
    kind: "client",
    description: "SPA client-harness tests for UI-presentation ACs (React component / Playwright e2e).",
    configSummary: "Per UI-presentation AC: a client item under client/tests/ (only when uiTrack).",
    model: "sonnet",
    effort: "default",
    toolScope: ["Read"],
    inputs: ["story-acs", "architecture-invariants", "design-guide"],
    enabledWhen: (ctx) => ctx.uiTrack === true,
    focusPrompt:
      "You are the CLIENT test analyst (this project HAS a frontend). For every UI-presentation AC the " +
      "architecture routes to the SPA's own client harness, emit a `kind:\"client\"` item with " +
      "`scenario_file` under `client/tests/` (e.g. `client/tests/pages/<Screen>.test.tsx`). Do NOT fold " +
      "a presentation AC into the backend pytest-bdd suite – that mechanism mismatch is a defect. For an " +
      "AC that OWNS a page/route, at least one client item MUST exercise the page THROUGH THE REAL " +
      "`<App>` at the AC's route (a Playwright e2e that navigates the route, OR a component test " +
      "rendering `<App>` in `<MemoryRouter initialEntries={[\"<the path>\"]}>`) – a bare " +
      "`render(<ThePage/>)` does NOT prove the page is routed; name the route in the description. Test " +
      "the design-guide SEAM (assert the element carries its design-guide class / `data-testid`), NEVER " +
      "an inline `style=` or raw CSS in the source. Do NOT set `invariant_id`. " +
      "MATCH THE TEST TO THE AC's `layer`: an AC whose `layer` is **`E2E`** is verified END-TO-END " +
      "against the REAL paired-branch DB – it REQUIRES a real Playwright e2e (scenario_file under " +
      "`client/tests/e2e/…`) that drives the DEPLOYED app in a browser against the live DB, with NO " +
      "mocked/stubbed fetch and NO in-memory data. A mocked/stubbed COMPONENT test (rendering " +
      "`<App>`/`<Page>` with fake data) is ONLY for a pure presentation/rendering AC, NEVER for an " +
      "`E2E`-layer AC – drafting an E2E-layer AC as a mocked component test is the recurring " +
      "reflect-testlist-defect (it cannot hit the DB the layer demands). One real e2e per E2E-layer AC. " +
      "ALSO cover NFR CLIENT-RENDER fitness functions: for every `architecture.json` NFR whose " +
      "`fitness_function` describes a CLIENT render (e.g. rendering a row with null/optional fields and " +
      "asserting a 'not tracked' indicator, or an empty/loading/error state), emit a `kind:\"client\"` " +
      "item that performs that render and asserts the stated outcome. These NFR-render fitness functions " +
      "are YOURS, never the fitness analyst's (it owns service/DB guards, not the SPA); a stated " +
      "client-render NFR with no client item is the recurring reflect-testlist-defect. " + SLICE_CONTRACT,
  },
};

/** Resolve a test-analyst kind to its catalogue entry. THROWS loud on an unknown kind, listing the
 *  known kinds sorted (mirrors resolveAgentKind / resolveLifecycleKind). */
export function resolveTestAnalystKind(kind: string): TestAnalystCatalogueEntry {
  const entry = TEST_ANALYST_CATALOGUE[kind];
  if (!entry) {
    const known = Object.keys(TEST_ANALYST_CATALOGUE).sort().join(", ");
    throw new Error(`test-analyst-catalogue: unknown test-analyst kind "${kind}". Known: ${known}.`);
  }
  return entry;
}

/** The analysts ENABLED for a given project – the catalogue filtered by each entry's `enabledWhen`
 *  against the resolved project config (an entry with no predicate is always enabled). The supervisor's
 *  roster preparer calls this so a no-frontend project (uiTrack:false) never sees or spawns `client`. */
export function enabledAnalysts(ctx: AnalystEnablementContext): TestAnalystCatalogueEntry[] {
  return Object.values(TEST_ANALYST_CATALOGUE).filter((e) => (e.enabledWhen ? e.enabledWhen(ctx) : true));
}
