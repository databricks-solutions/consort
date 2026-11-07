// The one-shot NAVIGATOR RE-AUTHOR marker for a test-RESILIENCE smell.
//
// When the build-cycle GREEN smell gate finds a `RESILIENCE_TEST_SMELLS` violation
// (an e2e that re-reads persisted state without a confirmed signal, or a fixed-duration
// wait), the Navigator who AUTHORED that test must RE-AUTHOR it resilient — not a Driver
// code repair, not a HIL halt. This marker routes an AUTO Navigator reauthor turn and
// bounds it to ONE attempt: the Navigator edits the flagged test(s), the cycle re-runs
// the GREEN verify, and if the smell persists the gate escalates (the one-shot is spent).
// Per-AC scope, mirroring the deploy-verify-assess marker conventions.
import * as fs from "node:fs";
import * as path from "node:path";
import { findFeatureDir } from "../../consort/config/consort-paths.js";

export interface ReauthorMarker {
  version: 1;
  ac_id: string;
  /** The test file(s) the resilience smell flagged — what the Navigator re-authors. */
  flagged_tests: string[];
  /** The deterministic per-occurrence remediation (from `checkTestSmells`) the Navigator applies. */
  remediation: string;
  /** Reauthor turns spent. One-shot: at 1, a still-flagged smell escalates to HIL. */
  attempts: number;
}

function markerPath(consortDir: string, featureId: string, story: string, ac: string): string | undefined {
  const fdir = findFeatureDir(consortDir, featureId);
  if (!fdir) return undefined;
  return path.join(fdir, "stories", story, `reauthor-resilience-${ac}.json`);
}

export function readReauthorMarker(
  consortDir: string,
  featureId: string,
  story: string,
  ac: string,
): ReauthorMarker | undefined {
  const file = markerPath(consortDir, featureId, story, ac);
  if (!file || !fs.existsSync(file)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as ReauthorMarker;
  } catch {
    return undefined;
  }
}

/** Record a reauthor marker (attempts preserved across a re-detect so the one-shot bound
 *  is not reset). Refreshes the flagged tests + remediation. */
export function writeReauthorMarker(
  consortDir: string,
  featureId: string,
  story: string,
  ac: string,
  flaggedTests: string[],
  remediation: string,
): string | undefined {
  const file = markerPath(consortDir, featureId, story, ac);
  if (!file) return undefined;
  const prior = readReauthorMarker(consortDir, featureId, story, ac);
  const marker: ReauthorMarker = {
    version: 1,
    ac_id: ac,
    flagged_tests: flaggedTests,
    remediation,
    attempts: prior?.attempts ?? 0,
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(marker, null, 2) + "\n", "utf8");
  return file;
}

/** The AC has an UNSPENT reauthor marker: route the Navigator reauthor turn. */
export function reauthorNeeded(consortDir: string, featureId: string, story: string, ac: string): boolean {
  const m = readReauthorMarker(consortDir, featureId, story, ac);
  return !!m && m.attempts < 1;
}

/** Count a reauthor turn (the Navigator re-authored once). Spends the one shot. */
export function markReauthored(consortDir: string, featureId: string, story: string, ac: string): void {
  const file = markerPath(consortDir, featureId, story, ac);
  const m = readReauthorMarker(consortDir, featureId, story, ac);
  if (!file || !m) return;
  m.attempts += 1;
  fs.writeFileSync(file, JSON.stringify(m, null, 2) + "\n", "utf8");
}

/** Clear the marker once the re-verify greened (the test is resilient now). */
export function clearReauthorMarker(consortDir: string, featureId: string, story: string, ac: string): void {
  const file = markerPath(consortDir, featureId, story, ac);
  if (file && fs.existsSync(file)) fs.rmSync(file, { force: true });
}
