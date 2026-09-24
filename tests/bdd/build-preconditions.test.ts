// Pre-condition preparers: the ONE source of truth for the deterministic context a BUILD
// turn is pre-conditioned with (the context-pack + the green-failure advisory). Both the
// real drive's roleTaskBody (positioned) AND the executor's PREPARE-PRECONDITIONS phase
// (declared) consume THESE pure projections, so a turn is pre-conditioned identically no
// matter which track dispatched it. These tests pin the registry + the green-failure
// advisory projection byte-for-byte against the marker the assess prompt injects.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  buildGreenFailureAdvisory,
  resolvePreparer,
  PRECONDITION_PREPARERS,
} from "../../consort/orchestrator/build/preconditions";
import { writeGreenFailure } from "../../consort/smells/supersession.js";

let tdd: string;
const F = "F6";
const S = "S3";
const AC = "AC1-split-fields-shown";

/** Seed a conventions.json (the LAYOUT source) directly – same shape the effects suite uses. */
function seedConventions(): void {
  mkdirSync(join(tdd, "architecture"), { recursive: true });
  writeFileSync(
    join(tdd, "architecture", "conventions.json"),
    JSON.stringify({
      established_by: F,
      established_at: "2026-01-01T00:00:00.000Z",
      service_backed: true,
      layers: [{ role: "service", module: "app/services" }],
    }),
  );
}

beforeEach(() => {
  tdd = mkdtempSync(join(tmpdir(), "precond-"));
});
afterEach(() => rmSync(tdd, { recursive: true, force: true }));

describe("resolvePreparer / PRECONDITION_PREPARERS", () => {
  it("registers exactly the shipped preparers", () => {
    // context-pack + green-failure-advisory (build self-heal turns) + test-analyst-roster (the
    // test-strategist supervisor's per-kind analyst roster, gated on the project's uiTrack).
    expect(Object.keys(PRECONDITION_PREPARERS).sort()).toEqual([
      "context-pack",
      "green-failure-advisory",
      "test-analyst-roster",
    ]);
  });

  it("resolves a known kind to a preparer fn", () => {
    expect(typeof resolvePreparer("context-pack")).toBe("function");
    expect(typeof resolvePreparer("green-failure-advisory")).toBe("function");
    expect(typeof resolvePreparer("test-analyst-roster")).toBe("function");
  });

  it("THROWS loud on an unknown kind (a manifest-authoring bug, never silently no-ops)", () => {
    expect(() => resolvePreparer("no-such-preparer")).toThrow(/no-such-preparer|unknown preparer/i);
  });
});

describe("green-failure-advisory preparer (byte-identical to the assess prompt's pre-localization)", () => {
  it("returns empty when there is no green-failure marker", () => {
    expect(buildGreenFailureAdvisory(tdd, F, S, AC)).toBe("");
  });

  it("projects the failureOutput block (start-here failure) when present", () => {
    writeGreenFailure(tdd, F, S, AC, {
      assessed: false,
      summary: "client suite failed",
      failureOutput: "FAIL client/tests/pages/StockView.test.tsx\n  Error: Cannot find module '../../src/pages/StockViewPage'",
    });
    const adv = buildGreenFailureAdvisory(tdd, F, S, AC);
    expect(adv).toMatch(/THE VERIFY'S OWN FAILURE OUTPUT \(start HERE/);
    expect(adv).toMatch(/Cannot find module '\.\.\/\.\.\/src\/pages\/StockViewPage'/);
    // Fenced + trailing blank line, exactly as the inline block produced.
    expect(adv.endsWith("```\n\n")).toBe(true);
  });

  it("projects contract + superseded advisories in FAILURE, CONTRACT, SUPERSEDED order", () => {
    writeGreenFailure(tdd, F, S, AC, {
      assessed: false,
      summary: "x",
      failureOutput: "FAILOUT",
      contractRefs: "app/models.py:12 uses inventory_code",
      supersededTestRefs: "SUPERSEDED-TEST CANDIDATES:\n  tests/architecture/test_migration.py",
    });
    const adv = buildGreenFailureAdvisory(tdd, F, S, AC);
    const failIdx = adv.indexOf("FAILOUT");
    const contractIdx = adv.indexOf("app/models.py:12");
    const supIdx = adv.indexOf("SUPERSEDED-TEST CANDIDATES");
    expect(failIdx).toBeGreaterThanOrEqual(0);
    expect(failIdx).toBeLessThan(contractIdx);
    expect(contractIdx).toBeLessThan(supIdx);
  });

  it("projects a test-smell advisory that routes a surgical driver fix, NOT a reopen", () => {
    writeGreenFailure(tdd, F, S, AC, {
      assessed: false,
      summary: "TEST-AUTHORING-SMELL",
      testSmellRefs: "  [broad-integrity-except] tests/architecture/test_contract_migration.py:288  except Exception:\n      fix: narrow to the specific error",
    });
    const adv = buildGreenFailureAdvisory(tdd, F, S, AC);
    expect(adv).toContain("test_contract_migration.py:288");
    expect(adv).toMatch(/assess-regression --fix/);
    expect(adv).toMatch(/NOT a spec-defect/);
    expect(adv).toMatch(/do NOT recommend consort-reopen-story/);
  });

  it("omits the test-smell advisory when no smell was localized", () => {
    writeGreenFailure(tdd, F, S, AC, { assessed: false, summary: "x" });
    expect(buildGreenFailureAdvisory(tdd, F, S, AC)).not.toMatch(/assess-regression --fix/);
  });
});

describe("context-pack preparer", () => {
  it("projects the LAYOUT map from conventions.json (delegates to buildContextPack)", () => {
    seedConventions();
    const pack = PRECONDITION_PREPARERS["context-pack"]({ consortDir: tdd, featureId: F, story: S, ac: AC });
    expect(pack).toMatch(/LAYOUT \(place\/judge code/);
    expect(pack).toMatch(/service=app\/services/);
  });

  it("honors the skipTestLoop option (no TESTS line for RED/REVIEW)", () => {
    seedConventions();
    const withLoop = PRECONDITION_PREPARERS["context-pack"]({ consortDir: tdd, featureId: F, story: S, ac: AC });
    const noLoop = PRECONDITION_PREPARERS["context-pack"]({ consortDir: tdd, featureId: F, story: S, ac: AC, options: { skipTestLoop: true } });
    expect(withLoop).toMatch(/TESTS ::/);
    expect(noLoop).not.toMatch(/TESTS ::/);
  });
});
