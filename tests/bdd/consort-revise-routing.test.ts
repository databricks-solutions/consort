// revise-routing: a SPEC-level blocking smell the PO can send back to
// its owning author and resume, instead of the terminal raise-to-hil halt.
// Hermetic: smell taxonomy + the pure transition + the effect command + the
// Human-Proxy self-heal on a tmp .tdd, no model, no real branches.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  featureTestListJson,
  storyTestListJson,
  storyIaCoverageJson,
  testListPatchJson,
  acsDir,
  acJson,
  handbackFile,
} from "../../consort/config/consort-paths";

import {
  SMELL_CATALOG,
  specLevelSmell,
  markSmellResolved,
  priorReviseCount,
  readSmellsLog,
  resolveOpenReflectSmellsForStory,
  storyTestListFingerprint,
  writeSmellsLog,
  openSmellScopeAcIds,
} from "../../consort/smells/smells";
import { analystOrderedJson } from "../../consort/test-list/fan-out-plan";
import { recordBlockingSmellFlag, writeEscalation, readEscalations } from "../../consort/gates/escalation";
import { nextTransition, nextDesignOnlyTransition, actionLane, type DriveState } from "../../consort/orchestrator/drive/orchestrator-drive";
import { commandsForAction, type DriveEffectsConfig } from "../../consort/orchestrator/drive/orchestrator-effects";
import { diskArtifactProbe } from "../../consort/orchestrator/state/orchestrator-probe";
import {
  applyReviseSelfHeal,
  reviseStoryWithSelfHeal,
  revisableSmellForStory,
  clearStoryBlockingSmellOnDiscard,
  rebuildStory,
} from "../../consort/orchestrator/status/revise";
import { storyTestProgress } from "../../consort/pipeline/cycle-record";
import { cyclesRootDir } from "../../consort/config/consort-paths";
import { readFileSync as readFileSyncNode } from "node:fs";
import { fileURLToPath } from "node:url";
import { writeReflectVerdict, reflectionVerdictWritten } from "../../consort/smells/reflection";
import { writePipeline, readPipeline, type StoryPipeline } from "../../consort/pipeline/story-pipeline";
import { deriveDriveState } from "../../consort/orchestrator/state/orchestrator-derive";

const FEATURE = "F1-file-bug";
const STORY = "S1-file-bug-via-form";

// ---- Phase A: taxonomy -------------------------------------------------------

describe("smell taxonomy", () => {
  it("tags ac-overlap as spec-level -> spec-author at the spec gate", () => {
    const def = SMELL_CATALOG.find((s) => s.name === "ac-overlap")!;
    expect(def.level).toBe("spec");
    expect(def.owning_role).toBe("spec-author");
    expect(def.gate_to_rerun).toBe("spec");
    expect(specLevelSmell("ac-overlap")).toEqual({ owning_role: "spec-author", gate_to_rerun: "spec" });
  });

  it("tags test-list-drift as spec-level -> test-strategist at the test_list gate", () => {
    expect(specLevelSmell("test-list-drift")).toEqual({
      owning_role: "test-strategist",
      gate_to_rerun: "test_list",
    });
  });

  it("tags reflect-architecture-defect as spec-level -> architect-reviewer at the architecture gate", () => {
    expect(specLevelSmell("reflect-architecture-defect")).toEqual({
      owning_role: "architect-reviewer",
      gate_to_rerun: "architecture",
    });
  });

  it("treats build-level smells (and unknowns) as non-routable", () => {
    expect(specLevelSmell("cycle-stall")).toBeNull();
    expect(specLevelSmell("scaffold-defect")).toBeNull();
    expect(specLevelSmell("boundary-violation")).toBeNull();
    expect(specLevelSmell("not-a-smell")).toBeNull();
  });
});

// ---- Phase B: resolution writers + the one-revise budget ---------------------

describe("smells.json resolution + revise budget", () => {
  let tdd: string;
  beforeEach(() => {
    tdd = mkdtempSync(join(tmpdir(), "tdd-revise-"));
  });
  afterEach(() => rmSync(tdd, { recursive: true, force: true }));

  it("markSmellResolved closes an open entry; priorReviseCount counts revises", () => {
    recordBlockingSmellFlag(tdd, "ac-overlap", "AC4 implied by AC2", { story_id: STORY });
    expect(priorReviseCount(tdd, "ac-overlap", STORY)).toBe(0);
    expect(markSmellResolved(tdd, "ac-overlap", { story_id: STORY, kind: "revised" })).toBe(true);
    expect(priorReviseCount(tdd, "ac-overlap", STORY)).toBe(1);
    // The entry is now resolved (no longer open).
    expect(readSmellsLog(tdd).detected[0].resolution_kind).toBe("revised");
  });

  it("a different story's same smell is independent", () => {
    recordBlockingSmellFlag(tdd, "ac-overlap", "x", { story_id: STORY });
    markSmellResolved(tdd, "ac-overlap", { story_id: STORY, kind: "revised" });
    expect(priorReviseCount(tdd, "ac-overlap", "S2-other")).toBe(0);
  });
});

// ---- Phase C: the pure transition --------------------------------------------

function baseState(escalation: DriveState["escalation"]): DriveState {
  return {
    phase: "feature",
    breakdownDone: true,
    storyOrder: [],
    stories: {},
    buildActive: null,
    escalation,
  };
}

describe("nextTransition revise-routing", () => {
  it("routes a routable spec-level escalation to revise-route (not raise-to-hil)", () => {
    const action = nextTransition(
      baseState({
        id: "smell:ac-overlap__F1",
        source: "smell:ac-overlap",
        reason: 'blocking smell "ac-overlap": AC4 implied by AC2',
        story_id: STORY,
        routable: { story: STORY, owning_role: "spec-author", gate: "spec" },
      }),
    );
    expect(action.kind).toBe("revise-route");
    if (action.kind === "revise-route") {
      expect(action.story).toBe(STORY);
      expect(action.role).toBe("spec-author");
      expect(action.gate).toBe("spec");
      expect(action.reason).toMatch(/AC4 implied by AC2/);
    }
    expect(actionLane(action)).toBe("design");
  });

  it("hard-halts (raise-to-hil) when the escalation is NOT routable", () => {
    const action = nextTransition(
      baseState({
        id: "smell:cycle-stall__F1",
        source: "smell:cycle-stall",
        reason: 'blocking smell "cycle-stall"',
        story_id: STORY,
        // no `routable` -> build-level / budget spent / explicit file
      }),
    );
    expect(action.kind).toBe("raise-to-hil");
  });
});

// The --only design bound (nextDesignOnlyTransition) must apply the SAME
// escalation pre-empt as the full transition. Without it, a reflect-flagged
// spec defect leaves reflectionPassed=false and the design sub-machine re-loops
// the reflect turn forever until the stall guard fires (the live
// stockflow-optimize --only design run: "driver stalled at iteration 7 ...
// navigator reflect repeated without advancing state").
describe("nextDesignOnlyTransition escalation pre-empt", () => {
  it("routes a routable reflect/spec escalation to revise-route (not a reflect re-loop)", () => {
    const action = nextDesignOnlyTransition(
      baseState({
        id: "smell:reflect-testlist-defect__F1",
        source: "smell:reflect-testlist-defect",
        reason: "reflect flagged a test-list defect for S1",
        story_id: STORY,
        routable: { story: STORY, owning_role: "test-strategist", gate: "test_list" },
      }),
    );
    expect(action.kind).toBe("revise-route");
    if (action.kind === "revise-route") {
      expect(action.story).toBe(STORY);
      expect(action.role).toBe("test-strategist");
      expect(action.gate).toBe("test_list");
    }
    expect(actionLane(action)).toBe("design");
  });

  it("hard-halts (raise-to-hil) a non-routable escalation instead of looping", () => {
    const action = nextDesignOnlyTransition(
      baseState({
        id: "smell:reflect-testlist-defect__F1",
        source: "smell:reflect-testlist-defect",
        reason: "reflect defect, revise budget spent",
        story_id: STORY,
        // no `routable` -> budget spent / explicit file
      }),
    );
    expect(action.kind).toBe("raise-to-hil");
  });

  it("with NO escalation, still delegates to the design sub-machine (no behavior change)", () => {
    // A clean state with a breakdown but nothing designed yet -> the design lane's
    // first action (ux-designer / spec-author etc.), never revise/raise.
    const action = nextDesignOnlyTransition(baseState(undefined));
    expect(["invoke-role", "design-complete", "surface-gate", "approve-gate"]).toContain(action.kind);
  });
});

// ---- Phase 3: the effect command ---------------------------------------------

describe("commandsForAction(revise-route)", () => {
  it("emits a single human-proxy decide-escalation carrying story/smell/route/verdict", () => {
    const cfg = {
      projectDir: "/proj",
      consortDir: "/proj/.tdd",
      featureId: FEATURE,
      runner: { run: async () => {} },
      modelForRole: () => "sonnet",
      approver: "human-proxy",
    } as unknown as DriveEffectsConfig;
    const cmds = commandsForAction(
      { kind: "revise-route", story: STORY, role: "spec-author", gate: "spec", reason: "AC4 implied by AC2", source: "smell:ac-overlap" },
      cfg,
    );
    expect(cmds).toHaveLength(1);
    const c = cmds[0];
    expect(c.kind).toBe("cli");
    if (c.kind === "cli") {
      expect(c.bin).toBe("consort-human-proxy");
      expect(c.args[0]).toBe("decide-escalation");
      expect(c.args).toEqual(expect.arrayContaining(["--smell", "ac-overlap", "--routed-to", "spec-author", "--gate", "spec", "--story", STORY]));
      expect(c.args).toEqual(expect.arrayContaining(["--reason", "AC4 implied by AC2"]));
    }
  });
});

// ---- Phase B3: the Human-Proxy self-heal end-to-end on disk ------------------

function pipelineBuilding(): StoryPipeline {
  return {
    version: 1,
    feature_id: FEATURE,
    stories: {
      [STORY]: {
        status: "building",
        gate: { status: "approved", history: [] },
        experiment: { slug: "exp1", status: "active", branch_id: "experiment-s1", opened_at: "t0" },
      },
    },
    build_queue: [],
    build_active: STORY,
  } as unknown as StoryPipeline;
}

// Seed the design artifacts a built story would have on disk, so we can prove
// the revise STALES them (forces the owning author to re-author).
function seedDesignArtifacts(tdd: string): void {
  mkdirSync(acsDir(tdd, FEATURE, STORY), { recursive: true });
  writeFileSync(
    acJson(tdd, FEATURE, STORY, "AC1-x"),
    JSON.stringify({ id: "AC1-x", layer: "E2E", given: "g", when: "w", then: "t", status: "draft" }) + "\n",
  );
  mkdirSync(join(featureTestListJson(tdd, FEATURE), ".."), { recursive: true });
  writeFileSync(
    featureTestListJson(tdd, FEATURE),
    JSON.stringify({ feature_id: FEATURE, items: [{ id: "T1", description: "x", ac_id: "AC1-x", status: "pending" }] }) + "\n",
  );
  mkdirSync(join(storyTestListJson(tdd, FEATURE, STORY), ".."), { recursive: true });
  writeFileSync(
    storyTestListJson(tdd, FEATURE, STORY),
    JSON.stringify({ feature_id: FEATURE, story_id: STORY, items: [{ id: "T1", description: "x", ac_id: "AC1-x", status: "pending" }] }) + "\n",
  );
}

/** Seed a GREEN cycle on disk for AC1-x/T1 (red_at + green_at), mirroring a story
 *  the build lane already drove green. resetStoryBuildState must remove it so a
 *  revised/rebuilt story re-drives RED/GREEN instead of resurrecting the stale
 *  green_at against a regenerated (same-id) test-list (Finding 27). */
function seedGreenCycle(tdd: string): void {
  const dir = join(cyclesRootDir(tdd), FEATURE, STORY, "AC1-x");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "cycle-001.json"),
    JSON.stringify({
      cycle_id: "cycle-001",
      feature_id: FEATURE,
      story_id: STORY,
      ac_id: "AC1-x",
      test_id: "T1",
      red_at: "2026-07-17T00:00:00.000Z",
      green_at: "2026-07-17T00:01:00.000Z",
    }) + "\n",
  );
}

/** True when the story has any cycle artifact on disk. */
function hasCycles(tdd: string): boolean {
  return existsSync(join(cyclesRootDir(tdd), FEATURE, STORY));
}

describe("applyReviseSelfHeal (the revise self-heal transition)", () => {
  let tdd: string;
  beforeEach(() => {
    tdd = mkdtempSync(join(tmpdir(), "tdd-revise-e2e-"));
    writePipeline(tdd, pipelineBuilding());
    seedDesignArtifacts(tdd);
    recordBlockingSmellFlag(tdd, "ac-overlap", "AC4 implied by AC2", { story_id: STORY });
  });
  afterEach(() => rmSync(tdd, { recursive: true, force: true }));

  it("resets the story to designing, discards the experiment, frees the lane, resolves the smell", () => {
    const r = applyReviseSelfHeal({
      featureId: FEATURE,
      story: STORY,
      smell: "ac-overlap",
      routedTo: "spec-author",
      gate: "spec",
      reason: "AC4 implied by AC2",
      consortDir: tdd,
    });
    expect(r.decided).toBe("revise");
    expect(r.resolvedSmell).toBe(true);

    const p = readPipeline(tdd, FEATURE);
    expect(p.stories[STORY].status).toBe("designing");
    expect(p.stories[STORY].experiment?.status).toBe("discarded");
    expect(p.stories[STORY].gate?.status).toBe("open");
    expect(p.build_active).toBeNull();

    // The smell is resolved-as-revised: the one-revise budget is now spent.
    expect(priorReviseCount(tdd, "ac-overlap", STORY)).toBe(1);
  });

  it("resets the story's BUILD state so it re-drives RED/GREEN, not re-deploy (Finding 27)", () => {
    // A revised story that kept its stale green_at cycles resurrects allGreen once
    // the design lane regenerates a same-id test-list, so the drive skips the build
    // and re-fails at deploy. The revise must clear the cycle records.
    seedGreenCycle(tdd);
    expect(hasCycles(tdd)).toBe(true);
    applyReviseSelfHeal({
      featureId: FEATURE, story: STORY, smell: "ac-overlap",
      routedTo: "spec-author", gate: "spec", reason: "AC4 implied by AC2", consortDir: tdd,
    });
    expect(hasCycles(tdd)).toBe(false);
  });

  it("is NOT hollow: stales the owning author's artifacts + writes the verdict brief", () => {
    applyReviseSelfHeal({
      featureId: FEATURE, story: STORY, smell: "ac-overlap",
      routedTo: "spec-author", gate: "spec", reason: "AC4 implied by AC2", consortDir: tdd,
    });
    // spec-gate revise clears the ACs (re-decomposition) + the test list, so the
    // design lane re-invokes spec-author, not just re-approve the same spec.
    expect(existsSync(acJson(tdd, FEATURE, STORY, "AC1-x"))).toBe(false);
    expect(existsSync(storyTestListJson(tdd, FEATURE, STORY))).toBe(false);
    const master = JSON.parse(readFileSync(featureTestListJson(tdd, FEATURE), "utf8")) as { items: unknown[] };
    expect(master.items).toHaveLength(0); // the story's item was removed
    // The verdict reached the spec-author as a hand-back brief.
    const hb = handbackFile(tdd, FEATURE, "spec-author", STORY);
    expect(existsSync(hb)).toBe(true);
    expect(readFileSync(hb, "utf8")).toMatch(/AC4 implied by AC2/);
  });

  it("test_list-gate revise stales the test list but KEEPS the ACs", () => {
    applyReviseSelfHeal({
      featureId: FEATURE, story: STORY, smell: "test-list-drift",
      routedTo: "test-strategist", gate: "test_list", reason: "T1 already green", consortDir: tdd,
    });
    expect(existsSync(storyTestListJson(tdd, FEATURE, STORY))).toBe(false);
    expect(existsSync(acJson(tdd, FEATURE, STORY, "AC1-x"))).toBe(true); // ACs preserved
    const hb = handbackFile(tdd, FEATURE, "test-strategist", STORY);
    expect(readFileSync(hb, "utf8")).toMatch(/T1 already green/);
  });

  it("ia-gate revise clears the IA coverage marker + architect notes (ux re-refines, architect re-tags), KEEPS the ACs", () => {
    // The reflect-ia-defect backstop: the IA gained a surface, so the per-story ia refinement
    // must re-run (marker cleared -> iaRefined false) AND the architect must re-tag E2E layers
    // against it (architectural_notes cleared -> architectAnnotated false). The ACs are preserved.
    writeFileSync(storyIaCoverageJson(tdd, FEATURE, STORY), JSON.stringify({ story: STORY, reconciled_at: "2026-01-01T00:00:00Z" }) + "\n");
    writeFileSync(
      acJson(tdd, FEATURE, STORY, "AC1-x"),
      JSON.stringify({ id: "AC1-x", layer: "E2E", given: "g", when: "w", then: "t", status: "draft", architectural_notes: "E2E via the file-stock form" }) + "\n",
    );
    applyReviseSelfHeal({
      featureId: FEATURE, story: STORY, smell: "reflect-ia-defect",
      routedTo: "ux-designer", gate: "ia", reason: "AC1 asserts a surface ia.md does not name", consortDir: tdd,
    });
    expect(existsSync(storyIaCoverageJson(tdd, FEATURE, STORY))).toBe(false); // marker cleared -> ux ia re-runs
    const ac = JSON.parse(readFileSync(acJson(tdd, FEATURE, STORY, "AC1-x"), "utf8")) as { id: string; architectural_notes?: string };
    expect(ac.id).toBe("AC1-x"); // the AC itself is preserved
    expect(ac.architectural_notes ?? "").toBe(""); // notes cleared -> architect re-tags
    const hb = handbackFile(tdd, FEATURE, "ux-designer", STORY);
    expect(readFileSync(hb, "utf8")).toMatch(/ia\.md does not name/);
    // Co-heal is scoped to the ARCHITECT (re-tag E2E layers against the new IA) — NOT the test-strategist,
    // which can't fix ia.md in a test list and would just hedge "the seams still need a home" (confusing
    // narration for no work). So the architect gets a brief; the test-strategist does not.
    expect(existsSync(handbackFile(tdd, FEATURE, "architect-reviewer", STORY))).toBe(true);
    expect(existsSync(handbackFile(tdd, FEATURE, "test-strategist", STORY))).toBe(false);
  });

  it("#4 — a DETERMINISTIC test_list conformance flag (ac_ids, no reflect verdict) revises SCOPED: patch marker + no architect re-annotate", () => {
    // The pre-reflect conformance gate flags reflect-testlist-defect with the offending AC id(s) but writes
    // NO reflect verdict. Before #4 that empty-findings path cleared the WHOLE story (every architect note
    // re-annotated). Now the self-heal reads the flag's ac_id(s) and takes the SCOPED patch path.
    const flaggedAc = "AC1-x";
    const otherAc = "AC2-y";
    writeFileSync(
      acJson(tdd, FEATURE, STORY, flaggedAc),
      JSON.stringify({ id: flaggedAc, layer: "E2E", given: "g", when: "w", then: "t", architectural_notes: "notes-AC1" }) + "\n",
    );
    writeFileSync(
      acJson(tdd, FEATURE, STORY, otherAc),
      JSON.stringify({ id: otherAc, layer: "API", given: "g", when: "w", then: "t", architectural_notes: "notes-AC2" }) + "\n",
    );
    // analyst-ordered.json present so the scoped PATCH path can keep it (edit in place, no fan-out re-roll).
    writeFileSync(analystOrderedJson(tdd, FEATURE, STORY), JSON.stringify({ items: [{ id: "T1", ac_id: flaggedAc }] }) + "\n");
    // The deterministic flag: ac_ids, no reflect verdict on disk.
    writeSmellsLog(tdd, [{ smell: "reflect-testlist-defect", cycle_ids: [], detail: "test-list conformance: …", story_id: STORY, ac_ids: [flaggedAc] }]);
    expect(openSmellScopeAcIds(tdd, "reflect-testlist-defect", STORY)).toEqual([flaggedAc]);

    applyReviseSelfHeal({
      featureId: FEATURE, story: STORY, smell: "reflect-testlist-defect",
      routedTo: "test-strategist", gate: "test_list", reason: "test-list conformance: client test on a backend AC", consortDir: tdd,
    });

    // SCOPED patch: the ordered list is kept + the patch marker names exactly the flagged AC.
    expect(existsSync(analystOrderedJson(tdd, FEATURE, STORY))).toBe(true);
    const marker = testListPatchJson(tdd, FEATURE, STORY);
    expect(existsSync(marker)).toBe(true);
    expect(JSON.parse(readFileSync(marker, "utf8")).ac_ids).toEqual([flaggedAc]);
    // The churn fix: NO architect re-annotate — both ACs keep their notes (the full-clear path is skipped).
    expect(JSON.parse(readFileSync(acJson(tdd, FEATURE, STORY, flaggedAc), "utf8")).architectural_notes).toBe("notes-AC1");
    expect(JSON.parse(readFileSync(acJson(tdd, FEATURE, STORY, otherAc), "utf8")).architectural_notes).toBe("notes-AC2");
  });

  it("invalidates the stale reflect verdict so the re-dispatched Navigator recomputes fresh (Finding 9)", () => {
    // A prior reflect turn judged the PRE-fix test-list and failed it.
    writeReflectVerdict(tdd, FEATURE, STORY, {
      version: 1,
      passed: false,
      findings: [{ owner: "test-strategist", detail: "T1 routed to the wrong suite" }],
    });
    expect(reflectionVerdictWritten(tdd, FEATURE, STORY)).toBe(true);
    applyReviseSelfHeal({
      featureId: FEATURE, story: STORY, smell: "reflect-testlist-defect",
      routedTo: "test-strategist", gate: "test_list", reason: "T1 routed to the wrong suite", consortDir: tdd,
    });
    // The stale verdict is gone: the design lane re-dispatches the Navigator, which
    // re-evaluates the corrected test-list instead of reusing passed:false (the loop
    // that ran the Navigator to the stall guard).
    expect(reflectionVerdictWritten(tdd, FEATURE, STORY)).toBe(false);
  });
});

// ---- operator `pipeline revise` self-heals the blocking smell (Findings 22+23) --

describe("reviseStoryWithSelfHeal (operator pipeline revise)", () => {
  let tdd: string;
  beforeEach(() => {
    tdd = mkdtempSync(join(tmpdir(), "tdd-revise-op-"));
    writePipeline(tdd, pipelineBuilding());
    seedDesignArtifacts(tdd);
  });
  afterEach(() => rmSync(tdd, { recursive: true, force: true }));

  it("self-heals an open reflect smell: resolves it, re-briefs the author, spends the budget (Finding 23)", () => {
    // The exact reported state: a reflect-testlist-defect blocks the drive.
    recordBlockingSmellFlag(tdd, "reflect-testlist-defect", "PI7 DELETE-rejection is untested", { story_id: STORY });
    expect(priorReviseCount(tdd, "reflect-testlist-defect", STORY)).toBe(0);

    const outcome = reviseStoryWithSelfHeal(tdd, FEATURE, STORY, {
      approver: "po@example.com",
      reason: "add a fitness test asserting DELETE on stock_adjustments is rejected",
    });

    expect(outcome.mode).toBe("self-heal");
    expect(outcome.smell).toBe("reflect-testlist-defect");
    expect(outcome.routedTo).toBe("test-strategist");
    // Finding 23: the smell is resolved (the next drive will NOT re-block at action 000).
    expect(readSmellsLog(tdd).detected.some((d) => !d.resolution && d.smell === "reflect-testlist-defect")).toBe(false);
    // Finding 22c: the one-revise budget is spent, so a re-fire hard-halts.
    expect(priorReviseCount(tdd, "reflect-testlist-defect", STORY)).toBe(1);
    // Finding 22a/b: the coverage-forcing brief reached the test-strategist.
    const hb = handbackFile(tdd, FEATURE, "test-strategist", STORY);
    expect(existsSync(hb)).toBe(true);
    const brief = readFileSync(hb, "utf8");
    expect(brief).toMatch(/DELETE on stock_adjustments is rejected/);
    // The test list is fan-out-produced: the brief re-DERIVES via the bin (no hand-edit), it does NOT
    // hand the test-strategist the old manual "ADD the specific coverage / keep all existing intact".
    expect(brief).toMatch(/RE-?RUN/i);
    expect(brief).toMatch(/do NOT hand-edit/i);
    expect(brief).not.toMatch(/ADD the specific coverage/);
    // The story is back in the design lane.
    expect(readPipeline(tdd, FEATURE).stories[STORY].status).toBe("designing");
  });

  it("falls back to a plain reset when no blocking smell is open", () => {
    const outcome = reviseStoryWithSelfHeal(tdd, FEATURE, STORY, {
      approver: "po@example.com",
      reason: "PO wants a different approach",
    });
    expect(outcome.mode).toBe("plain");
    expect(readPipeline(tdd, FEATURE).stories[STORY].status).toBe("designing");
  });

  it("the PLAIN reset also clears stale build cycles so the story re-drives (Finding 27)", () => {
    // The plain (no-smell) revise flips status to designing but leaves the test
    // list intact, so without a cycle reset every item reads green from the stale
    // cycles and the build lane skips straight to deploy.
    seedGreenCycle(tdd);
    expect(storyTestProgress(tdd, FEATURE, STORY).allGreen).toBe(true);
    const outcome = reviseStoryWithSelfHeal(tdd, FEATURE, STORY, {
      approver: "po@example.com",
      reason: "PO wants a different approach",
    });
    expect(outcome.mode).toBe("plain");
    expect(hasCycles(tdd)).toBe(false);
    expect(storyTestProgress(tdd, FEATURE, STORY).allGreen).toBe(false);
  });

  it("revisableSmellForStory ignores a build-level (non-spec) smell", () => {
    recordBlockingSmellFlag(tdd, "cycle-stall", "stalled", { story_id: STORY });
    expect(revisableSmellForStory(tdd, FEATURE, STORY)).toBeNull();
  });

  it("clearStoryBlockingSmellOnDiscard resolves the smell as cleared (not revised)", () => {
    recordBlockingSmellFlag(tdd, "reflect-testlist-defect", "x", { story_id: STORY });
    const cleared = clearStoryBlockingSmellOnDiscard(tdd, FEATURE, STORY, "po@example.com");
    expect(cleared).toBe("reflect-testlist-defect");
    // Resolved, but NOT as a revise (discard does not spend the one-revise budget).
    expect(readSmellsLog(tdd).detected.some((d) => !d.resolution && d.smell === "reflect-testlist-defect")).toBe(false);
    expect(priorReviseCount(tdd, "reflect-testlist-defect", STORY)).toBe(0);
  });
});

// ---- rebuild-story: the explicit clean-slate re-drive op (Finding 27) ----------

describe("rebuildStory (pipeline rebuild-story)", () => {
  let tdd: string;
  beforeEach(() => {
    tdd = mkdtempSync(join(tmpdir(), "tdd-rebuild-"));
    writePipeline(tdd, pipelineBuilding()); // STORY building + active, experiment active
    seedDesignArtifacts(tdd);
  });
  afterEach(() => rmSync(tdd, { recursive: true, force: true }));

  it("clears cycles, escalations, smells, re-forks the experiment, and re-lanes the story", () => {
    seedGreenCycle(tdd);
    // The two escalation sources that pin a story to the HIL after a false-GREEN:
    writeEscalation(tdd, { source: "deploy-verify", reason: "S2 verify failed", feature_id: FEATURE, story_id: STORY });
    // A build-level blocking smell (rebuild clears these too, not just spec-level).
    recordBlockingSmellFlag(tdd, "cycle-stall", "stuck at deploy", { story_id: STORY });
    expect(hasCycles(tdd)).toBe(true);

    const r = rebuildStory(tdd, FEATURE, STORY, { approver: "po@example.com" });

    expect(r.cyclesCleared).toBe(true);
    expect(r.testItemsReset).toBeGreaterThanOrEqual(0);
    expect(r.escalationsCleared).toHaveLength(1);
    expect(r.smellsCleared).toContain("cycle-stall");
    expect(r.experimentReset).toBe(true);

    // Build state is clean -> the drive re-runs RED/GREEN, not deploy.
    expect(hasCycles(tdd)).toBe(false);
    expect(storyTestProgress(tdd, FEATURE, STORY).allGreen).toBe(false);
    // Both HIL sources are cleared (dual-source rule): no unresolved escalation,
    // no open smell for the story.
    expect(readEscalations(tdd).every((e) => e.resolved_at || e.story_id !== STORY)).toBe(true);
    expect(readSmellsLog(tdd).detected.some((d) => !d.resolution && d.story_id === STORY)).toBe(false);
    // The story is back on the single build lane from a clean slate.
    const p = readPipeline(tdd, FEATURE);
    expect(p.stories[STORY].status).toBe("building");
    expect(p.build_active).toBe(STORY);
    expect(p.stories[STORY].experiment?.status).toBe("discarded");
  });

  it("refuses when the build lane is busy on a different story (single-lane invariant)", () => {
    const p = readPipeline(tdd, FEATURE);
    p.build_active = "S9-other";
    writePipeline(tdd, p);
    expect(() => rebuildStory(tdd, FEATURE, STORY)).toThrow(/busy on S9-other/);
  });

  it("throws when the story is not in the pipeline", () => {
    expect(() => rebuildStory(tdd, FEATURE, "S404-missing")).toThrow(/not in the pipeline/);
  });

  it("is idempotent enough to re-run: a second call is a clean no-op on the cycles", () => {
    seedGreenCycle(tdd);
    rebuildStory(tdd, FEATURE, STORY);
    const r2 = rebuildStory(tdd, FEATURE, STORY);
    expect(r2.cyclesCleared).toBe(false);
    expect(r2.escalationsCleared).toHaveLength(0);
  });
});

describe("story-pipeline CLI wires the self-heal (static)", () => {
  const cliSrc = readFileSyncNode(
    fileURLToPath(new URL("../../bin/consort/story-pipeline.cli.ts", import.meta.url)),
    "utf8",
  );
  it("revise delegates to reviseStoryWithSelfHeal (not a hollow reviseStory)", () => {
    expect(cliSrc).toMatch(/reviseStoryWithSelfHeal\(/);
  });
  it("discard clears the story's blocking smell", () => {
    expect(cliSrc).toMatch(/clearStoryBlockingSmellOnDiscard\(/);
  });
  it("exposes a resolve-smell subcommand", () => {
    expect(cliSrc).toMatch(/case "resolve-smell"/);
  });
  it("exposes a rebuild-story subcommand wired to rebuildStory", () => {
    expect(cliSrc).toMatch(/case "rebuild-story"/);
    expect(cliSrc).toMatch(/rebuildStory\(/);
  });
});

// ---- probe: routable computation off disk ------------------------------------

describe("diskArtifactProbe pendingEscalation.routable", () => {
  let tdd: string;
  beforeEach(() => {
    tdd = mkdtempSync(join(tmpdir(), "tdd-revise-probe-"));
  });
  afterEach(() => rmSync(tdd, { recursive: true, force: true }));

  it("marks a spec-level smell routable, using the active build story as fallback scope", () => {
    recordBlockingSmellFlag(tdd, "ac-overlap", "AC4 implied by AC2"); // no story scope
    const e = diskArtifactProbe(tdd, FEATURE, STORY).pendingEscalation();
    expect(e?.routable).toEqual({ story: STORY, owning_role: "spec-author", gate: "spec" });
  });

  it("does NOT mark a build-level smell routable", () => {
    recordBlockingSmellFlag(tdd, "cycle-stall", "stalled", { story_id: STORY });
    const e = diskArtifactProbe(tdd, FEATURE, STORY).pendingEscalation();
    expect(e?.routable).toBeUndefined();
  });

  it("does NOT mark routable once the one-revise budget is spent (a re-fire hard-halts)", () => {
    // First flag -> revised (budget spent).
    recordBlockingSmellFlag(tdd, "ac-overlap", "first", { story_id: STORY });
    markSmellResolved(tdd, "ac-overlap", { story_id: STORY, kind: "revised" });
    // Same smell re-fires on the same story.
    recordBlockingSmellFlag(tdd, "ac-overlap", "again", { story_id: STORY });
    const e = diskArtifactProbe(tdd, FEATURE, STORY).pendingEscalation();
    expect(e?.source).toBe("smell:ac-overlap");
    expect(e?.routable).toBeUndefined();
  });

  // Progress-based reflect budget: the critic drip-feeds test-list defects, so a
  // SECOND distinct reflect defect must still route AS LONG AS the prior revise
  // changed the test-list; a no-change re-emit (stuck) hard-halts.
  function writeTestList(sha: string): void {
    mkdirSync(join(storyTestListJson(tdd, FEATURE, STORY), ".."), { recursive: true });
    writeFileSync(
      storyTestListJson(tdd, FEATURE, STORY),
      JSON.stringify({ feature_id: FEATURE, story_id: STORY, marker: sha, items: [] }) + "\n",
    );
  }

  it("marks a SECOND reflect defect routable when the prior revise changed the test-list (progress)", () => {
    writeTestList("v1");
    recordBlockingSmellFlag(tdd, "reflect-testlist-defect", "defect A", { story_id: STORY });
    // First revise: co-heals + records the v1 fingerprint.
    resolveOpenReflectSmellsForStory(tdd, STORY, "revised A", storyTestListFingerprint(tdd, FEATURE, STORY));
    // The re-design CHANGED the list (v2), and the critic reveals a new defect B.
    writeTestList("v2");
    recordBlockingSmellFlag(tdd, "reflect-testlist-defect", "defect B", { story_id: STORY });
    const e = diskArtifactProbe(tdd, FEATURE, STORY).pendingEscalation();
    expect(e?.routable).toEqual({ story: STORY, owning_role: "test-strategist", gate: "test_list" });
  });

  it("does NOT mark routable when a reflect revise produced NO change (stuck -> hard halt)", () => {
    writeTestList("v1");
    recordBlockingSmellFlag(tdd, "reflect-testlist-defect", "defect A", { story_id: STORY });
    resolveOpenReflectSmellsForStory(tdd, STORY, "revised A", storyTestListFingerprint(tdd, FEATURE, STORY));
    // The re-design left the list UNCHANGED (still v1); the same defect re-fires.
    recordBlockingSmellFlag(tdd, "reflect-testlist-defect", "defect A again", { story_id: STORY });
    const e = diskArtifactProbe(tdd, FEATURE, STORY).pendingEscalation();
    expect(e?.source).toBe("smell:reflect-testlist-defect");
    expect(e?.routable).toBeUndefined();
  });
});

// ---- integration: decide -> perform -> re-derive (recover, then bounded halt) -

describe("revise-routing loop integration", () => {
  let tdd: string;
  const ctx = { phase: "feature" as const, breakdownDone: true };
  beforeEach(() => {
    tdd = mkdtempSync(join(tmpdir(), "tdd-revise-loop-"));
    writePipeline(tdd, pipelineBuilding());
  });
  afterEach(() => rmSync(tdd, { recursive: true, force: true }));

  function transitionNow(): ReturnType<typeof nextTransition> {
    const pipeline = readPipeline(tdd, FEATURE);
    const probe = diskArtifactProbe(tdd, FEATURE, pipeline.build_active);
    return nextTransition(deriveDriveState(pipeline, probe, ctx));
  }

  it("recovers: a spec-level smell mid-build routes to revise-route, then resumes the design lane", () => {
    // Mid-build, the navigator flags ac-overlap (blocking).
    recordBlockingSmellFlag(tdd, "ac-overlap", "AC4 implied by AC2", { story_id: STORY });

    // The driver routes to revise-route (NOT raise-to-hil).
    const a1 = transitionNow();
    expect(a1.kind).toBe("revise-route");

    // Perform it (the decide-escalation command, run in-process).
    if (a1.kind === "revise-route") {
      applyReviseSelfHeal({
        featureId: FEATURE,
        story: a1.story,
        smell: "ac-overlap",
        routedTo: a1.role,
        gate: a1.gate,
        reason: a1.reason,
        consortDir: tdd,
      });
    }

    // Re-derive: the escalation is gone, the story is back in the design lane,
    // so the driver resumes at the owning author (spec-author re-draft), NOT a halt.
    const a2 = transitionNow();
    expect(a2.kind).toBe("invoke-role");
    if (a2.kind === "invoke-role" && "role" in a2) {
      expect(a2.role).toBe("spec-author");
    }
  });

  it("bounded: a SECOND escape of the same smell on the same story hard-halts", () => {
    // First overlap -> revised (budget spent).
    recordBlockingSmellFlag(tdd, "ac-overlap", "first", { story_id: STORY });
    const a1 = transitionNow();
    expect(a1.kind).toBe("revise-route");
    if (a1.kind === "revise-route") {
      applyReviseSelfHeal({
        featureId: FEATURE, story: a1.story, smell: "ac-overlap",
        routedTo: a1.role, gate: a1.gate, reason: a1.reason, consortDir: tdd,
      });
    }
    // Put the story back in build so build_active scopes the re-fire, then the
    // SAME smell escapes again.
    const p = readPipeline(tdd, FEATURE);
    p.stories[STORY].status = "building";
    p.build_active = STORY;
    writePipeline(tdd, p);
    recordBlockingSmellFlag(tdd, "ac-overlap", "again", { story_id: STORY });

    // Budget spent -> not routable -> terminal halt.
    expect(transitionNow().kind).toBe("raise-to-hil");
  });
});
