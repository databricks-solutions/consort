// Deterministic pre-reflect test_list gate. The design lane's LLM reflect runs
// BEFORE the deterministic spec/test_list conformance gate, and on a revise only
// the reflect re-checks the re-authored test-list — so a structural defect a
// revise reintroduces (a client test on a non-E2E AC, an E2E AC with no real
// Playwright spec, a real-browser assertion in the jsdom harness) costs an LLM
// reflect lap the deterministic checks were built to save.
//
// This module runs the two AUTHORING-SMELL checks (checkClientKindLayerCoherence /
// checkJsdomBrowserAssertion) over the per-story test-list EARLIER:
// `testlistConformanceReason` is the pure predicate the probe reads
// (testListConforms), and `recordTestListGate` is the deterministic gate CLI step
// that flags the SAME `reflect-testlist-defect` smell the reflect gate uses — so
// the existing revise-route/escalation machinery bounds + routes it, with NO LLM
// turn. Mirrors reflection.ts (verdict → smell), sourced from the checks instead.
//
// Scope note: these are the two structural authoring smells that are unambiguous
// from the test-list at REFLECT time and that cost the diagnosed live reflect laps
// (a client test tagged to a backend-layer AC; a real-browser assertion in the
// jsdom harness). E2E-coverage completeness (every E2E AC has a Playwright
// scenario_file) is a FINALIZED-test-list property — scenario_files are still being
// assigned at reflect time — so it stays at the downstream test_list gate
// (gate-conformance-guard `e2eCoverageReason`), NOT here, where demanding it early
// would false-positive a design that covers E2E ACs via other harnesses.

import { existsSync, readFileSync, readdirSync } from "fs";
import { storyTestListJson, acsDir } from "../../consort/config/consort-paths.js";
import {
  checkClientKindLayerCoherence,
  checkJsdomBrowserAssertion,
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

/**
 * The deterministic structural violations of a story's test-list, or null when it
 * conforms (or no test-list exists yet — vacuously conformant, so the gate never
 * pre-empts before the test-list is authored). Pure: reads only on-disk artifacts.
 */
export function testlistConformanceReason(consortDir: string, featureId: string, story: string): string | null {
  const tlPath = storyTestListJson(consortDir, featureId, story);
  if (!existsSync(tlPath)) return null;
  let testListJson: string;
  try {
    testListJson = readFileSync(tlPath, "utf8");
  } catch {
    return null;
  }
  const acLayerById = storyAcLayers(consortDir, featureId, story);
  const violations: string[] = [];
  for (const r of [
    checkClientKindLayerCoherence(testListJson, acLayerById),
    checkJsdomBrowserAssertion(testListJson),
  ]) {
    if (!r.ok) violations.push(...r.violations);
  }
  return violations.length === 0 ? null : violations.join("; ");
}

/** True iff the story's test-list passes the deterministic structural checks. */
export function testListConforms(consortDir: string, featureId: string, story: string): boolean {
  return testlistConformanceReason(consortDir, featureId, story) === null;
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
  const reason = testlistConformanceReason(consortDir, featureId, story);
  if (reason === null) {
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
    detail: `test-list conformance: ${reason}`,
    story_id: story,
  };
  // Idempotent: a re-run against the same non-conformant test-list re-detects the
  // same defect; only write it when not already open for this story.
  if (hasOpenSmell(consortDir, TESTLIST_SMELL, story)) return [];
  writeSmellsLog(consortDir, [hit]);
  return [hit];
}
