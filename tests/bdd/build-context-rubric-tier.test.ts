// The flightiness fix: contextRubric injects PRODUCT NFRs into a story's per-turn
// rubric but EXCLUDES tier:"platform" NFRs — a cross-cutting/substrate-guaranteed
// concern is defended once by its gate/feature-level fitness, not re-reasoned in
// every story. Untiered NFRs are product by default and still thread.

import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { contextRubric } from "../../consort/orchestrator/build/build-context";

const dirs: string[] = [];
afterEach(() => { while (dirs.length) { try { rmSync(dirs.pop()!, { recursive: true, force: true }); } catch { /* */ } } });

function scaffold(nfrs: Array<Record<string, unknown>>): string {
  const consortDir = mkdtempSync(join(tmpdir(), "rubric-tier-"));
  dirs.push(consortDir);
  const F = "F1-x";
  const featureDir = join(consortDir, "features", F);
  const acsDir = join(featureDir, "stories", "S1", "acs");
  mkdirSync(acsDir, { recursive: true });
  writeFileSync(join(acsDir, "AC1.json"), JSON.stringify({ id: "AC1", layer: "API" }));
  writeFileSync(join(featureDir, "architecture.json"), JSON.stringify({ feature_id: F, nfrs }));
  return consortDir;
}

describe("contextRubric: platform NFRs are not threaded into the per-story rubric", () => {
  it("excludes a tier:'platform' NFR, keeps a product NFR (both feature-wide)", () => {
    const consortDir = scaffold([
      { id: "NFR-prod", brief: "exact-decimal storage", applies_to: "F1-x", tier: "product" },
      { id: "NFR-plat", brief: "clear layering", applies_to: "F1-x", tier: "platform", defended_by_gate: "consort-layering-clean" },
    ]);
    const rubric = contextRubric(consortDir, "F1-x", "S1", "");
    expect(rubric).toContain("NFR-prod");
    expect(rubric).not.toContain("NFR-plat");
  });

  it("threads an UNTIERED NFR (product by default)", () => {
    const consortDir = scaffold([{ id: "NFR-legacy", brief: "some guarantee", applies_to: "F1-x" }]);
    expect(contextRubric(consortDir, "F1-x", "S1", "")).toContain("NFR-legacy");
  });
});
