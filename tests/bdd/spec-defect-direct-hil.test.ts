// BDD coverage for the confirmed-unfixable-regression route (issue #200): a green
// failure the Navigator assessed with NO fix directive is a CONFIRMED
// non-driver-fixable failure and must route DIRECTLY to the HIL with the diagnosis –
// never fall through to doomed Driver green re-attempts for the full fixAttempts
// budget (3 x ~150s opus turns) before escalating.

import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { hasPendingUnfixableRegression, greenFailureJson } from "../../consort/smells/supersession.js";
import { nextTransition, type DriveState } from "../../consort/orchestrator/drive/orchestrator-drive.js";

const tmpDirs: string[] = [];
function mkTdd(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "unfixable-regression-"));
  tmpDirs.push(dir);
  return dir;
}
function writeGreenFailure(tdd: string, body: Record<string, unknown>): void {
  const file = greenFailureJson(tdd, "F1", "S1", "AC1");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(body, null, 2) + "\n");
}
afterEach(() => {
  while (tmpDirs.length) {
    const dir = tmpDirs.pop();
    if (dir) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
    }
  }
});

describe("hasPendingUnfixableRegression", () => {
  it("assessed with NO fix directive -> confirmed unfixable (direct HIL)", () => {
    const tdd = mkTdd();
    writeGreenFailure(tdd, { assessed: true, diagnosis: "the test asserts a migration that should not exist" });
    expect(hasPendingUnfixableRegression(tdd, "F1", "S1", "AC1")).toBe(true);
  });

  it("assessed WITH a fix directive -> NOT unfixable (the bounded repair path)", () => {
    const tdd = mkTdd();
    writeGreenFailure(tdd, { assessed: true, diagnosis: "x", fixDirective: "filter by the test's own rows" });
    expect(hasPendingUnfixableRegression(tdd, "F1", "S1", "AC1")).toBe(false);
  });

  it("assessed as a SPEC-DEFECT -> NOT unfixable (the spec-defect route owns it)", () => {
    const tdd = mkTdd();
    writeGreenFailure(tdd, { assessed: true, diagnosis: "x", specDefect: { fromRole: "test-strategist" } });
    expect(hasPendingUnfixableRegression(tdd, "F1", "S1", "AC1")).toBe(false);
  });

  it("NOT yet assessed -> NOT unfixable (the assess turn must run first)", () => {
    const tdd = mkTdd();
    writeGreenFailure(tdd, { assessed: false, diagnosis: "x" });
    expect(hasPendingUnfixableRegression(tdd, "F1", "S1", "AC1")).toBe(false);
  });

  it("no green-failure record at all -> NOT unfixable", () => {
    expect(hasPendingUnfixableRegression(mkTdd(), "F1", "S1", "AC1")).toBe(false);
  });
});

describe("nextTransition: a confirmed unfixable regression escalates DIRECTLY (issue #200)", () => {
  function buildState(build: Record<string, unknown>): DriveState {
    return {
      phase: "feature",
      breakdownDone: true,
      storyOrder: ["S1"],
      stories: {
        S1: {
          build: { experimentCut: true, experimentStale: false, ...build },
        } as DriveState["stories"][string],
      },
      buildActive: "S1",
    };
  }

  it("assessed with no directive -> raise-to-hil with the diagnosis, NOT a driver green re-attempt", () => {
    const a = nextTransition(
      buildState({
        testsWritten: true,
        codeWritten: false,
        awaitingAcceptance: false,
        greenUnfixableAc: "AC1",
        greenUnfixableDiagnosis: "the test asserts a migration that should not exist",
      }),
    );
    expect(a.kind).toBe("raise-to-hil");
    if (a.kind === "raise-to-hil") {
      expect(a.source).toBe("green-unfixable");
      expect(a.reason).toMatch(/NOT driver-fixable/);
      expect(a.reason).toMatch(/should not exist/);
    }
  });

  it("a fix directive still routes the bounded repair (the genuine path is untouched)", () => {
    const a = nextTransition(
      buildState({ testsWritten: true, codeWritten: false, awaitingAcceptance: false, repairRegressionAc: "AC1" }),
    );
    expect(a).toMatchObject({ kind: "invoke-role", role: "driver", buildMode: "repair" });
  });

  it("a spec-defect still takes its own route (precedence over the generic unfixable branch)", () => {
    const a = nextTransition(
      buildState({
        testsWritten: true,
        codeWritten: false,
        awaitingAcceptance: false,
        specDefectAc: "AC1",
        specDefectFromRole: "test-strategist",
        greenUnfixableAc: "AC1",
      }),
    );
    expect(a.kind).toBe("raise-to-hil");
    if (a.kind === "raise-to-hil") expect(a.source).toBe("spec-defect");
  });
});
