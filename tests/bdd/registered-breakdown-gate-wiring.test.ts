// Regression guard for the "guard on the wrong door" bug: the registered-breakdown
// check was wired into analyzeForGate (design-spec-gate), which the live orchestrator
// NEVER calls — so a pre-registered example diverged freely (stockflow-3-87 sailed
// past with blockers:[]). The LIVE spec gate is resolveArtifactInputs
// (gate-conformance-guard), invoked by human-proxy. These tests pin the check to
// that live path: (1) registeredBreakdownReason (the wrapper the spec case calls)
// blocks a divergent breakdown / no-ops when unregistered / passes on a match, and
// (2) the resolveArtifactInputs spec case actually references it (anti re-orphaning).

import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registeredBreakdownReason } from "../../consort/gates/gate-conformance-guard";

const dirs: string[] = [];
afterEach(() => { while (dirs.length) { try { rmSync(dirs.pop()!, { recursive: true, force: true }); } catch { /* */ } } });

const REG = {
  feature_id: "F1-stock-visibility",
  stories: [
    { id: "S1-file-stock", acs: ["AC1-file-stock-record", "AC2-retrieve-stock-record"] },
    { id: "S2-stock-by-location-table", acs: ["AC1-table"] },
  ],
};

/** consortDir with a registration.json + a derived story/AC breakdown on disk. */
function scaffold(withRegistration: boolean, stories: Record<string, string[]>): string {
  const consortDir = mkdtempSync(join(tmpdir(), "reg-gate-"));
  dirs.push(consortDir);
  const F = "F1-stock-visibility";
  const featureDir = join(consortDir, "features", F);
  for (const [s, acs] of Object.entries(stories)) {
    const adir = join(featureDir, "stories", s, "acs");
    mkdirSync(adir, { recursive: true });
    for (const ac of acs) writeFileSync(join(adir, `${ac}.json`), "{}");
  }
  if (withRegistration) writeFileSync(join(consortDir, "registration.json"), JSON.stringify(REG));
  return consortDir;
}

describe("registeredBreakdownReason: the LIVE spec-gate wrapper", () => {
  it("HARD-BLOCKS a divergent breakdown (invented/renamed stories)", () => {
    const consortDir = scaffold(true, {
      "S1-file-stock": ["AC1-file-stock-record", "AC2-retrieve-stock-record"],
      "S2-view-home": [], // divergent: registered as S2-stock-by-location-table
    });
    const reason = registeredBreakdownReason(consortDir, "F1-stock-visibility");
    expect(reason).not.toBeNull();
    expect(reason!).toMatch(/Registered-breakdown HARD-BLOCK/);
    expect(reason!).toMatch(/S2-view-home/);
  });

  it("no-ops (null) for a non-registered feature", () => {
    const consortDir = scaffold(false, { "S1-anything": ["AC1-x"] });
    expect(registeredBreakdownReason(consortDir, "F1-stock-visibility")).toBeNull();
  });

  it("passes (null) when the derived breakdown matches the registration by slug", () => {
    const consortDir = scaffold(true, {
      "S1-file-stock": ["AC1-file-stock-record", "AC2-retrieve-stock-record"],
      "S2-stock-by-location-table": ["AC1-table"],
    });
    expect(registeredBreakdownReason(consortDir, "F1-stock-visibility")).toBeNull();
  });
});

describe("wiring: the resolveArtifactInputs spec case calls registeredBreakdownReason (anti re-orphaning)", () => {
  it("gate-conformance-guard's spec case references registeredBreakdownReason", () => {
    const src = readFileSync(join(__dirname, "..", "..", "consort", "gates", "gate-conformance-guard.ts"), "utf8");
    // The check must be invoked inside resolveArtifactInputs (the live gate human-proxy calls),
    // not only defined — the exact regression that let it sit orphaned in analyzeForGate.
    const specCase = src.slice(src.indexOf('case "spec"'), src.indexOf('case "plan"'));
    expect(specCase).toMatch(/registeredBreakdownReason\(/);
  });
});
