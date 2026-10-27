// Deploy-verify self-heal (FEIP-7916). A feature-verify failure whose failing
// tests PASS when re-run in ISOLATION is shared-state contamination (a test that
// does not own its DB state, e.g. an absolute whole-table aggregate assertion),
// not broken software. Rather than the terminal deploy-verify HIL, the deploy
// classifies the failure and, when it is contamination, records a one-shot
// marker the orchestrator routes to a Navigator ASSESS -> Driver scope turn
// (reusing the build-lane green-failure assess machinery), then re-verifies.
//
// This module is the PURE core (no substrate, no process spawn): parse the
// failing node-ids, classify via an INJECTED isolation re-run, and persist +
// bound the marker. The deploy path wires the real isolation re-run
// (withEphemeralVerifyBranch); the orchestrator probe reads the marker.

import * as fs from "node:fs";
import * as path from "node:path";
import { findFeatureDir } from "../../consort/config/consort-paths.js";
import { collectDroppedColumns, liveReferenceLines } from "../architecture/test-smell-clean.js";

/**
 * Parse pytest "FAILED <nodeid>" / "ERROR <nodeid>" lines from the combined
 * verify output. The node-id is the `path::test` form pytest prints in its
 * short summary, which can be fed straight back to `pytest <nodeid> ...` for
 * the isolation re-run. Deduped + order-preserving.
 */
export function parseFailedNodeIds(output: string): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const line of output.split("\n")) {
    const m = line.match(/^(?:FAILED|ERROR)\s+(\S+::[^\s]+)/);
    if (m && !seen.has(m[1])) {
      seen.add(m[1]);
      ids.push(m[1]);
    }
  }
  return ids;
}

/**
 * Classify which of the deploy-verify FAILING node-ids are SUPERSEDED: their test
 * file references a column a CONTRACT migration in this feature DROPPED. At the
 * deploy-verify stage the test factually failed at HEAD, so a dropped-column
 * reference IS the cause — unlike the authoring-time `dropped-column-test-reference`
 * smell (which must stay conservative and skip downgrade/round-trip files to avoid
 * false positives), here the failure already happened, so a reference to a
 * now-dropped column is proof the test is stale and needs refactoring, NOT a
 * terminal regression HIL. Returns the superseded node-ids (subset of the input).
 * Pure: file reads keyed by the test file, deduped so each file is read once.
 */
export function classifyDeployVerifySupersession(
  failingNodeIds: string[],
  projectDir: string,
  migrationDirs: string[],
): string[] {
  const dropped = collectDroppedColumns(projectDir, migrationDirs);
  if (dropped.size === 0) return [];
  const out: string[] = [];
  const fileSuperseded = new Map<string, boolean>();
  for (const nodeId of failingNodeIds) {
    const file = nodeId.split("::")[0];
    if (!file) continue;
    let superseded = fileSuperseded.get(file);
    if (superseded === undefined) {
      superseded = false;
      try {
        const body = fs.readFileSync(path.join(projectDir, file), "utf8");
        for (const col of dropped) {
          if (liveReferenceLines(body, col).length > 0) {
            superseded = true;
            break;
          }
        }
      } catch {
        /* file gone / unreadable — not classifiable as superseded */
      }
      fileSuperseded.set(file, superseded);
    }
    if (superseded) out.push(nodeId);
  }
  return out;
}

export interface DeployVerifyAssessMarker {
  version: 1;
  /** The story this contamination marker belongs to, or absent for a
   *  FEATURE-ship deploy (no story – the merged-increment verify). The marker
   *  then lives at features/<F>/deploy-verify-assess.json instead of the story dir. */
  story_id?: string;
  /** What kind of self-healable deploy-verify failure this is. Absent =
   *  `"contamination"` (shared-state: the failing tests PASS in isolation; scope
   *  them to own their DB state). `"supersession"` = the failing tests reference a
   *  column this feature's CONTRACT migration DROPPED, so they fail at HEAD (they
   *  do NOT pass in isolation) and are stale – refactor the stale reference. Both
   *  route the same assess -> scope -> refactor machinery; only the directive
   *  framing + the Driver's edit differ. Absent preserves the pre-supersession
   *  byte-identical contamination behavior. */
  kind?: "contamination" | "supersession";
  /** For a `supersession` marker: the contract-dropped columns the failing tests
   *  reference (the ground the Navigator's assess turn confirms against). */
  dropped_columns?: string[];
  /** The pytest node-ids that failed in the full suite – for a contamination
   *  marker the ones the classifier found PASS in isolation; for a supersession
   *  marker the ones referencing a dropped column. The tests to scope/refactor. */
  failing_node_ids: string[];
  /** The OBSERVED failure output (bounded tail of the deploy-verify run) that
   *  produced `failing_node_ids`. Carried so the Navigator's ASSESS turn
   *  adjudicates superseded-vs-genuine from the ACTUAL runtime error (`column X
   *  does not exist` ⇒ superseded; an assertion mismatch ⇒ a real regression),
   *  not a static re-read of the tests. Absent on an older/empty-output marker. */
  failure_output?: string;
  /** True once the Navigator has assessed this failure (flagged the tests to
   *  scope or declared a genuine regression). Set by the assess-finalize step. */
  assessed: boolean;
  /** Assess+scope attempts spent. One-shot: at 1, the marker stops being
   *  assess-eligible and a repeat deploy-verify failure takes the terminal HIL. */
  attempts: number;
  /** The node-ids the Navigator's ASSESS turn confirmed as contamination-fragile
   *  and chose to scope (its scope set). Set by the assess-finalize step from the
   *  Navigator's scope directives. Present + non-empty routes the Driver SCOPE turn;
   *  empty (the Navigator vetoed / found it genuine) routes the terminal HIL. */
  flagged_tests?: string[];
  /** True once the Driver's SCOPE turn refactored the flagged tests to own their
   *  DB state. Set by the refactor-finalize step. Gates the one re-deploy. */
  refactored?: boolean;
}

/** The Navigator's ASSESS-DEPLOY output: per contamination-fragile test, HOW to
 *  scope it to own its DB state (seed + assert its own rows, or assert a delta,
 *  never an absolute whole-table total). Read by the refactor-finalize step to
 *  decide the scope set, and injected into the Driver's SCOPE turn as guidance. */
export interface DeployVerifyScope {
  version: 1;
  /** Absent for a feature-ship scope file (no story). */
  story_id?: string;
  directives: { node_id: string; directive: string }[];
}

/** The scope/marker files live at STORY scope (next to the story's
 *  deploy-evidence.json) when a storyId is given, else at FEATURE scope
 *  (features/<F>/) for the feature-ship deploy's own self-heal. */
function scopePath(consortDir: string, featureId: string, storyId?: string): string | undefined {
  const fdir = findFeatureDir(consortDir, featureId);
  if (!fdir) return undefined;
  return storyId
    ? path.join(fdir, "stories", storyId, "deploy-verify-scope.json")
    : path.join(fdir, "deploy-verify-scope.json");
}

/** Read the Navigator's scope directives (undefined when it wrote none – its veto). */
export function readDeployVerifyScope(
  consortDir: string,
  featureId: string,
  storyId?: string,
): DeployVerifyScope | undefined {
  const file = scopePath(consortDir, featureId, storyId);
  if (!file || !fs.existsSync(file)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as DeployVerifyScope;
  } catch {
    return undefined;
  }
}

/** The marker lives at story scope (next to the story's deploy-evidence.json)
 *  when a storyId is given, else at feature scope for the feature-ship deploy. */
function markerPath(consortDir: string, featureId: string, storyId?: string): string | undefined {
  const fdir = findFeatureDir(consortDir, featureId);
  if (!fdir) return undefined;
  return storyId
    ? path.join(fdir, "stories", storyId, "deploy-verify-assess.json")
    : path.join(fdir, "deploy-verify-assess.json");
}

export function readDeployVerifyAssessMarker(
  consortDir: string,
  featureId: string,
  storyId?: string,
): DeployVerifyAssessMarker | undefined {
  const file = markerPath(consortDir, featureId, storyId);
  if (!file || !fs.existsSync(file)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as DeployVerifyAssessMarker;
  } catch {
    return undefined;
  }
}

/** Record a fresh contamination marker (assessed:false, attempts:0). Idempotent
 *  on re-detection of the same failure: it refreshes the failing node-ids but
 *  preserves the spent `attempts` so the one-shot bound is not reset by a repeat
 *  deploy of the same story/feature. `storyId` absent = the feature-ship marker. */
export function writeDeployVerifyAssessMarker(
  consortDir: string,
  featureId: string,
  storyId: string | undefined,
  failingNodeIds: string[],
  opts?: { kind?: "contamination" | "supersession"; droppedColumns?: string[]; failureOutput?: string },
): string | undefined {
  const file = markerPath(consortDir, featureId, storyId);
  if (!file) return undefined;
  const prior = readDeployVerifyAssessMarker(consortDir, featureId, storyId);
  const supersession = opts?.kind === "supersession";
  // Carry a BOUNDED tail of the observed failure so the marker (and the assess
  // directive built from it) stays readable; the tail holds the pytest short
  // summary + the last FAILURES blocks, which is what names the real cause.
  const failureTail = opts?.failureOutput ? opts.failureOutput.slice(-6000) : undefined;
  const marker: DeployVerifyAssessMarker = {
    version: 1,
    ...(storyId ? { story_id: storyId } : {}),
    ...(supersession ? { kind: "supersession" as const } : {}),
    ...(supersession && opts?.droppedColumns?.length ? { dropped_columns: opts.droppedColumns } : {}),
    failing_node_ids: failingNodeIds,
    ...(failureTail ? { failure_output: failureTail } : {}),
    assessed: false,
    attempts: prior?.attempts ?? 0,
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(marker, null, 2) + "\n", "utf8");
  return file;
}

/** Mark the failure assessed (the Navigator turn ran) and count the attempt, so
 *  the next probe finds it no longer assess-eligible until the re-verify clears
 *  or re-detects it. `flaggedTests` (the Navigator's scope set) is recorded when
 *  given: non-empty routes the Driver SCOPE turn; omitted/empty leaves the marker
 *  with nothing to scope (the Navigator vetoed), so the finalize escalates. */
export function markDeployVerifyAssessed(
  consortDir: string,
  featureId: string,
  storyId: string | undefined,
  flaggedTests?: string[],
): void {
  const file = markerPath(consortDir, featureId, storyId);
  const m = readDeployVerifyAssessMarker(consortDir, featureId, storyId);
  if (!file || !m) return;
  m.assessed = true;
  m.attempts += 1;
  if (flaggedTests && flaggedTests.length > 0) m.flagged_tests = flaggedTests;
  fs.writeFileSync(file, JSON.stringify(m, null, 2) + "\n", "utf8");
}

/** Mark the Driver's SCOPE turn done (the flagged tests were refactored to own
 *  their state). Gates the one re-deploy: a refactored marker is no longer
 *  refactor-pending, so the transition falls through to re-deploy + re-verify. */
export function markDeployVerifyRefactored(
  consortDir: string,
  featureId: string,
  storyId?: string,
): void {
  const file = markerPath(consortDir, featureId, storyId);
  const m = readDeployVerifyAssessMarker(consortDir, featureId, storyId);
  if (!file || !m) return;
  m.refactored = true;
  fs.writeFileSync(file, JSON.stringify(m, null, 2) + "\n", "utf8");
}

/** The assessed failure has a non-empty scope set the Driver has not yet
 *  refactored: routes the one Driver SCOPE turn (buildMode refactor-deploy). */
export function deployVerifyRefactorPending(
  consortDir: string,
  featureId: string,
  storyId?: string,
): boolean {
  const m = readDeployVerifyAssessMarker(consortDir, featureId, storyId);
  return !!m && m.assessed === true && (m.flagged_tests?.length ?? 0) > 0 && m.refactored !== true;
}

/** Clear the marker (the re-verify passed – the scope worked). */
export function clearDeployVerifyAssessMarker(
  consortDir: string,
  featureId: string,
  storyId?: string,
): void {
  const file = markerPath(consortDir, featureId, storyId);
  if (file && fs.existsSync(file)) fs.rmSync(file);
}

/** One-shot bound: a contamination marker is assess-eligible while it exists,
 *  is not yet assessed, and is under the single-attempt cap. */
export function deployVerifyNeedsAssess(
  consortDir: string,
  featureId: string,
  storyId?: string,
): boolean {
  const m = readDeployVerifyAssessMarker(consortDir, featureId, storyId);
  return !!m && !m.assessed && m.attempts < 1;
}

/**
 * Classify a feature-verify failure. Re-run the failing node-ids in ISOLATION
 * (a fresh clean DB, injected by the deploy path). If they ALL pass alone, the
 * failure was shared-state contamination (self-healable via a scope turn); if
 * any still fails alone, it is genuine broken software (the terminal HIL). With
 * no parseable node-ids there is nothing to isolate, so it is treated as genuine.
 */
export async function classifyDeployVerifyFailure(
  failingNodeIds: string[],
  runIsolated: (nodeIds: string[]) => Promise<boolean>,
): Promise<"contamination" | "genuine"> {
  if (failingNodeIds.length === 0) return "genuine";
  const passedAlone = await runIsolated(failingNodeIds);
  return passedAlone ? "contamination" : "genuine";
}
