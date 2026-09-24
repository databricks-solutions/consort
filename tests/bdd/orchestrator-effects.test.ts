// Real DriveEffects (phase 3b act half) tests: the pure action->commands
// mapping per WorkflowAction kind, plus buildDriveEffects routing through an
// injected runner and reading a DriveState from a temp .tdd.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  commandsForAction,
  commandsFromManifest,
  commandsForActionResolved,
  buildDriveEffects,
  planNextAction,
  type DriveCommand,
  type DriveEffectsConfig,
  type CommandRunner,
} from "../../consort/orchestrator/drive/orchestrator-effects";
import type { WorkflowAction } from "../../consort/orchestrator/drive/orchestrator-drive";
import { existsSync, readFileSync } from "node:fs";
import { handbackFile } from "../../consort/config/consort-paths";
import { beginNextPendingCycle } from "../../consort/pipeline/cycle-record";
import { writeGreenFailure, writeSupersededTests } from "../../consort/smells/supersession";

function recordingRunner(): { runner: CommandRunner; calls: DriveCommand[] } {
  const calls: DriveCommand[] = [];
  return { calls, runner: { async run(cmd) { calls.push(cmd); } } };
}

function cfg(over: Partial<DriveEffectsConfig> = {}): DriveEffectsConfig {
  return {
    projectDir: "/p",
    consortDir: "/p/.tdd",
    featureId: "F1",
    runner: { async run() {} },
    modelForRole: () => "sonnet",
    approver: "human-proxy",
    deployTarget: "local",
    instance: "inst-x",
    // uiTrack defaults ON in production; the "off" cases in these directive-logic tests must set it
    // explicitly, so the helper baseline is off and a test opts in with cfg({ uiTrack: true }).
    uiTrack: false,
    ...over,
  };
}

describe("commandsForAction: invoke-role -> claude", () => {
  it("maps a build role to a claude command with the resolved model", () => {
    const c = cfg({ modelForRole: (r) => (r === "driver" ? "opus" : "sonnet") });
    const cmds = commandsForAction({ kind: "invoke-role", role: "driver", story: "S1" }, c);
    // [claude, cycle green, reconcile]: the Driver runs (writes code + runs the
    // project's tests), then the ORCHESTRATION records the cycle (stamps GREEN
    // via the substrate, not the agent), then reconcile logs what landed.
    expect(cmds).toHaveLength(3);
    // P5: the Driver resumes PER STORY by default (story-scoped resumeKey), warm
    // across the story's cycles and fresh at each new story. The on-disk artifact
    // remains its only inter-role context, so correctness is unchanged.
    expect(cmds[0]).toMatchObject({ kind: "claude", role: "driver", model: "opus", resumeKey: "driver:S1" });
    expect((cmds[0] as { task: string }).task).toMatch(/GREEN/);
    expect(cmds[1]).toMatchObject({ kind: "cli", bin: "consort-cycle" });
    expect((cmds[1] as { args: string[] }).args[0]).toBe("green");
    expect(cmds[2]).toMatchObject({ kind: "cli", bin: "consort-log" });
    expect((cmds[2] as { args: string[] }).args).toContain("--reconcile");
  });

  it("keys effort/model on the STEP: spec-author BREAKDOWN and AC-authoring resolve independently", () => {
    // "Apply to the step, not the role." commandsForAction derives a TurnKey per
    // action (breakdown vs acs) and passes it to effortForTurn/modelForTurn, so a
    // lever applied to breakdown does NOT leak onto the per-story AC-authoring turn.
    const seen: Array<{ role: string; turn?: string }> = [];
    const c = cfg({
      modelForTurn: (role, turn) => {
        seen.push({ role, turn });
        return role === "spec-author" && turn === "breakdown" ? "haiku" : "opus";
      },
      effortForTurn: (role, turn) => (role === "spec-author" && turn === "breakdown" ? "low" : "default"),
    });
    const breakdown = commandsForAction({ kind: "invoke-role", role: "spec-author", mode: "breakdown" }, c);
    const bClaude = breakdown.find((x) => (x as { kind?: string }).kind === "claude") as { model: string; effort?: string };
    expect(bClaude.model).toBe("haiku");
    expect(bClaude.effort).toBe("low");
    // The breakdown turn was keyed "breakdown", not the role with no turn.
    expect(seen).toContainEqual({ role: "spec-author", turn: "breakdown" });

    const acs = commandsForAction({ kind: "invoke-role", role: "spec-author", story: "S1" }, c);
    const aClaude = acs.find((x) => (x as { kind?: string }).kind === "claude") as { model: string; effort?: string };
    // AC-authoring keyed "acs" -> the breakdown lever does NOT apply.
    expect(aClaude.model).toBe("opus");
    expect(aClaude.effort).toBeUndefined(); // "default" => flag omitted
    expect(seen).toContainEqual({ role: "spec-author", turn: "acs" });
  });

  it("a reflect turn's command carries replay.buildMode='reflect' (so the replay restores its .sftdd verdict)", () => {
    const cmds = commandsForAction({ kind: "invoke-role", role: "navigator", story: "S1", buildMode: "reflect" }, cfg());
    const claude = cmds.find((c) => (c as { kind?: string }).kind === "claude") as { replay?: { buildMode?: string } };
    expect(claude.replay?.buildMode).toBe("reflect");
  });

  it("navigator ASSESS-DEPLOY: prompts to scope contamination-fragile tests + finalizes via assess-deploy-verify", () => {
    const cmds = commandsForAction({ kind: "invoke-role", role: "navigator", story: "S1", buildMode: "assess-deploy" }, cfg());
    const task = (cmds[0] as { task: string }).task;
    expect(task).toMatch(/DEPLOY-VERIFY/);
    expect(task).toMatch(/deploy-verify-scope\.json/);
    // The finalize is the deterministic assess-deploy-verify subcommand (NOT a
    // begin/review cycle turn).
    const cycle = cmds.find((c) => (c as { bin?: string }).bin === "consort-cycle") as { args: string[] };
    expect(cycle.args[0]).toBe("assess-deploy-verify");
    expect(cycle.args).toContain("S1");
    expect(cmds.some((c) => (c as { args?: string[] }).args?.[0] === "begin")).toBe(false);
  });

  it("driver SCOPE-DEPLOY: refactors ONLY the flagged tests + finalizes via refactor-deploy-verify (no green/refactor cycle)", () => {
    const cmds = commandsForAction({ kind: "invoke-role", role: "driver", story: "S1", buildMode: "refactor-deploy" }, cfg());
    const task = (cmds[0] as { task: string }).task;
    expect(task).toMatch(/SCOPE/);
    expect(task).toMatch(/do NOT change product code/i);
    const cycle = cmds.find((c) => (c as { bin?: string }).bin === "consort-cycle") as { args: string[] };
    expect(cycle.args[0]).toBe("refactor-deploy-verify");
    // Crucially NOT a green/refactor cycle stamp (there is no open cycle).
    expect(cmds.some((c) => ["green", "refactor"].includes((c as { args?: string[] }).args?.[0] ?? ""))).toBe(false);
  });

  it("resume scoping: non-build roles warm across the feature; build roles warm PER STORY (P5)", () => {
    // spec-author / architect-reviewer / etc. resume across the whole feature
    // (keyed by role). The build roles (navigator/driver) resume per STORY – a
    // fresh session each story bounds context growth (the per-story spec gate
    // keeps stories small); the detailed scoping is covered in the build-lane
    // perf describe below.
    const specAuthor = commandsForAction({ kind: "invoke-role", role: "spec-author", story: "S1" }, cfg());
    expect(specAuthor[0]).toMatchObject({ kind: "claude", role: "spec-author", resumeKey: "spec-author" });
    const navigator = commandsForAction({ kind: "invoke-role", role: "navigator", story: "S1" }, cfg());
    const driver = commandsForAction({ kind: "invoke-role", role: "driver", story: "S1" }, cfg());
    expect((navigator[0] as { resumeKey?: string }).resumeKey).toBe("navigator:S1");
    expect((driver[0] as { resumeKey?: string }).resumeKey).toBe("driver:S1");
  });

  it("navigator: agent writes the test, orchestration stamps the RED cycle (agent records nothing)", () => {
    const cmds = commandsForAction({ kind: "invoke-role", role: "navigator", story: "S1" }, cfg());
    // [claude, cycle begin, reconcile]. The Navigator is pure; the cycle CLI
    // (orchestration) records RED so the probe's red_at reading never depends
    // on the agent hand-writing a cycle artifact.
    expect(cmds[0]).toMatchObject({ kind: "claude", role: "navigator" });
    // P5: Navigator resumes per story (story-scoped resumeKey).
    expect((cmds[0] as { resumeKey?: string }).resumeKey).toBe("navigator:S1");
    const cycle = cmds.find((c) => (c as { bin?: string }).bin === "consort-cycle") as { args: string[] } | undefined;
    expect(cycle).toBeTruthy();
    expect(cycle!.args[0]).toBe("begin");
    expect(cycle!.args).toContain("S1");
    // The agent is NOT told to record the cycle or touch git.
    expect((cmds[0] as { task: string }).task).not.toMatch(/beginCycle|markGreen|git /i);
  });

  it("propose (interactive, no recorded requests) spawns the Spec Author + WRITES the proposal artifact", () => {
    const propose = commandsForAction({ kind: "invoke-role", role: "spec-author", mode: "propose" }, cfg());
    expect(propose[0]).toMatchObject({ kind: "claude", role: "spec-author" });
    const task = (propose[0] as { task: string }).task;
    // Must explicitly instruct writing feature-proposals.md (not just describe it):
    // the vague prior wording let the Spec Author write nothing then claim it exists.
    expect(task).toMatch(/feature-proposals\.md/);
    expect(task).toMatch(/write/i);
  });

  it("propose carries an ALREADY-DELIVERED directive so a re-plan never re-proposes a shipped feature", () => {
    // The sprint-2 greenfield trap: propose is seeded ONLY product-overview.md + nfrs.md (the PO's
    // forward-worded standing intent), so without a shipped-state signal it re-proposes a delivered
    // feature's foundation. A delivered feature (every story done + accepted) must surface in the task
    // as ALREADY DELIVERED; an in-progress feature must NOT (it isn't shipped), and a fresh project
    // (nothing delivered) must carry NO delivered clause — keeping that first-sprint prompt as it was.
    const dir = mkdtempSync(join(tmpdir(), "propose-delivered-"));
    try {
      // F1: delivered (done + accepted) + a titled request.
      mkdirSync(join(dir, "features", "F1-stock-visibility"), { recursive: true });
      writeFileSync(
        join(dir, "features", "F1-stock-visibility", "pipeline.json"),
        JSON.stringify({ version: 1, feature_id: "F1-stock-visibility", stories: { S1: { status: "done", acceptance: { decision: "accepted", history: [] } } }, build_queue: [], build_active: null }),
      );
      writeFileSync(join(dir, "features", "F1-stock-visibility", "feature-request.md"), "# See and adjust stock at one warehouse\n\nbody\n");
      // F6: in-progress (building) — must NOT read as delivered.
      mkdirSync(join(dir, "features", "F6-split-tracking-code"), { recursive: true });
      writeFileSync(
        join(dir, "features", "F6-split-tracking-code", "pipeline.json"),
        JSON.stringify({ version: 1, feature_id: "F6-split-tracking-code", stories: { S1: { status: "building" } }, build_queue: [], build_active: "S1" }),
      );

      const task = (commandsForAction({ kind: "invoke-role", role: "spec-author", mode: "propose" }, cfg({ consortDir: dir }))[0] as { task: string }).task;
      expect(task).toContain("ALREADY DELIVERED");
      expect(task).toContain("F1-stock-visibility (See and adjust stock at one warehouse)"); // id + request H1 title
      expect(task).toContain("do NOT re-propose");
      expect(task).not.toContain("F6-split-tracking-code"); // in-progress → not a delivered feature

      // Baseline: a project with nothing delivered carries no delivered clause (first-sprint prompt unchanged).
      const fresh = mkdtempSync(join(tmpdir(), "propose-fresh-"));
      try {
        const freshTask = (commandsForAction({ kind: "invoke-role", role: "spec-author", mode: "propose" }, cfg({ consortDir: fresh }))[0] as { task: string }).task;
        expect(freshTask).not.toContain("ALREADY DELIVERED");
      } finally {
        rmSync(fresh, { recursive: true, force: true });
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("propose (capture: recorded requests) is DETERMINISTIC – projects proposals via the Human Proxy, no LLM", () => {
    const cmds = commandsForAction({ kind: "invoke-role", role: "spec-author", mode: "propose" }, cfg({ recordedRequests: true }));
    // No claude spawn – the artifact is code-emitted from the recorded requests.
    expect(cmds.some((c) => (c as { kind?: string }).kind === "claude")).toBe(false);
    expect(cmds[0]).toMatchObject({ kind: "cli", bin: "consort-human-proxy" });
    expect((cmds[0] as { args: string[] }).args[0]).toBe("supply-proposals");
  });

  // livePropose (capture with a LIVE plan lane): even with recorded requests
  // present (so the proxy-as-PO still commits the recorded request at
  // author-requests), the spec-author's PROPOSE runs LIVE – it reads
  // product-overview.md + nfrs.md and authors feature-proposals.md itself,
  // instead of projecting deterministically. The proposal set is guided by the
  // product overview's own feature framing.
  it("propose (capture + livePropose) runs LIVE despite recorded requests", () => {
    const cmds = commandsForAction({ kind: "invoke-role", role: "spec-author", mode: "propose" }, cfg({ recordedRequests: true, livePropose: true }));
    expect(cmds[0]).toMatchObject({ kind: "claude", role: "spec-author" });
    expect((cmds[0] as { task: string }).task).toMatch(/feature-proposals\.md/);
    // NOT the deterministic supply-proposals path.
    expect(cmds.some((c) => (c as { args?: string[] }).args?.[0] === "supply-proposals")).toBe(false);
  });

  it("author-requests is a METERED PO turn (claude), not the inline supply-requests CLI", () => {
    // author-requests no longer intercepts with supply-requests; it dispatches the PO agent to
    // AUTHOR each committed feature-request.md, then re-projects the backlog post-turn. The recorded-
    // seed COPY moved to the backlog gate (see the approve-backlog-gate test below).
    const cmds = commandsForAction({ kind: "invoke-role", role: "product-owner", mode: "author-requests" }, cfg({ recordedRequests: true, livePropose: true, sprintName: "sprint" }));
    expect(cmds[0]).toMatchObject({ kind: "claude", role: "product-owner" });
    expect((cmds[0] as { task: string }).task).toMatch(/feature-request\.md/);
    // NOT the old inline supply-requests CLI.
    expect(cmds.some((c) => (c as { args?: string[] }).args?.[0] === "supply-requests")).toBe(false);
    // Post-turn sync-backlog re-projects backlog.json from the just-authored requests.
    expect(cmds.some((c) => (c as { kind: string }).kind === "sync-backlog")).toBe(true);
  });

  it("the backlog gate SUPPLIES the recorded requests (supply-requests) + re-syncs the backlog", () => {
    // The backlog SELECTION/commit — the human proxy copies each recorded seed + writes requested.json
    // (byte-identical replay), then sync-backlog projects backlog.json. This is where supply-requests
    // moved from author-requests.
    const cmds = commandsForAction({ kind: "approve-backlog-gate" }, cfg({ sprintName: "sprint" }));
    expect(cmds[0]).toMatchObject({ kind: "cli", bin: "consort-human-proxy" });
    expect((cmds[0] as { args: string[] }).args).toEqual(expect.arrayContaining(["--gate", "backlog"]));
    expect(cmds.some((c) => (c as { kind: string }).kind === "sync-backlog")).toBe(true);
  });

  it("propose + breakdown carry the UI-track E2E directive only when the UI track is on", () => {
    // breakdown prepends a reset-breakdown cli (FEIP-8024), so find the claude turn.
    const task = (cmds: ReturnType<typeof commandsForAction>) =>
      (cmds.find((c) => (c as { kind: string }).kind === "claude") as { task: string }).task;
    // Off: no UI directive.
    expect(task(commandsForAction({ kind: "invoke-role", role: "spec-author", mode: "propose" }, cfg()))).not.toMatch(/UI track/i);
    expect(task(commandsForAction({ kind: "invoke-role", role: "spec-author", mode: "breakdown" }, cfg()))).not.toMatch(/UI track/i);
    // On: propose + breakdown both instruct E2E (UI) stories.
    const onPropose = task(commandsForAction({ kind: "invoke-role", role: "spec-author", mode: "propose" }, cfg({ uiTrack: true })));
    expect(onPropose).toMatch(/UI track is ON/);
    expect(onPropose).toMatch(/E2E/);
    const onBreakdown = task(commandsForAction({ kind: "invoke-role", role: "spec-author", mode: "breakdown" }, cfg({ uiTrack: true })));
    expect(onBreakdown).toMatch(/UI track is ON/);
    expect(onBreakdown).toMatch(/E2E/);
  });

  it("scopes the spec-author per-story draft to ONE story (directive + inlined stub)", () => {
    // Level-1 input scoping: the draft invocation is handed only the
    // target story's stub + a single-story directive, so the agent can't batch
    // every story's ACs (which would delay the first story's gate + build).
    const tmp = mkdtempSync(join(tmpdir(), "effects-specauthor-"));
    const consortDir = join(tmp, ".tdd");
    mkdirSync(join(consortDir, "features", "F1", "stories", "S1"), { recursive: true });
    writeFileSync(
      join(consortDir, "features", "F1", "stories", "S1", "story.json"),
      JSON.stringify({ id: "S1", asA: "team member", iWantTo: "file a bug", soThat: "it is tracked" }),
    );
    const task = (commandsForAction({ kind: "invoke-role", role: "spec-author", story: "S1" }, cfg({ consortDir }))[0] as { task: string }).task;
    expect(task).toMatch(/story S1 and NOTHING else/);
    expect(task).toMatch(/Do not create, draft, or modify acceptance criteria for any other story/);
    expect(task).toMatch(/once per story/);
    // The target story's stub is inlined so the prompt is self-contained.
    expect(task).toMatch(/As a team member/);
    expect(task).toMatch(/I want to file a bug/);
    rmSync(tmp, { recursive: true, force: true });
  });

  it("spec-author draft falls back to the directive alone when the story stub is unreadable", () => {
    // No story.json on disk (cfg's consortDir does not exist): still one-story-scoped,
    // just without the inlined stub sentence.
    const task = (commandsForAction({ kind: "invoke-role", role: "spec-author", story: "S2" }, cfg())[0] as { task: string }).task;
    expect(task).toMatch(/story S2 and NOTHING else/);
    expect(task).not.toMatch(/The story:/);
  });

  it("test-strategist task inlines the story's AC ids so it need not re-derive them (P1)", () => {
    // P1 outlier fix: hand the strategist the exact AC ids up front (it re-scanned
    // the acs/ dir to re-derive them, a slow step on a small model) and pin the
    // ac_id mapping the response-formatter enforces.
    const tmp = mkdtempSync(join(tmpdir(), "effects-strategist-"));
    const consortDir = join(tmp, ".tdd");
    mkdirSync(join(consortDir, "features", "F1", "stories", "S1"), { recursive: true });
    writeFileSync(
      join(consortDir, "features", "F1", "stories", "S1", "story.json"),
      JSON.stringify({ id: "S1", acs: ["AC1-create-form", "AC2-validate-input"] }),
    );
    const task = (commandsForAction({ kind: "invoke-role", role: "test-strategist", story: "S1" }, cfg({ consortDir }))[0] as { task: string }).task;
    expect(task).toMatch(/story S1's ordered tests/);
    expect(task).toMatch(/APPEND them to the feature master test list/);
    expect(task).toMatch(/Do NOT author any test-list-per-story\.json/);
    expect(task).toContain("AC1-create-form");
    expect(task).toContain("AC2-validate-input");
    expect(task).toMatch(/EXACT ids/);
    expect(task).toMatch(/cover each AC at least once/);
    rmSync(tmp, { recursive: true, force: true });
  });

  it("test-strategist task falls back to the bare directive when no ACs are on disk yet", () => {
    const task = (commandsForAction({ kind: "invoke-role", role: "test-strategist", story: "S9" }, cfg())[0] as { task: string }).task;
    expect(task).toMatch(/story S9's ordered tests/);
    expect(task).toMatch(/APPEND them to the feature master test list/);
    expect(task).not.toMatch(/The story's ACs are:/);
  });

  it("estimate-committed sizes the committed features by real id + re-syncs the backlog to stamp sizes", () => {
    // The planning-gap fix: after author-requests, the Architect sizes the COMMITTED
    // feature (by its F-id, merging into estimates.json), then sync-backlog re-projects
    // so backlog.json carries the per-sprint size (works on a re-plan sprint too).
    const cmds = commandsForAction(
      { kind: "invoke-role", role: "architect-reviewer", mode: "estimate-committed" },
      cfg({ sprintName: "sprint-2" }),
    );
    const claude = cmds.find((c) => (c as { kind: string }).kind === "claude") as { task: string };
    expect(claude.task).toMatch(/COMMITTED feature/);
    expect(claude.task).toMatch(/real feature id/i);
    expect(claude.task).toMatch(/estimates\.json/);
    expect(claude.task).toMatch(/KEEP every existing estimate/); // merge, not overwrite
    // The backlog is re-synced so the fresh F-keyed size lands in backlog.json.
    expect(cmds.some((c) => (c as { kind: string }).kind === "sync-backlog" && (c as { sprint?: string }).sprint === "sprint-2")).toBe(true);
  });

  it("test-strategist task warns that every DB-writing test must own its state (shared-state-write guard)", () => {
    // A service-backed feature: the dbScope hint must carry the general
    // state-ownership rule, not just the invariant-coverage directive, so a
    // create/content-type test that writes a fixed key with no cleanup does not
    // collide in the shared-feature-branch deploy-verify (the test_T3 halt).
    const tmp = mkdtempSync(join(tmpdir(), "effects-strategist-state-"));
    const consortDir = join(tmp, ".tdd");
    mkdirSync(join(consortDir, "features", "F1", "stories", "S1"), { recursive: true });
    writeFileSync(
      join(consortDir, "features", "F1", "architecture.json"),
      JSON.stringify({ service_backed: true, persistence_invariants: [{ id: "PI1-unique", brief: "unique (sku, location)" }] }),
    );
    const task = (commandsForAction({ kind: "invoke-role", role: "test-strategist", story: "S1" }, cfg({ consortDir }))[0] as { task: string }).task;
    expect(task).toMatch(/WRITES to the DB/);
    expect(task).toMatch(/own its state/);
    expect(task).toMatch(/UNIQUE key/);
    expect(task).toMatch(/shared-state-write/);
    rmSync(tmp, { recursive: true, force: true });
  });

  it("author-requests dispatches the PO agent + a post-turn sync-backlog (metered, no inline supply-requests)", () => {
    // author-requests is now a metered PO turn: it AUTHORS each committed feature-request.md, then
    // sync-backlog re-projects backlog.json. The recorded-seed copy happens at the backlog gate.
    const author = commandsForAction({ kind: "invoke-role", role: "product-owner", mode: "author-requests" }, cfg({ sprintName: "sprint" }));
    expect(author[0]).toMatchObject({ kind: "claude", role: "product-owner" });
    expect(author.some((c) => (c as { kind: string }).kind === "sync-backlog")).toBe(true);
    // NOT the old inline supply-requests CLI.
    expect(author.some((c) => (c as { args?: string[] }).args?.[0] === "supply-requests")).toBe(false);
  });

  it("author-requests + the backlog gate scope sync-backlog / supply-requests to cfg.sprintName (deriver reads the SAME sprint)", () => {
    // J2 planning stall: the backlog must be written under the SAME sprint name the deriver reads.
    // author-requests' post-turn sync-backlog carries cfg.sprintName; the backlog gate's supply-requests
    // + sync-backlog carry it too. If drivePlanning leaves sprintName unset the two disagree => empty
    // backlog => requestsAuthored stays false => the loop re-derives => DRIVER STALL.
    const author = commandsForAction(
      { kind: "invoke-role", role: "product-owner", mode: "author-requests" },
      cfg({ sprintName: "stockflow-rerecord-s1" }),
    );
    expect(author.find((c) => (c as { kind: string }).kind === "sync-backlog")).toMatchObject({ kind: "sync-backlog", sprint: "stockflow-rerecord-s1" });
    const gate = commandsForAction({ kind: "approve-backlog-gate" }, cfg({ sprintName: "stockflow-rerecord-s1" }));
    const supply = gate[0] as { args: string[] };
    expect(supply.args).toContain("--sprint");
    expect(supply.args[supply.args.indexOf("--sprint") + 1]).toBe("stockflow-rerecord-s1");
    expect(gate.find((c) => (c as { kind: string }).kind === "sync-backlog")).toMatchObject({ kind: "sync-backlog", sprint: "stockflow-rerecord-s1" });
  });

  it("spec-author breakdown resets partial state, then seeds the pipeline (reset + claude + verify-artifact + sync-breakdown)", () => {
    const cmds = commandsForAction({ kind: "invoke-role", role: "spec-author", mode: "breakdown" }, cfg());
    // [reset-breakdown (FEIP-8024), claude, verify-artifact (FEIP-8006 out-of-root
    // guard), sync-breakdown, reconcile].
    expect(cmds).toHaveLength(5);
    expect(cmds[0]).toMatchObject({ kind: "cli", bin: "consort-pipeline" });
    expect((cmds[0] as { args: string[] }).args[0]).toBe("reset-breakdown"); // runs BEFORE the turn
    expect(cmds[1]).toMatchObject({ kind: "claude", role: "spec-author" });
    expect(cmds[2]).toMatchObject({ kind: "verify-artifact", role: "spec-author" });
    expect(cmds[3]).toMatchObject({ kind: "cli", bin: "consort-pipeline" });
    expect((cmds[3] as { args: string[] }).args[0]).toBe("sync-breakdown");
    expect(cmds[4]).toMatchObject({ kind: "cli", bin: "consort-log" });
    expect((cmds[4] as { args: string[] }).args).toContain("--reconcile");
  });

  it("sprint-scoped planning roles (propose/author-requests) do NOT reconcile", () => {
    // No feature artifacts to reconcile at planning time. propose is [claude,
    // verify-artifact (FEIP-8006 guard)] – neither is a reconcile (log) step.
    const propose = commandsForAction({ kind: "invoke-role", role: "spec-author", mode: "propose" }, cfg());
    expect(propose).toHaveLength(2);
    expect(propose[0]).toMatchObject({ kind: "claude", role: "spec-author" });
    expect(propose[1]).toMatchObject({ kind: "verify-artifact", role: "spec-author" });
    expect(propose.some((c) => (c as { bin?: string }).bin === "consort-log")).toBe(false);
  });
});

describe("commandsForAction: unified config model-side payload (effort per turn + fallback + budget)", () => {
  const claudeOf = (cmds: ReturnType<typeof commandsForAction>) =>
    cmds.find((c) => (c as { kind: string }).kind === "claude") as
      | { model?: string; effort?: string; fallbackModel?: string; maxBudgetUsd?: number }
      | undefined;

  it("modelForTurn tiers the model by build turn: driver GREEN/REFACTOR cheaper than RED", () => {
    // Mirror the sftdd-config resolution: red keeps sonnet, green/refactor drop to haiku.
    const perTurn: Record<string, string> = { red: "sonnet", green: "haiku", refactor: "haiku" };
    const c = cfg({
      modelForRole: () => "sonnet",
      modelForTurn: (role, turn) => (role === "driver" && turn && perTurn[turn] ? perTurn[turn] : "sonnet"),
    });
    // Driver GREEN (buildMode absent -> "green") runs haiku.
    const green = claudeOf(commandsForAction({ kind: "invoke-role", role: "driver", story: "S1" }, c));
    expect(green?.model).toBe("haiku");
    // Driver REFACTOR runs haiku.
    const refactor = claudeOf(
      commandsForAction({ kind: "invoke-role", role: "driver", story: "S1", buildMode: "refactor", ac: "AC1" }, c),
    );
    expect(refactor?.model).toBe("haiku");
    // Navigator RED (test authoring) keeps sonnet.
    const red = claudeOf(commandsForAction({ kind: "invoke-role", role: "navigator", story: "S1" }, c));
    expect(red?.model).toBe("sonnet");
  });

  it("back-compat: no modelForTurn -> modelForRole still sets the model", () => {
    const c = cfg({ modelForRole: (r) => (r === "driver" ? "opus" : "sonnet") }); // no modelForTurn
    const green = claudeOf(commandsForAction({ kind: "invoke-role", role: "driver", story: "S1" }, c));
    expect(green?.model).toBe("opus");
  });

  it("effortForTurn governs ANY turn (not just review); fallback + budget reach the claude command", () => {
    const c = cfg({
      effortForTurn: (_role, turn) => (turn === "green" ? "high" : turn === "review" ? "low" : ""),
      fallbackModelForRole: (role) => (role === "navigator" ? "haiku" : undefined),
      maxBudgetUsdForRole: (role) => (role === "driver" ? 1.5 : undefined),
    });
    // Driver GREEN: effort high (per the resolver) + budget 1.5, no fallback.
    const green = claudeOf(commandsForAction({ kind: "invoke-role", role: "driver", story: "S1" }, c));
    expect(green?.effort).toBe("high");
    expect(green?.maxBudgetUsd).toBe(1.5);
    expect(green?.fallbackModel).toBeUndefined();
    // Navigator REVIEW: effort low + fallback haiku.
    const review = claudeOf(
      commandsForAction({ kind: "invoke-role", role: "navigator", story: "S1", buildMode: "review", ac: "AC1" }, c),
    );
    expect(review?.effort).toBe("low");
    expect(review?.fallbackModel).toBe("haiku");
  });

  it("effort '' / 'default' from the resolver omits --effort entirely", () => {
    const c = cfg({ effortForTurn: () => "" });
    const red = claudeOf(commandsForAction({ kind: "invoke-role", role: "navigator", story: "S1" }, c));
    expect(red?.effort).toBeUndefined();
  });

  it("back-compat: no effortForTurn -> review-only reviewEffort still applies", () => {
    const c = cfg({ reviewEffort: "low" }); // no effortForTurn
    const review = claudeOf(
      commandsForAction({ kind: "invoke-role", role: "navigator", story: "S1", buildMode: "review", ac: "AC1" }, c),
    );
    const green = claudeOf(commandsForAction({ kind: "invoke-role", role: "driver", story: "S1" }, c));
    expect(review?.effort).toBe("low");
    expect(green?.effort).toBeUndefined(); // authoring turns keep model default
  });
});

describe("commandsForAction: P8b loop granularity (hybrid-a layer-batched build)", () => {
  const cycleArgs = (cmds: ReturnType<typeof commandsForAction>): string[] =>
    (cmds.find((c) => (c as { bin?: string }).bin === "consort-cycle") as { args: string[] }).args;
  const navTask = (cmds: ReturnType<typeof commandsForAction>): string => (cmds[0] as { task: string }).task;

  it("default (story): the navigator begin command appends --loop story (whole-story RED)", () => {
    const cmds = commandsForAction({ kind: "invoke-role", role: "navigator", story: "S1" }, cfg());
    const args = cycleArgs(cmds);
    expect(args[0]).toBe("begin");
    expect(args).toContain("--loop");
    expect(args[args.indexOf("--loop") + 1]).toBe("story");
  });

  it("opt-in 'ac': the navigator begin command carries NO --loop flag (one RED per test)", () => {
    const cmds = commandsForAction({ kind: "invoke-role", role: "navigator", story: "S1" }, cfg({ loopGranularity: "ac" }));
    const args = cycleArgs(cmds);
    expect(args[0]).toBe("begin");
    expect(args).not.toContain("--loop");
  });

  it("hybrid-a: the navigator begin command appends --loop hybrid-a + --batch-cap", () => {
    const cmds = commandsForAction(
      { kind: "invoke-role", role: "navigator", story: "S1" },
      cfg({ loopGranularity: "hybrid-a", batchCap: 3 }),
    );
    const args = cycleArgs(cmds);
    expect(args[0]).toBe("begin");
    expect(args).toContain("--loop");
    expect(args[args.indexOf("--loop") + 1]).toBe("hybrid-a");
    expect(args).toContain("--batch-cap");
    expect(args[args.indexOf("--batch-cap") + 1]).toBe("3");
    // The RED prompt tells the Navigator to write the layer-batch, not one test.
    expect(navTask(cmds)).toMatch(/layer-batch/i);
  });

  it("hybrid-a does NOT add --loop to the REVIEW verb (review stays per-AC)", () => {
    const cmds = commandsForAction(
      { kind: "invoke-role", role: "navigator", story: "S1", buildMode: "review", ac: "AC1" },
      cfg({ loopGranularity: "hybrid-a", batchCap: 3 }),
    );
    const args = cycleArgs(cmds);
    expect(args[0]).toBe("review");
    expect(args).not.toContain("--loop");
  });

  it("hybrid-a: the driver GREEN prompt asks to green the whole batch in one pass", () => {
    const cmds = commandsForAction(
      { kind: "invoke-role", role: "driver", story: "S1" },
      cfg({ loopGranularity: "hybrid-a" }),
    );
    expect(navTask(cmds)).toMatch(/layer-batch|ALL GREEN/i);
  });

  // A contract/cleanup story (drop column / remove endpoint / rename) auto-drops
  // to the finest `ac` loop even under a story-default run, since its lockstep
  // DB+code change is too heavy for one story-level GREEN turn. The drop MUST
  // reach the prompt text AND the cycle CLI flag, not only deriveDriveState's
  // routing (the F6/S3-split-drop-old build re-escalated when the prompt still
  // said "make ALL of the story GREEN in one pass" while the substrate stamped ac).
  it("contract story under story-default: navigator begin carries NO --loop (drops to per-AC)", () => {
    const cmds = commandsForAction(
      { kind: "invoke-role", role: "navigator", story: "S3-split-drop-old" },
      cfg(),
    );
    const args = cycleArgs(cmds);
    expect(args[0]).toBe("begin");
    expect(args).not.toContain("--loop");
    // The RED prompt is per-test (singular), not the whole-story batch.
    expect(navTask(cmds)).toMatch(/the next failing test \(RED\)|EXACTLY ONE failing test/i);
  });

  it("contract story under story-default: driver GREEN prompt is per-test, not whole-story", () => {
    const cmds = commandsForAction(
      { kind: "invoke-role", role: "driver", story: "S3-split-drop-old" },
      cfg(),
    );
    expect(navTask(cmds)).toMatch(/Make the failing test for story/i);
    expect(navTask(cmds)).not.toMatch(/Make ALL of story/i);
  });

  it("additive story under story-default is unchanged (--loop story; whole-story GREEN)", () => {
    const nav = commandsForAction({ kind: "invoke-role", role: "navigator", story: "S1-record-stock" }, cfg());
    const args = cycleArgs(nav);
    expect(args[0]).toBe("begin");
    expect(args[args.indexOf("--loop") + 1]).toBe("story");
    const driver = commandsForAction({ kind: "invoke-role", role: "driver", story: "S1-record-stock" }, cfg());
    expect(navTask(driver)).toMatch(/Make ALL of story/i);
  });
});

describe("commandsForAction: state transitions -> kit CLIs", () => {
  it("dispatch / surface / approve-gate / complete route to consort-pipeline", () => {
    expect(commandsForAction({ kind: "dispatch", story: "S1" }, cfg())).toEqual([
      { kind: "cli", bin: "consort-pipeline", args: ["dispatch", "--feature", "F1", "--tdd-dir", "/p/.tdd"] },
    ]);
    expect(commandsForAction({ kind: "surface-gate", story: "S1" }, cfg())[0]).toMatchObject({
      bin: "consort-pipeline",
    });
    const approve = commandsForAction({ kind: "approve-gate", story: "S1" }, cfg())[0] as { args: string[] };
    expect(approve.args).toContain("approve-gate");
    expect(approve.args).toContain("--approver");
    expect(approve.args).toContain("human-proxy");
  });

  it("approve-promote-gate supplies a non-empty --promote-ref (else the gate skips + the driver stalls)", () => {
    // The promote-phase stall: the Human Proxy SKIPS the promote gate without a
    // promote_ref ("nothing to promote"), so the orchestrator MUST pass one or
    // the gate never approves and approve-promote-gate loops forever. The ref is
    // the feature's canonical branch (what gets merged into the parent tier).
    const cmd = commandsForAction({ kind: "approve-promote-gate" }, cfg({ featureBranch: "feature-f1" }))[0] as { args: string[] };
    expect(cmd.args).toContain("--gate");
    expect(cmd.args[cmd.args.indexOf("--gate") + 1]).toBe("promote");
    expect(cmd.args).toContain("--promote-ref");
    expect(cmd.args[cmd.args.indexOf("--promote-ref") + 1]).toBe("feature-f1");
  });

  it("approve-promote-gate falls back to the feature id when no featureBranch is set", () => {
    const cmd = commandsForAction({ kind: "approve-promote-gate" }, cfg())[0] as { args: string[] };
    const ref = cmd.args[cmd.args.indexOf("--promote-ref") + 1];
    expect(ref).toBe("F1");
    expect(ref.length).toBeGreaterThan(0);
  });

  it("cut-experiment routes to a COMPLETE consort-experiment cut command", () => {
    const cmds = commandsForAction({ kind: "cut-experiment", story: "S1" }, cfg({ featureBranch: "feature/x" }));
    const cmd = cmds[0] as { bin: string; args: string[] };
    expect(cmd.bin).toBe("consort-experiment");
    expect(cmd.args[0]).toBe("cut");
    // Every flag the experiment CLI requires for `cut` must be emitted (the bug
    // that broke the smoke was an incomplete command; the contract test in
    // orchestrator-experiment-contract.test.ts validates it through the CLI's
    // own validator, this asserts the flags are present at all).
    for (const flag of ["--feature", "--story", "--slug", "--branch", "--parent", "--instance"]) {
      expect(cmd.args, `cut missing ${flag}`).toContain(flag);
    }
    expect(cmd.args).toContain("inst-x");
    expect(cmd.args).toContain("feature/x");
  });

  it("cut-experiment emits only the cut (build replay is now per-turn, not a post-cut skip)", () => {
    // The monolithic replay-build step is gone: build replay happens turn by turn
    // in the runner (per Navigator/Driver turn), so cut-experiment just cuts.
    const cmds = commandsForAction({ kind: "cut-experiment", story: "S1" }, cfg({ featureBranch: "feature/x" }));
    expect(cmds[0]).toMatchObject({ kind: "cli", bin: "consort-experiment" });
    expect(cmds.some((c) => (c as { kind: string }).kind === "replay-build")).toBe(false);
  });

  it("ux-designer translates the design brief into the project style guide", () => {
    const cmds = commandsForAction({ kind: "invoke-role", role: "ux-designer" }, cfg());
    expect(cmds[0]).toMatchObject({ kind: "claude", role: "ux-designer" });
    const task = (cmds[0] as { task: string }).task;
    expect(task).toMatch(/design-brief\.md/);
    expect(task).toMatch(/design-guide\.md/);
    expect(task).toMatch(/design-guide\.json/);
    // Exhaustive brief coverage (the fix for intermittent 0.80 semantic scores): the
    // task forces enumerating + realizing EVERY brief element – status states, assets,
    // token levels, components – not a representative subset.
    expect(task).toMatch(/EXHAUSTIV/i);
    expect(task).toMatch(/every status\/state variant|each badge\/pill state/i);
    expect(task).toMatch(/favicon/i);
    expect(task).toMatch(/components/i);
  });

  it("navigator + driver get the design guide as a build input only when the UI track is on", () => {
    const task = (action: Parameters<typeof commandsForAction>[0], over = {}) =>
      (commandsForAction(action, cfg(over))[0] as { task: string }).task;
    // Off: no design-guide directive.
    expect(task({ kind: "invoke-role", role: "navigator", story: "S1" })).not.toMatch(/design guide/i);
    // On: both build roles are pointed at the design guide.
    expect(task({ kind: "invoke-role", role: "navigator", story: "S1" }, { uiTrack: true })).toMatch(/design guide/i);
    expect(task({ kind: "invoke-role", role: "driver", story: "S1" }, { uiTrack: true })).toMatch(/design guide/i);
  });

  it("accept is ONE command: pipeline accept, which performs the merge AND records acceptance (FEIP-8013)", () => {
    // Was two commands (experiment merge + pipeline accept), which double-recorded
    // acceptStory and let an interactive human run only the state half + strand the
    // code. `pipeline accept` now does the git-merge itself (resolving slug/branches
    // from the experiment record); the orchestrator supplies instance + project-dir.
    const cmds = commandsForAction({ kind: "accept", story: "S1" }, cfg({ instance: "inst-x" }));
    expect(cmds).toHaveLength(1);
    const c = cmds[0] as { bin: string; args: string[] };
    expect(c.bin).toBe("consort-pipeline");
    expect(c.args[0]).toBe("accept");
    expect(c.args).toContain("--story");
    expect(c.args).toContain("--approver");
    expect(c.args).toContain("--instance");
    expect(c.args).toContain("inst-x");
    expect(c.args).toContain("--project-dir");
    // No separate experiment-merge command any more.
    expect(cmds.some((x) => (x as { bin?: string }).bin === "consort-experiment")).toBe(false);
  });

  it("deploy is run by the orchestration (deterministic consort-deploy --gate), not the LLM", () => {
    const cmds = commandsForAction({ kind: "deploy" }, cfg({ featureBranch: "feature-f1" }));
    // teardown first (free the port), then the gated feature deploy.
    expect(cmds[0]).toMatchObject({ kind: "cli", bin: "consort-deploy" });
    expect((cmds[0] as { args: string[] }).args).toContain("--stop");
    expect(cmds[1]).toMatchObject({ kind: "cli", bin: "consort-deploy" });
    const g = (cmds[1] as { args: string[] }).args;
    expect(g).toContain("--gate"); // gate deploy: records evidence + escalates, never an LLM claim
    expect(g).toContain("--feature");
    expect(g).not.toContain("--story"); // feature-level deploy (no story)
    // Bind to the FEATURE branch so a failed verify can fork an ephemeral child to
    // classify shared-state contamination (the feature-ship self-heal), instead of
    // hard-raising to HIL on a flaky test.
    expect(g).toContain("--lakebase-branch");
    expect(g[g.indexOf("--lakebase-branch") + 1]).toBe("feature-f1");
    // No release-engineer LLM turn in the deploy path.
    expect(cmds.some((c) => "role" in c && (c as { role?: string }).role === "release-engineer")).toBe(false);
  });

  it("await-acceptance: runs the deterministic deploy gate as a CLI (not a spawned agent), then marks awaiting", () => {
    const cmds = commandsForAction({ kind: "await-acceptance", story: "S1" }, cfg());
    // teardown first (free the port).
    expect(cmds[0]).toMatchObject({ kind: "cli", bin: "consort-deploy" });
    expect((cmds[0] as { args: string[] }).args).toContain("--stop");
    // the deploy gate runs DETERMINISTICALLY as a synchronous CLI (the deploy is
    // the substrate, not a model's word; a live agent could background the long
    // ephemeral-isolated verify + stall await-acceptance). deploy-evidence is the
    // backstop. The logging layer still narrates the RE deploy handoff.
    const dep = cmds[1] as { kind: string; bin?: string; args?: string[] };
    expect(dep.kind).toBe("cli");
    expect(dep.bin).toBe("consort-deploy");
    expect(dep.args).toContain("--gate");
    expect(dep.args).toContain("--story");
    expect(dep.args).toContain("S1");
    expect(dep.args).toContain("--lakebase-branch");
    expect(dep.args).not.toContain("--stop");
    // then the pipeline marks awaiting-acceptance.
    expect(cmds[2]).toMatchObject({ kind: "cli", bin: "consort-pipeline" });
    expect((cmds[2] as { args: string[] }).args[0]).toBe("await-acceptance");
  });

  it("approve-deploy-gate is the PO gate via the Human Proxy", () => {
    const g = commandsForAction({ kind: "approve-deploy-gate" }, cfg())[0] as { bin: string; args: string[] };
    expect(g.bin).toBe("consort-human-proxy");
    expect(g.args).toContain("--gate");
    expect(g.args).toContain("deploy");
  });

  it("approve-plan-gate is the sprint plan gate via the Human Proxy (sprint-scoped)", () => {
    const g = commandsForAction({ kind: "approve-plan-gate" }, cfg({ sprintName: "sprint-1" }))[0] as { bin: string; args: string[] };
    expect(g.bin).toBe("consort-human-proxy");
    expect(g.args).toContain("--sprint");
    expect(g.args).toContain("sprint-1");
    expect(g.args).toContain("--gate");
    expect(g.args).toContain("plan");
  });
});

describe("commandsForAction: coarse phase transitions -> set-phase", () => {
  it("planning-complete -> discovery, feature-complete -> deploy, done -> shipped", () => {
    expect(commandsForAction({ kind: "planning-complete" }, cfg())).toEqual([{ kind: "set-phase", phase: "discovery" }]);
    // feature-complete runs the feature-design-complete conformance gate (a
    // deterministic feature-wide backstop) before advancing to the deploy phase.
    expect(commandsForAction({ kind: "feature-complete" }, cfg())).toEqual([
      { kind: "cli", bin: "consort-gate-conformance", args: ["--feature", "F1", "--tdd-dir", "/p/.tdd"] },
      { kind: "set-phase", phase: "deploy" },
    ]);
    expect(commandsForAction({ kind: "done" }, cfg())).toEqual([{ kind: "set-phase", phase: "shipped" }]);
  });
});

describe("buildDriveEffects", () => {
  let consortDir: string;
  beforeEach(() => {
    consortDir = mkdtempSync(join(tmpdir(), "drive-eff-"));
  });
  afterEach(() => {
    rmSync(consortDir, { recursive: true, force: true });
  });

  it("perform routes an action's commands through the runner", async () => {
    const { runner, calls } = recordingRunner();
    const eff = buildDriveEffects(cfg({ runner, consortDir }));
    await eff.perform({ kind: "accept", story: "S1" });
    // accept is now ONE command: pipeline accept (which performs the merge + records).
    expect(calls).toHaveLength(1);
    expect((calls[0] as { bin: string }).bin).toBe("consort-pipeline");
    expect((calls[0] as { args: string[] }).args[0]).toBe("accept");
  });

  it("readState rebuilds a DriveState from pipeline.json + workflow-state", async () => {
    const featureDir = join(consortDir, "features", "F1");
    mkdirSync(featureDir, { recursive: true });
    writeFileSync(join(consortDir, "workflow-state.json"), JSON.stringify({ phase: "implementation" }));
    writeFileSync(
      join(featureDir, "pipeline.json"),
      JSON.stringify({
        version: 1,
        feature_id: "F1",
        build_queue: [],
        build_active: "S1",
        stories: { S1: { status: "building", gate: { status: "approved", history: [] } } },
      }),
    );
    const eff = buildDriveEffects(cfg({ consortDir }));
    const state = await eff.readState();
    expect(state.phase).toBe("feature"); // implementation -> feature
    expect(state.buildActive).toBe("S1");
    expect(state.stories.S1.gateApproved).toBe(true);
  });

  it("planNextAction (the --dry-run core) reports the next action + its commands", async () => {
    // Planning, proposed (feature-spec exists) + estimated (Architect sized the
    // candidates) but the human has not committed the backlog (no requested.json / backlog) ->
    // next is the BACKLOG GATE (the human's feature selection), which precedes author-requests.
    const featureDir = join(consortDir, "features", "F1");
    mkdirSync(featureDir, { recursive: true });
    writeFileSync(join(consortDir, "workflow-state.json"), JSON.stringify({ phase: "planning" }));
    // Intake present + APPROVED (product-overview.md + nfrs.md + the intake-gate marker) so the drive
    // is past the PO intake turn AND its gate – the state under test is "proposed + estimated,
    // awaiting author-requests".
    writeFileSync(join(consortDir, "product-overview.md"), "# Overview\n\nA product.\n");
    writeFileSync(join(consortDir, "nfrs.md"), "# NFRs\n\n## Required\n- R1 fast\n");
    mkdirSync(join(consortDir, "intake"), { recursive: true });
    writeFileSync(join(consortDir, "intake", "approved"), "approved\n");
    writeFileSync(join(featureDir, "feature-spec.json"), JSON.stringify({ id: "F1", stories: [] }));
    mkdirSync(join(consortDir, "planning"), { recursive: true });
    writeFileSync(
      join(consortDir, "planning", "estimates.json"),
      JSON.stringify({ estimates: [{ feature_id: "F1", size: "M" }] }),
    );
    writeFileSync(
      join(featureDir, "pipeline.json"),
      JSON.stringify({ version: 1, feature_id: "F1", build_queue: [], build_active: null, stories: {} }),
    );

    const plan = await planNextAction(cfg({ consortDir }));
    expect(plan.action).toEqual({ kind: "approve-backlog-gate" });
    // The backlog gate: headless the Human Proxy commits the recorded selection (--gate backlog:
    // copies the seeds + writes requested.json), then sync-backlog projects the backlog.
    expect(plan.commands[0]).toMatchObject({ kind: "cli", bin: "consort-human-proxy" });
    expect((plan.commands[0] as { args: string[] }).args).toEqual(expect.arrayContaining(["--gate", "backlog"]));
  });

  it("planNextAction resolves an agent action's commands the SAME way perform does (J3: --dry-run/interactive preview == what the drive performs; survives J5)", async () => {
    // --dry-run + the interactive 'what's next' preview is a prompt constructor back to the human: it
    // must show what the drive WILL do. perform resolves an agent turn via
    // `commandsFromManifest(action,cfg) ?? commandsForAction(action,cfg)` (useManifestSteps default on).
    // planNextAction MUST use that SAME resolution – identical today (the breakdown manifest is
    // golden-equivalent), and – the point of J3 – still correct after J5 deletes commandsForAction's
    // agent arm (planNextAction then resolves via the manifest, not a deleted arm).
    const featureDir = join(consortDir, "features", "F1");
    mkdirSync(featureDir, { recursive: true });
    writeFileSync(join(consortDir, "workflow-state.json"), JSON.stringify({ phase: "design" }));
    // No breakdown yet => the design lane's first action is spec-author breakdown (executor-dispatched).
    writeFileSync(
      join(featureDir, "pipeline.json"),
      JSON.stringify({ version: 1, feature_id: "F1", build_queue: [], build_active: null, stories: {} }),
    );

    const c = cfg({ consortDir });
    const plan = await planNextAction(c);
    expect(plan.action).toEqual({ kind: "invoke-role", role: "spec-author", mode: "breakdown" });
    // The commands MUST equal perform's resolution for the same action + cfg (the executor-aligned view).
    const performView = commandsForActionResolved(plan.action, c);
    expect(plan.commands).toEqual(performView);
  });

  it("J4: the optimize sweep resolver (commandsForActionResolved) builds the pinned agent command IDENTICALLY to commandsForAction today", () => {
    // The optimize sweep runs a PINNED handoff's OWN role turn via commandsForActionResolved (the
    // drive's one resolver). With useManifestSteps on + a golden-equivalent manifest, that view is
    // byte-identical to the legacy commandsForAction – so the swept command is unchanged today, and
    // the sweep survives J5 (the resolver's fallback becomes deterministic-only, manifest wins for agents).
    const swept: WorkflowAction[] = [
      { kind: "invoke-role", role: "spec-author", mode: "breakdown" } as WorkflowAction,
      { kind: "invoke-role", role: "spec-author", story: "S1" } as unknown as WorkflowAction,
      { kind: "invoke-role", role: "architect-reviewer", story: "S1" } as unknown as WorkflowAction,
      { kind: "invoke-role", role: "dba", story: "S1" } as unknown as WorkflowAction,
      { kind: "invoke-role", role: "test-strategist", story: "S1" } as unknown as WorkflowAction,
    ];
    const c = cfg({ useManifestSteps: true });
    for (const action of swept) {
      expect(commandsForActionResolved(action, c), `resolved == legacy for ${JSON.stringify(action)}`).toEqual(
        commandsForAction(action, c),
      );
    }
  });
});

describe("hand-back delivery: onHandback writes, roleTask consumes (informed retry)", () => {
  let tdd: string;
  beforeEach(() => {
    tdd = mkdtempSync(join(tmpdir(), "hb-eff-"));
    mkdirSync(join(tdd, "features", "F1", "stories", "S2", "acs"), { recursive: true });
  });
  afterEach(() => rmSync(tdd, { recursive: true, force: true }));

  it("buildDriveEffects.onHandback writes the hand-back note where the role's prompt will read it", () => {
    const eff = buildDriveEffects(cfg({ consortDir: tdd, projectDir: tdd }));
    eff.onHandback!(
      { signature: "x", responder: "test-strategist", story: "S2", expected: "a per-story test list", satisfiedBy: () => false },
      "HANDBACK (attempt 1): your previous turn did not return a per-story test list for story S2.",
    );
    const file = handbackFile(tdd, "F1", "test-strategist", "S2");
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file, "utf8")).toMatch(/HANDBACK \(attempt 1\)/);
  });

  it("commandsForAction CONSUMES the hand-back: it prefixes the role task once, then deletes the note", () => {
    const eff = buildDriveEffects(cfg({ consortDir: tdd, projectDir: tdd }));
    eff.onHandback!(
      { signature: "x", responder: "test-strategist", story: "S2", expected: "a per-story test list", satisfiedBy: () => false },
      "HANDBACK: fix the empty test list for S2.",
    );
    const action = { kind: "invoke-role", role: "test-strategist", story: "S2" } as const;
    const cmds = commandsForAction(action, cfg({ consortDir: tdd, projectDir: tdd }));
    const task = (cmds[0] as { task: string }).task;
    expect(task).toMatch(/HANDBACK: fix the empty test list for S2\./);
    // Consume-once: the note is deleted so it is not re-injected on later turns.
    expect(existsSync(handbackFile(tdd, "F1", "test-strategist", "S2"))).toBe(false);
    const again = commandsForAction(action, cfg({ consortDir: tdd, projectDir: tdd }));
    expect((again[0] as { task: string }).task).not.toMatch(/HANDBACK/);
  });
});

describe("commandsForAction: build-lane perf (P2 review rubric / P5 session scope / P6 effort)", () => {
  const review = { kind: "invoke-role", role: "navigator", story: "S1", ac: "AC1-create", buildMode: "review" } as const;
  const red = { kind: "invoke-role", role: "navigator", story: "S1" } as const;
  const green = { kind: "invoke-role", role: "driver", story: "S1" } as const;
  const claudeCmd = (a: Parameters<typeof commandsForAction>[0], over = {}) =>
    commandsForAction(a, cfg(over))[0] as { task: string; resumeKey?: string; effort?: string };

  // ── P2: pre-digested REVIEW rubric ─────────────────────────────────────────
  it("inlines an AC-scoped rubric (layer + applicable NFRs) and tells the reviewer NOT to re-read the full files", () => {
    const tmp = mkdtempSync(join(tmpdir(), "effects-rubric-"));
    const tdd = join(tmp, ".tdd");
    mkdirSync(join(tdd, "features", "F1", "stories", "S1", "acs"), { recursive: true });
    writeFileSync(
      join(tdd, "features", "F1", "architecture.json"),
      JSON.stringify({
        nfrs: [
          { id: "NFR-R2-status-validation", brief: "status is always a recognized state", applies_to: "S1" },
          { id: "NFR-additive-migrations", brief: "migrations are additive", applies_to: "F1" },
          { id: "NFR-other-story", brief: "n/a here", applies_to: "S2" },
        ],
      }),
    );
    writeFileSync(
      join(tdd, "features", "F1", "stories", "S1", "acs", "AC1-create.json"),
      JSON.stringify({ id: "AC1-create", layer: "API" }),
    );
    const task = claudeCmd(review, { consortDir: tdd, loopGranularity: "ac" }).task;
    expect(task).toMatch(/RUBRIC \(pre-extracted/);
    expect(task).toContain("layer=API");
    expect(task).toContain("NFR-R2-status-validation"); // story-scoped NFR
    expect(task).toContain("NFR-additive-migrations"); // feature-wide NFR
    expect(task).not.toContain("NFR-other-story"); // a sibling story's NFR is excluded
    expect(task).toMatch(/do not re-read them by default/);
    rmSync(tmp, { recursive: true, force: true });
  });

  it("the review rubric degrades gracefully when architecture.json is absent", () => {
    // loop="ac": exercise the per-AC review path (story-level review is the default).
    // cfg's consortDir does not exist -> no layer, no NFRs -> bare review prompt, no RUBRIC clause.
    const task = claudeCmd(review, { loopGranularity: "ac" }).task;
    expect(task).toMatch(/REVIEW the implementation of AC AC1-create/);
    expect(task).not.toMatch(/RUBRIC \(pre-extracted/);
  });

  // ── #4 context compaction: the SAME rubric now feeds the RED + GREEN authoring
  //    turns, not just REVIEW, so the Navigator/Driver do not re-read the full
  //    design tree every turn. Story-scoped: layers are the UNION across the ACs.
  it("injects the pre-extracted rubric into RED (navigator) and GREEN (driver), story-scoped", () => {
    const tmp = mkdtempSync(join(tmpdir(), "effects-buildrubric-"));
    const tdd = join(tmp, ".tdd");
    mkdirSync(join(tdd, "features", "F1", "stories", "S1", "acs"), { recursive: true });
    // Two ACs across two layers -> the story rubric unions them.
    writeFileSync(
      join(tdd, "features", "F1", "stories", "S1", "story.json"),
      JSON.stringify({ id: "S1", acs: ["AC1-create", "AC2-list"] }),
    );
    writeFileSync(
      join(tdd, "features", "F1", "stories", "S1", "acs", "AC1-create.json"),
      JSON.stringify({ id: "AC1-create", layer: "API" }),
    );
    writeFileSync(
      join(tdd, "features", "F1", "stories", "S1", "acs", "AC2-list.json"),
      JSON.stringify({ id: "AC2-list", layer: "Infra" }),
    );
    writeFileSync(
      join(tdd, "features", "F1", "architecture.json"),
      JSON.stringify({ nfrs: [{ id: "NFR-tx", brief: "atomic writes", applies_to: "S1" }] }),
    );
    const redTask = claudeCmd(red, { consortDir: tdd }).task;
    const greenTask = claudeCmd(green, { consortDir: tdd }).task;
    for (const task of [redTask, greenTask]) {
      expect(task).toMatch(/RUBRIC \(pre-extracted/);
      expect(task).toContain("layers=API, Infra"); // story-scoped union
      expect(task).toContain("NFR-tx");
      expect(task).toMatch(/do not re-read them by default/);
    }
  });

  it("build-turn rubric degrades to the bare directive when no design artifacts exist", () => {
    // No consortDir on disk -> empty rubric -> unchanged GREEN directive, no RUBRIC clause.
    const greenTask = claudeCmd(green).task;
    expect(greenTask).toMatch(/Make ALL of story S1/);
    expect(greenTask).not.toMatch(/RUBRIC \(pre-extracted/);
    expect(greenTask).not.toMatch(/do not re-read them by default/);
  });

  // ── context pack: the module LAYOUT (conventions.json) + TEST locations, so a
  //    build turn places code + finds tests without discovery round-trips.
  it("injects the LAYOUT map into build turns, and the TESTS loop only where the loop runs", () => {
    const tmp = mkdtempSync(join(tmpdir(), "effects-pack-"));
    const tdd = join(tmp, ".tdd");
    mkdirSync(join(tdd, "architecture"), { recursive: true });
    writeFileSync(
      join(tdd, "architecture", "conventions.json"),
      JSON.stringify({
        established_by: "F1",
        established_at: "2026-01-01T00:00:00.000Z",
        service_backed: true,
        layers: [
          { role: "boundary", module: "app/routes" },
          { role: "service", module: "app/services" },
          { role: "repository", module: "app/repositories" },
        ],
      }),
    );
    const greenTask = claudeCmd(green, { consortDir: tdd }).task;
    const redTask = claudeCmd(red, { consortDir: tdd }).task;
    // LAYOUT map is injected into both RED and GREEN.
    for (const task of [greenTask, redTask]) {
      expect(task).toMatch(/LAYOUT \(place\/judge code/);
      expect(task).toContain("boundary=app/routes");
      expect(task).toContain("repository=app/repositories");
    }
    // The TEST-loop line rides only on turns that RUN the loop: GREEN yes, RED no.
    expect(greenTask).toMatch(/TESTS ::/);
    expect(greenTask).toMatch(/do NOT find\/grep\/ls/);
    expect(redTask).not.toMatch(/TESTS ::/);
    rmSync(tmp, { recursive: true, force: true });
  });

  // ── P5: build session scope ────────────────────────────────────────────────
  it("by default resumes Navigator/Driver PER STORY (story-scoped resumeKey), fresh at each new story", () => {
    expect(claudeCmd(red).resumeKey).toBe("navigator:S1");
    expect(claudeCmd(green).resumeKey).toBe("driver:S1");
    expect(claudeCmd(review).resumeKey).toBe("navigator:S1"); // review shares the story session
    // a different story is a different (fresh) session
    expect(claudeCmd({ kind: "invoke-role", role: "navigator", story: "S2" }).resumeKey).toBe("navigator:S2");
  });

  it("buildSessionScope=cycle cold-spawns every build turn (no resumeKey) – the overflow safety valve", () => {
    expect(claudeCmd(red, { buildSessionScope: "cycle" }).resumeKey).toBeUndefined();
    expect(claudeCmd(green, { buildSessionScope: "cycle" }).resumeKey).toBeUndefined();
  });

  it("non-build roles still resume across the whole feature (keyed by role)", () => {
    expect(claudeCmd({ kind: "invoke-role", role: "architect-reviewer", story: "S1" }).resumeKey).toBe("architect-reviewer");
  });

  // ── P6: fast review via --effort ───────────────────────────────────────────
  it("sets effort=low on the REVIEW turn only (the headless 'fast' knob)", () => {
    expect(claudeCmd(review).effort).toBe("low");
    expect(claudeCmd(red).effort).toBeUndefined(); // RED authors a test
    expect(claudeCmd(green).effort).toBeUndefined(); // GREEN authors code
  });

  it("reviewEffort is configurable; an empty reviewEffort drops the flag (model default)", () => {
    expect(claudeCmd(review, { reviewEffort: "medium" }).effort).toBe("medium");
    expect(claudeCmd(review, { reviewEffort: "" }).effort).toBeUndefined();
  });
});

describe("commandsForAction: promote phase (PR review + merge to parent)", () => {
  it("deploy-complete sets the coarse phase to promote", () => {
    expect(commandsForAction({ kind: "deploy-complete" }, cfg())).toEqual([{ kind: "set-phase", phase: "promote" }]);
  });

  it("prepare-pr / wait-ci / merge invoke the SCM-workflow CLIs against --project-dir", () => {
    // --force: at promote the tree is dirty with the PRODUCED .consort corpus the
    // build never commits (code-only commits; corpus is recorder-captured run-state).
    // Promote CI reads only code, so prepare-pr must push past the corpus dirty-tree.
    expect(commandsForAction({ kind: "prepare-pr" }, cfg())).toEqual([
      // The shipped-migration-immutability backstop runs first: a branch with
      // mutated shipped migrations never reaches the PR (fail-closed at promote).
      { kind: "cli", bin: "consort-migration-history-clean", args: ["--project-dir", "/p"] },
      { kind: "cli", bin: "lakebase-scm-prepare-pr", args: ["--project-dir", "/p", "--force"] },
    ]);
    expect(commandsForAction({ kind: "wait-ci" }, cfg())).toEqual([
      { kind: "cli", bin: "lakebase-scm-wait-ci", args: ["--project-dir", "/p"] },
    ]);
    // The merge waits for the downstream migrate so staging gets code + schema,
    // but a slow/absent migrate run is non-fatal (the merge already landed) so
    // the drive reaches `done` instead of hanging then failing.
    expect(commandsForAction({ kind: "merge" }, cfg())).toEqual([
      {
        kind: "cli",
        bin: "lakebase-scm-merge",
        args: [
          "--project-dir",
          "/p",
          "--wait-migrate",
          "--migrate-timeout-nonfatal",
          "--migrate-timeout-sec",
          "600",
        ],
      },
    ]);
  });

  it("approve-promote-gate approves the `promote` gate via the Human Proxy (with a promote-ref)", () => {
    const cmds = commandsForAction({ kind: "approve-promote-gate" }, cfg());
    expect(cmds).toHaveLength(1);
    expect(cmds[0]).toMatchObject({ kind: "cli", bin: "consort-human-proxy" });
    // The promote gate REQUIRES a non-empty promote_ref or the Human Proxy skips it
    // (and the driver stalls), so the orchestrator always supplies one (the feature
    // being promoted; falls back to the feature id when no featureBranch is set).
    expect((cmds[0] as { args: string[] }).args).toEqual(
      ["--feature", "F1", "--gate", "promote", "--approver", "human-proxy", "--tdd-dir", "/p/.tdd", "--promote-ref", "F1"],
    );
  });

  it("done switches to the parent tier AND deletes the merged feature branch as the last step", () => {
    // Feature wrap-up: end on the parent (staging), not the just-merged feature
    // branch, AND remove that branch so the process never leaves us on (or able to
    // fall back to) a branch that should have been deleted. Deterministic +
    // idempotent guarantee on top of scm-merge's conditional local cleanup (whose
    // plain `git checkout` aborts on the dirty per-run metadata, skipping its own
    // switch + branch delete).
    const cmds = commandsForAction(
      { kind: "done" },
      cfg({ parentBranch: "staging", featureBranch: "feature-f6" }),
    );
    // Force (-f): at `done` the feature is merged + its code committed; only the
    // per-run .tdd/.lakebase metadata is dirty, and a plain `git checkout` refuses
    // to overwrite those tracked-churny files. The switch must land on the parent
    // regardless (the fork-guard ignores the same metadata).
    expect(cmds[0]).toEqual({ kind: "cli", bin: "git", args: ["checkout", "-f", "staging"] });
    // The local feature-branch delete: non-fatal (|| true) so an already-gone
    // branch on a resume does not fail the terminal step; -D because a PR-merged
    // branch is not a literal ancestor of the parent tip.
    expect(cmds[1]).toEqual({
      kind: "cli",
      bin: "sh",
      args: ["-c", `git branch -D 'feature-f6' 2>/dev/null || true`],
    });
    expect(cmds[cmds.length - 1]).toMatchObject({ kind: "set-phase", phase: "shipped" });
  });

  it("done switches to the parent but does NOT emit a branch delete when the feature branch is unknown", () => {
    const cmds = commandsForAction({ kind: "done" }, cfg({ parentBranch: "staging" }));
    expect(cmds[0]).toEqual({ kind: "cli", bin: "git", args: ["checkout", "-f", "staging"] });
    // No sh branch-delete command when featureBranch is unset.
    expect(cmds.some((c) => c.kind === "cli" && c.bin === "sh")).toBe(false);
    expect(cmds[cmds.length - 1]).toMatchObject({ kind: "set-phase", phase: "shipped" });
  });

  it("done does NOT delete the feature branch when it equals the parent (never delete the tier we are on)", () => {
    const cmds = commandsForAction(
      { kind: "done" },
      cfg({ parentBranch: "staging", featureBranch: "staging" }),
    );
    expect(cmds.some((c) => c.kind === "cli" && c.bin === "sh")).toBe(false);
  });

  it("done emits ONLY the set-phase when the parent tier is unknown (no SCM state)", () => {
    const cmds = commandsForAction({ kind: "done" }, cfg({ parentBranch: undefined }));
    expect(cmds).toEqual([{ kind: "set-phase", phase: "shipped" }]);
  });
});

// A green-failure assess can produce a MIXED verdict, some prior tests flagged
// SUPERSEDED plus a genuine regression in the rest. The Driver's REPAIR turn must
// then refactor the flagged superseded tests AND apply the regression fix in one
// turn; otherwise the un-refactored superseded tests keep erroring (and, on a
// shared session, cascade the others into failure) and the honest-GREEN verify
// never holds, so it escalates. (Caught live on F6/S3-split-drop-old: T3-T5
// superseded by the dropped inventory_code column poisoned the module session, so
// T6-T8 bounced with InFailedSqlTransaction; the repair fixed only T6-T8.)
describe("commandsForAction: repair turn carries the superseded-tests allowlist (mixed verdict)", () => {
  let tdd: string;
  const F = "F1";
  const S = "S1";
  const wj = (file: string, obj: unknown): void => writeFileSync(file, JSON.stringify(obj, null, 2) + "\n");
  beforeEach(() => {
    tdd = mkdtempSync(join(tmpdir(), "effects-repair-"));
    const acsDir = join(tdd, "features", F, "stories", S, "acs");
    mkdirSync(acsDir, { recursive: true });
    wj(join(acsDir, "AC1.json"), { id: "AC1", layer: "API", text: "the API returns" });
    const items = [{ id: "T1", description: "first", ac_id: "AC1", status: "pending" }];
    wj(join(tdd, "features", F, "stories", S, "test-list-per-story.json"), { feature_id: F, story_id: S, items });
    wj(join(tdd, "features", F, "test-list.json"), { feature_id: F, items });
    beginNextPendingCycle({ consortDir: tdd, featureId: F, story: S }); // RED cycle for AC1 (openRed)
  });
  afterEach(() => rmSync(tdd, { recursive: true, force: true }));

  const task = (ac: string): string =>
    (commandsForAction(
      { kind: "invoke-role", role: "driver", buildMode: "repair", story: S, ac },
      cfg({ consortDir: tdd, featureId: F }),
    )[0] as { task: string }).task;

  it("mixed verdict: the repair task carries BOTH the regression fix AND the supersede allowlist", () => {
    writeGreenFailure(tdd, F, S, "AC1", {
      assessed: true,
      summary: "T6-T8 InFailedSqlTransaction",
      diagnosis: "module-scoped session poisoned by a prior erroring scenario",
      fixDirective: "add a rollback guard to the module session between scenarios",
    });
    writeSupersededTests(tdd, F, S, "AC1", {
      tests: ["tests/step_defs/test_s1_split_add_backfill.py"],
      reason: "inventory_code lookup removed by S3",
    });
    const t = task("AC1");
    expect(t).toMatch(/REPAIR a driver-fixable regression/);
    expect(t).toMatch(/rollback guard to the module session/);
    // The actual supersede directive body (not just the repair turn's mention of it).
    expect(t).toMatch(/supersedes behavior encoded in PRIOR tests/);
    expect(t).toMatch(/inventory_code lookup removed by S3/);
  });

  it("pure regression (no supersede flag): the repair task is the regression directive alone", () => {
    writeGreenFailure(tdd, F, S, "AC1", {
      assessed: true,
      summary: "off-by-one",
      diagnosis: "boundary",
      fixDirective: "fix the boundary check",
    });
    const t = task("AC1");
    expect(t).toMatch(/REPAIR a driver-fixable regression/);
    // No allowlist => no supersede directive body (the repair turn's EXCEPTION
    // clause mentions the phrase, but the actual flagged-tests block is absent).
    expect(t).not.toMatch(/supersedes behavior encoded in PRIOR tests/);
  });
});

// The assess turn's supersession scan must be COMPREHENSIVE: a contract change
// (drop/rename a column) supersedes not only behavior tests that NAME the column
// but ALSO fitness/migration tests asserting a property of it (reversibility,
// schema-shape). Caught live on F6/S3: the navigator flagged 9 column-naming
// behavior tests but missed T11 (test_s1_split_fitness reversibility), so the
// honest verify stayed red on the one unflagged test and escalated.
describe("commandsForAction: assess directive scans fitness/migration tests for supersession", () => {
  it("names fitness/architecture/migration + reversibility, and demands the COMPLETE failing set", () => {
    const cmds = commandsForAction(
      { kind: "invoke-role", role: "navigator", story: "S3-split-drop-old", buildMode: "assess", ac: "AC1-column-dropped" },
      cfg(),
    );
    const t = (cmds[0] as { task: string }).task;
    expect(t).toMatch(/ASSESS a failed honest-GREEN verify/);
    expect(t).toMatch(/FITNESS \/ architecture \/ migration tests/);
    expect(t).toMatch(/reversibility/);
    expect(t).toMatch(/EVERY failing test|COMPLETE set/);
  });

  it("hands the navigator the superseded-tests.json fallback (no spelunking when flag-superseded won't run)", () => {
    // Root cause of the assess-turn rabbit-hole (live: ctx-test-elow r2's navigator ran flag-superseded,
    // it failed, so it grepped ~/.cache / scripts/lk to reverse-engineer the artifact + hand-wrote the
    // WRONG filename `superseded.json`). The superseded branch must mirror the regression branch's explicit
    // fallback: name the canonical file (superseded-tests.json) + "write it directly, do NOT search".
    const t = (commandsForAction(
      { kind: "invoke-role", role: "navigator", story: "S3-split-drop-old", buildMode: "assess", ac: "AC1-column-dropped" },
      cfg(),
    )[0] as { task: string }).task;
    expect(t).toMatch(/superseded-tests\.json/); // the canonical artifact is named
    expect(t).toMatch(/FALL BACK to writing THAT EXACT file/); // explicit fallback, like the regression branch
    expect(t).toMatch(/do NOT search the cache \/ scripts \/ logs|invent a different filename/i); // anti-spelunk
  });

  it("when a pre-localized superseded advisory is present, tells the agent to TRUST it and flag in one call (no re-verify spin)", () => {
    // Root cause of the F6/S3 55-min spin: the deterministic gate pre-localized the
    // superseded set (56 lines / 8 files), but the prompt still said "scan
    // COMPREHENSIVELY", so the agent re-read every candidate to verify instead of
    // flagging. When the advisory is present it is authoritative (a deterministic
    // grep of the migration's dropped symbol) – flag exactly it in ONE call.
    const tmp = mkdtempSync(join(tmpdir(), "effects-assess-adv-"));
    const tdd = join(tmp, ".tdd");
    mkdirSync(join(tdd, "features", "F1", "stories", "S3", "acs"), { recursive: true });
    writeGreenFailure(tdd, "F1", "S3", "AC1", {
      assessed: false,
      summary: "T11 reversibility fails after inventory_code drop",
      supersededTestRefs:
        "SUPERSEDED-TEST CANDIDATES (pre-localized; you do NOT need to search): the migration DROPPED inventory_code, and these PRIOR test lines still assert it:\n  tests/test_S1_split_fitness.py:42  [inventory_code]  ...",
    });
    const t = (commandsForAction(
      { kind: "invoke-role", role: "navigator", story: "S3", buildMode: "assess", ac: "AC1" },
      cfg({ consortDir: tdd, featureId: "F1" }),
    )[0] as { task: string }).task;
    // The advisory is injected.
    expect(t).toMatch(/SUPERSEDED-TEST CANDIDATES/);
    // The PROMPT BODY (not just the advisory's own words) must add a decisive
    // directive to trust the pre-localized set and NOT re-read every candidate.
    expect(t).toMatch(/deterministic|pre-localized/i);
    expect(t).toMatch(/do NOT re-read (each|every|them)|without re-reading|flag (exactly )?(the|those) (listed|pre-localized)/i);
    // AND the contradictory "Scan COMPREHENSIVELY" open-ended directive must be
    // SUPPRESSED when the set is already localized (it caused the re-verify spin).
    expect(t).not.toMatch(/Scan COMPREHENSIVELY/);
    rmSync(tmp, { recursive: true, force: true });
  });

  it("injects the verify's failureOutput as the ASSESS pre-localizer (start-here failure lines)", () => {
    // The general pre-localization for failures the deterministic column-drop gates cannot
    // localize (a missing client component): the verify's OWN captured output is in the marker,
    // and the assess prompt injects it as the START-HERE failure so the navigator does not re-scan.
    const tmp = mkdtempSync(join(tmpdir(), "effects-assess-failout-"));
    const tdd = join(tmp, ".tdd");
    mkdirSync(join(tdd, "features", "F1", "stories", "S3", "acs"), { recursive: true });
    writeGreenFailure(tdd, "F1", "S3", "AC1", {
      assessed: false,
      summary: "GREEN verify FAILED on the client pass",
      failureOutput: "FAIL client/tests/pages/StockView.test.tsx\n  Error: Cannot find module '../../src/pages/StockViewPage'",
    });
    const t = (commandsForAction(
      { kind: "invoke-role", role: "navigator", story: "S3", buildMode: "assess", ac: "AC1" },
      cfg({ consortDir: tdd, featureId: "F1" }),
    )[0] as { task: string }).task;
    expect(t).toMatch(/Cannot find module '\.\.\/\.\.\/src\/pages\/StockViewPage'/);
    expect(t).toMatch(/VERIFY.S OWN FAILURE OUTPUT|start HERE/i);
    expect(t).toMatch(/do NOT re-run|do NOT re-scan|do not re-scan/i);
    rmSync(tmp, { recursive: true, force: true });
  });

  it("WITHOUT an advisory, keeps the comprehensive-scan directive (agent must search itself)", () => {
    // No pre-localization (not a contract/drop story, or gate found nothing): the
    // agent still needs the COMPREHENSIVE scan guidance.
    const t = (commandsForAction(
      { kind: "invoke-role", role: "navigator", story: "S9-plain", buildMode: "assess", ac: "AC1" },
      cfg(),
    )[0] as { task: string }).task;
    expect(t).toMatch(/Scan COMPREHENSIVELY/);
  });

  it("the assess directive invokes consort-cycle via ./scripts/lk (bare `consort-cycle` is NOT on the scaffolded PATH)", () => {
    // Regression guard: the navigator RUNS these verdict commands itself from the
    // project dir, where `consort-cycle` is reachable ONLY as `./scripts/lk consort-cycle`.
    // A bare `consort-cycle assess-regression`/`flag-superseded` in the directive is
    // `command not found`, so the navigator cannot record its fixDirective/superseded
    // verdict -> the driver-fixable regression WRONGLY escalates to HIL and the sprint
    // halts. Both flag-superseded (path a) and assess-regression (path b) must be
    // lk-prefixed. Two live captures halted on exactly this before the fix.
    const t = (commandsForAction(
      { kind: "invoke-role", role: "navigator", story: "S9-plain", buildMode: "assess", ac: "AC1" },
      cfg(),
    )[0] as { task: string }).task;
    expect(t).toMatch(/\.\/scripts\/lk consort-cycle flag-superseded/);
    expect(t).toMatch(/\.\/scripts\/lk consort-cycle assess-regression/);
    // ...and never the bare form the agent cannot resolve.
    expect(t).not.toMatch(/(^|[^k] )consort-cycle assess-regression/m);
    expect(t).not.toMatch(/(^|[^k] )consort-cycle flag-superseded/m);
  });
});

describe("commandsForAction: pre-build reflection gate (navigator reflect)", () => {
  const reflect = { kind: "invoke-role", role: "navigator", story: "S1", buildMode: "reflect" } as const;

  it("the reflect turn is a claude turn that critiques spec + test-list and writes the verdict", () => {
    const cmds = commandsForAction(reflect, cfg());
    const claude = cmds.find((c) => (c as { kind: string }).kind === "claude") as { task: string; role: string };
    expect(claude.role).toBe("navigator");
    expect(claude.task).toMatch(/REFLECT on story S1 BEFORE the build lane/);
    expect(claude.task).toContain("test-list-per-story.json");
    expect(claude.task).toContain("reflect-verdict.json");
    // It critiques design consistency, not implementation.
    expect(claude.task).toMatch(/contradict|no covering test|untestable|layer/i);
    // EXHAUSTIVENESS: one pass must surface EVERY defect (findings[] is multi-valued), including each
    // sub-guarantee of a multi-part NFR — a piecemeal one-finding-per-lap reflect burned the bounded
    // revise budget and escalated with a still-defective design.
    expect(claude.task).toMatch(/EXHAUSTIVE/);
    expect(claude.task).toMatch(/multi-part NFR fitness_function|sub-guarantee/);
  });

  it("emits the DETERMINISTIC reflect-gate CLI step after the reflect turn (not a build begin/review)", () => {
    const cmds = commandsForAction(reflect, cfg());
    const cli = cmds.find((c) => (c as { bin?: string }).bin === "consort-cycle") as { args: string[] };
    expect(cli).toBeDefined();
    expect(cli.args).toEqual(["reflect-gate", "--feature", "F1", "--story", "S1", "--tdd-dir", expect.any(String)]);
    // It must NOT run the build-cycle `begin`/`review` verbs (that would start RED).
    expect(cli.args).not.toContain("begin");
    expect(cli.args).not.toContain("review");
  });
});

// Regression guard: role task prompts must name artifact paths under the RESOLVED
// artifact root (the basename of the configured consortDir), never a hardcoded
// ".tdd/". On a fresh project (whose root is ".sftdd") a prompt telling the agent
// to read/write ".tdd/..." points at a directory the driver does not resolve, so
// the design lane stalls (the agent writes reflect-verdict.json / test-list.json
// where the deterministic probe never looks). This asserts the prompt path prefix
// tracks the config, closing the ".tdd/.sftdd" mismatch.
describe("role tasks name paths under the resolved artifact root (not a hardcoded .tdd/)", () => {
  const consortCfg = (over: Partial<DriveEffectsConfig> = {}) => cfg({ consortDir: "/p/.sftdd", ...over });
  function taskFor(action: Parameters<typeof commandsForAction>[0]): string {
    const cmds = commandsForAction(action, consortCfg());
    return (cmds.find((c) => (c as { kind: string }).kind === "claude") as { task: string }).task;
  }

  it("ux-designer reads the design brief under .sftdd, not .tdd", () => {
    const task = taskFor({ kind: "invoke-role", role: "ux-designer" });
    expect(task).toContain(".sftdd/design/design-brief.md");
    expect(task).not.toContain(".tdd/");
  });

  it("navigator reflect writes the verdict + reads the spec slice under .sftdd, not .tdd", () => {
    const task = taskFor({ kind: "invoke-role", role: "navigator", story: "S1", buildMode: "reflect" });
    expect(task).toContain(".sftdd/features/F1/stories/S1/reflect-verdict.json");
    expect(task).toContain(".sftdd/features/F1/stories/S1/test-list-per-story.json");
    expect(task).not.toContain(".tdd/");
  });

  it("test-strategist appends to the feature master test list under .sftdd, not .tdd", () => {
    const task = taskFor({ kind: "invoke-role", role: "test-strategist", story: "S1" });
    expect(task).toContain(".sftdd/features/F1/test-list.json");
    expect(task).not.toContain(".tdd/");
  });

  it("driver story refactor names review.json + architecture under .sftdd, not .tdd", () => {
    const task = taskFor({ kind: "invoke-role", role: "driver", story: "S1", buildMode: "refactor" });
    expect(task).toContain(".sftdd/cycles/F1/S1/review.json");
    expect(task).not.toContain(".tdd/");
  });

  it("a legacy .tdd root is honored verbatim (dual-read projects keep working)", () => {
    const cmds = commandsForAction({ kind: "invoke-role", role: "ux-designer" }, cfg({ consortDir: "/p/.tdd" }));
    const task = (cmds.find((c) => (c as { kind: string }).kind === "claude") as { task: string }).task;
    expect(task).toContain(".tdd/design/design-brief.md");
    expect(task).not.toContain(".sftdd/");
  });
});

// FEIP-8006: after a design/planning role's turn, the orchestrator emits a
// verify-artifact command asserting the role's expected output actually landed
// UNDER the project's consortDir. A subagent that resolved the project root wrong
// wrote it elsewhere (the Test Strategist wrote test-list.json to ~/dev/lakebase-demo,
// then a downstream consumer crashed with a cryptic, misattributed error). The
// guard fires BEFORE any consuming effect so the failure is loud + attributed to
// the producing role. anyOf paths are ABSOLUTE (Write needs absolute paths).
describe("commandsForAction: FEIP-8006 out-of-root artifact guard (verify-artifact)", () => {
  const verify = (cmds: ReturnType<typeof commandsForAction>) =>
    cmds.find((c) => (c as { kind: string }).kind === "verify-artifact") as
      | { kind: "verify-artifact"; role: string; anyOf: string[]; label: string }
      | undefined;

  it("test-strategist: emits a verify-artifact for the feature test-list under the ABSOLUTE consortDir", () => {
    // The exact role/artifact of the reported bug (agent wrote test-list.json out of root).
    const v = verify(commandsForAction({ kind: "invoke-role", role: "test-strategist", story: "S1" }, cfg()));
    expect(v).toBeTruthy();
    expect(v!.role).toBe("test-strategist");
    expect(v!.label).toContain("test-list.json");
    // ABSOLUTE, rooted at the configured consortDir (not a bare basename).
    expect(v!.anyOf.every((p) => p.startsWith("/p/.tdd/"))).toBe(true);
    expect(v!.anyOf.some((p) => p.includes("F1"))).toBe(true);
  });

  it("each design/planning role gets a verify-artifact naming its expected output", () => {
    const cases: Array<[Parameters<typeof commandsForAction>[0], string]> = [
      [{ kind: "invoke-role", role: "spec-author", mode: "propose" }, "feature-proposals.md"],
      [{ kind: "invoke-role", role: "architect-reviewer", mode: "estimate" }, "estimates.json"],
      [{ kind: "invoke-role", role: "architect-reviewer", mode: "estimate-committed" }, "estimates.json"],
      [{ kind: "invoke-role", role: "spec-author", mode: "breakdown" }, "feature-spec.json"],
      [{ kind: "invoke-role", role: "ux-designer" }, "design-guide.json"],
      [{ kind: "invoke-role", role: "spec-author", story: "S1" }, "acs"],
      [{ kind: "invoke-role", role: "architect-reviewer", story: "S1" }, "architecture.json"],
      [{ kind: "invoke-role", role: "test-strategist", story: "S1" }, "test-list.json"],
    ];
    for (const [action, label] of cases) {
      const v = verify(commandsForAction(action, cfg()));
      expect(v, `no verify-artifact for ${JSON.stringify(action)}`).toBeTruthy();
      expect(v!.label).toContain(label);
      expect(v!.anyOf.length).toBeGreaterThan(0);
      expect(v!.anyOf.every((p) => p.startsWith("/p/.tdd/"))).toBe(true);
    }
  });

  it("the guard runs BEFORE the consuming effect (breakdown: verify-artifact precedes sync-breakdown)", () => {
    // sync-breakdown reads feature-spec.json; if it ran first on an absent file the
    // crash would misattribute to the pipeline, not the Spec Author. Order matters.
    const cmds = commandsForAction({ kind: "invoke-role", role: "spec-author", mode: "breakdown" }, cfg());
    const iVerify = cmds.findIndex((c) => (c as { kind: string }).kind === "verify-artifact");
    // Two pipeline commands now bracket the turn (FEIP-8024): reset-breakdown
    // BEFORE, sync-breakdown AFTER. The guard must precede sync-breakdown.
    const iSync = cmds.findIndex((c) => (c as { args?: string[] }).args?.[0] === "sync-breakdown");
    const iReset = cmds.findIndex((c) => (c as { args?: string[] }).args?.[0] === "reset-breakdown");
    expect(iVerify).toBeGreaterThanOrEqual(0);
    expect(iSync).toBeGreaterThan(iVerify);
    expect(iReset).toBeLessThan(iVerify); // reset runs before the turn + guard
  });

  it("build turns (navigator/driver) emit NO verify-artifact (the cycle ledger covers them)", () => {
    for (const role of ["navigator", "driver"] as const) {
      expect(verify(commandsForAction({ kind: "invoke-role", role, story: "S1" }, cfg()))).toBeUndefined();
    }
  });

  it("author-requests (human input, no LLM artifact) emits NO verify-artifact", () => {
    expect(
      verify(commandsForAction({ kind: "invoke-role", role: "product-owner", mode: "author-requests" }, cfg())),
    ).toBeUndefined();
  });
});
