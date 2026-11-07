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

import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { storyTestListJson, acsDir, architectureJson, featureSpecJson, dbDesignJson, storiesDir, featureTestListJson, pipelineJson } from "../../consort/config/consort-paths.js";
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
  checkSchemaDiffCrossStoryColumns,
  checkFitnessSingularCoverage,
  checkFitnessClauseCoverage,
  checkStoryPersistenceCoverage,
  checkMockPrescription,
  describesAtomicityRollback,
  describesMigrationRoundTrip,
  invariantRealizingStory,
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

/** Every story id of the feature (the stories/ subdirectories), for the write-path owner scan. */
function featureStoryIds(consortDir: string, featureId: string): string[] {
  const dir = storiesDir(consortDir, featureId);
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir).filter((n) => {
      try {
        return statSync(join(dir, n)).isDirectory();
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}

/** A story's per-story test-list items, from `currentStoryTestListJson` for the current story (the
 *  in-memory content the mid-turn self-check holds, since the on-disk per-story list is written
 *  postTurn), else the on-disk list. Empty on any read/parse miss. */
function storyTestListItems(
  consortDir: string,
  featureId: string,
  story: string,
  current?: { story: string; json: string },
): Array<{ invariant_id?: string; description?: string }> {
  let text: string | undefined;
  if (current && current.story === story) {
    text = current.json;
  } else {
    const p = storyTestListJson(consortDir, featureId, story);
    if (existsSync(p)) {
      try {
        text = readFileSync(p, "utf8");
      } catch {
        /* unreadable -> no items */
      }
    }
  }
  if (!text) return [];
  try {
    const d = JSON.parse(text) as { items?: Array<{ invariant_id?: string; description?: string }> };
    return Array.isArray(d.items) ? d.items : [];
  } catch {
    return [];
  }
}

/**
 * Map each persistence_invariant id -> the story that OWNS (realizes) it, or undefined when ownership
 * is ambiguous. TWO anchors: (1) the schema-change realizer (invariantRealizingStory) when the feature
 * MIGRATES the invariant's table — exact; (2) a WRITE-PATH fallback for a pre-existing / unmigrated
 * table (no schema_change — the F2 stock_records PI1/PI2 case): the story whose per-story test-list
 * most references the table NAME in an item description. A tie or zero references => undefined
 * (ambiguous: left to the feature-wide design-complete backstop, which names the best-guess owner).
 * `current` supplies the in-memory test-list for the story being gated so the mid-turn self-check sees
 * its own just-authored items (the on-disk per-story list is stale/absent in-turn).
 */
export function invariantOwnerStories(
  consortDir: string,
  featureId: string,
  current?: { story: string; json: string },
  opts?: { writePath?: boolean },
): Map<string, string | undefined> {
  // The schema-change realizer (invariantRealizingStory) is the AUTHORITATIVE owner and the only
  // signal the PER-STORY gate uses (writePath defaults off). The write-path heuristic — the story
  // whose test-list most references the table — is UNRELIABLE during the in-flux design lane: it can't
  // tell a table's WRITER from a read-only story that references it to assert NON-modification (F5's S1
  // count asserts "no adjustment written"), and the realizing story may be undesigned when an earlier
  // story's gate runs. That raciness made the per-story check fight the Navigator's correct re-anchoring
  // into a bounded revise loop → HIL (the F5/PI30 case). So the write-path is OPT-IN, used only by the
  // feature-wide design-complete self-heal (opts.writePath) where every story + db-design is settled.
  const writePath = opts?.writePath === true;
  const out = new Map<string, string | undefined>();
  let archText: string | undefined;
  let dbText: string | undefined;
  try {
    const p = architectureJson(consortDir, featureId);
    if (existsSync(p)) archText = readFileSync(p, "utf8");
  } catch {
    /* no architecture yet */
  }
  try {
    const p = dbDesignJson(consortDir, featureId);
    if (existsSync(p)) dbText = readFileSync(p, "utf8");
  } catch {
    /* no db-design yet */
  }
  if (archText === undefined) return out;
  let arch: { persistence_invariants?: Array<{ id?: string; table?: string }> };
  try {
    arch = JSON.parse(archText);
  } catch {
    return out;
  }
  const invariants = (arch.persistence_invariants ?? []).filter(
    (i): i is { id: string; table?: string } => !!i && typeof i.id === "string" && i.id.length > 0,
  );
  if (invariants.length === 0) return out;
  const realizing = invariantRealizingStory(archText, dbText); // schema-change anchor (may be empty)
  const storyIds = featureStoryIds(consortDir, featureId);
  // Cache each story's test-list items once for the write-path scan.
  const itemsByStory = new Map<string, Array<{ invariant_id?: string; description?: string }>>();
  for (const s of storyIds) itemsByStory.set(s, storyTestListItems(consortDir, featureId, s, current));
  for (const inv of invariants) {
    const anchored = realizing.get(inv.id);
    if (anchored) {
      out.set(inv.id, anchored);
      continue;
    }
    // No schema-change anchor: the invariant is on a table THIS feature does not migrate (truly
    // inherited). The PER-STORY gate does NOT guess an owner (writePath off) — it leaves it undefined so
    // the invariant is not flagged for any story here; it is caught feature-wide at design-complete,
    // where the write-path is reliable. Only the design-complete self-heal opts into the write-path.
    if (!writePath || !inv.table) {
      out.set(inv.id, undefined);
      continue;
    }
    // Write-path: the story whose items most reference the table name — the GENUINE writer of the
    // inherited table. CRITICAL: exclude items tagged with THIS invariant (`invariant_id === inv.id`).
    // Otherwise forcing the invariant's own covering test onto the WRONG story makes that story "own"
    // the invariant self-referentially — the F5/PI30 loop: the coverage gate flagged S1, the Navigator
    // re-anchored PI30 to the realizing S2, the Strategist moved it, the gate re-flagged S1 (now the
    // only story "referencing" stock_adjustments, via that very test), ad infinitum until HIL. Counting
    // only NON-self references means a story owns the invariant only if it writes the table for OTHER
    // reasons (the real reconcile/write path); a story that merely had the PI test pushed onto it scores
    // 0 and is not the owner. The realizing story may be undesigned at an earlier story's gate (no refs
    // yet) → owner undefined → not flagged here; it is caught at that story's own gate, or the feature
    // -wide design-complete backstop, once its write-path tests exist.
    let best: string | undefined;
    let bestN = 0;
    let tie = false;
    for (const s of storyIds) {
      const n = (itemsByStory.get(s) ?? []).filter(
        (it) => it.invariant_id !== inv.id && (it.description ?? "").includes(inv.table!),
      ).length;
      if (n > bestN) {
        bestN = n;
        best = s;
        tie = false;
      } else if (n === bestN && n > 0) {
        tie = true;
      }
    }
    out.set(inv.id, bestN > 0 && !tie ? best : undefined);
  }
  return out;
}

/** The persistence_invariant ids THIS story owns (owner === story), for the story-scoped coverage check. */
function storyOwnedInvariantIds(consortDir: string, featureId: string, story: string, storyTestListText: string): string[] {
  const owners = invariantOwnerStories(consortDir, featureId, { story, json: storyTestListText });
  const ids: string[] = [];
  for (const [id, owner] of owners) if (owner === story) ids.push(id);
  return ids;
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
    // No-mock policy, enforced at the SOURCE of the test description: a component/behavior test that
    // names a mock/stub of a service boundary (and does not negate it — "no mock", "real") is a
    // design defect, since the policy is to hit the real backend + Lakebase branch. Caught here at the
    // drive's pre-reflect self-check so the test-strategist re-authors the description BEFORE build —
    // the gap that let F2/S2's T32 "fetch stubbed" reach the build lane (it was only in the gate guard).
    checkMockPrescription(testListJson),
    checkTestlistMigrationRevision(testListJson),
    checkSchemaChangeOrphan(testListJson, dbDesign),
    // A migration-reversibility test must carry the schema_change_id it exercises, so the orphan
    // check above can reconcile it against the DBA ledger (else a prose-asserted migration for an
    // un-planned change slips to the semantic reflect — the F1/S2 history).
    checkMigrationTestSchemaChangeTag(testListJson, dbDesign),
    // A parent-aware schema-diff test for THIS story must assert only this story's own schema delta —
    // a column a PRIOR story added/dropped already rides on the parent the diff compares against, so
    // asserting it as added/removed here is unsatisfiable. Deterministic over the DBA ledger's columns
    // + owning story; shifts the catch to the test-strategist's in-turn self-check so the design lane
    // self-corrects instead of the Navigator bouncing it at GREEN.
    checkSchemaDiffCrossStoryColumns(testListJson, dbDesign, story),
    // Story-scoped NFR fitness-coverage (the pre-reflect complement to the feature-wide
    // fitness*CoverageReason at the test_list gate): a product NFR whose applies_to is THIS
    // story needs >=1 nfr_id-tagged item in this story's list. onlyStory scoping keeps a
    // feature-level or sibling-story NFR from false-flagging before its story is designed.
    ...(archJson !== undefined
      ? [
          checkFitnessSingularCoverage(testListJson, archJson, { onlyStory: story }),
          checkFitnessClauseCoverage(testListJson, archJson, { onlyStory: story }),
          // Story-scoped persistence-invariant coverage (the pre-reflect complement to the feature-wide
          // checkPersistenceCoverage at the design-complete gate): a persistence invariant THIS story
          // realizes must have a correctly-shaped covering item in this story's list. Ownership is the
          // schema-change realizer, else a write-path anchor for an unmigrated table (the F2
          // stock_records PI1/PI2 case). An owned-but-uncovered invariant flags the reflect-testlist
          // -defect here so the revise-route self-heals it to the test-strategist BEFORE the build —
          // instead of the feature-wide design-complete gate catching it late with a hard HIL halt.
          checkStoryPersistenceCoverage(testListJson, archJson, storyOwnedInvariantIds(consortDir, featureId, story, testListJson)),
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

/** True iff the story's test-list passes the deterministic structural checks AND — at the story that
 *  COMPLETES the feature's design — the feature has no uncovered AND no wrong-shaped persistence
 *  invariant. The second clause is what makes the drive RUN the testlist-gate at design-complete even
 *  when every per-story check passes: a truly-inherited invariant (no schema-anchor) slips every
 *  per-story check — whether its cover is ABSENT (featureUncoveredInvariantIds) or the WRONG SHAPE
 *  (featureMisshapedInvariants, e.g. F2/S3 PI1 covered only by a state test, not an atomicity test) — so
 *  without this the gate step is skipped and the gap hard-raises at the approve gate instead of
 *  self-healing. Returning false here routes flag-testlist-nonconformance -> recordTestListGate, whose
 *  part-B logic flags the OWNING story so the revise-route covers/re-shapes it. */
export function testListConforms(consortDir: string, featureId: string, story: string): boolean {
  if (testlistConformanceViolations(consortDir, featureId, story) !== null) return false;
  if (
    isDesignCompletingStory(consortDir, featureId, story) &&
    (featureUncoveredInvariantIds(consortDir, featureId).length > 0 ||
      featureMisshapedInvariants(consortDir, featureId).length > 0)
  )
    return false;
  return true;
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
  const hits: SmellHit[] = [];

  // (1) PER-STORY structural + schema-anchored persistence coverage for THIS story.
  const found = testlistConformanceViolations(consortDir, featureId, story);
  if (found === null) {
    resolveOpenSmells(consortDir, TESTLIST_SMELL, {
      story_id: story,
      kind: "cleared",
      note: "test-list now conforms to the deterministic structural checks",
    });
  } else {
    const hit: SmellHit = {
      smell: TESTLIST_SMELL,
      cycle_ids: [],
      detail: `test-list conformance: ${found.reason}`,
      story_id: story,
      // Carry the flagged ac_id(s) so the revise self-heal scopes the re-author to
      // exactly those ACs (a targeted patch, no whole-story architect re-annotate) — #4.
      ...(found.acIds.length > 0 ? { ac_ids: found.acIds } : {}),
    };
    // Idempotent: only write when not already open for this story.
    if (!hasOpenSmell(consortDir, TESTLIST_SMELL, story)) {
      writeSmellsLog(consortDir, [hit]);
      hits.push(hit);
    }
  }

  // (2) DESIGN-COMPLETE feature-wide coverage SELF-HEAL. When approving THIS story completes the
  // feature's design (every other story gated), a declared invariant with NO schema-change anchor
  // (truly inherited — F5's PI26-reconcile-atomic on the F2-owned stock_adjustments) has slipped every
  // per-story gate (per-story uses the schema anchor only). Rather than hard-raise at the design
  // -complete approve gate, flag it as a reflect-testlist-defect for its OWNING story (write-path
  // RELIABLE now that every story is designed) so the SAME revise-route reopens that story's
  // test-strategist to cover it — the self-heal that makes the design-complete coverage gap routable
  // instead of a HIL halt. Fires only at design-complete, so an earlier story is never flagged for a
  // later story's invariant. The approve-gate's featureCoverageReason remains the final backstop.
  for (const h of designCompleteCoverageHits(consortDir, featureId, story)) {
    if (!hasOpenSmell(consortDir, TESTLIST_SMELL, h.story_id)) {
      writeSmellsLog(consortDir, [h]);
      hits.push(h);
    }
  }
  return hits;
}

/** True iff approving `story`'s gate completes the feature's design: every OTHER feature-spec story is
 *  gate `approved` in pipeline.json. Read directly (not via story-pipeline) to avoid an import cycle. */
function isDesignCompletingStory(consortDir: string, featureId: string, story: string): boolean {
  let stories: string[] = [];
  try {
    stories = (JSON.parse(readFileSync(featureSpecJson(consortDir, featureId), "utf8")) as { stories?: string[] }).stories ?? [];
  } catch {
    return false;
  }
  if (stories.length === 0) return false;
  let pipe: { stories?: Record<string, { gate?: { status?: string } }> };
  try {
    pipe = JSON.parse(readFileSync(pipelineJson(consortDir, featureId), "utf8"));
  } catch {
    return false;
  }
  return stories.every((s) => s === story || pipe.stories?.[s]?.gate?.status === "approved");
}

/** Feature-wide persistence invariants DECLARED (service-backed) but with NO invariant_id-tagged item
 *  in the master test-list — the design-complete coverage gap, computed the same way as
 *  checkPersistenceCoverage. Empty when not service-backed / nothing declared / all covered. */
function featureUncoveredInvariantIds(consortDir: string, featureId: string): string[] {
  let archText: string, tlText: string;
  try {
    archText = readFileSync(architectureJson(consortDir, featureId), "utf8");
    tlText = readFileSync(featureTestListJson(consortDir, featureId), "utf8");
  } catch {
    return [];
  }
  let dbText: string | undefined;
  try {
    const p = dbDesignJson(consortDir, featureId);
    if (existsSync(p)) dbText = readFileSync(p, "utf8");
  } catch {
    /* no db-design yet → demand all (prior behavior) */
  }
  let arch: { service_backed?: boolean; persistence_invariants?: Array<{ id?: string; type?: string }> };
  let tl: { items?: Array<{ invariant_id?: string }> };
  try {
    arch = JSON.parse(archText);
    tl = JSON.parse(tlText);
  } catch {
    return [];
  }
  if (arch.service_backed !== true) return [];
  // EXEMPT inherited schema-constraints (mirrors checkPersistenceCoverage): a non-`transactional`
  // invariant on a table this feature does NOT migrate (no schema_change → absent from
  // invariantRealizingStory) is a PRE-EXISTING constraint tested where the table was created, not
  // re-covered here. Stops the recurring F5 design-complete dead-lock where the architect re-declares
  // inherited constraints (PI1 F1-unique, PI4/PI5 F2 audit — briefs say "pre-existing, no new migration")
  // and the loop can never author a cover for them. `transactional` invariants stay demanded (behavior).
  const realizing = dbText ? invariantRealizingStory(archText, dbText) : null;
  const declared = (arch.persistence_invariants ?? [])
    .filter((i): i is { id: string; type?: string } => !!i && typeof i.id === "string" && i.id.length > 0)
    .filter((i) => realizing === null || i.type === "transactional" || realizing.has(i.id))
    .map((i) => i.id);
  const covered = new Set((tl.items ?? []).map((i) => i.invariant_id).filter((x): x is string => typeof x === "string" && x.length > 0));
  return declared.filter((id) => !covered.has(id));
}

/** Feature-wide persistence invariants (service-backed) that HAVE >=1 invariant_id-tagged covering item
 *  in the master test-list but NONE of the SHAPE their type requires — a `transactional` invariant with
 *  no atomicity/rollback cover, or a `migration_reversible` invariant with no downgrade round-trip cover.
 *  The SHAPE complement to featureUncoveredInvariantIds (which finds only the ABSENT-cover case): a
 *  truly-inherited transactional invariant (no schema anchor → no story owner) whose only cover is a
 *  wrong-shaped state test slips every per-story gate AND the uncovered self-heal, and hard-raised at the
 *  approve gate (the F2/S3 PI1-adjust-updates-in-place case). Uses the SAME describe* detectors as
 *  checkTransactionalShape / checkMigrationReversibleShape, so the self-heal and the approve-gate backstop
 *  can never disagree on what "wrong shape" means. Empty when all covers are correctly shaped. */
function featureMisshapedInvariants(consortDir: string, featureId: string): Array<{ id: string; type: string }> {
  let archText: string, tlText: string;
  try {
    archText = readFileSync(architectureJson(consortDir, featureId), "utf8");
    tlText = readFileSync(featureTestListJson(consortDir, featureId), "utf8");
  } catch {
    return [];
  }
  let arch: { service_backed?: boolean; persistence_invariants?: Array<{ id?: string; type?: string }> };
  let tl: { items?: Array<{ invariant_id?: string; description?: string }> };
  try {
    arch = JSON.parse(archText);
    tl = JSON.parse(tlText);
  } catch {
    return [];
  }
  if (arch.service_backed !== true) return [];
  const items = tl.items ?? [];
  const out: Array<{ id: string; type: string }> = [];
  for (const inv of arch.persistence_invariants ?? []) {
    if (!inv || typeof inv.id !== "string" || !inv.id) continue;
    if (inv.type !== "transactional" && inv.type !== "migration_reversible") continue;
    const covering = items.filter((it) => it.invariant_id === inv.id);
    if (covering.length === 0) continue; // the ABSENT-cover case is featureUncoveredInvariantIds' job
    const shaped =
      inv.type === "transactional"
        ? covering.some((it) => describesAtomicityRollback(it.description ?? ""))
        : covering.some((it) => describesMigrationRoundTrip(it.description ?? ""));
    if (!shaped) out.push({ id: inv.id, type: inv.type });
  }
  return out;
}

/** The design-complete coverage SELF-HEAL hits: at the design-completing story, one reflect-testlist
 *  -defect per uncovered OR wrong-shaped feature invariant, flagged against its OWNING story (schema
 *  -change realizer, else the write-path writer — reliable now; falls back to the design-completing story
 *  when neither resolves). The revise-route reopens each owning story's test-strategist to cover/re-shape
 *  it — so a mis-shaped transactional/migration invariant self-heals here instead of hard-raising at the
 *  approve gate (the F2/S3 PI1 case). */
function designCompleteCoverageHits(consortDir: string, featureId: string, story: string): SmellHit[] {
  if (!isDesignCompletingStory(consortDir, featureId, story)) return [];
  const uncovered = featureUncoveredInvariantIds(consortDir, featureId);
  const misshaped = featureMisshapedInvariants(consortDir, featureId);
  const owners = invariantOwnerStories(consortDir, featureId, undefined, { writePath: true });
  // INSTRUMENTATION (visible in the live drive log): show the design-complete coverage decision — the
  // declared-but-uncovered AND covered-but-wrong-shaped invariants, and the owning story the write-path
  // attributed each to (the story whose test-strategist the revise-route will reopen). So a real run
  // SHOWS the self-heal's attribution (and any mis-attribution) directly, rather than it being inferred.
  const ownerOf = (id: string) => owners.get(id) ?? `${story}(fallback)`;
  const uncoveredNote = uncovered.length === 0 ? "none" : uncovered.map((id) => `${id} -> ${ownerOf(id)}`).join(", ");
  const misshapedNote = misshaped.length === 0 ? "none" : misshaped.map((m) => `${m.id}(${m.type}) -> ${ownerOf(m.id)}`).join(", ");
  process.stdout.write(`[coverage-self-heal] design-complete at ${story}: uncovered={${uncoveredNote}} misshaped={${misshapedNote}}\n`);
  const hits: SmellHit[] = [];
  for (const id of uncovered) {
    const owner = owners.get(id) ?? story;
    hits.push({
      smell: TESTLIST_SMELL,
      cycle_ids: [],
      story_id: owner,
      detail:
        `feature-wide persistence coverage (design-complete): invariant ${id} has NO covering test-list item (invariant_id); ` +
        `realized by ${owner}. Add a correctly-shaped covering test tagged invariant_id=${id} to ${owner}'s test-list (see test-strategy.md).`,
    });
  }
  for (const { id, type } of misshaped) {
    const owner = owners.get(id) ?? story;
    hits.push({
      smell: TESTLIST_SMELL,
      cycle_ids: [],
      story_id: owner,
      detail:
        `feature-wide persistence SHAPE (design-complete): transactional/migration invariant ${id} (${type}) is covered but by the WRONG SHAPE — ` +
        (type === "transactional"
          ? `a transactional invariant needs an ATOMICITY/ROLLBACK test (force a mid-transaction failure, assert NEITHER write persists — the F2 T19 shape), not a state/persistence assertion`
          : `a migration_reversible invariant needs a downgrade→upgrade ROUND-TRIP, not a forward-only assertion`) +
        `. Re-author ${owner}'s covering item to the right shape, OR retag ${id} onto the item that performs it (see test-strategy.md).`,
    });
  }
  return hits;
}
