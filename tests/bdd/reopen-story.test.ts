// Reopen-for-redesign (hardening #4, recovery): clearing a story's design artifacts so the
// drive re-dispatches the Spec Author instead of re-approving a stale spec. The subtlety the
// stockflow recovery hit: hasAcs = storyAcIds() > 0, and storyAcIds reads BOTH the acs/ dir
// AND story.json.acs[], so a robust reopen must clear the dir AND empty story.json.acs[].

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { reopenStoryForRedesign, reopenStoryFromRole } from "../../consort/gates/reopen-story";
import { storyAcIds } from "../../consort/config/consort-paths";

let tdd: string;
beforeEach(() => {
  tdd = mkdtempSync(join(tmpdir(), "reopen-"));
});
afterEach(() => {
  rmSync(tdd, { recursive: true, force: true });
});
function write(rel: string, body: unknown): void {
  const p = join(tdd, rel);
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, typeof body === "string" ? body : JSON.stringify(body));
}

const F = "F3-inbound-receipt";
const S = "S3-validate-receipt-form";
const sp = (rel: string): string => join(tdd, `features/${F}/stories/${S}/${rel}`);

describe("reopenStoryForRedesign", () => {
  it("backs up + clears the design artifacts so hasAcs becomes false", () => {
    write(`features/${F}/stories/${S}/story.json`, { id: S, asA: "op", iWantTo: "validate", soThat: "clean data", acs: ["AC1-a", "AC2-b"] });
    write(`features/${F}/stories/${S}/acs/AC1-a.json`, { id: "AC1-a", given: "g", when: "w", then: "t" });
    write(`features/${F}/stories/${S}/acs/AC2-b.json`, { id: "AC2-b", given: "g", when: "w", then: "t" });
    write(`features/${F}/stories/${S}/test-list-per-story.json`, { items: [] });
    write(`features/${F}/stories/${S}/reflect-verdict.json`, { version: 1, passed: true, findings: [] });
    write(`features/${F}/stories/${S}/plan.json`, { steps: [] });

    expect(storyAcIds(tdd, F, S).length, "hasAcs is true before reopen").toBeGreaterThan(0);

    const res = reopenStoryForRedesign(tdd, F, S, { now: () => new Date("2026-08-27T00:00:00Z") });

    // Design artifacts are gone.
    expect(existsSync(sp("acs"))).toBe(false);
    expect(existsSync(sp("test-list-per-story.json"))).toBe(false);
    expect(existsSync(sp("reflect-verdict.json"))).toBe(false);
    expect(existsSync(sp("plan.json"))).toBe(false);
    // hasAcs is now DEFINITIVELY false (dir gone AND story.json.acs[] emptied).
    expect(storyAcIds(tdd, F, S).length).toBe(0);
    // The story shell is preserved; only acs[] is emptied.
    const sj = JSON.parse(readFileSync(sp("story.json"), "utf8")) as { acs: unknown[]; asA: string };
    expect(sj.acs).toEqual([]);
    expect(sj.asA).toBe("op");
    // Everything cleared was backed up first (the only safety net for untracked .consort files).
    expect(existsSync(join(res.backupDir, "acs/AC1-a.json"))).toBe(true);
    expect(existsSync(join(res.backupDir, "story.json"))).toBe(true);
    expect(res.cleared).toContain("acs");
  });

  it("no artifacts to clear => empty result (story already needs design)", () => {
    write(`features/${F}/stories/${S}/story.json`, { id: S, acs: [] });
    const res = reopenStoryForRedesign(tdd, F, S);
    expect(res.cleared).toHaveLength(0);
  });

  it("clears the story's ORPHANED green-failure markers (the specDefect resume-loop)", () => {
    write(`features/${F}/stories/${S}/story.json`, { id: S, asA: "op", iWantTo: "x", soThat: "y", acs: ["AC1-a"] });
    write(`features/${F}/stories/${S}/acs/AC1-a.json`, { id: "AC1-a", given: "g", when: "w", then: "t" });
    // A green-failure marker with specDefect — the state that a reopen historically
    // LEFT behind: --list reads none, but consort-next derives BLOCKED off THIS and
    // a resume re-raises it. The reopen must clear it (backed up).
    const gfPath = `cycles/${F}/${S}/AC1-a/green-failure.json`;
    write(gfPath, { assessed: true, summary: "TEST-AUTHORING-SMELL", specDefect: { fromRole: "test-strategist", reason: "broad-integrity-except" } });

    const res = reopenStoryForRedesign(tdd, F, S, { now: () => new Date("2026-08-27T00:00:00Z") });

    expect(existsSync(join(tdd, gfPath)), "orphaned green-failure marker is gone").toBe(false);
    expect(existsSync(join(res.backupDir, "cycles/AC1-a/green-failure.json")), "marker was backed up first").toBe(true);
    expect(res.cleared.some((c) => c.includes("green-failure.json"))).toBe(true);
  });

  describe("reopenStoryFromRole (scoped — the proportionate go-back)", () => {
    // A fully-designed + built + accepted story: the case where a build failure turns out to be an
    // upstream DESIGN defect (a flaky/mis-calibrated test) and only a slice must be re-authored.
    function seedFullyDesigned(): void {
      write(`features/${F}/stories/${S}/story.json`, { id: S, asA: "op", iWantTo: "x", soThat: "y", acs: ["AC1-a"] });
      write(`features/${F}/stories/${S}/acs/AC1-a.json`, { id: "AC1-a", given: "g", when: "w", then: "t", architectural_notes: "layer: service" });
      write(`features/${F}/architecture.json`, { feature_id: F, service_backed: true });
      write(`features/${F}/db-design.json`, { feature_id: F, tables: [] });
      write(`features/${F}/stories/${S}/test-list-per-story.json`, { feature_id: F, story_id: S, items: [{ id: "T1" }] });
      write(`features/${F}/stories/${S}/reflect-verdict.json`, { version: 1, passed: true, findings: [] });
      write(`features/${F}/stories/${S}/plan.json`, { steps: [] });
      write(`features/${F}/pipeline.json`, {
        version: 1, feature_id: F,
        stories: { [S]: { status: "done", gate: { status: "approved", history: [] }, experiment: { status: "merged", branch: "exp1", instance: 1 }, acceptance: { decision: "accepted", history: [] } } },
        build_queue: [S], build_active: S,
      });
      write(`features/${F}/deploy-evidence.json`, { deployed: true });
      write(`workflow-state.json`, { phase: "deploy", phase_feature_id: F });
    }

    it("--from test-strategist: clears test-list+reflect+plan, KEEPS ACs+architecture+db, re-gates", () => {
      seedFullyDesigned();
      const res = reopenStoryFromRole(tdd, F, S, "test-strategist", { now: () => new Date("2026-09-07T00:00:00Z") });
      // Reverted from the test-strategist downstream.
      expect(existsSync(sp("test-list-per-story.json"))).toBe(false);
      expect(existsSync(sp("reflect-verdict.json"))).toBe(false);
      expect(existsSync(sp("plan.json"))).toBe(false);
      // KEPT (upstream): the ACs (hasAcs still true), the architecture, and the schema — NOT re-run.
      expect(storyAcIds(tdd, F, S).length).toBeGreaterThan(0);
      expect(existsSync(join(tdd, `features/${F}/architecture.json`))).toBe(true);
      expect(existsSync(join(tdd, `features/${F}/db-design.json`))).toBe(true);
      const ac = JSON.parse(readFileSync(sp("acs/AC1-a.json"), "utf8")) as { architectural_notes?: unknown };
      expect(ac.architectural_notes).toBeDefined(); // architect not reverted
      // Re-gated: pipeline -> designing, deploy-evidence gone (so the spec gate re-surfaces cleanly).
      const pl = JSON.parse(readFileSync(join(tdd, `features/${F}/pipeline.json`), "utf8")) as { stories: Record<string, unknown> };
      expect(pl.stories[S]).toEqual({ status: "designing" });
      expect(existsSync(join(tdd, `features/${F}/deploy-evidence.json`))).toBe(false);
      expect(existsSync(join(res.backupDir, "test-list-per-story.json"))).toBe(true); // backed up
    });

    it("--from architect-reviewer: reverts architecture + strips AC notes + downstream, KEEPS the ACs", () => {
      seedFullyDesigned();
      reopenStoryFromRole(tdd, F, S, "architect-reviewer", { now: () => new Date("2026-09-07T00:00:00Z") });
      expect(existsSync(join(tdd, `features/${F}/architecture.json`))).toBe(false);
      expect(existsSync(join(tdd, `features/${F}/db-design.json`))).toBe(false);
      expect(existsSync(sp("test-list-per-story.json"))).toBe(false);
      // The ACs are kept (spec-author's work) but their architectural_notes are stripped so the
      // Architect re-annotates (architectAnnotated flips false).
      expect(storyAcIds(tdd, F, S).length).toBeGreaterThan(0);
      const ac = JSON.parse(readFileSync(sp("acs/AC1-a.json"), "utf8")) as { architectural_notes?: unknown; given?: string };
      expect(ac.architectural_notes).toBeUndefined();
      expect(ac.given).toBe("g"); // AC content preserved
    });

    it("--from spec-author delegates to the full reopen (acs[] emptied)", () => {
      seedFullyDesigned();
      reopenStoryFromRole(tdd, F, S, "spec-author");
      expect(storyAcIds(tdd, F, S).length).toBe(0);
    });
  });

  it("reopening a DONE + merged + ACCEPTED story resets the pipeline entry, deploy gate, and coarse phase", () => {
    // An accepted+merged story + its feature at the deploy gate – the case hand-surgery got wrong.
    write(`features/${F}/stories/${S}/story.json`, { id: S, acs: ["AC1-a"] });
    write(`features/${F}/stories/${S}/acs/AC1-a.json`, { id: "AC1-a", given: "g", when: "w", then: "t" });
    write(`features/${F}/pipeline.json`, {
      version: 1,
      feature_id: F,
      stories: {
        [S]: {
          status: "done",
          gate: { status: "approved", history: [] },
          experiment: { status: "merged", branch: "exp1", instance: 1 },
          acceptance: { decision: "accepted", history: [] },
        },
      },
      build_queue: [S],
      build_active: S,
    });
    write(`features/${F}/deploy-evidence.json`, { deployed: true });
    write(`workflow-state.json`, { phase: "deploy", phase_feature_id: F });

    const res = reopenStoryForRedesign(tdd, F, S, { now: () => new Date("2026-08-27T00:00:00Z") });

    // The entry is reset to a bare `designing` – spec gate, experiment, AND acceptance dropped ,
    // and pulled off the build lane, so deriveFeaturePhase no longer reads the feature as complete.
    const pl = JSON.parse(readFileSync(join(tdd, `features/${F}/pipeline.json`), "utf8")) as {
      stories: Record<string, unknown>;
      build_queue: string[];
      build_active: string | null;
    };
    expect(pl.stories[S]).toEqual({ status: "designing" });
    expect(pl.build_queue).not.toContain(S);
    expect(pl.build_active).toBeNull();
    // The feature deploy-gate artifact is gone (backed up).
    expect(existsSync(join(tdd, `features/${F}/deploy-evidence.json`))).toBe(false);
    expect(existsSync(join(res.backupDir, "feature-deploy-evidence.json"))).toBe(true);
    // The coarse phase + its owner are cleared, so the drive re-derives design/build (not deploy).
    const ws = JSON.parse(readFileSync(join(tdd, "workflow-state.json"), "utf8")) as Record<string, unknown>;
    expect(ws.phase).toBeUndefined();
    expect(ws.phase_feature_id).toBeUndefined();
  });
});
