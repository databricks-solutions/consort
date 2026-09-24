// The deterministic pre-reflect test_list gate (consort/smells/testlist-conformance.ts):
// runs the structural conformance checks over a story's test-list EARLIER than the
// spec gate — so a structural defect (a client test on a non-E2E AC, a jsdom-vacuous
// browser assertion) flags the reflect-testlist-defect smell without an LLM reflect lap.

import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { testlistConformanceReason, recordTestListGate } from "../../consort/smells/testlist-conformance.js";
import { readSmellsLog } from "../../consort/smells/smells.js";

const F = "F1";
const S = "S1";
const tmpDirs: string[] = [];

/** A .consort dir with a story's acs/*.json + test-list-per-story.json. */
function seed(acs: Array<{ id: string; layer: string }>, items: Array<{ id: string; kind: string; ac_id: string; scenario_file?: string; description?: string }>): string {
  const consortDir = fs.mkdtempSync(path.join(os.tmpdir(), "testlist-conf-"));
  tmpDirs.push(consortDir);
  const storyDir = path.join(consortDir, "features", F, "stories", S);
  const acsDir = path.join(storyDir, "acs");
  fs.mkdirSync(acsDir, { recursive: true });
  for (const ac of acs) fs.writeFileSync(path.join(acsDir, `${ac.id}.json`), JSON.stringify({ id: ac.id, layer: ac.layer }));
  fs.writeFileSync(path.join(storyDir, "test-list-per-story.json"), JSON.stringify({ feature_id: F, story_id: S, items }));
  return consortDir;
}

afterEach(() => {
  while (tmpDirs.length) {
    const d = tmpDirs.pop();
    if (d) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } }
  }
});

describe("testlistConformanceReason", () => {
  it("is null (conformant) for a client item on an E2E AC + a real e2e spec", () => {
    const dir = seed(
      [{ id: "AC1-file", layer: "E2E" }],
      [{ id: "T1", kind: "client", ac_id: "AC1-file", scenario_file: "client/tests/e2e/file.spec.ts", description: "files a row" }],
    );
    expect(testlistConformanceReason(dir, F, S)).toBeNull();
  });

  it("flags a client item anchored to an API-layer AC (the T22 class)", () => {
    const dir = seed(
      [{ id: "AC3-collision", layer: "API" }],
      [{ id: "T22", kind: "client", ac_id: "AC3-collision", scenario_file: "client/tests/e2e/optimistic.spec.ts", description: "updates in place" }],
    );
    const reason = testlistConformanceReason(dir, F, S);
    expect(reason).not.toBeNull();
    expect(reason).toMatch(/AC3-collision|client/i);
  });

  it("flags a jsdom-vacuous browser assertion (the T19 class)", () => {
    const dir = seed(
      [{ id: "AC1-file", layer: "E2E" }],
      [
        { id: "T1", kind: "client", ac_id: "AC1-file", scenario_file: "client/tests/e2e/file.spec.ts", description: "files a row" },
        { id: "T19", kind: "client", ac_id: "AC1-file", scenario_file: "client/tests/pages/App.routing.test.tsx", description: "no full-page reload occurs during any transition" },
      ],
    );
    expect(testlistConformanceReason(dir, F, S)).not.toBeNull();
  });

  it("is vacuously null when no test-list exists yet (never pre-empts before testListReady)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "testlist-conf-"));
    tmpDirs.push(dir);
    expect(testlistConformanceReason(dir, F, S)).toBeNull();
  });
});

describe("recordTestListGate", () => {
  it("flags the reflect-testlist-defect smell on a non-conformant test-list, no LLM turn", () => {
    const dir = seed(
      [{ id: "AC3-collision", layer: "API" }],
      [{ id: "T22", kind: "client", ac_id: "AC3-collision", scenario_file: "client/tests/e2e/x.spec.ts", description: "x" }],
    );
    const hits = recordTestListGate(dir, F, S);
    expect(hits).toHaveLength(1);
    expect(hits[0].smell).toBe("reflect-testlist-defect");
    const open = readSmellsLog(dir).detected.filter((d) => d.smell === "reflect-testlist-defect" && !d.resolution);
    expect(open).toHaveLength(1);
    expect(open[0].detail).toMatch(/test-list conformance/);
  });

  it("returns [] and self-clears on a conformant test-list", () => {
    const dir = seed(
      [{ id: "AC1-file", layer: "E2E" }],
      [{ id: "T1", kind: "client", ac_id: "AC1-file", scenario_file: "client/tests/e2e/file.spec.ts", description: "files a row" }],
    );
    expect(recordTestListGate(dir, F, S)).toEqual([]);
    const open = readSmellsLog(dir).detected.filter((d) => d.smell === "reflect-testlist-defect" && !d.resolution);
    expect(open).toHaveLength(0);
  });
});
