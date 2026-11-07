// Finding 29: a spec-author can write a truncated / invalid-JSON AC file (e.g.
// ending right after `architectural_notes` with no closing brace). It used to
// pass the per-story spec gate AND the reflect gate (neither parsed the AC files)
// and only fail at deploy gate-conformance, long after build + accept. The
// per-story spec-gate approval now runs the SAME conformance the deploy gate
// trusts, so the defect fails at approve time, where it is produced. Hermetic.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  initPipeline,
  writePipeline,
  surfaceForGate,
  approveStoryGateFromDisk,
} from "../../consort/pipeline/story-pipeline";
import { featureDir, storyAcsConformanceReason } from "../../consort/gates/gate-conformance-guard";

const F = "F4-pick-outbound";
const S = "S2-stock-row-unchanged";
const APPROVER = "po@example.com";

let tdd: string;
beforeEach(() => {
  tdd = mkdtempSync(join(tmpdir(), "tdd-ac-conf-"));
});
afterEach(() => rmSync(tdd, { recursive: true, force: true }));

function acsDir(): string {
  const d = join(tdd, "features", F, "stories", S, "acs");
  mkdirSync(d, { recursive: true });
  return d;
}

/** A schema-conformant first-in-story AC. */
const CONFORMANT_AC = {
  id: "AC1-row-unchanged",
  layer: "Infra",
  given: "a stock row exists",
  when: "a pick is recorded elsewhere",
  then: "this row is unchanged",
  status: "draft",
  architectural_notes: "owner: stock service",
};

/** The exact defect: valid up to `architectural_notes`, then the file is cut off
 *  with NO closing brace (the truncation the spec-author writer left behind). */
const TRUNCATED_AC =
  '{\n  "id": "AC2-inline-error",\n  "layer": "API",\n  "given": "a quantity field",\n' +
  '  "when": "an invalid quantity is submitted",\n  "then": "an inline error is shown",\n' +
  '  "status": "draft",\n  "architectural_notes": "owner: pick form\n';

function surfaced(): void {
  const p = initPipeline(F);
  surfaceForGate(p, S); // creates the story entry + opens its gate
  writePipeline(tdd, p);
}

describe("storyAcsConformanceReason (Finding 29)", () => {
  it("returns null when every AC parses + conforms", () => {
    writeFileSync(join(acsDir(), "AC1-row-unchanged.json"), JSON.stringify(CONFORMANT_AC));
    expect(storyAcsConformanceReason(featureDir(tdd, F), S)).toBeNull();
  });

  it("flags a truncated / invalid-JSON AC as not valid JSON", () => {
    writeFileSync(join(acsDir(), "AC1-row-unchanged.json"), JSON.stringify(CONFORMANT_AC));
    writeFileSync(join(acsDir(), "AC2-inline-error.json"), TRUNCATED_AC);
    const reason = storyAcsConformanceReason(featureDir(tdd, F), S);
    expect(reason).toMatch(/not valid JSON/);
    expect(reason).toMatch(/AC2-inline-error\.json/);
  });
});

describe("approveStoryGateFromDisk refuses a malformed AC at the spec gate (Finding 29)", () => {
  it("approves a story whose ACs all conform", () => {
    surfaced();
    writeFileSync(join(acsDir(), "AC1-row-unchanged.json"), JSON.stringify(CONFORMANT_AC));
    const r = approveStoryGateFromDisk(tdd, F, S, { approver: APPROVER });
    expect(r.ok).toBe(true);
  });

  it("logs a story-scoped gate.approved on approval (G4b: the per-story spec gate is no longer silent)", () => {
    surfaced();
    writeFileSync(join(acsDir(), "AC1-row-unchanged.json"), JSON.stringify(CONFORMANT_AC));
    approveStoryGateFromDisk(tdd, F, S, { approver: APPROVER });
    const log = join(tdd, "agent-log.jsonl");
    expect(existsSync(log)).toBe(true);
    const events = readFileSync(log, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const approved = events.filter((e) => e.event === "gate.approved");
    expect(approved).toHaveLength(1);
    expect(approved[0].metadata.gate).toBe("spec");
    expect(approved[0].metadata.story).toBe(S);
    expect(approved[0].metadata.feature_id).toBe(F);
  });

  it("REFUSES to approve when an AC is truncated (the deploy-gate defect, caught early)", () => {
    surfaced();
    writeFileSync(join(acsDir(), "AC1-row-unchanged.json"), JSON.stringify(CONFORMANT_AC));
    writeFileSync(join(acsDir(), "AC2-inline-error.json"), TRUNCATED_AC);
    const r = approveStoryGateFromDisk(tdd, F, S, { approver: APPROVER });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not valid JSON/);
    // The gate stays unapproved: the story was never queued for build.
    expect(r.queue).toBeUndefined();
  });
});

// F5/PI1 class: the per-story design gate that COMPLETES the feature's design must enforce
// FEATURE-WIDE persistence coverage + shape — so an uncovered/mis-shaped invariant is caught at
// DESIGN, not only at the post-build feature-complete backstop.
describe("approveStoryGateFromDisk enforces feature-wide persistence coverage at the design-completing gate (the F5/PI1 class)", () => {
  const fdir = () => featureDir(tdd, F);
  const writeArch = () =>
    writeFileSync(
      join(fdir(), "architecture.json"),
      JSON.stringify({ feature_id: F, nfrs: [], service_backed: true, persistence_invariants: [{ id: "PI1-reconcile-atomic", type: "transactional", table: "stock_adjustments", brief: "row + audit land together or neither persists" }] }),
    );
  const writeSpec = () => writeFileSync(join(fdir(), "feature-spec.json"), JSON.stringify({ id: F, stories: [S], status: "draft" }));
  const writeMaster = (items: object[]) => writeFileSync(join(fdir(), "test-list.json"), JSON.stringify({ feature_id: F, items }));
  const base = () => {
    surfaced();
    writeFileSync(join(acsDir(), "AC1-row-unchanged.json"), JSON.stringify(CONFORMANT_AC));
    writeArch();
    writeSpec();
  };

  it("BLOCKS approval of the design-completing story when a declared invariant is UNCOVERED", () => {
    base();
    writeMaster([{ id: "T1", description: "POST returns 201", ac_id: "AC1-row-unchanged", status: "pending", kind: "behavior" }]);
    const r = approveStoryGateFromDisk(tdd, F, S, { approver: APPROVER });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/persistence coverage|PI1-reconcile-atomic/);
  });

  it("BLOCKS when the invariant is covered only by a WRONG-SHAPED (migration round-trip) item", () => {
    base();
    writeMaster([{ id: "T2", description: "additive migration down->up preserves existing stock_adjustments rows", ac_id: "AC1-row-unchanged", status: "pending", kind: "fitness", invariant_id: "PI1-reconcile-atomic" }]);
    const r = approveStoryGateFromDisk(tdd, F, S, { approver: APPROVER });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/transactional shape|ATOMICITY/);
  });

  it("APPROVES when the invariant is covered by a correctly-shaped atomicity item", () => {
    base();
    writeMaster([{ id: "T3", description: "force a mid-transaction failure and assert NEITHER write persists — both roll back", ac_id: "AC1-row-unchanged", status: "pending", kind: "fitness", invariant_id: "PI1-reconcile-atomic" }]);
    expect(approveStoryGateFromDisk(tdd, F, S, { approver: APPROVER }).ok).toBe(true);
  });

  it("does NOT block a non-design-completing story (a sibling is still ungated), nor a feature with no feature-spec (back-compat)", () => {
    // feature-spec lists TWO stories; only S is being approved, the sibling is not yet gated → not design-complete → no feature-wide check.
    surfaced();
    writeFileSync(join(acsDir(), "AC1-row-unchanged.json"), JSON.stringify(CONFORMANT_AC));
    writeArch();
    writeFileSync(join(fdir(), "feature-spec.json"), JSON.stringify({ id: F, stories: [S, "S3-later"], status: "draft" }));
    writeMaster([{ id: "T1", description: "POST returns 201", ac_id: "AC1-row-unchanged", status: "pending", kind: "behavior" }]);
    expect(approveStoryGateFromDisk(tdd, F, S, { approver: APPROVER }).ok).toBe(true);
  });
});

// Regression (stockflow-3-88): the registered-breakdown guard must run on the
// PER-STORY spec gate (approveStoryGateFromDisk), the path an interactive run
// actually gates on — not only on the feature-level resolveArtifactInputs
// (human-proxy) path. A run whose design lane diverged from registration.json
// (invented S2) approved its first story and detonated downstream as a
// spec-defect, because the guard was wired only to the feature-level path.
describe("approveStoryGateFromDisk enforces the registered breakdown (per-story path, stockflow-3-88)", () => {
  function writeRegistration(stories: Array<{ id: string; acs: string[] }>): void {
    writeFileSync(join(tdd, "registration.json"), JSON.stringify({ feature_id: F, stories }));
  }

  it("HARD-BLOCKS the first story's spec gate when the derived breakdown diverges from registration", () => {
    surfaced();
    writeFileSync(join(acsDir(), "AC1-row-unchanged.json"), JSON.stringify(CONFORMANT_AC)); // AC is conformant...
    // ...but the derived story (S) is not the registered one -> divergence.
    writeRegistration([{ id: "S1-registered-different", acs: ["AC1-registered"] }]);
    const r = approveStoryGateFromDisk(tdd, F, S, { approver: APPROVER });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Registered-breakdown HARD-BLOCK/);
    expect(r.queue).toBeUndefined(); // never queued for build
  });

  it("no-ops (approves) when the feature has no registration.json", () => {
    surfaced();
    writeFileSync(join(acsDir(), "AC1-row-unchanged.json"), JSON.stringify(CONFORMANT_AC));
    // no registration.json written
    expect(approveStoryGateFromDisk(tdd, F, S, { approver: APPROVER }).ok).toBe(true);
  });

  it("passes the registered check when the derived breakdown matches registration (by slug)", () => {
    surfaced();
    writeFileSync(join(acsDir(), "AC1-row-unchanged.json"), JSON.stringify(CONFORMANT_AC));
    // Registration declares exactly this story + AC slug (ordinals may differ) -> match.
    writeRegistration([{ id: "S9-stock-row-unchanged", acs: ["AC7-row-unchanged"] }]);
    expect(approveStoryGateFromDisk(tdd, F, S, { approver: APPROVER }).ok).toBe(true);
  });
});
