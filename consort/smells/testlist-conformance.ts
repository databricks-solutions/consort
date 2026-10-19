// Deterministic pre-reflect test_list gate. The design lane's LLM reflect runs
// BEFORE the deterministic spec/test_list conformance gate, and on a revise only
// the reflect re-checks the re-authored test-list — so a structural defect a
// revise reintroduces (a client test on a non-E2E AC, an E2E AC with no real
// Playwright spec, a real-browser assertion in the jsdom harness) costs an LLM
// reflect lap the deterministic checks were built to save.
//
// This module runs the deterministic AUTHORING-SMELL checks (checkClientKindLayerCoherence /
// checkJsdomBrowserAssertion / checkTestlistWholeTableAggregate / checkTestlistFixedKeyE2e /
// checkTestlistScenarioFileCoherence / checkTestlistEndpointCoherence / checkTestlistE2eSpecSuffix) over
// the per-story test-list EARLIER:
// `testlistConformanceReason` is the pure predicate the probe reads
// (testListConforms), and `recordTestListGate` is the deterministic gate CLI step
// that flags the SAME `reflect-testlist-defect` smell the reflect gate uses — so
// the existing revise-route/escalation machinery bounds + routes it, with NO LLM
// turn. Mirrors reflection.ts (verdict → smell), sourced from the checks instead.
//
// Scope note: these are the structural authoring smells that are unambiguous from
// the test-list at REFLECT time and that cost the diagnosed live reflect laps (a
// client test tagged to a backend-layer AC; a real-browser assertion in the jsdom
// harness; an absolute whole-table aggregate with no own-row scope). The
// whole-table-aggregate check mirrors the code-level detector in test-smell-clean.ts
// (which fires on the scenario CODE at GREEN) at the DESCRIPTION layer, one step
// earlier — same rule, two artifact layers. Migration-marker isolation is NOT checked
// here: @pytest.mark.migration is a code-level detail that descriptions don't reliably
// name (a description-level check false-positived a legitimate reversibility round-trip
// in the recorded corpus), so it stays a code-level GREEN-time detector.
// E2E-coverage completeness (every E2E AC has a Playwright
// scenario_file) is a FINALIZED-test-list property — scenario_files are still being
// assigned at reflect time — so it stays at the downstream test_list gate
// (gate-conformance-guard `e2eCoverageReason`), NOT here, where demanding it early
// would false-positive a design that covers E2E ACs via other harnesses.

import { existsSync, readFileSync, readdirSync } from "fs";
import { storyTestListJson, acsDir, architectureJson, featureSpecJson, dbDesignJson } from "../../consort/config/consort-paths.js";
import {
  checkClientKindLayerCoherence,
  checkJsdomBrowserAssertion,
  checkTestlistWholeTableAggregate,
  checkTestlistFixedKeyE2e,
  checkTestlistScenarioFileCoherence,
  checkTestlistEndpointCoherence,
  checkTestlistE2eSpecSuffix,
  checkTestlistComponentScenarioFile,
  checkTestlistMigrationRevision,
  checkSchemaChangeOrphan,
  checkMigrationTestSchemaChangeTag,
  checkFitnessSingularCoverage,
  checkFitnessClauseCoverage,
  extractApiEndpoints,
} from "../orchestrator/validators/conformance/artifact-conformance.js";
import { writeSmellsLog, hasOpenSmell, resolveOpenSmells, type SmellHit } from "./smells.js";

/** The `reflect-testlist-defect` smell (test-strategist-owned) that the reflect
 *  gate also uses — reused so the deterministic gate shares its revise machinery. */
const TESTLIST_SMELL = "reflect-testlist-defect" as const;

/** The story's `{acId: layer}` map, from its acs/*.json. */
function storyAcLayers(consortDir: string, featureId: string, story: string): Record<string, string> {
  const acLayerById: Record<string, string> = {};
  const dir = acsDir(consortDir, featureId, story);
  if (existsSync(dir)) {
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".json")) continue;
      try {
        const layer = (JSON.parse(readFileSync(`${dir}/${f}`, "utf8")) as { layer?: string }).layer;
        if (typeof layer === "string") acLayerById[f.replace(/\.json$/, "")] = layer;
      } catch {
        /* a malformed AC is reported by the acs-conformance gate */
      }
    }
  }
  return acLayerById;
}

/** The feature's DECLARED `/api/...` surface — every endpoint token the architecture, the feature spec,
 *  and the story's ACs name. The union across sources is deliberately GENEROUS: an endpoint declared
 *  ANYWHERE counts as declared, so checkTestlistEndpointCoherence only flags a test endpoint that is
 *  absent from ALL of them (fewer false positives). Empty when no source names an `/api/...` endpoint. */
function declaredApiEndpoints(consortDir: string, featureId: string, story: string): string[] {
  const texts: string[] = [];
  for (const p of [architectureJson(consortDir, featureId), featureSpecJson(consortDir, featureId)]) {
    try {
      if (existsSync(p)) texts.push(readFileSync(p, "utf8"));
    } catch {
      /* a malformed source is reported by its own conformance gate */
    }
  }
  const dir = acsDir(consortDir, featureId, story);
  try {
    if (existsSync(dir)) for (const f of readdirSync(dir)) if (f.endsWith(".json")) texts.push(readFileSync(`${dir}/${f}`, "utf8"));
  } catch {
    /* no acs dir yet */
  }
  const toks = new Set<string>();
  for (const t of texts) for (const e of extractApiEndpoints(t)) toks.add(e);
  return [...toks];
}

/**
 * The deterministic structural violations of a story's test-list + the ac_id(s) they
 * concern, or null when it conforms (or no test-list exists yet — vacuously conformant,
 * so the gate never pre-empts before the test-list is authored). The acIds let the
 * revise self-heal SCOPE the re-author to exactly the flagged ACs (#4): a conformance
 * flag that names its ACs becomes a targeted patch, NOT a whole-story clear that
 * needlessly re-annotates every architect note. Pure: reads only on-disk artifacts.
 */
export function testlistConformanceViolations(
  consortDir: string,
  featureId: string,
  story: string,
): { reason: string; acIds: string[] } | null {
  const tlPath = storyTestListJson(consortDir, featureId, story);
  if (!existsSync(tlPath)) return null;
  let testListJson: string;
  try {
    testListJson = readFileSync(tlPath, "utf8");
  } catch {
    return null;
  }
  return testlistConformanceForContent(consortDir, featureId, story, testListJson);
}

/**
 * The same deterministic story-scoped conformance as testlistConformanceViolations, but against a
 * test-list JSON STRING the caller supplies. The Test Strategist's mid-turn self-check runs this
 * against the MASTER filtered to the story, because the per-story view the gate reads
 * (storyTestListJson) is written by a postTurn and does NOT exist yet in-turn — reading it there
 * would vacuously pass and let the defect escape to the reflect gate. acLayers / db-design /
 * architecture ARE on disk mid-turn, so they are read here. ONE check-core, two entry points
 * (self-check + gate) — they can never diverge.
 */
export function testlistConformanceForContent(
  consortDir: string,
  featureId: string,
  story: string,
  testListJson: string,
): { reason: string; acIds: string[] } | null {
  const acLayerById = storyAcLayers(consortDir, featureId, story);
  // The DBA's schema-change ledger (optional): read for the orphan check so a test
  // referencing an un-planned schema_change_id is caught pre-reflect. Absent/unreadable
  // is fine — checkSchemaChangeOrphan is vacuous without an id'd ledger.
  let dbDesign: string | undefined;
  try {
    const p = dbDesignJson(consortDir, featureId);
    if (existsSync(p)) dbDesign = readFileSync(p, "utf8");
  } catch {
    /* a malformed db-design is reported by checkDbDesign */
  }
  // The feature architecture (optional): read for the STORY-SCOPED NFR fitness-coverage
  // checks so an NFR that applies_to THIS story but has no nfr_id-tagged test flags here
  // (pre-reflect) instead of one LLM reflect lap later. Scoped to applies_to===story so a
  // feature-level / sibling-story NFR is never false-flagged (that stays the feature-wide
  // test_list gate). Absent/unreadable is fine — the checks are skipped.
  let archJson: string | undefined;
  try {
    const p = architectureJson(consortDir, featureId);
    if (existsSync(p)) archJson = readFileSync(p, "utf8");
  } catch {
    /* a malformed architecture is reported by its own gate */
  }
  const violations: string[] = [];
  const acIds = new Set<string>();
  for (const r of [
    checkClientKindLayerCoherence(testListJson, acLayerById),
    checkJsdomBrowserAssertion(testListJson),
    checkTestlistWholeTableAggregate(testListJson),
    checkTestlistFixedKeyE2e(testListJson, acLayerById),
    checkTestlistScenarioFileCoherence(testListJson),
    checkTestlistEndpointCoherence(testListJson, declaredApiEndpoints(consortDir, featureId, story)),
    checkTestlistE2eSpecSuffix(testListJson),
    checkTestlistComponentScenarioFile(testListJson),
    checkTestlistMigrationRevision(testListJson),
    checkSchemaChangeOrphan(testListJson, dbDesign),
    // A migration-reversibility test must carry the schema_change_id it exercises, so the orphan
    // check above can reconcile it against the DBA ledger (else a prose-asserted migration for an
    // un-planned change slips to the semantic reflect — the F1/S2 history).
    checkMigrationTestSchemaChangeTag(testListJson, dbDesign),
    // Story-scoped NFR fitness-coverage (the pre-reflect complement to the feature-wide
    // fitness*CoverageReason at the test_list gate): a product NFR whose applies_to is THIS
    // story needs >=1 nfr_id-tagged item in this story's list. onlyStory scoping keeps a
    // feature-level or sibling-story NFR from false-flagging before its story is designed.
    ...(archJson !== undefined
      ? [
          checkFitnessSingularCoverage(testListJson, archJson, { onlyStory: story }),
          checkFitnessClauseCoverage(testListJson, archJson, { onlyStory: story }),
        ]
      : []),
  ]) {
    if (!r.ok) {
      violations.push(...r.violations);
      for (const id of r.acIds ?? []) acIds.add(id);
    }
  }
  return violations.length === 0 ? null : { reason: violations.join("; "), acIds: [...acIds] };
}

/** The deterministic structural violations as a single string, or null when conformant. */
export function testlistConformanceReason(consortDir: string, featureId: string, story: string): string | null {
  return testlistConformanceViolations(consortDir, featureId, story)?.reason ?? null;
}

/** True iff the story's test-list passes the deterministic structural checks. */
export function testListConforms(consortDir: string, featureId: string, story: string): boolean {
  return testlistConformanceViolations(consortDir, featureId, story) === null;
}

/**
 * The deterministic pre-reflect gate step (mirrors recordReflectionGate): on a
 * non-conformant test-list, flag the `reflect-testlist-defect` smell (test-
 * strategist-owned) carrying the deterministic violation as detail, so the existing
 * escalation → revise-route machinery bounds + routes it with NO LLM turn. On a
 * conformant test-list, self-clear any lingering open smell (a `cleared` resolve,
 * which does not spend the revise budget), exactly like a passing reflect verdict.
 */
export function recordTestListGate(consortDir: string, featureId: string, story: string): SmellHit[] {
  const found = testlistConformanceViolations(consortDir, featureId, story);
  if (found === null) {
    resolveOpenSmells(consortDir, TESTLIST_SMELL, {
      story_id: story,
      kind: "cleared",
      note: "test-list now conforms to the deterministic structural checks",
    });
    return [];
  }
  const hit: SmellHit = {
    smell: TESTLIST_SMELL,
    cycle_ids: [],
    detail: `test-list conformance: ${found.reason}`,
    story_id: story,
    // Carry the flagged ac_id(s) so the revise self-heal scopes the re-author to
    // exactly those ACs (a targeted patch, no whole-story architect re-annotate) — #4.
    ...(found.acIds.length > 0 ? { ac_ids: found.acIds } : {}),
  };
  // Idempotent: a re-run against the same non-conformant test-list re-detects the
  // same defect; only write it when not already open for this story.
  if (hasOpenSmell(consortDir, TESTLIST_SMELL, story)) return [];
  writeSmellsLog(consortDir, [hit]);
  return [hit];
}
