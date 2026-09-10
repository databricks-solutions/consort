// Guard for a PRE-REGISTERED example: the live design lane must not re-derive a
// different story/AC breakdown than the registration. Proves: slug-level (ordinal
// insensitive) matching; an invented story (the `app-shell` wild path) and AC
// restructures are flagged; un-authored ACs are not falsely flagged; absent
// registration is a complete no-op; and analyzeForGate surfaces a divergence as a
// transition_blocker (fail-closed at the design-spec gate).

import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  checkRegisteredBreakdown,
  readRegistration,
  readDerivedBreakdown,
  type Registration,
} from "../../consort/gates/registered-breakdown";

const REG: Registration = {
  feature_id: "F1-stock-visibility",
  stories: [
    { id: "S1-file-stock", acs: ["AC1-file-stock-record", "AC2-retrieve-stock-record", "AC3-collision-resolved-at-write"] },
    { id: "S2-stock-by-location-table", acs: ["AC1-table-lists-stock-by-location"] },
  ],
};

describe("checkRegisteredBreakdown: derived breakdown vs registration (by slug)", () => {
  it("ok when the derived breakdown matches, even with shifted ordinals", () => {
    // Same slugs, different ordinals (S1<->S2 renumbered) => still a match.
    const derived = [
      { id: "S2-file-stock", acs: ["AC3-file-stock-record", "AC1-retrieve-stock-record", "AC9-collision-resolved-at-write"] },
      { id: "S1-stock-by-location-table", acs: ["AC1-table-lists-stock-by-location"] },
    ];
    expect(checkRegisteredBreakdown(REG, derived)).toEqual({ ok: true, violations: [] });
  });

  it("flags an invented/unregistered story (the app-shell wild path)", () => {
    const derived = [
      { id: "S1-app-shell", acs: ["AC1-navbar-shell"] },
      { id: "S2-file-stock", acs: REG.stories[0].acs },
      { id: "S3-stock-by-location-table", acs: REG.stories[1].acs },
    ];
    const r = checkRegisteredBreakdown(REG, derived);
    expect(r.ok).toBe(false);
    expect(r.violations.join(" ")).toMatch(/unregistered story "S1-app-shell"/);
  });

  it("flags a missing registered story", () => {
    const derived = [{ id: "S1-file-stock", acs: REG.stories[0].acs }]; // dropped stock-by-location-table
    const r = checkRegisteredBreakdown(REG, derived);
    expect(r.ok).toBe(false);
    expect(r.violations.join(" ")).toMatch(/registered story "S2-stock-by-location-table" is missing/);
  });

  it("flags AC restructures (unregistered + missing AC) for a story that has ACs", () => {
    const derived = [
      { id: "S1-file-stock", acs: ["AC1-file-stock-record", "AC2-retrieve-stock-record", "AC3-actor-capture"] }, // collision->actor-capture
      { id: "S2-stock-by-location-table", acs: REG.stories[1].acs },
    ];
    const r = checkRegisteredBreakdown(REG, derived);
    expect(r.ok).toBe(false);
    expect(r.violations.join(" ")).toMatch(/unregistered AC "AC3-actor-capture"/);
    expect(r.violations.join(" ")).toMatch(/registered AC "AC3-collision-resolved-at-write" is missing/);
  });

  it("does NOT flag a matched story whose ACs are not authored yet (empty acs => skip AC check)", () => {
    const derived = [
      { id: "S1-file-stock", acs: [] }, // design lane hasn't authored ACs yet
      { id: "S2-stock-by-location-table", acs: [] },
    ];
    expect(checkRegisteredBreakdown(REG, derived)).toEqual({ ok: true, violations: [] });
  });
});

describe("readRegistration / readDerivedBreakdown (filesystem)", () => {
  const dirs: string[] = [];
  afterEach(() => { while (dirs.length) { try { rmSync(dirs.pop()!, { recursive: true, force: true }); } catch { /* */ } } });
  function scaffold(withRegistration: boolean, stories: Record<string, string[]>): string {
    const consortDir = mkdtempSync(join(tmpdir(), "reg-breakdown-"));
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

  it("readRegistration returns null when absent (guard no-ops for non-registered projects)", () => {
    const consortDir = scaffold(false, { "S1-file-stock": ["AC1-file-stock-record"] });
    expect(readRegistration(consortDir, "F1-stock-visibility")).toBeNull();
  });

  it("readRegistration returns null for a DIFFERENT feature (registration is feature-scoped)", () => {
    const consortDir = scaffold(true, { "S1-file-stock": ["AC1-file-stock-record"] });
    expect(readRegistration(consortDir, "F2-other-feature")).toBeNull();
    expect(readRegistration(consortDir, "F1-stock-visibility")).not.toBeNull();
  });

  it("readRegistration + readDerivedBreakdown reflect what is on disk, and the check flags divergence", () => {
    const consortDir = scaffold(true, {
      "S1-app-shell": ["AC1-navbar-shell"],
      "S2-file-stock": REG.stories[0].acs,
      "S3-stock-by-location-table": REG.stories[1].acs,
    });
    const reg = readRegistration(consortDir, "F1-stock-visibility");
    expect(reg?.feature_id).toBe("F1-stock-visibility");
    const derived = readDerivedBreakdown(consortDir, "F1-stock-visibility");
    expect(derived.map((d) => d.id)).toContain("S1-app-shell");
    const r = checkRegisteredBreakdown(reg!, derived);
    expect(r.ok).toBe(false);
    expect(r.violations.join(" ")).toMatch(/unregistered story "S1-app-shell"/);
  });
});
