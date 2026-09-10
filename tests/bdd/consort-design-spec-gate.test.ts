import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { writeMasterTestList } from "../../consort/test-list/test-list";
import { analyzeForGate, recordPlan, writePlan, readPlan, checkChromeShellStory } from "../../consort/gates/design-spec-gate";

let tdd: string;
const FEATURE_DIR = "features/F1-test-feature";
const STORY = "S1";

beforeEach(() => {
  tdd = mkdtempSync(join(tmpdir(), "tdd-gate-"));
  mkdirSync(join(tdd, FEATURE_DIR), { recursive: true });
});

// Experiments + plans are story-scoped: the analyzer scopes the
// master test list to the story's ACs, so a test must seed those AC files.
function seedAcs(...acIds: string[]): void {
  const acsDir = join(tdd, FEATURE_DIR, "stories", STORY, "acs");
  mkdirSync(acsDir, { recursive: true });
  for (const ac of acIds) writeFileSync(join(acsDir, `${ac}.json`), JSON.stringify({ id: ac }));
}

afterEach(() => {
  rmSync(tdd, { recursive: true, force: true });
});

describe("design-spec-gate", () => {
  it("proposes N=1 when fewer than 2 opinion gaps are detected", () => {
    writeMasterTestList(tdd, {
      feature_id: "F1",
      items: [
        { id: "T1", description: "happy path returns 200", ac_id: "AC1", status: "pending" },
        { id: "T2", description: "rejects invalid input with 400", ac_id: "AC1", status: "pending" },
      ],
    });
    seedAcs("AC1");
    const analysis = analyzeForGate(tdd, "F1", STORY);
    expect(analysis.proposed_plan.mode).toBe("N=1");
    expect(analysis.proposed_plan.N).toBe(1);
    expect(analysis.proposed_plan.strategies.length).toBe(1);
  });

  it("proposes N>=2 when opinion-gap keywords appear in 2+ items", () => {
    writeMasterTestList(tdd, {
      feature_id: "F1",
      items: [
        { id: "T1", description: "either postgres arrays or json blob – decide", ac_id: "AC1", status: "pending" },
        { id: "T2", description: "consider whether to denormalize", ac_id: "AC1", status: "pending" },
        { id: "T3", description: "happy path", ac_id: "AC2", status: "pending" },
      ],
    });
    seedAcs("AC1", "AC2");
    const analysis = analyzeForGate(tdd, "F1", STORY);
    expect(analysis.proposed_plan.mode).toBe("N>=2");
    expect(analysis.proposed_plan.N).toBeGreaterThanOrEqual(2);
    expect(analysis.opinion_gaps.length).toBeGreaterThanOrEqual(2);
    expect(analysis.proposed_plan.strategies.length).toBe(analysis.proposed_plan.N);
  });

  it("caps strategies at 3 even with more gaps detected", () => {
    writeMasterTestList(tdd, {
      feature_id: "F1",
      items: Array.from({ length: 5 }, (_, i) => ({
        id: `T${i + 1}`,
        description: `consider option ${i} or alternatively...`,
        ac_id: "AC1",
        status: "pending" as const,
      })),
    });
    seedAcs("AC1");
    const analysis = analyzeForGate(tdd, "F1", STORY);
    expect(analysis.proposed_plan.N).toBeLessThanOrEqual(3);
    expect(analysis.proposed_plan.strategies.length).toBeLessThanOrEqual(3);
  });

  it("recordPlan appends a structured entry to selection-log.md", () => {
    writeMasterTestList(tdd, {
      feature_id: "F1",
      items: [{ id: "T1", description: "happy path", ac_id: "AC1", status: "pending" }],
    });
    seedAcs("AC1");
    const analysis = analyzeForGate(tdd, "F1", STORY);
    recordPlan(tdd, analysis.proposed_plan, "kevin.hartman@databricks.com");
    const log = readFileSync(join(tdd, "selection-log.md"), "utf8");
    expect(log).toContain("Experiment plan for F1");
    expect(log).toContain("Mode:");
    expect(log).toContain("kevin.hartman@databricks.com");
  });

  it("writePlan/readPlan round-trip persists plan to features/<F>/stories/<story>/plan.json", () => {
    writeMasterTestList(tdd, {
      feature_id: "F1",
      items: [{ id: "T1", description: "happy path", ac_id: "AC1", status: "pending" }],
    });
    seedAcs("AC1");
    const analysis = analyzeForGate(tdd, "F1", STORY);
    writePlan(tdd, analysis.proposed_plan);
    // plan.json lands in the feature's resolved dir (the <id>-<slug> dir where
    // its ACs live), co-located with what readPlan reads back – not a bare F1 dir.
    expect(existsSync(join(tdd, FEATURE_DIR, "stories", STORY, "plan.json"))).toBe(true);
    const round = readPlan(tdd, "F1", STORY);
    expect(round).toEqual(analysis.proposed_plan);
  });

  it("readPlan returns null when no plan has been written", () => {
    expect(readPlan(tdd, "F1", STORY)).toBeNull();
  });

  it("no registered-breakdown blocker when the feature has no registration.json (non-registered projects unaffected)", () => {
    writeMasterTestList(tdd, { feature_id: "F1", items: [{ id: "T1", description: "happy path", ac_id: "AC1", status: "pending" }] });
    seedAcs("AC1");
    const analysis = analyzeForGate(tdd, "F1", STORY);
    expect(analysis.transition_blockers.some((b) => b.kind === "registered-breakdown-divergence")).toBe(false);
  });

  it("surfaces a registered-breakdown-divergence blocker when the derived story diverges from registration.json", () => {
    // A pre-registered feature declares S1-file-stock; the live design lane produced S1 (an
    // unregistered story slug) => analyzeForGate must hard-stop at the design-spec gate.
    writeMasterTestList(tdd, { feature_id: "F1", items: [{ id: "T1", description: "happy path", ac_id: "AC1", status: "pending" }] });
    seedAcs("AC1");
    writeFileSync(
      join(tdd, "registration.json"),
      JSON.stringify({ feature_id: "F1", stories: [{ id: "S1-file-stock", acs: ["AC1-file-stock-record"] }] }),
    );
    const analysis = analyzeForGate(tdd, "F1", STORY);
    const blocker = analysis.transition_blockers.find((b) => b.kind === "registered-breakdown-divergence");
    expect(blocker).toBeDefined();
    expect(blocker!.detail).toMatch(/unregistered story "S1"|registered story "S1-file-stock" is missing/);
  });
});

describe("checkChromeShellStory: advisory flag for a non-behavioral chrome/shell story", () => {
  function seedStory(
    acs: Array<{ id: string; layer: string }>,
    intent: { asA?: string; iWantTo?: string; soThat?: string },
    opts?: { registration?: boolean },
  ): void {
    const storyDir = join(tdd, FEATURE_DIR, "stories", STORY);
    const acsDir = join(storyDir, "acs");
    mkdirSync(acsDir, { recursive: true });
    for (const a of acs) writeFileSync(join(acsDir, `${a.id}.json`), JSON.stringify({ id: a.id, layer: a.layer }));
    writeFileSync(join(storyDir, "story.json"), JSON.stringify({ id: STORY, ...intent }));
    if (opts?.registration) {
      writeFileSync(join(tdd, "registration.json"), JSON.stringify({ feature_id: "F1", stories: [{ id: STORY, acs: acs.map((a) => a.id) }] }));
    }
  }

  it("FLAGS an all-E2E story whose intent names chrome (navbar/branding)", () => {
    seedStory(
      [{ id: "AC1-navbar-shell", layer: "E2E" }, { id: "AC2-favicon", layer: "E2E" }],
      { asA: "user", iWantTo: "see a navbar and app branding", soThat: "the app looks finished" },
    );
    const b = checkChromeShellStory(tdd, "F1", STORY);
    expect(b.length).toBe(1);
    expect(b[0].kind).toBe("chrome-shell-story");
    expect(b[0].detail).toMatch(/navbar/);
  });

  it("does NOT flag a legit all-E2E UI story with no chrome lexicon (sku-detail-view)", () => {
    seedStory(
      [{ id: "AC1-lists-stock", layer: "E2E" }],
      { asA: "operator", iWantTo: "view stock across locations for a SKU", soThat: "I can decide where to pick" },
    );
    expect(checkChromeShellStory(tdd, "F1", STORY)).toEqual([]);
  });

  it("does NOT flag when the story has a behavioral (API/Infra) AC even if the lexicon matches", () => {
    seedStory(
      [{ id: "AC1-navbar", layer: "E2E" }, { id: "AC2-count", layer: "API" }],
      { iWantTo: "show a navbar with a live count" },
    );
    expect(checkChromeShellStory(tdd, "F1", STORY)).toEqual([]);
  });

  it("no-ops for a registered project (the hard registered-breakdown guard owns it)", () => {
    seedStory(
      [{ id: "AC1-navbar-shell", layer: "E2E" }],
      { iWantTo: "render the app-shell navbar" },
      { registration: true },
    );
    expect(checkChromeShellStory(tdd, "F1", STORY)).toEqual([]);
  });

  it("analyzeForGate surfaces the chrome-shell-story blocker on a flagged story", () => {
    writeMasterTestList(tdd, { feature_id: "F1", items: [{ id: "T1", description: "renders navbar", ac_id: "AC1-navbar-shell", status: "pending" }] });
    seedStory([{ id: "AC1-navbar-shell", layer: "E2E" }], { iWantTo: "render the app-shell navbar with branding" });
    const analysis = analyzeForGate(tdd, "F1", STORY);
    expect(analysis.transition_blockers.some((x) => x.kind === "chrome-shell-story")).toBe(true);
  });
});
