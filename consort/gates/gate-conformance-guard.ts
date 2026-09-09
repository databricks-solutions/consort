// Gate conformance guard: the deterministic gate CONDITION for the Consort state
// machine. Whether a gate's artifacts are complete + conformant (schema, per-AC
// shape, story/AC independence, architecture conventions, service_backed, layers,
// NFR/fitness/persistence coverage) is a property of the WORKFLOW STATE, not of
// who approves, so it lives here and is enforced on the gate-advance path. Both
// the per-story design gate (pipeline approve-gate) and the Human Proxy's
// feature-gate drain consult it, so a real human cannot advance a non-conformant
// gate any more than the headless proxy can.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import type { GateName } from "./gates.js";
import { resolveProjectSettings } from "../../consort/config/consort-config-file.js";
import {
  checkArtifactConformance,
  canonicalArtifactName,
  checkStoryIndependence,
  checkAcIndependence,
  checkLayeringDeclared,
  checkNfrCoverage,
  projectBriefRefs,
  checkFitnessCoverage,
  checkFitnessClauseCoverage,
  checkE2ECoverage,
  checkPersistenceCoverage,
  checkInvariantCoverageDistinct,
  invariantRealizingStory,
  checkSchemaChangeStoryRealizes,
  checkServiceBackedDeclaration,
  checkE2eLayerPresent,
  checkDbDesign,
} from "../../consort/orchestrator/validators/conformance/artifact-conformance.js";
import { acsForStory } from "../test-list/test-list.js";
import { featureResolved, architectureJson, dbDesignJson, nfrsMd, featureNfrsMd } from "../../consort/config/consort-paths.js";
import { readConventions, assertArchitectureConforms } from "../architecture/architecture-conventions.js";

export function featureDir(consortDir: string, featureId: string): string {
  return featureResolved(consortDir, featureId);
}

/**
 * Aggregate conformance check over a set of resolved inputs. Returns a reason
 * string listing every violation when any artifact fails its declared format,
 * or null when all conform. Layer 2 of the gate: existence (Layer 1) is
 * checked by the callers below; this enforces "does what exists conform?".
 */
function conformanceReason(inputs: Record<string, string>): string | null {
  const problems: string[] = [];
  for (const [name, content] of Object.entries(inputs)) {
    const result = checkArtifactConformance(name, content);
    if (!result.ok) problems.push(...result.violations);
  }
  return problems.length === 0 ? null : `format conformance failed: ${problems.join("; ")}`;
}

/**
 * Every per-AC file under the feature's stories must conform to ac.schema (which
 * enforces the AC<n>-<slug> id pattern + the given/when/then shape). The spec
 * gate previously validated only feature-spec.{json,md}, so a Spec Author that
 * named ACs as bare slugs (create-form-displays) or dropped malformed junk into
 * acs/ passed the gate, then broke the Test Strategist (ac_id pattern) or stalled
 * the design lane. This makes acs/ conformance a hard spec-gate condition: every
 * acs/<X>.json (canonicalized to ac.json) is validated. Returns a reason listing
 * violations, or null when all ACs conform (or none exist yet).
 */
/** The AC-conformance problems for ONE story (parse + schema + intra-story
 *  independence), scoped to `stories/<story>/acs/`. The single per-story scan both
 *  the feature-wide gate and the per-story spec-gate approval read, so a truncated
 *  or non-conformant AC is caught identically wherever it is checked. */
function storyAcProblems(fdir: string, story: string): string[] {
  const acsDir = join(fdir, "stories", story, "acs");
  if (!existsSync(acsDir)) return [];
  const problems: string[] = [];
  const acs: Array<{ name: string; content: string }> = [];
  for (const f of readdirSync(acsDir)) {
    if (!f.endsWith(".json")) continue;
    const p = join(acsDir, f);
    let content: string;
    try {
      content = readFileSync(p, "utf8");
    } catch {
      continue;
    }
    acs.push({ name: f.replace(/\.json$/, ""), content });
    // checkArtifactConformance JSON.parses first, so a truncated/invalid AC file
    // (missing closing brace) fails here with "not valid JSON" – the exact defect
    // that previously slipped past the spec + reflect gates to deploy (Finding 29).
    const r = checkArtifactConformance(canonicalArtifactName(p), content);
    if (!r.ok) problems.push(`${story}/acs/${f}: ${r.violations.join("; ")}`);
  }
  // AC independence within this story: a later AC must not be a subset of an
  // earlier one (records independence.distinct_from_prior; blocks the
  // AC3-subset-of-AC2 overlap that otherwise stalls the build).
  const indep = checkAcIndependence(acs);
  if (!indep.ok) problems.push(...indep.violations.map((v) => `${story}/acs: ${v}`));
  return problems;
}

/** Conformance reason for ONE story's ACs (Finding 29): every `acs/<X>.json` for
 *  the story must JSON-parse + conform to ac.schema. Returns a reason listing
 *  violations, or null when all conform (or none exist yet). Wired into the
 *  per-story spec-gate approval so a malformed AC is refused at approve time, not
 *  discovered at deploy gate-conformance. */
export function storyAcsConformanceReason(fdir: string, story: string): string | null {
  const problems = storyAcProblems(fdir, story);
  return problems.length === 0 ? null : `AC conformance failed: ${problems.join("; ")}`;
}

function acsConformanceReason(fdir: string): string | null {
  const stories = join(fdir, "stories");
  if (!existsSync(stories)) return null;
  const problems = readdirSync(stories).flatMap((s) => storyAcProblems(fdir, s));
  return problems.length === 0 ? null : `AC conformance failed: ${problems.join("; ")}`;
}

/**
 * Story-independence spec-gate condition: in a feature with >1 story, every story
 * after the first must record `independence.distinct_from_prior: true` + a
 * rationale on its story.json. Blocks the S2-subset-of-S1 overlap at the design
 * gate (it otherwise surfaces mid-build as a born-green behavior cycle-stall).
 * Returns a reason listing offenders, or null when all conform (or <2 stories).
 */
function collectStoryJsons(fdir: string): Array<{ name: string; content: string }> {
  const stories = join(fdir, "stories");
  if (!existsSync(stories)) return [];
  const out: Array<{ name: string; content: string }> = [];
  for (const s of readdirSync(stories)) {
    const p = join(stories, s, "story.json");
    if (!existsSync(p)) continue;
    try {
      out.push({ name: s, content: readFileSync(p, "utf8") });
    } catch {
      continue;
    }
  }
  return out;
}

function storyIndependenceReason(fdir: string): string | null {
  const r = checkStoryIndependence(collectStoryJsons(fdir));
  return r.ok ? null : `story independence failed: ${r.violations.join("; ")}`;
}

/**
 * Story-SCOPED independence check for the per-story spec gate: judge ONLY the
 * story being gated (using its siblings for first-ness), so a story missing its
 * independence determination fails at ITS OWN spec gate instead of slipping to
 * the full-feature ship gate 50 turns later. The per-story counterpart of
 * storyAcsConformanceReason; the whole-feature storyIndependenceReason stays the
 * ship-gate backstop. Returns a reason, or null when the target conforms / is the
 * first story / is not present.
 */
export function storyIndependenceForStoryReason(fdir: string, story: string): string | null {
  const r = checkStoryIndependence(collectStoryJsons(fdir), story);
  return r.ok ? null : `story independence failed: ${r.violations.join("; ")}`;
}

/**
 * requires_e2e spec-gate condition (HUMAN-authoritative, per-story): a story whose
 * story.json sets `requires_e2e: true` MUST carry >=1 `layer:"E2E"` AC. This is the
 * flatten-PROOF lever for a client-facing story the design lane keeps collapsing into a
 * backend "the record is saved" API AC. Everything else we can steer with is agent-derived
 * – the AC layer tags, the architect's renders_via, prose in story.md – and the design lane
 * flattens its own classification. `requires_e2e` is set by the HUMAN/PO on the story, so the
 * design lane cannot override it: a flagged story with no E2E AC HARD-BLOCKS (fail-closed)
 * instead of opening on a backend-only spec. Complements the FEATURE-wide checkE2eLayerPresent
 * (which a sibling story's E2E AC can satisfy); this is PER-story, so it bites even when other
 * stories carry the E2E – the sub-case checkE2eLayerPresent cannot see. Null when the story is
 * unflagged / already has an E2E AC / is absent / is malformed (its own conformance check
 * catches malformed).
 */
export function storyRequiresE2eReason(fdir: string, story: string): string | null {
  const sj = join(fdir, "stories", story, "story.json");
  if (!existsSync(sj)) return null;
  try {
    if ((JSON.parse(readFileSync(sj, "utf8")) as { requires_e2e?: unknown }).requires_e2e !== true) return null;
  } catch {
    return null; // a malformed story.json is reported by its own conformance check
  }
  const ad = join(fdir, "stories", story, "acs");
  if (existsSync(ad)) {
    for (const f of readdirSync(ad)) {
      if (!f.endsWith(".json")) continue;
      try {
        if ((JSON.parse(readFileSync(join(ad, f), "utf8")) as { layer?: string }).layer === "E2E") return null;
      } catch {
        /* a malformed AC is caught by acsConformanceReason */
      }
    }
  }
  return (
    `story ${story} sets requires_e2e:true but no acceptance criterion is tagged layer:"E2E" – the client<->server ` +
    `interaction this story exists for (a form submit + its confirmation, an inline validation the client renders) must be ` +
    `an E2E AC verified by a real Playwright test, NOT flattened into a backend "the record is saved" API AC. Add a ` +
    `client-submit AC tagged layer:"E2E" (a mocked component test cannot verify the real wire contract)`
  );
}

/**
 * Feature-wide backstop for the per-story requires_e2e check: apply it to every DESIGNED
 * story (one with an acs/ dir), so a flagged story that slipped its per-story gate still
 * blocks the ship gate. Defers on a not-yet-designed flagged story (no acs/ yet – the
 * streaming design lane may not have authored it), the same way the other feature-wide
 * checks tolerate a partially-designed feature.
 */
function requiresE2eReason(consortDir: string, featureId: string): string | null {
  const fdir = featureDir(consortDir, featureId);
  const storiesDir = join(fdir, "stories");
  if (!existsSync(storiesDir)) return null;
  for (const s of readdirSync(storiesDir)) {
    if (!existsSync(join(storiesDir, s, "acs"))) continue; // not designed yet – defer
    const r = storyRequiresE2eReason(fdir, s);
    if (r !== null) return r;
  }
  return null;
}

/**
 * Architecture-conventions spec-gate condition: once the project canon is
 * established (.tdd/architecture/conventions.json, set by the first service-
 * backed feature), every LATER feature's architecture.json must reuse the same
 * role -> module layout (and rendering framework). Returns a reason listing the
 * divergences, or null when it conforms / no conventions exist yet / the feature
 * has no architecture.json. Hard-blocks the spec gate so a divergent layout never
 * reaches build (where it would mismatch the inherited code + trip the layering
 * gate's module-placement check).
 */
function architectureConventionsReason(consortDir: string, featureId: string): string | null {
  const conventions = readConventions(consortDir);
  if (!conventions) return null; // first feature / nothing established yet
  const archFile = architectureJson(consortDir, featureId);
  if (!existsSync(archFile)) return null; // architecture not produced yet
  let content: string;
  try {
    content = readFileSync(archFile, "utf8");
  } catch {
    return null;
  }
  const r = assertArchitectureConforms(conventions, content);
  return r.ok ? null : `architecture conventions failed: ${r.violations.join("; ")}`;
}

/** Read architecture.json content for the feature, or undefined when absent. */
function readArchitecture(consortDir: string, featureId: string): string | undefined {
  const f = architectureJson(consortDir, featureId);
  if (!existsSync(f)) return undefined;
  try {
    return readFileSync(f, "utf8");
  } catch {
    return undefined;
  }
}

/**
 * Layering-declaration spec-gate condition (closes the "checkLayeringDeclared
 * hard-blocks Gate 2" claim that was previously unwired): a service_backed
 * feature MUST declare layered `layers` (boundary -> service -> repository) in
 * architecture.json. A trivial (non-service-backed) feature is exempt (the YAGNI
 * guard). Null when it conforms / architecture not produced yet.
 */
function layeringDeclaredReason(consortDir: string, featureId: string): string | null {
  const arch = readArchitecture(consortDir, featureId);
  if (arch === undefined) return null;
  const r = checkLayeringDeclared(arch);
  return r.ok ? null : `layering declaration failed: ${r.violations.join("; ")}`;
}

/**
 * DB-design spec-gate condition (the DBA's realization of the architect's
 * persistence contract): once architecture.json exists, a service_backed feature
 * MUST have a db-design.json that declares >=1 table and realizes every declared
 * persistence_invariant. A trivial (non-service-backed) feature is exempt. Null
 * when it conforms / architecture not produced yet.
 */
function dbDesignReason(consortDir: string, featureId: string): string | null {
  const arch = readArchitecture(consortDir, featureId);
  if (arch === undefined) return null;
  const dbFile = dbDesignJson(consortDir, featureId);
  const db = existsSync(dbFile) ? (() => { try { return readFileSync(dbFile, "utf8"); } catch { return undefined; } })() : undefined;
  const r = checkDbDesign(db, arch);
  return r.ok ? null : `db-design failed: ${r.violations.join("; ")}`;
}

/**
 * NFR-coverage spec-gate condition (closes the "checkNfrCoverage hard-blocks the
 * architecture gate" claim that was previously unwired): every `## Required`
 * R<n> item in the HIL's nfrs.md must be covered by an architecture.json nfr via
 * a matching brief_ref. Uses the feature-level nfrs.md override when present,
 * else the project nfrs.md. Null when covered / no nfrs.md / no architecture yet.
 */
function nfrCoverageReason(consortDir: string, featureId: string): string | null {
  const arch = readArchitecture(consortDir, featureId);
  if (arch === undefined) return null;
  const featureNfrs = featureNfrsMd(consortDir, featureId);
  const projectNfrs = nfrsMd(consortDir);
  const nfrsFile = existsSync(featureNfrs) ? featureNfrs : existsSync(projectNfrs) ? projectNfrs : undefined;
  if (nfrsFile === undefined) return null; // no NFR brief -> nothing Required to cover
  let nfrsContent: string;
  try {
    nfrsContent = readFileSync(nfrsFile, "utf8");
  } catch {
    return null;
  }
  // Per-feature relevance: a project Required NFR is covered when THIS feature,
  // any sibling feature, or an explicit nfr_out_of_scope declaration realizes it,
  // so a feature that touches no code a project-wide NFR governs is not forced to
  // manufacture nominal coverage (it is upheld by the feature that owns it).
  const r = checkNfrCoverage(nfrsContent, arch, projectBriefRefs(consortDir));
  if (r.ok) return null;
  // Name WHICH nfrs.md (feature override vs project) + that this HARD-BLOCKS the spec gate, so the
  // HIL/agent sees the exact uncovered Required NFR and where it was declared – the architect must add
  // a matching brief_ref (or nfr_out_of_scope) before the gate opens.
  const src = nfrsFile === featureNfrs ? `per-feature nfrs.md (features/${featureId}/nfrs.md)` : "project nfrs.md";
  return `NFR coverage HARD-BLOCK (spec gate): architecture.json does not cover every ## Required NFR in the ${src} – ${r.violations.join("; ")}. Add a matching brief_ref on architecture.json (or declare nfr_out_of_scope).`;
}

/**
 * Fitness-coverage test_list-gate condition (closes the "checkFitnessCoverage
 * hard-blocks Gate 3" claim that was previously unwired): a service_backed/
 * layered feature's test-list must have >=1 kind:"fitness" item (the
 * architectural regression guard). A trivial feature is exempt. Null when
 * covered / no test-list or architecture yet.
 */
function fitnessCoverageReason(consortDir: string, featureId: string, testListJson: string): string | null {
  const arch = readArchitecture(consortDir, featureId);
  if (arch === undefined) return null;
  const r = checkFitnessCoverage(testListJson, arch);
  return r.ok ? null : `fitness coverage failed: ${r.violations.join("; ")}`;
}

/**
 * Per-CLAUSE fitness-coverage test_list-gate condition: an NFR declared in the
 * ATOMIC `fitness_functions` array form must have one covering test per clause
 * (each tagged with the NFR's `id` via `nfr_id`). Fires ONLY for NFRs on the array
 * form (back-compatible with the singular `fitness_function`), giving deterministic
 * teeth so a multi-part NFR is defended clause-by-clause instead of being surfaced
 * one-uncovered-clause-per-lap by the reflect. Null when covered / no test-list or
 * architecture yet.
 */
function fitnessClauseCoverageReason(consortDir: string, featureId: string, testListJson: string): string | null {
  const arch = readArchitecture(consortDir, featureId);
  if (arch === undefined) return null;
  const r = checkFitnessClauseCoverage(testListJson, arch);
  return r.ok ? null : `atomic fitness-clause coverage failed: ${r.violations.join("; ")}`;
}

/**
 * E2E-coverage test_list-gate condition: every AC tagged `layer:"E2E"` (a client<->server
 * contract – the client rendering a REAL server response) MUST have a real Playwright e2e in the
 * test-list (scenario_file under an `e2e/` path), never only a mocked component test whose
 * fabricated response envelope drifts from the real wire contract. Makes test-strategy.md's E2E
 * rule a DETERMINISTIC gate (was prose the supervisor was asked to catch), closing the recurring
 * S2/S3 inline-error defect. Collects `layer:"E2E"` AC ids by the same per-story acs walk
 * serviceBackedReason uses. Null when covered / no E2E-layer AC / no test-list.
 */
function e2eCoverageReason(consortDir: string, featureId: string, testListJson: string): string | null {
  const storiesDir = join(featureDir(consortDir, featureId), "stories");
  if (!existsSync(storiesDir)) return null;
  const e2eAcIds: string[] = [];
  for (const s of readdirSync(storiesDir)) {
    const ad = join(storiesDir, s, "acs");
    if (!existsSync(ad)) continue;
    for (const f of readdirSync(ad)) {
      if (!f.endsWith(".json")) continue;
      try {
        const ac = JSON.parse(readFileSync(join(ad, f), "utf8")) as { id?: string; layer?: string };
        if (ac.layer === "E2E") e2eAcIds.push(ac.id ?? f.replace(/\.json$/, ""));
      } catch {
        /* a malformed AC is caught by acsConformanceReason */
      }
    }
  }
  const r = checkE2ECoverage(testListJson, e2eAcIds);
  return r.ok ? null : `E2E coverage failed: ${r.violations.join("; ")}`;
}

/**
 * Persistence-coverage test_list-gate condition: a service_backed feature's
 * architecture must declare its persistence_invariants[] and the test-list must
 * cover each (an item referencing its invariant_id), so every DB-level guarantee
 * gets a real-branch test tied to the schema's own contract – not a blunt quota,
 * and not a re-test of the ORM. Trivial features are exempt. Null when covered /
 * no test-list or architecture yet.
 */
function persistenceCoverageReason(consortDir: string, featureId: string, testListJson: string): string | null {
  const arch = readArchitecture(consortDir, featureId);
  if (arch === undefined) return null;
  const r = checkPersistenceCoverage(testListJson, arch);
  return r.ok ? null : `persistence coverage failed: ${r.violations.join("; ")}`;
}

/**
 * Distinct-invariant-coverage test_list-gate condition (the cross-story
 * counterpart to persistenceCoverageReason): a declared persistence_invariant
 * belongs to exactly ONE story's fitness tests. A later story re-emitting a
 * fitness item for an invariant an earlier story already covers is a redundant
 * re-test that drifts (one copy asserts the field-named message, the other only
 * the raw rejection) and dead-locks the reflect gate; it is the persistence face
 * of the S2-subset-of-S1 story overlap. Maps each item's invariant_id to its
 * story via the acs/ dirs (the same ac->story membership scopeToStory uses), then
 * hard-blocks a duplicated invariant. Null when distinct / no test-list.
 */
function invariantCoverageDistinctReason(consortDir: string, featureId: string, testListJson: string): string | null {
  let master: { items?: Array<{ ac_id?: string; invariant_id?: string }> };
  try {
    master = JSON.parse(testListJson);
  } catch {
    return null; // bad JSON reported by conformanceReason
  }
  const items = master.items ?? [];
  const storiesDir = join(featureDir(consortDir, featureId), "stories");
  if (!existsSync(storiesDir)) return null;
  const perStory = readdirSync(storiesDir)
    .filter((s) => {
      try {
        return statSync(join(storiesDir, s)).isDirectory();
      } catch {
        return false;
      }
    })
    .map((story) => {
      const acIds = new Set(acsForStory(consortDir, featureId, story));
      const invariantIds = items
        .filter((it) => typeof it.invariant_id === "string" && it.invariant_id.length > 0 && typeof it.ac_id === "string" && acIds.has(it.ac_id))
        .map((it) => it.invariant_id as string);
      return { story, invariantIds };
    });
  // Ownership by REALIZATION (db-design), not story order: each invariant belongs to the story whose
  // migration creates/alters its table. Lets the check flag a display-only story front-loaded with a
  // write-story's invariant (and name the real owner), instead of the earliest-S-number fallback that
  // dead-locked the reflect gate. Absent/unparseable inputs -> empty map -> the checker's fallback.
  const archFile = architectureJson(consortDir, featureId);
  const dbFile = dbDesignJson(consortDir, featureId);
  const owner = invariantRealizingStory(
    existsSync(archFile) ? readFileSync(archFile, "utf8") : undefined,
    existsSync(dbFile) ? readFileSync(dbFile, "utf8") : undefined,
  );
  const r = checkInvariantCoverageDistinct(perStory, owner);
  return r.ok ? null : `invariant coverage not distinct across stories: ${r.violations.join("; ")}`;
}

/**
 * Service-backed-declaration spec-gate condition (closes the under-declaration
 * escape hatch): the layering + fitness guards all key off `service_backed`, so an
 * architect that omits it / sets it false on a feature that demonstrably persists
 * data silently disables every layering check. This cross-checks the declaration
 * against the architect's OWN structured evidence – the feature's AC `layer`s and
 * the architecture.json `nfrs[]` text – and hard-blocks a not-service_backed
 * feature that shows persistence evidence. Null when consistent / no architecture.
 */
function serviceBackedReason(consortDir: string, featureId: string): string | null {
  const arch = readArchitecture(consortDir, featureId);
  if (arch === undefined) return null;
  // The architect's own evidence: every AC's declared layer + every nfrs[] text.
  const acLayers: string[] = [];
  const fdir = featureDir(consortDir, featureId);
  const stories = join(fdir, "stories");
  if (existsSync(stories)) {
    for (const s of readdirSync(stories)) {
      const ad = join(stories, s, "acs");
      if (!existsSync(ad)) continue;
      for (const f of readdirSync(ad)) {
        if (!f.endsWith(".json")) continue;
        try {
          const layer = (JSON.parse(readFileSync(join(ad, f), "utf8")) as { layer?: string }).layer;
          if (typeof layer === "string") acLayers.push(layer);
        } catch {
          /* a malformed AC is caught by acsConformanceReason */
        }
      }
    }
  }
  const nfrsText: string[] = [];
  try {
    const nfrs = (JSON.parse(arch) as { nfrs?: Array<{ brief?: string; requirement?: string; notes?: string }> }).nfrs ?? [];
    for (const n of nfrs) nfrsText.push(n.brief ?? "", n.requirement ?? "", n.notes ?? "");
  } catch {
    /* invalid architecture.json is reported by the schema conformance check */
  }
  const r = checkServiceBackedDeclaration(arch, { acLayers, nfrsText });
  return r.ok ? null : `service_backed declaration failed: ${r.violations.join("; ")}`;
}

/**
 * E2E-layer-presence spec-gate condition (closes the "UI feature designed as all-backend"
 * escape): `e2eCoverageReason` only bites once an AC is tagged `layer:"E2E"`, so a design
 * lane that mis-classifies every client-facing AC as `API`/`Infra` produces a UI feature with
 * ZERO E2E ACs that passes the coverage guard vacuously – exactly how the actor-less pick form
 * shipped. This cross-checks the architect's OWN structural signal (a `boundary` layer with
 * `renders_via` = the feature renders a UI) against the feature's AC `layer`s: a UI-rendering
 * feature must carry >=1 `layer:"E2E"` AC. It is FEATURE-wide but NON-monotonic (zero E2E now
 * can become >=1 once a later, still-undesigned story is authored), so – unlike the monotonic
 * serviceBacked check – it enforces ONLY once every story the feature-spec DECLARES has been
 * designed (an `acs/` dir on disk); a partially-designed feature returns null (defer). Null when
 * design is incomplete / the feature renders no UI / an E2E AC already exists / no architecture.
 */
export function e2eLayerPresentReason(consortDir: string, featureId: string): string | null {
  const arch = readArchitecture(consortDir, featureId);
  if (arch === undefined) return null;
  const fdir = featureDir(consortDir, featureId);
  // Declared stories (feature-spec.json.stories) vs designed stories (an acs/ dir on disk).
  // Defer until every declared story is designed – the streaming design lane may not have
  // reached the client-facing story yet, and a premature zero-E2E read would false-positive.
  let declared: string[];
  try {
    declared = (JSON.parse(readFileSync(join(fdir, "feature-spec.json"), "utf8")) as { stories?: string[] }).stories ?? [];
  } catch {
    return null; // no/malformed feature-spec: completeness is unknowable, do not block
  }
  if (declared.length === 0) return null;
  const storiesDir = join(fdir, "stories");
  const hasAcs = (story: string): boolean => existsSync(join(storiesDir, story, "acs"));
  if (!declared.every(hasAcs)) return null; // design not complete yet – defer
  // Every declared story is designed: collect its AC layers (the same acs/ walk serviceBackedReason uses).
  const acLayers: string[] = [];
  for (const s of declared) {
    const ad = join(storiesDir, s, "acs");
    for (const f of readdirSync(ad)) {
      if (!f.endsWith(".json")) continue;
      try {
        const layer = (JSON.parse(readFileSync(join(ad, f), "utf8")) as { layer?: string }).layer;
        if (typeof layer === "string") acLayers.push(layer);
      } catch {
        /* a malformed AC is caught by acsConformanceReason */
      }
    }
  }
  // The architect-independent client-facing signal: a React UI track (consort-config.json,
  // read from the project root – consortDir is <projectDir>/.consort). Lets the check fire even
  // when the mis-classification also dropped the boundary's renders_via.
  let uiReact = false;
  try {
    const proj = resolveProjectSettings(dirname(consortDir)).project;
    uiReact = proj.uiTrack === true && proj.clientFramework === "react";
  } catch {
    /* no/unreadable project config: fall back to the architecture's renders_via signal alone */
  }
  const r = checkE2eLayerPresent(arch, { acLayers, uiReact });
  return r.ok ? null : `E2E-layer presence failed: ${r.violations.join("; ")}`;
}

/**
 * db-design story-attribution spec-gate condition: a `create_table` must be attributed to a story
 * that actually persists (has an API/Infra AC), never a pure UI/E2E shell story. This closes the
 * root cause of the persistence-invariant reflect loop – a scaffold story handed the table creation
 * makes `invariantRealizingStory` name it the owner, so the fitness PI tests anchor there and the
 * navigator reflect gate bounces them. Cross-checks db-design `schema_changes[]` against each
 * story's AC `layer`s (the same acs/ walk serviceBackedReason uses). Null when every create_table
 * is attributed to a persisting story / no db-design / no create_table.
 */
function schemaChangeStoryRealizesReason(consortDir: string, featureId: string): string | null {
  const dbFile = dbDesignJson(consortDir, featureId);
  if (!existsSync(dbFile)) return null;
  let db: { schema_changes?: Array<{ story_id?: string; kind?: string; table?: string }> };
  try {
    db = JSON.parse(readFileSync(dbFile, "utf8"));
  } catch {
    return null; // malformed db-design is reported by dbDesignReason
  }
  const changes = db.schema_changes ?? [];
  if (changes.length === 0) return null;
  const storiesDir = join(featureDir(consortDir, featureId), "stories");
  if (!existsSync(storiesDir)) return null;
  const storyLayers = new Map<string, string[]>();
  for (const s of readdirSync(storiesDir)) {
    const ad = join(storiesDir, s, "acs");
    if (!existsSync(ad)) continue;
    const layers: string[] = [];
    for (const f of readdirSync(ad)) {
      if (!f.endsWith(".json")) continue;
      try {
        const layer = (JSON.parse(readFileSync(join(ad, f), "utf8")) as { layer?: string }).layer;
        if (typeof layer === "string") layers.push(layer);
      } catch {
        /* a malformed AC is reported by acsConformanceReason */
      }
    }
    storyLayers.set(s, layers);
  }
  const r = checkSchemaChangeStoryRealizes(changes, storyLayers);
  return r.ok ? null : `db-design story attribution failed: ${r.violations.join("; ")}`;
}

/**
 * Resolve the artifact inputs for a gate from files that ACTUALLY exist AND
 * conform to their declared format. Returns a `reason` (so the caller skips
 * rather than fabricates) when a required artifact is absent or any present
 * artifact is non-conformant. Never substitutes placeholder content.
 */
export function resolveArtifactInputs(
  gate: GateName,
  fdir: string,
  promoteRef: string | undefined,
  consortDir: string,
  featureId: string,
): { inputs: Record<string, string> } | { reason: string } {
  const readIfPresent = (name: string): string | undefined => {
    const p = join(fdir, name);
    try {
      return existsSync(p) ? readFileSync(p, "utf8") : undefined;
    } catch {
      return undefined;
    }
  };

  const withConformance = (
    inputs: Record<string, string>,
  ): { inputs: Record<string, string> } | { reason: string } => {
    const reason = conformanceReason(inputs);
    return reason === null ? { inputs } : { reason };
  };

  switch (gate) {
    case "spec": {
      // The spec gate locks the Spec Author's structured draft spec:
      // feature-spec.json + feature-spec.md (both required). product-overview.md
      // (the Product Owner's project-level overview) is NOT part of the
      // per-feature spec gate and is deliberately not included here.
      const featureJson = readIfPresent("feature-spec.json");
      if (featureJson === undefined) {
        return { reason: "feature-spec.json not found (spec phase not complete)" };
      }
      const featureMd = readIfPresent("feature-spec.md");
      if (featureMd === undefined) {
        return { reason: "feature-spec.md not found (structured draft spec incomplete)" };
      }
      const inputs: Record<string, string> = {
        "feature-spec.json": featureJson,
        "feature-spec.md": featureMd,
      };
      const conf = withConformance(inputs);
      if ("reason" in conf) return conf;
      // Also enforce per-AC conformance (AC<n> id pattern + shape); the gate
      // previously skipped the acs/ files, letting slug ids + junk through.
      const acReason = acsConformanceReason(fdir);
      if (acReason !== null) return { reason: acReason };
      // And story independence: a later story must not be a subset of an earlier
      // one (records independence.distinct_from_prior; blocks the S2-subset-of-S1
      // overlap that otherwise stalls the build).
      const indepReason = storyIndependenceReason(fdir);
      if (indepReason !== null) return { reason: indepReason };
      // And architecture conventions: once the project canon is established (by an
      // earlier feature), this feature's architecture.json must REUSE the same
      // role -> module layout. Blocks F2 from remapping app/services -> app/logic
      // and diverging from the code it inherited (which would then trip the
      // layering gate's module-placement check at build time). The first feature
      // is exempt (no conventions yet); a non-service-backed feature is exempt.
      const conventionsReason = architectureConventionsReason(consortDir, featureId);
      if (conventionsReason !== null) return { reason: conventionsReason };
      // Architecture conformance (Gate 2, surfaced through the per-story spec gate
      // since the design lane runs the architect before surfacing it). First the
      // service_backed determination itself: a feature that under-declares (not
      // service_backed while it shows persistence evidence) silently disables the
      // layering checks below, so cross-check it against the architect's own
      // evidence before trusting the flag. Then: a service_backed feature must
      // declare its layers, and every Required NFR must be covered by a brief_ref.
      const serviceBacked = serviceBackedReason(consortDir, featureId);
      if (serviceBacked !== null) return { reason: serviceBacked };
      // A UI-rendering feature (boundary renders_via) must carry >=1 layer:"E2E" AC – else the
      // design lane classified a client-facing feature as all-backend and the E2E-coverage guard
      // (test_list gate) never bites. Enforced only once every declared story is designed.
      const e2eLayerReason = e2eLayerPresentReason(consortDir, featureId);
      if (e2eLayerReason !== null) return { reason: e2eLayerReason };
      // Human-authoritative per-story lever: a story the human/PO flagged requires_e2e must
      // carry an E2E AC. Bites per-story even when a sibling satisfies the feature-wide check.
      const requiresE2e = requiresE2eReason(consortDir, featureId);
      if (requiresE2e !== null) return { reason: requiresE2e };
      const layeringReason = layeringDeclaredReason(consortDir, featureId);
      if (layeringReason !== null) return { reason: layeringReason };
      // The DBA runs after the architect and before the test-strategist: a
      // service_backed feature must have a db-design.json realizing every declared
      // persistence_invariant with a physical table/constraint.
      const dbReason = dbDesignReason(consortDir, featureId);
      if (dbReason !== null) return { reason: dbReason };
      // db-design must attribute each create_table to a story that actually persists (API/Infra AC),
      // never a UI/E2E shell story – the mis-attribution that otherwise makes the fitness PI tests
      // anchor to a scaffold story and get bounced by the navigator reflect gate.
      const schemaStoryReason = schemaChangeStoryRealizesReason(consortDir, featureId);
      if (schemaStoryReason !== null) return { reason: schemaStoryReason };
      const nfrReason = nfrCoverageReason(consortDir, featureId);
      return nfrReason === null ? conf : { reason: nfrReason };
    }
    case "plan": {
      const planJson = readIfPresent("plan.json");
      if (planJson === undefined) {
        return { reason: "plan.json not found (plan phase not produced)" };
      }
      return withConformance({ "plan.json": planJson });
    }
    case "test_list": {
      const tlJson = readIfPresent("test-list.json");
      const tlMd = readIfPresent("test-list.md");
      if (tlJson === undefined && tlMd === undefined) {
        return { reason: "test-list.json/md not found (test-strategist phase not complete)" };
      }
      const inputs: Record<string, string> = {};
      if (tlJson !== undefined) inputs["test-list.json"] = tlJson;
      if (tlMd !== undefined) inputs["test-list.md"] = tlMd;
      const conf = withConformance(inputs);
      if ("reason" in conf) return conf;
      // Fitness coverage (Gate 3): a service_backed/layered feature's test-list
      // must carry >=1 kind:"fitness" item (the architectural regression guard).
      // Claimed as a hard-block in test-list.schema.json but previously unwired.
      if (tlJson !== undefined) {
        const fitnessReason = fitnessCoverageReason(consortDir, featureId, tlJson);
        if (fitnessReason !== null) return { reason: fitnessReason };
        // Per-clause fitness coverage (Gate 3): an NFR on the ATOMIC
        // `fitness_functions` array form must have one covering test per clause
        // (tagged nfr_id). Fires only for the array form, so it is additive; it is
        // the deterministic teeth that stop a multi-part NFR thrashing the reflect
        // one-uncovered-clause-per-lap.
        const clauseReason = fitnessClauseCoverageReason(consortDir, featureId, tlJson);
        if (clauseReason !== null) return { reason: clauseReason };
        // Persistence coverage (Gate 3): a service_backed feature must declare its
        // persistence_invariants[] and cover each with a real-branch test (an item
        // referencing its invariant_id), so DB guarantees are tested against the
        // schema's own contract, not only incidentally through API behavior tests.
        const persistenceReason = persistenceCoverageReason(consortDir, featureId, tlJson);
        if (persistenceReason !== null) return { reason: persistenceReason };
        // Distinct invariant coverage (Gate 3): each declared invariant belongs
        // to exactly ONE story's fitness tests. A later story re-testing an
        // invariant an earlier story already covers is a redundant re-test that
        // drifts + dead-locks the reflect gate (the persistence face of story
        // overlap); drop it from the later story.
        const distinctReason = invariantCoverageDistinctReason(consortDir, featureId, tlJson);
        if (distinctReason !== null) return { reason: distinctReason };
        // E2E coverage (Gate 3): an AC whose acceptance is a CLIENT render of a real SERVER
        // response (a validation rejection shown inline, a success confirmation) is a
        // client<->server contract – layer:"E2E" – and MUST have a real Playwright e2e, never
        // only a mocked component test whose fabricated response envelope drifts from the real
        // wire contract (the S3 inline-error defect: the mock used a flat body, the backend
        // sent {detail:{...}}, so nothing rendered against the live API).
        const e2eReason = e2eCoverageReason(consortDir, featureId, tlJson);
        if (e2eReason !== null) return { reason: e2eReason };
      }
      return conf;
    }
    case "promote": {
      if (promoteRef === undefined || promoteRef.length === 0) {
        return { reason: "no promote_ref supplied (nothing to promote)" };
      }
      // promote_ref has no declared format; conformance is a no-op for it.
      return withConformance({ promote_ref: promoteRef });
    }
    case "deploy": {
      // The deploy (working-software) gate locks the Release Engineer's
      // deploy-evidence.json. Teeth: refuse unless the increment was
      // actually reachable AND its feature-verify passed against the running
      // app, not merely that the evidence file exists + conforms.
      const evidence = readIfPresent("deploy-evidence.json");
      if (evidence === undefined) {
        return { reason: "deploy-evidence.json not found (feature not deployed + verified)" };
      }
      let parsed: { reachable?: unknown; verify?: { passed?: unknown } };
      try {
        parsed = JSON.parse(evidence) as typeof parsed;
      } catch {
        return { reason: "deploy-evidence.json is not valid JSON" };
      }
      if (parsed.reachable !== true) {
        return { reason: "deploy-evidence records reachable=false (app not reachable on the target)" };
      }
      if (parsed.verify?.passed !== true) {
        return { reason: "deploy-evidence records verify.passed=false (feature-verify did not pass against the running app)" };
      }
      return withConformance({ "deploy-evidence.json": evidence });
    }
  }
}

