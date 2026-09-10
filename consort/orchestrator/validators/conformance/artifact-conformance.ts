// Layer 2 (conformance): "did this artifact adhere to the format
// expected?"
//
// The three layers a gate enforces on an artifact:
//   Layer 1 existence  - the artifact exists on disk (human-proxy no longer
//                        fabricates a placeholder for a missing file).
//   Layer 2 conformance- THIS module: the artifact that exists matches the
//                        format its producing role is documented to emit.
//   Layer 3 signoff    - approveGate records the HITL approval + hash.
//
// The format each artifact must satisfy is DERIVED FROM the role contracts in
// skills/consort/agents/*.md and references/spec-format.md, not
// invented here:
//   - JSON artifacts (feature/story/ac/test-list/plan/workflow-state) have
//     JSON Schemas in consort/config/schemas/ and are validated against them.
//   - architecture.md: the Architect Reviewer names its sections (Architectural
//     Concerns Mapping, Pattern proposals, Risks); extended with the two the
//     Architect Reviewer adjudicates at Gate 2 (Decisions, Sign-off).
//   - feature-spec.md: the Spec Author's draft-spec narrative (Summary, Stories,
//     Out of scope, Open questions that seed Gate 1).
//   - feature-request.md: the Feature Requester's original ask; the Spec Author's
//     INPUT (free-form narrative, H1 + non-empty body only). Never overwritten.
//   - test-list.md: a Beck-style ordered list rendered from test-list.json;
//     every item traces to a Spec Author-authored AC (an orphan item is a smell).
//   - product-overview.md: the Product Owner's project-level overview (replaces
//     the old spec.md); H1 + body only.
//
// Keying is by artifact FILENAME, not by gate: an artifact's format is
// intrinsic to the artifact, so this module never needs to know which gate is
// collecting it. Callers (human-proxy's resolver, the conformance CLI) map
// gate -> artifacts; this module maps artifact -> format.

import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join, basename, dirname } from "path";
import { getValidator, formatSchemaErrors } from "../schema-loader.js";
import { featuresDir as featuresDirOf } from "../../../config/consort-paths.js";

export type ConformanceResult =
  | { ok: true }
  | { ok: false; violations: string[] };

interface RequiredSection {
  /** Human label used in the violation message. */
  label: string;
  /** Lowercase substring sought (case-insensitively) in a heading line. */
  match: string;
}

type FormatSpec =
  | { kind: "json-schema"; schema: string }
  | { kind: "md-narrative" }
  | { kind: "md-sections"; sections: RequiredSection[] }
  | { kind: "test-list-md" };

/**
 * Artifact filename -> the format its producing role is documented to emit.
 * Filenames not present here have no declared format and pass unconditionally
 * (e.g. promote_ref, scratch notes).
 */
export const ARTIFACT_FORMATS: Record<string, FormatSpec> = {
  "feature-spec.json": { kind: "json-schema", schema: "feature.schema.json" },
  "story.json": { kind: "json-schema", schema: "story.schema.json" },
  "ac.json": { kind: "json-schema", schema: "ac.schema.json" },
  "test-list.json": { kind: "json-schema", schema: "test-list.schema.json" },
  "plan.json": { kind: "json-schema", schema: "plan.schema.json" },
  "architecture.json": { kind: "json-schema", schema: "architecture.schema.json" },
  // DBA's physical schema (tables/DDL + per-story migration plan) that realizes
  // the architect's persistence_invariants.
  "db-design.json": { kind: "json-schema", schema: "db-design.schema.json" },
  "workflow-state.json": { kind: "json-schema", schema: "workflow-state.schema.json" },
  // Release Engineer's deploy-gate evidence (reachability + feature-verify).
  "deploy-evidence.json": { kind: "json-schema", schema: "deploy-evidence.schema.json" },
  // UX Designer (UI projects only): the machine-checkable design tokens.
  "design-guide.json": { kind: "json-schema", schema: "design-guide.schema.json" },

  // Architect Reviewer's section 6 + Gate 2 adjudication surface.
  "architecture.md": {
    kind: "md-sections",
    sections: [
      { label: "Architectural Concerns Mapping", match: "architectural concerns mapping" },
      { label: "Pattern proposals", match: "pattern proposal" },
      { label: "Risks", match: "risk" },
      { label: "Gate decisions", match: "decision" },
      { label: "Sign-off", match: "sign-off" },
    ],
  },

  // Spec Author's draft-spec narrative.
  "feature-spec.md": {
    kind: "md-sections",
    sections: [
      { label: "Summary", match: "summary" },
      { label: "Stories", match: "stories" },
      { label: "Out of scope", match: "out of scope" },
      { label: "Open questions", match: "open question" },
    ],
  },

  // Feature Requester's original ask: the Spec Author's INPUT. Free-form
  // narrative; only H1 + non-empty body required. Never overwritten.
  "feature-request.md": { kind: "md-narrative" },

  // Spec Author's sprint backlog proposal: the artifact the sprint PLAN gate
  // locks. Free-form narrative; H1 + non-empty body required.
  "feature-proposals.md": { kind: "md-narrative" },

  // Product Owner's project-level overview (replaces the old spec.md).
  "product-overview.md": { kind: "md-narrative" },

  // HIL non-functional-requirements brief (the Architect's intake). The HIL
  // states required NFRs (each with a stable R<n> id), preferences, and
  // out-of-bounds items. The Architect must carry every Required item into
  // architecture.json via a matching brief_ref (see checkNfrCoverage). Project
  // -level (.tdd/nfrs.md) or per-feature (.tdd/features/<F>/nfrs.md).
  "nfrs.md": {
    kind: "md-sections",
    sections: [
      { label: "Required", match: "required" },
      { label: "Preferences", match: "preference" },
      { label: "Out of bounds", match: "out of bounds" },
    ],
  },

  // HIL design brief (UI projects): the human's reference sites + what to take
  // from each. The design analogue of product-overview.md, the source the UX
  // Designer teases the design out of. A brief with no references is
  // meaningless, so a
  // References section is the one hard requirement.
  "design-brief.md": {
    kind: "md-sections",
    sections: [{ label: "References", match: "reference" }],
  },

  // UX Designer narrative artifacts (UI projects only). design-guide.md
  // sections are grounded in a real shipped guide (partner-asset-tracker
  // STYLE_GUIDE.md); design-guide.json carries the machine-checkable tokens.
  "design-guide.md": {
    kind: "md-sections",
    sections: [
      { label: "Design Philosophy", match: "philosophy" },
      { label: "UI Framework", match: "framework" },
      { label: "Typography", match: "typography" },
      { label: "Color Palette", match: "color" },
      { label: "Spacing", match: "spacing" },
      { label: "Components", match: "components" },
      { label: "User Feedback Principles", match: "feedback" },
    ],
  },
  "ia.md": {
    kind: "md-sections",
    sections: [
      { label: "Screens", match: "screens" },
      { label: "Navigation", match: "navigation" },
      { label: "User flows", match: "flow" },
    ],
  },

  // Beck-style ordered list rendered from test-list.json.
  "test-list.md": { kind: "test-list-md" },
};

/** True when the artifact name has a declared format this module enforces. */
export function hasDeclaredFormat(name: string): boolean {
  return name in ARTIFACT_FORMATS;
}

/**
 * Check a single artifact's content against its declared format. Artifacts
 * with no declared format pass. Returns the full list of violations so a
 * caller can surface every problem at once rather than one-at-a-time.
 */
export function checkArtifactConformance(name: string, content: string): ConformanceResult {
  const spec = ARTIFACT_FORMATS[name];
  if (spec === undefined) return { ok: true };

  switch (spec.kind) {
    case "json-schema":
      return checkJsonSchema(name, content, spec.schema);
    case "md-narrative":
      return finalize(checkMdNarrative(name, content));
    case "md-sections":
      return finalize(checkMdSections(name, content, spec.sections));
    case "test-list-md":
      return finalize(checkTestListMd(content));
  }
}

function finalize(violations: string[]): ConformanceResult {
  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}

function checkJsonSchema(name: string, content: string, schemaFile: string): ConformanceResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    return { ok: false, violations: [`${name} is not valid JSON: ${cause}`] };
  }
  const validate = getValidator(schemaFile);
  if (validate(parsed)) return { ok: true };
  return { ok: false, violations: formatSchemaErrors(validate).map((e) => `${name} ${e}`) };
}

interface Heading {
  level: number;
  text: string;
}

const HEADING_RE = /^(#{1,6})\s+(.*\S)\s*$/;

function parseHeadings(content: string): Heading[] {
  const out: Heading[] = [];
  for (const line of content.split("\n")) {
    const m = HEADING_RE.exec(line);
    if (m) out.push({ level: m[1].length, text: m[2] });
  }
  return out;
}

function hasH1(headings: Heading[]): boolean {
  return headings.some((h) => h.level === 1);
}

/** Non-heading, non-blank content exists below the title. */
function hasBody(content: string): boolean {
  return content.split("\n").some((line) => {
    const t = line.trim();
    return t.length > 0 && !HEADING_RE.test(line);
  });
}

function checkMdNarrative(name: string, content: string): string[] {
  const violations: string[] = [];
  const headings = parseHeadings(content);
  if (!hasH1(headings)) violations.push(`${name} has no H1 title`);
  if (!hasBody(content)) violations.push(`${name} has an empty body (title only)`);
  return violations;
}

function checkMdSections(name: string, content: string, sections: RequiredSection[]): string[] {
  const violations: string[] = [];
  const headings = parseHeadings(content);
  if (!hasH1(headings)) violations.push(`${name} has no H1 title`);
  const headingText = headings.map((h) => h.text.toLowerCase());
  for (const section of sections) {
    if (!headingText.some((t) => t.includes(section.match))) {
      violations.push(`${name} missing required section: ${section.label}`);
    }
  }
  return violations;
}

// A rendered Beck list item, e.g. "- [ ] T1: rejects an empty title  (AC1.4)".
const TEST_ITEM_RE = /^\s*[-*]\s*\[[ xX]?\]\s*T\d/;
const AC_REF_RE = /\bAC\s*\d/i;

function checkTestListMd(content: string): string[] {
  const violations: string[] = [];
  const headings = parseHeadings(content);
  if (!hasH1(headings)) violations.push("test-list.md has no H1 title");
  if (!/ordered for\s*:/i.test(content)) {
    violations.push('test-list.md missing "Ordered for:" ordering rationale');
  }
  if (!headings.some((h) => h.text.toLowerCase().includes("deferred"))) {
    violations.push("test-list.md missing required section: Deferred / skipped");
  }
  for (const line of content.split("\n")) {
    if (TEST_ITEM_RE.test(line) && !AC_REF_RE.test(line)) {
      violations.push(`test-list.md has a test item with no AC reference (orphan): ${line.trim()}`);
    }
  }
  return violations;
}

// ─── NFR coverage (cross-artifact: nfrs.md Required ids vs architecture.json) ───

/** One list item under nfrs.md's `## Required` section. */
export interface RequiredNfr {
  /** The R<n> id, or null when the item has no parseable id. */
  id: string | null;
  /** The requirement text (id stripped). */
  text: string;
}

const REQUIRED_NFR_ITEM_RE = /^\s*[-*]\s+\*{0,2}(R\d+)\*{0,2}\s*[:.)\-]?\s*(.*)$/;
const PLAIN_LIST_ITEM_RE = /^\s*[-*]\s+(.*\S)\s*$/;

/**
 * Extract the list items under nfrs.md's `## Required` section. Each Required
 * NFR should carry a stable `R<n>` id so the Architect can reference it from
 * architecture.json via brief_ref. Items without an id are returned with
 * id=null so the coverage check can flag them (untrackable).
 */
export function parseRequiredNfrs(nfrsMd: string): RequiredNfr[] {
  const lines = nfrsMd.split("\n");
  const out: RequiredNfr[] = [];
  let inRequired = false;
  for (const line of lines) {
    const h = HEADING_RE.exec(line);
    if (h) {
      // Enter on a heading whose text is exactly/starts-with "required";
      // any subsequent heading ends the section.
      inRequired = h[2].trim().toLowerCase().startsWith("required");
      continue;
    }
    if (!inRequired) continue;
    const withId = REQUIRED_NFR_ITEM_RE.exec(line);
    if (withId) {
      out.push({ id: withId[1], text: withId[2].trim() });
      continue;
    }
    const plain = PLAIN_LIST_ITEM_RE.exec(line);
    if (plain) out.push({ id: null, text: plain[1].trim() });
  }
  return out;
}

/**
 * Cross-artifact coverage check: every Required NFR in nfrs.md must be carried
 * into architecture.json via a matching `brief_ref` on one of its nfrs[]. A
 * Required item with no id (untrackable) or with no matching brief_ref is a
 * violation, so a non-covered HIL requirement HARD-BLOCKS the architecture gate
 * (the Human Proxy will not approve it). architecture.json that is absent or
 * invalid JSON is itself reported (the architect produced nothing to cover with).
 */
export function checkNfrCoverage(
  nfrsMd: string,
  architectureJson: string,
  /** PER-FEATURE RELEVANCE: brief ids a SIBLING feature in the same project
   *  already covers. A project-wide Required NFR need only be realized by the
   *  feature(s) that TOUCH it, so a feature that does not implement a concern is
   *  not forced to manufacture nominal coverage – it passes when a sibling covers
   *  it. Empty/omitted preserves the original single-feature strictness. */
  otherFeatureBriefRefs: ReadonlySet<string> = new Set(),
): ConformanceResult {
  const required = parseRequiredNfrs(nfrsMd);
  if (required.length === 0) return { ok: true }; // no Required NFRs to cover

  let parsed: { nfrs?: Array<{ brief_ref?: string }>; nfr_out_of_scope?: Array<{ ref?: string }> };
  try {
    parsed = JSON.parse(architectureJson);
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    return { ok: false, violations: [`architecture.json is not valid JSON: ${cause}`] };
  }
  const briefRefs = new Set(
    (parsed.nfrs ?? []).map((n) => n.brief_ref).filter((r): r is string => typeof r === "string" && r.length > 0),
  );
  // This feature may EXPLICITLY scope a project NFR out (it touches no code the
  // NFR governs), an honest "not my concern, upheld elsewhere" declaration the
  // gate accepts rather than forcing nominal coverage.
  const scopedOut = new Set(
    (parsed.nfr_out_of_scope ?? []).map((s) => s.ref).filter((r): r is string => typeof r === "string" && r.length > 0),
  );

  const violations: string[] = [];
  for (const item of required) {
    if (item.id === null) {
      const preview = item.text.length > 50 ? `${item.text.slice(0, 50)}...` : item.text;
      violations.push(`nfrs.md Required item has no R<n> id (cannot be coverage-tracked): "${preview}"`);
      continue;
    }
    const covered = briefRefs.has(item.id) || otherFeatureBriefRefs.has(item.id) || scopedOut.has(item.id);
    if (!covered) {
      violations.push(
        `Required NFR ${item.id} from nfrs.md is not covered by this feature, any sibling feature, or an ` +
          `explicit nfr_out_of_scope declaration (no matching brief_ref)`,
      );
    }
  }
  return finalize(violations);
}

/** Collect the brief_refs covered by EVERY feature's architecture.json under the
 *  project (for the per-feature-relevance NFR check: a Required NFR satisfied by
 *  any one feature counts as covered project-wide). Best-effort: unreadable /
 *  invalid architecture.json files contribute nothing. */
export function projectBriefRefs(consortDir: string): Set<string> {
  const refs = new Set<string>();
  const fdir = featuresDirOf(consortDir);
  if (!existsSync(fdir)) return refs;
  for (const feature of readdirSync(fdir)) {
    const archPath = join(fdir, feature, "architecture.json");
    if (!existsSync(archPath)) continue;
    try {
      const parsed = JSON.parse(readFileSync(archPath, "utf8")) as { nfrs?: Array<{ brief_ref?: string }> };
      for (const n of parsed.nfrs ?? []) {
        if (typeof n.brief_ref === "string" && n.brief_ref.length > 0) refs.add(n.brief_ref);
      }
    } catch {
      /* best-effort: skip an unreadable/invalid feature architecture */
    }
  }
  return refs;
}

/**
 * Evidence-bound `service_backed` determination: the layering + fitness guards
 * all key off the architect's self-declared `service_backed` flag, so an architect
 * that omits it (or sets false) on a feature that demonstrably persists data
 * silently exempts the whole feature from layering enforcement – the defect that
 * let a data-persisting bug tracker ship with HTML in a fat controller. This
 * cross-checks the declaration against the architect's OWN structured evidence:
 * a feature that is not `service_backed: true` while it shows persistence
 * evidence (an `Infra`-layer AC, or an NFR about migrations/schema/storage) is a
 * contradiction and HARD-BLOCKS the gate. `service_backed: true` owns it (no
 * contradiction); a genuinely trivial feature with no such evidence is exempt.
 * Evidence is passed in (the gate gathers AC layers + NFR text) so the check
 * stays pure. Absent `service_backed` is treated as not-true (omission is not an
 * escape hatch).
 */
const PERSISTENCE_EVIDENCE_RE =
  /\b(migrat\w*|schema|persist\w*|stored|store|tables?|database|repositor\w*|\bORM\b)\b/i;

export function checkServiceBackedDeclaration(
  architectureJson: string,
  evidence: { acLayers?: string[]; nfrsText?: string[] },
): ConformanceResult {
  let parsed: { service_backed?: boolean; persistence_invariants?: Array<{ id?: string }> };
  try {
    parsed = JSON.parse(architectureJson);
  } catch (err) {
    return { ok: false, violations: [`architecture.json is not valid JSON: ${err instanceof Error ? err.message : String(err)}`] };
  }
  const infraAc = (evidence.acLayers ?? []).some((l) => l === "Infra");
  const persistNfr = (evidence.nfrsText ?? []).some((t) => PERSISTENCE_EVIDENCE_RE.test(t));
  const why = [
    infraAc ? "an AC is tagged layer:Infra (a data-store contract)" : "",
    persistNfr ? "an NFR references persistence (migration/schema/storage)" : "",
  ].filter(Boolean).join(" and ");

  if (parsed.service_backed === true) {
    // Declared service-backed; layering checks take over. But a service does NOT
    // always mean a database: persistence is tracked by persistence_invariants
    // (the source of truth for "has a DB"), not by service_backed. So the DB
    // gates (checkDbDesign / checkPersistenceCoverage) exempt a service that
    // declares none. The safety net against a feature that REALLY persists
    // slipping through with no invariants lives HERE: persistence evidence
    // (an Infra AC / a storage NFR) while persistence_invariants is empty is the
    // contradiction – force the invariants so the schema gets tested.
    if (!infraAc && !persistNfr) return { ok: true }; // a non-persisting service: fine
    const hasInvariants = (parsed.persistence_invariants ?? []).some((i) => i && typeof i.id === "string" && i.id.length > 0);
    if (hasInvariants) return { ok: true }; // a real DB feature, properly declared
    return {
      ok: false,
      violations: [
        `architecture.json is service_backed and shows persistence evidence (${why}) but declares NO persistence_invariants[]; ` +
          `a feature that persists data must name its DB-level guarantees (unique/FK/CHECK/NOT NULL/transactional/migration-reversible) ` +
          `so the schema gets a real-branch test, OR remove the misleading persistence signal if this service does not actually persist`,
      ],
    };
  }
  if (!infraAc && !persistNfr) return { ok: true }; // no persistence evidence; a trivial feature may omit/false
  return {
    ok: false,
    violations: [
      `architecture.json is not service_backed but shows persistence evidence (${why}); ` +
        `set service_backed:true + declare boundary/service/repository layers (a data-persisting feature MUST be layered), ` +
        `or remove the misleading signal if the feature is genuinely trivial`,
    ],
  };
}

/**
 * E2E-layer PRESENCE (closes the "a UI feature designed as all-backend" escape).
 * `checkE2ECoverage` only bites once an AC is tagged `layer:"E2E"`, so a design lane
 * that mis-classifies EVERY client-facing AC as `API`/`Infra` yields a feature with ZERO
 * E2E ACs and satisfies the coverage guard vacuously – exactly how the actor-less pick
 * form shipped (a whole feature of client behavior, not one E2E AC, so the client<->
 * server contract was never verified end to end, TWICE: the design lane flattened even a
 * rewritten "operator submits the form in the browser" premise into a backend
 * "the pick is saved" API AC). This cross-checks TWO signals that the feature is
 * client-facing against the AC-layer evidence:
 *   1. the architect's own structural declaration – a `boundary` layer with `renders_via`
 *      (`react`/`jinja2`) means the feature renders a UI; and
 *   2. the architect-INDEPENDENT project signal – the project is a React UI track
 *      (`uiReact`) AND the feature exposes an `API`-layer AC (an endpoint the SPA
 *      consumes). Signal 2 matters because the SAME mis-classification that drops the
 *      E2E tags can also drop `renders_via` (an architect that thinks the feature is
 *      backend declares a plain API boundary), so keying only on the architect's own
 *      declaration lets the failure dodge the net.
 * Given either signal, the feature MUST carry >=1 `layer:"E2E"` AC (a genuine client<->
 * server round-trip's only real verification is a Playwright e2e). Mirrors
 * `checkServiceBackedDeclaration` (a structural declaration cross-checked against
 * evidence, not prose the architect can silently override). Null when the feature is
 * not client-facing, or already has an E2E AC. The CALLER enforces this only once every
 * declared story is designed (a partially-designed feature may not have reached its
 * client-facing story yet), the same way the streaming design lane defers other
 * feature-wide checks.
 */
export function checkE2eLayerPresent(
  architectureJson: string,
  evidence: { acLayers?: string[]; uiReact?: boolean },
): ConformanceResult {
  let parsed: { layers?: Array<{ role?: string; renders_via?: unknown }> };
  try {
    parsed = JSON.parse(architectureJson);
  } catch (err) {
    return { ok: false, violations: [`architecture.json is not valid JSON: ${err instanceof Error ? err.message : String(err)}`] };
  }
  const acLayers = evidence.acLayers ?? [];
  const declaresRenderingBoundary = (parsed.layers ?? []).some(
    (l) => l.role === "boundary" && typeof l.renders_via === "string" && l.renders_via.length > 0,
  );
  // Signal 2: a React UI-track project's feature that exposes an endpoint the SPA calls.
  const reactFeatureWithApi = evidence.uiReact === true && acLayers.includes("API");
  const clientFacing = declaresRenderingBoundary || reactFeatureWithApi;
  if (!clientFacing) return { ok: true }; // an API/CLI/Infra feature renders no UI to verify end to end
  if (acLayers.includes("E2E")) return { ok: true };
  const why = declaresRenderingBoundary
    ? `declares a UI-rendering boundary (renders_via)`
    : `is a React UI-track project exposing an API-layer AC (an endpoint the client consumes)`;
  return {
    ok: false,
    violations: [
      `the feature ${why} but NO acceptance criterion is tagged layer:"E2E"; a feature that renders a UI has at least one ` +
        `client<->server contract (a form submit, an inline validation rejection, a success/empty state) whose ONLY real ` +
        `verification is a Playwright e2e against the live API – tag that AC layer:"E2E" (a mocked component test stubs the ` +
        `response envelope, so a fabricated shape passes green while the real wire contract drifts). NOTE: an outcome phrased as ` +
        `"record WHO performed the action" or "the pick is saved", when the operator enters their name on a form with no auth, IS ` +
        `a client form submission (layer:"E2E") – do not flatten it into a backend "API" AC. If the endpoint is genuinely not ` +
        `consumed by any client, reconsider – that is unusual for a UI-track feature.`,
    ],
  };
}

/**
 * Layering declared (FEIP layered-build enforcement): a feature the architect
 * marked `service_backed: true` MUST declare a boundary + service + repository in
 * `architecture.json.layers` (layered architecture: boundary -> service ->
 * repository -> ORM). A service-backed feature with no/partial layers HARD-BLOCKS
 * Gate 2, so the build cannot produce a fat controller unchecked. A feature that
 * is not service_backed is exempt (the YAGNI guard). Absent/invalid architecture
 * is reported elsewhere.
 */
export function checkLayeringDeclared(architectureJson: string): ConformanceResult {
  let parsed: { service_backed?: boolean; layers?: Array<{ role?: string }> };
  try {
    parsed = JSON.parse(architectureJson);
  } catch (err) {
    return { ok: false, violations: [`architecture.json is not valid JSON: ${err instanceof Error ? err.message : String(err)}`] };
  }
  if (parsed.service_backed !== true) return { ok: true };
  const roles = new Set(
    (parsed.layers ?? []).map((l) => l.role).filter((r): r is string => typeof r === "string"),
  );
  const missing = ["boundary", "service", "repository"].filter((r) => !roles.has(r));
  if (missing.length) {
    return {
      ok: false,
      violations: [
        `service_backed feature must declare layers [${missing.join(", ")}] in architecture.json ` +
          `(layered architecture: boundary -> service -> repository -> ORM; the boundary never touches the DB session)`,
      ],
    };
  }
  return { ok: true };
}

/**
 * Fitness coverage (FEIP layered-build enforcement): a service-backed / layered
 * feature MUST have >=1 `kind:"fitness"` item in its test-list (the architectural
 * constraint gets a fitness test, per test-strategy.md), or Gate 3 HARD-BLOCKS.
 * Scoped to service_backed/layered features only (NFR coverage is already enforced
 * separately by checkNfrCoverage), so a trivial feature is exempt.
 */
export function checkFitnessCoverage(testListJson: string, architectureJson: string): ConformanceResult {
  let arch: { service_backed?: boolean; layers?: unknown[] };
  try {
    arch = JSON.parse(architectureJson);
  } catch {
    return { ok: true }; // invalid architecture reported elsewhere
  }
  const declaresConstraint = arch.service_backed === true || (Array.isArray(arch.layers) && arch.layers.length > 0);
  if (!declaresConstraint) return { ok: true };
  let tl: { items?: Array<{ kind?: string }> };
  try {
    tl = JSON.parse(testListJson);
  } catch (err) {
    return { ok: false, violations: [`test-list.json is not valid JSON: ${err instanceof Error ? err.message : String(err)}`] };
  }
  const hasFitness = (tl.items ?? []).some((i) => i.kind === "fitness");
  if (!hasFitness) {
    return {
      ok: false,
      violations: [
        `architecture is service-backed/layered but the test-list has no kind:"fitness" item ` +
          `(a service-backed feature needs a fitness test for its gate-uncovered constraints, e.g. a ` +
          `real-branch persistence-invariant test or config-in-env; the inward-deps/ORM-containment ` +
          `layering contract is defended by the consort-layering-clean gate, not a test item; see test-strategy.md)`,
      ],
    };
  }
  return { ok: true };
}

/**
 * E2E coverage (the client<->server CONTRACT): an AC whose acceptance is the CLIENT rendering an
 * outcome DERIVED FROM A REAL SERVER RESPONSE – a validation rejection shown inline, a success
 * confirmation, an error state from a failed request – is a client<->server contract, tagged
 * `layer:"E2E"`, and MUST be covered by a REAL end-to-end test: a Playwright spec (scenario_file
 * under an `e2e/` path, e.g. `client/tests/e2e/…`) that drives the deployed app against the live
 * API. A mocked component test is NOT sufficient – it stubs the response envelope, so a fabricated
 * shape passes green while the real wire contract drifts. That is exactly the recurring S2/S3
 * inline-error defect: the client mocked a flat `{quantity: …}` body, went green, and shipped a
 * form that rendered nothing against the real backend's `{detail: {quantity: …}}`. Makes
 * test-strategy.md's long-standing E2E rule a DETERMINISTIC gate (it was prose the supervisor was
 * asked to "catch"). For each `layer:"E2E"` AC id, the assembled test-list must hold >=1 item whose
 * `scenario_file` is under an `e2e/` path. Empty `e2eAcIds` (no E2E-layer AC) is vacuously ok.
 */
export function checkE2ECoverage(testListJson: string, e2eAcIds: string[]): ConformanceResult {
  if (e2eAcIds.length === 0) return { ok: true };
  let tl: { items?: Array<{ ac_id?: string; kind?: string; scenario_file?: string }> };
  try {
    tl = JSON.parse(testListJson);
  } catch (err) {
    return { ok: false, violations: [`test-list.json is not valid JSON: ${err instanceof Error ? err.message : String(err)}`] };
  }
  const items = tl.items ?? [];
  const isE2e = (sf?: string): boolean => typeof sf === "string" && /(^|\/)e2e\//.test(sf);
  const violations: string[] = [];
  for (const acId of e2eAcIds) {
    const forAc = items.filter((i) => i.ac_id === acId);
    if (forAc.some((i) => isE2e(i.scenario_file))) continue;
    const how = forAc.length
      ? `covered only by ${forAc.map((i) => i.scenario_file ?? `kind:${i.kind ?? "?"}`).join(", ")}`
      : "has no covering test";
    violations.push(
      `E2E-layer AC ${acId} ${how} – a mocked component test cannot verify the real client<->server contract ` +
        `(a fabricated response envelope passes green while the real wire shape drifts). Add a real Playwright ` +
        `e2e (scenario_file under client/tests/e2e/) that drives the deployed app against the live API`,
    );
  }
  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}

/**
 * Persistence coverage (robust DB testing, not an ORM re-test): a service-backed
 * feature's architecture MUST declare its `persistence_invariants[]` (the DB-level
 * guarantees the SCHEMA enforces – a unique key, an FK/cascade, a NOT NULL/CHECK, a
 * transactional-atomicity boundary, migration up-then-down reversibility), and the
 * test-list MUST cover EVERY declared invariant with >=1 item referencing its
 * `invariant_id`. This ties DB test coverage to the schema's own contract rather
 * than a blunt "one integration test" quota: it forces a test that verifies the
 * MIGRATION actually realized each invariant against the real branch (model-vs-DB
 * drift the ORM cannot catch) + the repository honors it, not the ORM's generic
 * CRUD. Scoped to service_backed features (a trivial feature is exempt). A
 * service-backed feature that declares NO invariants is itself a gap (it persists
 * data, so it has at least one). Gate 3 hard-blocks.
 */
export function checkPersistenceCoverage(testListJson: string, architectureJson: string): ConformanceResult {
  let arch: { service_backed?: boolean; persistence_invariants?: Array<{ id?: string }> };
  try {
    arch = JSON.parse(architectureJson);
  } catch {
    return { ok: true }; // invalid architecture reported elsewhere
  }
  if (arch.service_backed !== true) return { ok: true };
  const invariants = (arch.persistence_invariants ?? []).filter((i) => i && typeof i.id === "string" && i.id.length > 0);
  // A service does not always mean a database. No declared invariants => a
  // non-persisting service with nothing to cover, so coverage is vacuously ok.
  // The guard that a feature which really persists MUST declare invariants lives
  // in checkServiceBackedDeclaration (persistence evidence forces them).
  if (invariants.length === 0) return { ok: true };
  let tl: { items?: Array<{ invariant_id?: string }> };
  try {
    tl = JSON.parse(testListJson);
  } catch (err) {
    return { ok: false, violations: [`test-list.json is not valid JSON: ${err instanceof Error ? err.message : String(err)}`] };
  }
  const covered = new Set((tl.items ?? []).map((i) => i.invariant_id).filter((x): x is string => typeof x === "string" && x.length > 0));
  const uncovered = invariants.map((i) => i.id as string).filter((id) => !covered.has(id));
  if (uncovered.length > 0) {
    return {
      ok: false,
      violations: [
        `persistence_invariant(s) with no covering test-list item (invariant_id): ${uncovered.join(", ")} ` +
          `(each declared invariant needs >=1 test that verifies the migration realized it against the real branch – ` +
          `NOT a test of the ORM's generic round-trip; see test-strategy.md)`,
      ],
    };
  }
  return { ok: true };
}

/**
 * Deterministic per-CLAUSE fitness coverage for an NFR declared in the ATOMIC
 * `fitness_functions` array form. For each nfrs[] entry that carries a non-empty
 * `fitness_functions` array (and an `id`), the test-list must hold at least as many
 * `fitness` items tagged with that NFR's `id` (via `nfr_id`) as the array has
 * clauses — one test per atomic obligation. This is the structural teeth for #4:
 * it fires ONLY for NFRs on the array form (a compound singular `fitness_function`
 * is untouched, so it is fully back-compatible), and it needs NO natural-language
 * "is this compound?" heuristic - the architect declares the clauses as discrete
 * data and the count is mechanical. It stops a multi-part NFR being surfaced
 * ONE-uncovered-clause-per-lap by the reflect (the piecemeal thrash), because a
 * missing clause is a mechanical shortfall here, before the reflect ever runs.
 */
export function checkFitnessClauseCoverage(testListJson: string, architectureJson: string): ConformanceResult {
  let arch: { nfrs?: Array<{ id?: string; fitness_functions?: unknown; tier?: string }> };
  try {
    arch = JSON.parse(architectureJson);
  } catch {
    return { ok: true }; // invalid architecture reported elsewhere
  }
  const atomic = (arch.nfrs ?? [])
    // A platform-tier NFR is defended once (a deterministic gate or a single
    // feature-level fitness item), NOT per-clause per-story — so it is excluded
    // from the atomic-coverage count. Untiered/product NFRs count as before.
    .filter((n) => n && typeof n.id === "string" && n.id.length > 0 && Array.isArray(n.fitness_functions) && n.tier !== "platform")
    .map((n) => ({ id: n.id as string, clauses: (n.fitness_functions as unknown[]).filter((c) => typeof c === "string" && c.trim().length > 0).length }))
    .filter((n) => n.clauses > 0);
  if (atomic.length === 0) return { ok: true }; // no NFR uses the atomic array form
  let tl: { items?: Array<{ kind?: string; nfr_id?: string }> };
  try {
    tl = JSON.parse(testListJson);
  } catch (err) {
    return { ok: false, violations: [`test-list.json is not valid JSON: ${err instanceof Error ? err.message : String(err)}`] };
  }
  const countById = new Map<string, number>();
  for (const it of tl.items ?? []) {
    if (typeof it.nfr_id === "string" && it.nfr_id.length > 0) countById.set(it.nfr_id, (countById.get(it.nfr_id) ?? 0) + 1);
  }
  const short = atomic
    .map((n) => ({ id: n.id, need: n.clauses, have: countById.get(n.id) ?? 0 }))
    .filter((n) => n.have < n.need);
  if (short.length > 0) {
    return {
      ok: false,
      violations: short.map(
        (n) =>
          `NFR ${n.id} declares ${n.need} atomic fitness clause(s) (fitness_functions) but only ${n.have} test-list item(s) reference it via nfr_id ` +
          `(author one fitness test per clause, each tagged nfr_id:"${n.id}"; do not pack multiple clauses into one test)`,
      ),
    };
  }
  return { ok: true };
}

/** The deterministic gates a platform-tier NFR may name in `defended_by_gate` to
 *  discharge its obligation without a per-story fitness test. These are the
 *  substrate guarantees that already defend a cross-cutting concern ONCE (the
 *  layering/ORM-containment gate; the config-in-env check). Extend as more
 *  cross-cutting concerns gain a deterministic gate. */
export const PLATFORM_NFR_GATES: ReadonlySet<string> = new Set(["consort-layering-clean", "config-in-env"]);

/**
 * The anti-silent-drop teeth for NFR tiering. A `tier:"platform"` NFR is defended
 * ONCE (not per story), so it is exempt from the per-story fitness/rubric burden —
 * but it must still be defended, never dropped. It is valid only if it NAMES its
 * defense: either `defended_by_gate` in the known-gate allowlist, OR a non-empty
 * `fitness_function`/`fitness_functions` (a single feature-level obligation). A
 * platform NFR carrying neither is a violation (you cannot tier something to
 * platform to make it disappear). Product/untiered NFRs never reach this branch.
 */
export function checkPlatformNfrDefended(architectureJson: string, knownGates: ReadonlySet<string> = PLATFORM_NFR_GATES): ConformanceResult {
  let arch: { nfrs?: Array<{ id?: string; brief?: string; requirement?: string; tier?: string; defended_by_gate?: unknown; fitness_function?: unknown; fitness_functions?: unknown }> };
  try {
    arch = JSON.parse(architectureJson);
  } catch {
    return { ok: true }; // invalid architecture reported elsewhere
  }
  const violations: string[] = [];
  for (const n of arch.nfrs ?? []) {
    if (!n || n.tier !== "platform") continue;
    const label = (typeof n.id === "string" && n.id) || (typeof n.brief === "string" && n.brief) || (typeof n.requirement === "string" && n.requirement) || "(unnamed NFR)";
    const gate = typeof n.defended_by_gate === "string" ? n.defended_by_gate.trim() : "";
    const hasSingular = typeof n.fitness_function === "string" && n.fitness_function.trim().length > 0;
    const hasArray = Array.isArray(n.fitness_functions) && (n.fitness_functions as unknown[]).some((c) => typeof c === "string" && c.trim().length > 0);
    if (gate && knownGates.has(gate)) continue; // defended by a known deterministic gate
    if (hasSingular || hasArray) continue; // defended by a feature-level fitness obligation
    if (gate && !knownGates.has(gate)) {
      violations.push(`platform NFR ${label} names defended_by_gate:"${gate}" which is not a known deterministic gate (known: ${[...knownGates].join(", ")}); name a real gate or give it a feature-level fitness_function`);
    } else {
      violations.push(`platform NFR ${label} names no defense: a tier:"platform" NFR must set defended_by_gate (one of: ${[...knownGates].join(", ")}) OR a feature-level fitness_function — it is defended once, but never dropped`);
    }
  }
  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}

/**
 * DB-design coverage (the DBA's cross-check, the physical counterpart to
 * checkPersistenceCoverage): a service_backed feature's DBA produces
 * db-design.json realizing the architect's contract. It must (1) exist + parse,
 * (2) declare >=1 table, and (3) list EVERY architecture.json
 * persistence_invariant id in `realizes_invariants[]` (the physical design that
 * enforces each declared guarantee). The architect still OWNS the invariants; the
 * DBA realizes them, so an uncovered invariant is an unrealized guarantee. A
 * not-service_backed feature is exempt (db-design may be empty/absent), the same
 * posture as persistence_invariants. The spec gate hard-blocks on a violation.
 */
export function checkDbDesign(dbDesignJson: string | undefined, architectureJson: string): ConformanceResult {
  let arch: { service_backed?: boolean; persistence_invariants?: Array<{ id?: string }> };
  try {
    arch = JSON.parse(architectureJson);
  } catch {
    return { ok: true }; // invalid architecture reported elsewhere
  }
  if (arch.service_backed !== true) return { ok: true };
  const invariants = (arch.persistence_invariants ?? [])
    .filter((i) => i && typeof i.id === "string" && i.id.length > 0)
    .map((i) => i.id as string);
  // A service does not always mean a database. When the feature declares NO
  // persistence_invariants it is a non-persisting service (compute / proxy /
  // external-API aggregator): there is nothing to physically realize, so
  // db-design is optional (the DBA is skipped). persistence_invariants, not
  // service_backed, is the source of truth for "has a database". The safety net
  // against a truly-persisting feature under-declaring lives in
  // checkServiceBackedDeclaration (Infra AC / storage NFR forces invariants).
  if (invariants.length === 0) return { ok: true };
  if (dbDesignJson === undefined) {
    return {
      ok: false,
      violations: [
        `feature declares persistence_invariants but has no db-design.json (the DBA runs after the architect and before the ` +
          `test-strategist to realize the schema; declare >=1 table and realize every persistence_invariant; ` +
          `see db-design.schema.json + agents/dba.md)`,
      ],
    };
  }
  let db: { tables?: unknown[]; realizes_invariants?: string[] };
  try {
    db = JSON.parse(dbDesignJson);
  } catch (err) {
    return { ok: false, violations: [`db-design.json is not valid JSON: ${err instanceof Error ? err.message : String(err)}`] };
  }
  const violations: string[] = [];
  if (!Array.isArray(db.tables) || db.tables.length === 0) {
    violations.push(
      `db-design.json declares no tables[] but the feature declares persistence_invariants (it persists data, so it has >=1 table; see agents/dba.md)`,
    );
  }
  const realized = new Set((db.realizes_invariants ?? []).filter((x): x is string => typeof x === "string" && x.length > 0));
  const uncovered = invariants.filter((id) => !realized.has(id));
  if (uncovered.length > 0) {
    violations.push(
      `persistence_invariant(s) not realized by db-design.json realizes_invariants[]: ${uncovered.join(", ")} ` +
        `(the DBA must physically realize every invariant the architect declared – a table/column/constraint/index – ` +
        `and list its id here; see agents/dba.md)`,
    );
  }
  return violations.length > 0 ? { ok: false, violations } : { ok: true };
}

/**
 * Story independence (design-gate enforcement): in a feature with >1 story, every
 * story AFTER the first must record `independence.distinct_from_prior: true` with a
 * non-empty rationale on its story.json. A later story whose behavior an earlier
 * story already builds (S2 subset of S1) has no honest RED and stalls the build as
 * a cycle-stall; recording the determination forces the Spec Author to apply the
 * story-independence test and gives the HIL a reject surface. The first story (the
 * lowest S-number present) has no prior and is exempt. A single-story feature is a
 * no-op. Deterministic on PRESENCE; correctness of the rationale is the model's +
 * HIL's call.
 */
export function checkStoryIndependence(
  stories: Array<{ name: string; content: string }>,
  /**
   * When set, judge ONLY the story whose name (or S-id) matches, still using the
   * full set to know its priors (and thus whether it is the first). This is the
   * per-story spec-gate scope: at story S's own gate, a later, not-yet-designed
   * sibling stub that lacks independence must not fault S's gate. When omitted,
   * every non-first story is judged (the full-feature ship-gate scope).
   */
  targetStory?: string,
): ConformanceResult {
  const parsed: Array<{ name: string; id: string; num: number; indep: unknown }> = [];
  for (const s of stories) {
    let obj: { id?: unknown; independence?: unknown };
    try {
      obj = JSON.parse(s.content);
    } catch {
      continue; // malformed JSON is reported by the schema check elsewhere
    }
    const idForNum = typeof obj.id === "string" ? obj.id : s.name;
    const m = /^S(\d+)/.exec(idForNum);
    if (!m) continue;
    parsed.push({ name: s.name, id: idForNum, num: parseInt(m[1], 10), indep: obj.independence });
  }
  if (parsed.length < 2) return { ok: true }; // nothing to be independent OF
  const firstNum = Math.min(...parsed.map((p) => p.num));
  const violations: string[] = [];
  for (const p of parsed) {
    // Story-scoped: judge only the target story (matched by dir name or S-id),
    // still counting all siblings for first-ness. A non-matching target is a
    // no-op (nothing to judge at this story's gate).
    if (targetStory !== undefined && p.name !== targetStory && p.id !== targetStory) continue;
    if (p.num === firstNum) continue; // first story has no prior
    const i = p.indep as { distinct_from_prior?: unknown; rationale?: unknown } | undefined;
    if (!i || typeof i !== "object") {
      violations.push(
        `${p.name}: missing independence determination (every story after the first must record ` +
          `independence.distinct_from_prior + rationale; apply the story-independence test, or fold/re-scope it)`,
      );
    } else if (i.distinct_from_prior !== true) {
      violations.push(
        `${p.name}: independence.distinct_from_prior is not true (this story's behavior is a subset of an earlier ` +
          `story; fold it into that story or re-scope it to a distinct, independently-RED-able slice)`,
      );
    } else if (typeof i.rationale !== "string" || i.rationale.trim().length === 0) {
      violations.push(`${p.name}: independence.rationale is empty (state the distinct behavior this story adds beyond the prior stories)`);
    }
  }
  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}

/**
 * AC independence (design-gate enforcement), the per-story counterpart to
 * checkStoryIndependence: within ONE story, every AC after the first must record
 * `independence.distinct_from_prior: true` + a rationale on its ac.json. An AC
 * whose `then` an earlier AC's build already delivers (AC3 confirmation-shown
 * subset of AC2 submit-flow) is green-on-arrival and stalls the build as a
 * test-list-drift. The first AC (lowest AC-number present) has no prior and is
 * exempt; a single-AC story is a no-op. `acs` are the AC files of ONE story.
 */
export function checkAcIndependence(acs: Array<{ name: string; content: string }>): ConformanceResult {
  const parsed: Array<{ name: string; num: number; indep: unknown }> = [];
  for (const a of acs) {
    let obj: { id?: unknown; independence?: unknown };
    try {
      obj = JSON.parse(a.content);
    } catch {
      continue; // malformed JSON reported by the schema check elsewhere
    }
    const idForNum = typeof obj.id === "string" ? obj.id : a.name;
    const m = /^AC(\d+)/.exec(idForNum);
    if (!m) continue;
    parsed.push({ name: typeof obj.id === "string" ? obj.id : a.name, num: parseInt(m[1], 10), indep: obj.independence });
  }
  if (parsed.length < 2) return { ok: true };
  const firstNum = Math.min(...parsed.map((p) => p.num));
  const violations: string[] = [];
  for (const p of parsed) {
    if (p.num === firstNum) continue;
    const i = p.indep as { distinct_from_prior?: unknown; rationale?: unknown } | undefined;
    if (!i || typeof i !== "object") {
      violations.push(
        `${p.name}: missing independence determination (every AC after the first must record ` +
          `independence.distinct_from_prior + rationale; apply the AC-independence test, or fold/re-scope it)`,
      );
    } else if (i.distinct_from_prior !== true) {
      violations.push(
        `${p.name}: independence.distinct_from_prior is not true (this AC's outcome is already delivered by an ` +
          `earlier AC; fold it into that AC or re-scope it to a distinct, independently-RED-able outcome)`,
      );
    } else if (typeof i.rationale !== "string" || i.rationale.trim().length === 0) {
      violations.push(`${p.name}: independence.rationale is empty (state the distinct outcome this AC adds beyond the earlier ACs)`);
    }
  }
  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}

/**
 * Persistence-invariant coverage must be DISTINCT across stories (test_list-gate
 * enforcement, the cross-story counterpart to checkPersistenceCoverage). A
 * declared persistence_invariant is realized ONCE by the feature's schema (the
 * migration that creates the constraint) and belongs to a fitness test in
 * EXACTLY ONE story: the story whose migration realizes it (by convention the
 * earliest story that references it). A later story re-emitting a fitness item
 * for an invariant an earlier story already covers is a redundant re-test. It
 * duplicates the earlier story's DB assertion, invites drift (the two copies
 * diverge: one asserts the field-named validation message, the other only the
 * raw rejection, which then dead-locks the reflect gate), and is the persistence
 * face of the story-overlap (S2 subset of S1) that checkStoryIndependence guards
 * at the story level. The owner is the lowest-S-number story carrying the
 * invariant; later stories must DROP the duplicate fitness item, or, if their
 * migration adds a NEW invariant, cover that instead. `perStory` is each story's
 * id plus the invariant_ids its fitness items reference. Pure. A feature with one
 * story, or no repeated invariant, is a no-op.
 */
export function checkInvariantCoverageDistinct(
  perStory: Array<{ story: string; invariantIds: string[] }>,
  /** OPTIONAL invariant_id -> the story that REALIZES it (its table's create/alter migration),
   *  derived from db-design (invariantRealizingStory). When present, ownership is REALIZATION, not
   *  story order: a fitness item on a story that does NOT realize the invariant is the violation
   *  (even when that story sorts FIRST – the display-only-S1-front-loads-S2's-invariant defect), and
   *  the fix is to move it to the realizing story, not to keep it on the earliest. When absent, falls
   *  back to the earliest-S-number heuristic (a story-order proxy for "who realizes it"). */
  ownerByInvariant?: Map<string, string>,
): ConformanceResult {
  // invariant_id -> the stories (with S-number) whose fitness items reference it.
  const carriers = new Map<string, Array<{ story: string; num: number }>>();
  for (const s of perStory) {
    const m = /^S(\d+)/.exec(s.story);
    const num = m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
    for (const inv of new Set(s.invariantIds)) {
      if (!inv) continue;
      const arr = carriers.get(inv) ?? [];
      arr.push({ story: s.story, num });
      carriers.set(inv, arr);
    }
  }
  const violations: string[] = [];
  for (const [inv, stories] of carriers) {
    const realizer = ownerByInvariant?.get(inv);
    if (realizer && stories.some((s) => s.story !== realizer)) {
      // REALIZATION-based ownership: every carrier that is NOT the realizing story is mis-anchored ,
      // its migration/table does not exist there. This fires even for a SINGLE carrier (a display-only
      // story holding a write-story's invariant), which the earliest-wins path silently accepted.
      const owns = stories.some((s) => s.story === realizer);
      for (const c of stories) {
        if (c.story === realizer) continue;
        violations.push(
          `${c.story} carries persistence invariant ${inv} but does NOT realize it – its table/migration ` +
            `is introduced by ${realizer} (db-design schema_changes). Move the ${inv} fitness item to ${realizer}` +
            `${owns ? "" : " (which must add it)"}; a display/read-only story cannot test an invariant whose ` +
            `table it never creates. Anchor by the realizing story, not AC keyword proximity.`,
        );
      }
      continue;
    }
    if (stories.length < 2) continue;
    // Fallback (no db-design owner map): earliest-S-number heuristic – the lowest story owns it.
    const sorted = [...stories].sort((a, b) => a.num - b.num || a.story.localeCompare(b.story));
    const owner = sorted[0].story;
    for (const later of sorted.slice(1)) {
      violations.push(
        `${later.story} re-tests persistence invariant ${inv} already covered by ${owner}. ` +
          `A persistence invariant is realized once per feature and belongs to exactly one story's fitness tests; ` +
          `drop the duplicate fitness item(s) from ${later.story}. If ${later.story}'s migration adds a NEW ` +
          `invariant, cover that new invariant instead.`,
      );
    }
  }
  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}

/**
 * Resolve invariant_id -> the story that REALIZES it, from architecture (invariant -> table) joined to
 * db-design schema_changes (story -> the table it creates/alters). An invariant belongs to the FIRST
 * story whose migration touches its table (create_table, else the earliest add_column/alter/constraint
 * on it). This is the single source of ownership truth the coverage check, the analyst, and the spec
 * gate all key off – replacing "earliest story that happens to name it". Returns an empty map when the
 * inputs are absent/unparseable or no invariant has a resolvable table (the checker then falls back).
 */
export function invariantRealizingStory(
  architectureJson: string | undefined,
  dbDesignJson: string | undefined,
): Map<string, string> {
  const out = new Map<string, string>();
  if (!architectureJson || !dbDesignJson) return out;
  let arch: { persistence_invariants?: Array<{ id?: string; table?: string }> };
  let db: { schema_changes?: Array<{ story_id?: string; kind?: string; table?: string }> };
  try {
    arch = JSON.parse(architectureJson);
    db = JSON.parse(dbDesignJson);
  } catch {
    return out;
  }
  const changes = (db.schema_changes ?? []).filter(
    (c): c is { story_id: string; kind: string; table: string } =>
      !!c && typeof c.story_id === "string" && typeof c.kind === "string" && typeof c.table === "string",
  );
  const sNum = (s: string): number => {
    const m = /^S(\d+)/.exec(s);
    return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
  };
  // Per table: the realizing story = the create_table story if any, else the earliest story that alters it.
  const tableRealizer = new Map<string, string>();
  for (const table of new Set(changes.map((c) => c.table))) {
    const forTable = changes.filter((c) => c.table === table);
    const creator = forTable.find((c) => c.kind === "create_table");
    const realizer = creator
      ? creator.story_id
      : [...forTable].sort((a, b) => sNum(a.story_id) - sNum(b.story_id))[0]?.story_id;
    if (realizer) tableRealizer.set(table, realizer);
  }
  for (const inv of arch.persistence_invariants ?? []) {
    if (!inv || typeof inv.id !== "string" || typeof inv.table !== "string") continue;
    const realizer = tableRealizer.get(inv.table);
    if (realizer) out.set(inv.id, realizer);
  }
  return out;
}

/**
 * Guard the ROOT cause of the persistence-invariant reflect loop: a db-design that attributes a
 * `create_table` to a story whose ACs are ALL non-persisting (a pure UI/E2E shell, no API/Infra
 * layer). Such a story cannot realize a table – it has no data-layer AC that needs one – so
 * `invariantRealizingStory` (which trusts db-design) resolves the invariant's owner to the shell
 * story, the fitness analyst dutifully anchors its PI tests there, and only the navigator reflect
 * gate (which reads the shell story's ACs) catches it – then bounces the whole design lane back to
 * the architect + test-strategist. Catching the mis-attribution HERE turns that round-trip into a
 * deterministic, correctly-routed db-design error (owner: DBA/architect) BEFORE the build lane.
 *
 * `schemaChanges` = db-design `schema_changes[]`; `storyLayers` = each story's AC `layer`s. A story
 * "can realize a table" iff it has >=1 AC whose layer is not E2E (i.e. an API or Infra boundary).
 * Only `create_table` is checked (the moment a table is introduced); a story unknown to
 * `storyLayers` is skipped (reported by the AC-conformance check). Pure. No create_table, or every
 * attribution valid => ok.
 */
export function checkSchemaChangeStoryRealizes(
  schemaChanges: Array<{ story_id?: string; kind?: string; table?: string }>,
  storyLayers: Map<string, string[]>,
): ConformanceResult {
  const canRealize = (story: string): boolean =>
    (storyLayers.get(story) ?? []).some((l) => l.toUpperCase() !== "E2E");
  const violations: string[] = [];
  const seen = new Set<string>();
  for (const c of schemaChanges) {
    if (!c || c.kind !== "create_table" || typeof c.story_id !== "string" || typeof c.table !== "string") continue;
    if (!storyLayers.has(c.story_id)) continue; // unknown story – reported by the AC-conformance check
    const key = `${c.story_id}::${c.table}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!canRealize(c.story_id)) {
      violations.push(
        `db-design attributes create_table ${c.table} to ${c.story_id}, whose ACs are all non-persisting ` +
          `(UI/E2E shell – no API/Infra layer). A scaffold/shell story cannot realize a table it has no data AC ` +
          `for. Attribute the create_table (and the invariants it realizes) to the story that first reads/writes ` +
          `${c.table}; a shell story gets no schema_changes. (This is the mis-anchoring the navigator reflect gate ` +
          `otherwise bounces back through the whole design lane.)`,
      );
    }
  }
  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}

/**
 * Map a file path to the canonical artifact name the registry is keyed by.
 * Acceptance-criteria files are named <AC>.json/.md but share the "ac.json"
 * contract, so any *.json under an `acs/` directory normalizes to "ac.json".
 * Everything else uses its basename.
 */
export function canonicalArtifactName(path: string): string {
  const base = basename(path);
  if (basename(dirname(path)) === "acs" && base.endsWith(".json")) return "ac.json";
  return base;
}

export interface FeatureConformanceEntry {
  /** Path relative to consortDir, for display. */
  artifact: string;
  ok: boolean;
  violations: string[];
}

export interface FeatureConformanceReport {
  featureId: string;
  /** True when every checked artifact conforms. Missing artifacts are not failures. */
  ok: boolean;
  entries: FeatureConformanceEntry[];
}

/**
 * Scan a feature's on-disk artifacts and check each that EXISTS against its
 * declared format. Existence (Layer 1) is intentionally not enforced here: a
 * feature mid-design legitimately lacks plan.json / test-list.json. This
 * answers "do the artifacts that exist adhere to their format?". The standalone
 * counterpart to the gate-time check the human-proxy runs.
 */
export function scanFeatureConformance(consortDir: string, featureId: string): FeatureConformanceReport {
  const featuresDir = featuresDirOf(consortDir);
  const candidates = existsSync(featuresDir)
    ? readdirSync(featuresDir).filter((d) => d.startsWith(featureId))
    : [];
  if (candidates.length === 0) {
    throw new Error(`feature ${featureId} not found under ${featuresDir}`);
  }
  const featureDir = join(featuresDir, candidates[0]);

  const paths: string[] = [];
  const pushIfExists = (p: string): void => {
    if (existsSync(p)) paths.push(p);
  };

  // Top-level Product Owner project overview.
  pushIfExists(join(consortDir, "product-overview.md"));
  // HIL NFR brief: project-level + optional per-feature override.
  pushIfExists(join(consortDir, "nfrs.md"));
  // Project-level UX Designer artifacts (UI projects; absent otherwise).
  for (const name of ["design-brief.md", "design-guide.md", "design-guide.json", "ia.md"]) {
    pushIfExists(join(consortDir, "design", name));
  }
  // Feature-level artifacts.
  for (const name of ["feature-request.md", "feature-spec.json", "feature-spec.md", "nfrs.md", "architecture.md", "db-design.json", "plan.json", "test-list.json", "test-list.md"]) {
    pushIfExists(join(featureDir, name));
  }
  // Stories + their acceptance criteria.
  const storiesDir = join(featureDir, "stories");
  const storyJsons: Array<{ name: string; content: string }> = [];
  const acsByStory: Array<{ story: string; acs: Array<{ name: string; content: string }> }> = [];
  if (existsSync(storiesDir)) {
    for (const storyName of readdirSync(storiesDir)) {
      const storyDir = join(storiesDir, storyName);
      if (!statSync(storyDir).isDirectory()) continue;
      const storyJsonPath = join(storyDir, "story.json");
      pushIfExists(storyJsonPath);
      if (existsSync(storyJsonPath)) {
        try {
          storyJsons.push({ name: storyName, content: readFileSync(storyJsonPath, "utf8") });
        } catch { /* unreadable reported by schema check */ }
      }
      const acsDir = join(storyDir, "acs");
      if (existsSync(acsDir)) {
        const acs: Array<{ name: string; content: string }> = [];
        for (const acFile of readdirSync(acsDir).filter((f) => f.endsWith(".json"))) {
          const acPath = join(acsDir, acFile);
          paths.push(acPath);
          try {
            acs.push({ name: acFile.replace(/\.json$/, ""), content: readFileSync(acPath, "utf8") });
          } catch { /* unreadable reported by schema check */ }
        }
        if (acs.length > 0) acsByStory.push({ story: storyName, acs });
      }
    }
  }

  const entries: FeatureConformanceEntry[] = paths.map((p) => {
    const content = readFileSync(p, "utf8");
    const result = checkArtifactConformance(canonicalArtifactName(p), content);
    return {
      artifact: p.startsWith(consortDir) ? p.slice(consortDir.length).replace(/^\//, "") : p,
      ok: result.ok,
      violations: result.ok ? [] : result.violations,
    };
  });

  // Cross-artifact story independence: a feature with >1 story must record, on
  // every story after the first, that it delivers behavior an earlier story does
  // not (story-independence test). Prevents the S2-subset-of-S1 overlap that
  // surfaces mid-build as a born-green behavior cycle-stall.
  if (storyJsons.length >= 2) {
    const indep = checkStoryIndependence(storyJsons);
    entries.push({
      artifact: "stories/*/story.json (story independence)",
      ok: indep.ok,
      violations: indep.ok ? [] : indep.violations,
    });
  }

  // Cross-artifact AC independence (per story): within a story, every AC after
  // the first must record that its outcome is not already delivered by an earlier
  // AC. Prevents the AC3-subset-of-AC2 overlap that surfaces mid-build as a
  // test-list-drift / born-green behavior cycle-stall.
  for (const { story, acs } of acsByStory) {
    if (acs.length < 2) continue;
    const indep = checkAcIndependence(acs);
    entries.push({
      artifact: `stories/${story}/acs/*.json (AC independence)`,
      ok: indep.ok,
      violations: indep.ok ? [] : indep.violations,
    });
  }

  // Cross-artifact NFR coverage: once architecture.json exists, every Required
  // NFR in the HIL's nfrs.md (project-level + optional per-feature) must be
  // covered by a brief_ref. Skipped until architecture.json is produced (a
  // feature mid-design legitimately lacks it). Per-feature nfrs.md extends the
  // project one, so both are checked against this feature's architecture.json.
  const archPath = join(featureDir, "architecture.json");
  if (existsSync(archPath)) {
    const archContent = readFileSync(archPath, "utf8");
    // Per-feature relevance: a project Required NFR is covered when THIS feature,
    // OR any sibling feature, realizes it (or this feature scopes it out). Collect
    // sibling coverage once.
    const siblingRefs = projectBriefRefs(consortDir);
    for (const nfrsPath of [join(consortDir, "nfrs.md"), join(featureDir, "nfrs.md")]) {
      if (!existsSync(nfrsPath)) continue;
      const cov = checkNfrCoverage(readFileSync(nfrsPath, "utf8"), archContent, siblingRefs);
      const rel = nfrsPath.startsWith(consortDir) ? nfrsPath.slice(consortDir.length).replace(/^\//, "") : nfrsPath;
      entries.push({
        artifact: `${rel} -> architecture.json (NFR coverage)`,
        ok: cov.ok,
        violations: cov.ok ? [] : cov.violations,
      });
    }

    // Layered-build enforcement: a service_backed feature must declare its layers
    // (Gate 2), and its test-list must carry a fitness item (Gate 3). Both no-op
    // for a non-service-backed feature, so trivial features are exempt.
    const lay = checkLayeringDeclared(archContent);
    entries.push({
      artifact: "architecture.json (layering declared)",
      ok: lay.ok,
      violations: lay.ok ? [] : lay.violations,
    });

    // DB-design coverage: a service_backed feature's DBA produces db-design.json
    // realizing every architect-declared persistence_invariant with a physical
    // table/constraint. No-op for a non-service-backed feature.
    const dbDesignPath = join(featureDir, "db-design.json");
    const dbDesignContent = existsSync(dbDesignPath) ? readFileSync(dbDesignPath, "utf8") : undefined;
    const dbd = checkDbDesign(dbDesignContent, archContent);
    entries.push({
      artifact: "db-design.json -> architecture.json (invariant realization)",
      ok: dbd.ok,
      violations: dbd.ok ? [] : dbd.violations,
    });
    const testListPath = join(featureDir, "test-list.json");
    if (existsSync(testListPath)) {
      const testListContent = readFileSync(testListPath, "utf8");
      const fit = checkFitnessCoverage(testListContent, archContent);
      entries.push({
        artifact: "test-list.json -> architecture.json (fitness coverage)",
        ok: fit.ok,
        violations: fit.ok ? [] : fit.violations,
      });
      const persist = checkPersistenceCoverage(testListContent, archContent);
      entries.push({
        artifact: "test-list.json -> architecture.json (persistence-invariant coverage)",
        ok: persist.ok,
        violations: persist.ok ? [] : persist.violations,
      });
    }
  }

  return { featureId, ok: entries.every((e) => e.ok), entries };
}
