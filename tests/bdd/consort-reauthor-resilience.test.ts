import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  writeReauthorMarker,
  readReauthorMarker,
  reauthorNeeded,
  markReauthored,
  clearReauthorMarker,
} from "../../consort/smells/reauthor-resilience";

const FEATURE = "F5-cycle-count";
const STORY = "S2-reconcile-to-count";
const AC = "AC1";
let consortDir: string;

beforeEach(() => {
  consortDir = mkdtempSync(join(tmpdir(), "reauthor-"));
  mkdirSync(join(consortDir, "features", FEATURE, "stories", STORY), { recursive: true });
});
afterEach(() => rmSync(consortDir, { recursive: true, force: true }));

describe("reauthor-resilience marker: the one-shot Navigator-reauthor bound", () => {
  it("write -> reauthorNeeded true -> markReauthored -> reauthorNeeded false (one-shot spent) -> clear", () => {
    expect(reauthorNeeded(consortDir, FEATURE, STORY, AC)).toBe(false); // no marker yet

    writeReauthorMarker(consortDir, FEATURE, STORY, AC, ["client/tests/e2e/stock-adjust-inline.spec.ts"], "await the confirmed signal before reload");
    const m = readReauthorMarker(consortDir, FEATURE, STORY, AC);
    expect(m?.flagged_tests).toEqual(["client/tests/e2e/stock-adjust-inline.spec.ts"]);
    expect(m?.attempts).toBe(0);
    expect(reauthorNeeded(consortDir, FEATURE, STORY, AC)).toBe(true); // unspent -> route the reauthor turn

    markReauthored(consortDir, FEATURE, STORY, AC); // the Navigator re-authored once
    expect(readReauthorMarker(consortDir, FEATURE, STORY, AC)?.attempts).toBe(1);
    expect(reauthorNeeded(consortDir, FEATURE, STORY, AC)).toBe(false); // one-shot spent -> a repeat smell escalates

    clearReauthorMarker(consortDir, FEATURE, STORY, AC); // the re-verify greened
    expect(readReauthorMarker(consortDir, FEATURE, STORY, AC)).toBeUndefined();
  });

  it("a re-write preserves the spent attempts (the one-shot is not reset by a re-detect)", () => {
    writeReauthorMarker(consortDir, FEATURE, STORY, AC, ["a.spec.ts"], "fix");
    markReauthored(consortDir, FEATURE, STORY, AC);
    writeReauthorMarker(consortDir, FEATURE, STORY, AC, ["a.spec.ts"], "fix"); // re-detect of the same smell
    expect(readReauthorMarker(consortDir, FEATURE, STORY, AC)?.attempts).toBe(1); // NOT reset to 0
    expect(reauthorNeeded(consortDir, FEATURE, STORY, AC)).toBe(false);
  });
});
