// Stage 2 (#578) 2b golden: dispatching spec-author breakdown THROUGH the StepExecutor
// (buildDriveEffects.performViaExecutor) drives the SAME deterministic CLIs, in the SAME order,
// as the legacy perform() path – the byte-identical contract that lets the executor own the live
// turn. The ONE declared delta (kept intentionally, per the plan) is execute()'s validate-outputs
// gate, which runs the manifest validators at the turn; the CLI sequence around the agent is
// identical: reset-breakdown (pre) -> agent -> reconcile (materialize) -> sync-breakdown (post).
//
// Hermetic: a fake runner records every DriveCommand. The agent's `claude` command is dispatched
// by LiveDriveStepAgent through that same runner, so both paths funnel through one command stream
// we can compare. No live spawn – the fake runner just records + returns.

import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildDriveEffects, type DriveCommand, type DriveEffectsConfig } from "../../consort/orchestrator/drive/orchestrator-effects";
import { executorDispatched, outputPathsForAction } from "../../consort/orchestrator/drive/executor-dispatch";
import type { WorkflowAction, DriveState } from "../../consort/orchestrator/drive/orchestrator-drive";
import type { ValidateBoundDeps } from "../../consort/orchestrator/steps/step-contract";

const BREAKDOWN: WorkflowAction = { kind: "invoke-role", role: "spec-author", mode: "breakdown" };
const FEATURE = "F1-stock-visibility";
const RED_STORY = "S1-create-sku";
const RED: WorkflowAction = { kind: "invoke-role", role: "navigator", story: RED_STORY };

/** Seed the breakdown manifest's declared inputs into the real .consort – the uncontained agent
 *  reads them there, and the executor's phase-1 gate checks their presence. product-overview + nfrs
 *  are PROJECT-level (.consort root); feature-request is FEATURE-scoped at
 *  features/<F>/feature-request.md (featureRequestMd / the corrected breakdown manifest source
 *  feature:features/{feature}/feature-request.md). Absent them, resolveInputs returns {missing}. */
function seedBreakdownInputs(consortDir: string): void {
  for (const f of ["product-overview.md", "nfrs.md"]) {
    writeFileSync(join(consortDir, f), `# ${f}\nseed\n`);
  }
  const frDir = join(consortDir, "features", FEATURE);
  mkdirSync(frDir, { recursive: true });
  writeFileSync(join(frDir, "feature-request.md"), `# feature-request.md\nseed\n`);
}

/** A recording runner: captures each command as a compact label, and (crucially) SIMULATES the
 *  agent turn by writing the artifacts the executor's phase-5 validate + phase-4.5 reconcile need,
 *  so the executor path reaches a clean produce without a live spawn. */
function recordingRunner(consortDir: string) {
  const labels: string[] = [];
  return {
    labels,
    runner: {
      async run(cmd: DriveCommand) {
        if (cmd.kind === "claude") {
          labels.push(`claude:${cmd.role}`);
          // Simulate the live spec-author writing its artifact channel outputs.
          const specDir = join(consortDir, "features", FEATURE);
          mkdirSync(specDir, { recursive: true });
          writeFileSync(join(specDir, "feature-spec.json"), JSON.stringify({ id: FEATURE, name: "Stock visibility", status: "draft", tdd_mode: "N=1", stories: ["S1-a"] }) + "\n");
          return;
        }
        if (cmd.kind === "cli") {
          const verb = cmd.args[0];
          labels.push(`cli:${cmd.bin.replace("consort-", "")}:${verb}`);
          // The reconcile CLI materializes the agent-log – simulate that so validate-outputs passes.
          if (cmd.bin.endsWith("-log") && verb === "--reconcile") {
            writeFileSync(join(consortDir, "agent-log.jsonl"),
              JSON.stringify({ timestamp: "2026-08-05T00:00:00Z", level: "info", role: "spec-author", event: "artifact.written", message: "wrote feature-spec.json" }) + "\n");
          }
          return;
        }
        labels.push(cmd.kind);
      },
    },
  };
}

function cfg(consortDir: string, projectDir: string, over: Partial<DriveEffectsConfig> = {}): DriveEffectsConfig {
  return {
    projectDir,
    consortDir,
    featureId: FEATURE,
    runner: { async run() {} },
    modelForRole: () => "opus",
    approver: "human-proxy",
    deployTarget: "local",
    ...over,
  } as DriveEffectsConfig;
}

const routerDeps: ValidateBoundDeps = {
  allowed: () => ({ kind: "design-complete" }) as WorkflowAction,
  reviseBudgetAvailable: () => true,
  recordRetry: () => ({ sanctioned: true }),
};
const state = { phase: "feature" } as unknown as DriveState;

describe("performViaExecutor (Stage 2 2b): spec-author breakdown through the StepExecutor", () => {
  it("runs the SAME CLI sequence as the legacy path: reset-breakdown, claude, reconcile, sync-breakdown", async () => {
    const projectDir = mkdtempSync(join(tmpdir(), "pve-"));
    const consortDir = join(projectDir, ".consort");
    mkdirSync(consortDir, { recursive: true });
    seedBreakdownInputs(consortDir);
    try {
      const rec = recordingRunner(consortDir);
      const effects = buildDriveEffects(cfg(consortDir, projectDir, { useManifestSteps: true, runner: rec.runner }));
      const bounded = await effects.performViaExecutor!(BREAKDOWN, state, routerDeps);

      // The executor produced a bounded route (not undefined => it WAS executor-dispatched).
      expect(bounded).toBeDefined();
      // The command stream funneled through the runner, in the Template-Method phase order:
      // pre-turn (reset-breakdown), agent, materialize (reconcile log), post-turn (sync-breakdown).
      expect(rec.labels).toEqual([
        "cli:pipeline:reset-breakdown",
        "claude:spec-author",
        "cli:log:--reconcile",
        "cli:pipeline:sync-breakdown",
      ]);
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("returns undefined (falls through to perform) when useManifestSteps is OFF", async () => {
    const projectDir = mkdtempSync(join(tmpdir(), "pve-"));
    try {
      const effects = buildDriveEffects(cfg(join(projectDir, ".consort"), projectDir)); // flag off
      expect(await effects.performViaExecutor!(BREAKDOWN, state, routerDeps)).toBeUndefined();
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("returns undefined for an action NOT on the executor allowlist (a still-legacy invoke-role turn)", async () => {
    const projectDir = mkdtempSync(join(tmpdir(), "pve-"));
    try {
      const effects = buildDriveEffects(cfg(join(projectDir, ".consort"), projectDir, { useManifestSteps: true }));
      // estimate-committed is a design turn that stays on the LEGACY path – it re-syncs the sprint
      // backlog via a dedicated commandsForAction branch with no shipped manifest, so it is
      // deliberately EXCLUDED from executorDispatched (unlike plain `estimate`, which IS dispatched).
      const notMigrated: WorkflowAction = { kind: "invoke-role", role: "architect-reviewer", mode: "estimate-committed" } as WorkflowAction;
      expect(await effects.performViaExecutor!(notMigrated, state, routerDeps)).toBeUndefined();
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("BLOCKS (no post-turn sync-breakdown) when the agent's artifact fails validation", async () => {
    const projectDir = mkdtempSync(join(tmpdir(), "pve-"));
    const consortDir = join(projectDir, ".consort");
    mkdirSync(consortDir, { recursive: true });
    seedBreakdownInputs(consortDir);
    try {
      // A runner whose "agent" writes a NON-conformant feature-spec (empty stories) => validate fails.
      const labels: string[] = [];
      const runner = {
        async run(cmd: DriveCommand) {
          if (cmd.kind === "claude") {
            labels.push("claude");
            const d = join(consortDir, "features", FEATURE); mkdirSync(d, { recursive: true });
            writeFileSync(join(d, "feature-spec.json"), JSON.stringify({ id: FEATURE, name: "X", status: "draft", tdd_mode: "N=1", stories: [] }) + "\n");
            return;
          }
          if (cmd.kind === "cli") { labels.push(`cli:${cmd.args[0]}`); if (cmd.bin.endsWith("-log")) writeFileSync(join(consortDir, "agent-log.jsonl"), "{}\n"); }
        },
      };
      const effects = buildDriveEffects(cfg(consortDir, projectDir, { useManifestSteps: true, runner }));
      const bounded = await effects.performViaExecutor!(BREAKDOWN, state, routerDeps);
      expect(bounded).toBeDefined();
      // sync-breakdown (the `after` CLI) must NOT have run – validation blocked the turn.
      expect(labels).not.toContain("cli:sync-breakdown");
      // reset-breakdown (pre) + reconcile still ran (they precede the gate).
      expect(labels).toContain("cli:reset-breakdown");
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });
});

// ─── navigator RED (a BUILD turn, LEAN – no cloud) through the StepExecutor ───────────────────────
// Same performViaExecutor seam, widened to a build turn. The 3 divergences from breakdown:
//   1. inputs are STORY-scoped (test-list-per-story.json + the story's acs/ DIR), not feature-flat.
//   2. the output is the PRODUCT channel – a real tests/ tree at the PROJECT ROOT (not .consort).
//   3. the post-turn CLI is the `@build-cycle` marker (the RED cycle stamp), NOT sync-breakdown – so
//      the expander must RESOLVE the marker (via buildCycleCommand), not filter it. Absent that, no
//      RED is stamped, testsWritten never flips, and the loop re-proposes RED and stalls.

/** Seed navigator RED's story-scoped inputs on the live tree: the per-story test-list + the acs/
 *  dir (a DIRECTORY input – presence-checked, not injected). The executor's phase-1 gate needs both. */
function seedRedInputs(consortDir: string): void {
  const storyDir = join(consortDir, "features", FEATURE, "stories", RED_STORY);
  mkdirSync(join(storyDir, "acs"), { recursive: true });
  writeFileSync(
    join(storyDir, "test-list-per-story.json"),
    JSON.stringify({ feature_id: FEATURE, story_id: RED_STORY, items: [{ id: "T1", kind: "behavior", description: "create a SKU" }] }) + "\n",
  );
  writeFileSync(
    join(storyDir, "acs", "AC1-create-sku.json"),
    JSON.stringify({ id: "AC1-create-sku", story_id: RED_STORY, statement: "A SKU can be created", layer: "persistence" }) + "\n",
  );
}

/** A recording runner for RED: labels each command, and SIMULATES the navigator writing its PRODUCT
 *  output (a tests/ tree at the PROJECT ROOT) + the reconcile materializing the meta agent-log. */
function redRecordingRunner(projectDir: string, consortDir: string) {
  const labels: string[] = [];
  return {
    labels,
    runner: {
      async run(cmd: DriveCommand) {
        if (cmd.kind === "claude") {
          labels.push(`claude:${cmd.role}`);
          // The navigator authors tests/ at the project ROOT (the product channel).
          const testsDir = join(projectDir, "tests");
          mkdirSync(testsDir, { recursive: true });
          writeFileSync(join(testsDir, "test_create_sku.py"), "def test_create_sku():\n    assert False  # RED\n");
          return;
        }
        if (cmd.kind === "cli") {
          const verb = cmd.args[0];
          labels.push(`cli:${cmd.bin.replace("consort-", "")}:${verb}`);
          if (cmd.bin.endsWith("-log") && verb === "--reconcile") {
            writeFileSync(join(consortDir, "agent-log.jsonl"),
              JSON.stringify({ timestamp: "2026-08-05T00:00:00Z", level: "info", role: "navigator", event: "artifact.written", message: "wrote tests/test_create_sku.py" }) + "\n");
          }
          return;
        }
        labels.push(cmd.kind);
      },
    },
  };
}

describe("performViaExecutor (#590): navigator RED (the PRODUCT channel) through the StepExecutor", () => {
  it("runs the build-turn CLI sequence: claude, @build-cycle (RED stamp), reconcile – and writes tests/ at the project ROOT", async () => {
    const projectDir = mkdtempSync(join(tmpdir(), "pve-red-"));
    const consortDir = join(projectDir, ".consort");
    mkdirSync(consortDir, { recursive: true });
    seedRedInputs(consortDir);
    try {
      const rec = redRecordingRunner(projectDir, consortDir);
      const effects = buildDriveEffects(cfg(consortDir, projectDir, { useManifestSteps: true, runner: rec.runner, loopGranularity: "story" }));
      const bounded = await effects.performViaExecutor!(RED, state, routerDeps);

      // Executor-dispatched (not undefined).
      expect(bounded).toBeDefined();
      // The command stream in Template-Method phase order: RED has NO pre-turn CLI; the agent writes
      // its tests; reconcile materializes the meta agent-log; the post-turn `@build-cycle` marker
      // RESOLVES to the cycle `begin` (RED stamp) – NOT filtered out, NOT sync-breakdown.
      expect(rec.labels).toEqual([
        "claude:navigator",
        "cli:log:--reconcile",
        "cli:cycle:begin",
      ]);
      // The PRODUCT artifact landed at the project ROOT (the real code tree), not under .consort.
      expect(existsSync(join(projectDir, "tests", "test_create_sku.py"))).toBe(true);
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("BLOCKS (no RED cycle stamp) when the navigator writes no tests/ tree", async () => {
    const projectDir = mkdtempSync(join(tmpdir(), "pve-red-"));
    const consortDir = join(projectDir, ".consort");
    mkdirSync(consortDir, { recursive: true });
    seedRedInputs(consortDir);
    try {
      const labels: string[] = [];
      const runner = {
        async run(cmd: DriveCommand) {
          if (cmd.kind === "claude") { labels.push("claude"); return; /* writes NO tests/ */ }
          if (cmd.kind === "cli") { labels.push(`cli:${cmd.args[0]}`); if (cmd.bin.endsWith("-log")) writeFileSync(join(consortDir, "agent-log.jsonl"), "{}\n"); }
        },
      };
      const effects = buildDriveEffects(cfg(consortDir, projectDir, { useManifestSteps: true, runner, loopGranularity: "story" }));
      const bounded = await effects.performViaExecutor!(RED, state, routerDeps);
      expect(bounded).toBeDefined();
      // The `@build-cycle` RED stamp (cycle begin) must NOT have run – validation (no tests/) blocked it.
      expect(labels).not.toContain("cli:begin");
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("returns undefined for a turn NOT on the executor allowlist (estimate-committed stays legacy)", async () => {
    // After A-full Stages G/H/I every navigator build turn (RED/review/assess*/reflect) IS
    // executor-dispatched, so the not-dispatched exemplar is a still-legacy DESIGN turn:
    // estimate-committed re-syncs the backlog via a dedicated commandsForAction branch, no manifest.
    const projectDir = mkdtempSync(join(tmpdir(), "pve-red-"));
    try {
      const effects = buildDriveEffects(cfg(join(projectDir, ".consort"), projectDir, { useManifestSteps: true }));
      const legacy: WorkflowAction = { kind: "invoke-role", role: "architect-reviewer", mode: "estimate-committed" } as WorkflowAction;
      expect(await effects.performViaExecutor!(legacy, state, routerDeps)).toBeUndefined();
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });
});

// ─── driver GREEN (a BUILD turn) through the StepExecutor ─────────────────────────────────────────
// The build lane's other half, same performViaExecutor seam. Divergences from navigator RED:
//   - the PRODUCT edits span the app (app/ + migrations + client/), so there is NO single product
//     file to validate – the manifest's validated output is the META agent-log; the post-turn
//     @build-cycle honest-GREEN verify (the `green` verb) is what proves the code + flips codeWritten.
//   - HERE (hermetic) the @build-cycle green is just recorded as a label + its DB verify is NOT run
//     (no cloud); the LIVE honest-GREEN is the cloud-gated proof. This golden asserts the DISPATCH
//     is identical: the CLI stream + channel resolution, not the verify outcome.

const GREEN: WorkflowAction = { kind: "invoke-role", role: "driver", story: RED_STORY };

describe("performViaExecutor (#594): driver GREEN through the StepExecutor", () => {
  it("runs the build-turn CLI sequence: claude, reconcile, @build-cycle (green) – with agent-log as the validated meta output", async () => {
    const projectDir = mkdtempSync(join(tmpdir(), "pve-green-"));
    const consortDir = join(projectDir, ".consort");
    mkdirSync(consortDir, { recursive: true });
    seedRedInputs(consortDir); // same story-scoped inputs (test-list-per-story + acs)
    try {
      const labels: string[] = [];
      const runner = {
        async run(cmd: DriveCommand) {
          if (cmd.kind === "claude") {
            labels.push(`claude:${cmd.role}`);
            // Simulate the driver editing app code (the product channel spans the app – not a single file).
            mkdirSync(join(projectDir, "app"), { recursive: true });
            writeFileSync(join(projectDir, "app", "models.py"), "class Sku:\n    pass\n");
            return;
          }
          if (cmd.kind === "cli") {
            labels.push(`cli:${cmd.bin.replace("consort-", "")}:${cmd.args[0]}`);
            if (cmd.bin.endsWith("-log") && cmd.args[0] === "--reconcile") {
              writeFileSync(join(consortDir, "agent-log.jsonl"),
                JSON.stringify({ timestamp: "2026-08-05T00:00:00Z", level: "info", role: "driver", event: "artifact.written", message: "wrote app/models.py" }) + "\n");
            }
            return;
          }
          labels.push(cmd.kind);
        },
      };
      const effects = buildDriveEffects(cfg(consortDir, projectDir, { useManifestSteps: true, runner, loopGranularity: "story" }));
      const bounded = await effects.performViaExecutor!(GREEN, state, routerDeps);

      expect(bounded).toBeDefined();
      // Same phase order as RED: agent, reconcile (materialize the meta agent-log the validator
      // checks), then the post-turn apply-theme re-freeze (P1: idempotent, --if-guide no-ops on a
      // non-UI project) + the @build-cycle `green` verb (honest-GREEN), NOT `begin`.
      expect(labels).toEqual([
        "claude:driver",
        "cli:log:--reconcile",
        "cli:apply-design-theme:--if-guide",
        "cli:cycle:green",
      ]);
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("BLOCKS (no @build-cycle green) when the driver's turn produces no reconciled agent-log", async () => {
    const projectDir = mkdtempSync(join(tmpdir(), "pve-green-"));
    const consortDir = join(projectDir, ".consort");
    mkdirSync(consortDir, { recursive: true });
    seedRedInputs(consortDir);
    try {
      const labels: string[] = [];
      const runner = {
        async run(cmd: DriveCommand) {
          if (cmd.kind === "claude") { labels.push("claude"); return; /* no code, and reconcile writes no log below */ }
          if (cmd.kind === "cli") { labels.push(`cli:${cmd.args[0]}`); /* reconcile writes NO agent-log => validate fails */ }
        },
      };
      const effects = buildDriveEffects(cfg(consortDir, projectDir, { useManifestSteps: true, runner, loopGranularity: "story" }));
      const bounded = await effects.performViaExecutor!(GREEN, state, routerDeps);
      expect(bounded).toBeDefined();
      // The honest-GREEN @build-cycle (cycle:green) must NOT have run – validation (missing agent-log) blocked it.
      expect(labels).not.toContain("cli:green");
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("returns undefined for a turn NOT on the executor allowlist (estimate-committed stays legacy)", async () => {
    // After A-full Stage I every driver build turn (GREEN/refactor/repair/refactor-deploy/
    // refactor-superseded/green-superseded) IS executor-dispatched, and author-requests is now a
    // metered PO turn. The remaining genuinely-legacy agent turn is estimate-committed (the
    // backlog-resyncing architect turn: no shipped manifest, deterministic-agentless).
    const projectDir = mkdtempSync(join(tmpdir(), "pve-green-"));
    try {
      const effects = buildDriveEffects(cfg(join(projectDir, ".consort"), projectDir, { useManifestSteps: true }));
      const legacy: WorkflowAction = { kind: "invoke-role", role: "architect-reviewer", mode: "estimate-committed" } as WorkflowAction;
      expect(await effects.performViaExecutor!(legacy, state, routerDeps)).toBeUndefined();
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });
});

// ─── the 7 remaining DESIGN roles: the executor DISPATCH GATE + channel PLACEMENT (Stage 1) ────────
// This block asserts the two role-specific knobs the widening added – executorDispatched (the gate)
// and outputPathsForAction (the per-output channel-relative path) – directly, since those are the
// only role-specific parts of the otherwise role-agnostic performTurnViaExecutor.
//
// It does NOT run the FULL performViaExecutor for these roles yet: that surfaced a REAL latent bug in
// the shipped design manifests' INPUT sources (see the note below) that must be fixed on the real path
// before the full executor-dispatch parity + LIVE proof can pass. The retirement-map step (2) for
// these roles is BLOCKED on that fix, which is tracked in the plan doc (channel-model-live-proof.md).
describe("executorDispatched (Stage 1): the 7 widened design turns take the executor path", () => {
  const DISPATCHED: Array<[string, WorkflowAction]> = [
    ["spec-author per-story ACs", { kind: "invoke-role", role: "spec-author", story: RED_STORY }],
    ["spec-author propose", { kind: "invoke-role", role: "spec-author", mode: "propose" }],
    ["architect-reviewer per-story", { kind: "invoke-role", role: "architect-reviewer", story: RED_STORY }],
    ["architect estimate", { kind: "invoke-role", role: "architect-reviewer", mode: "estimate" }],
    ["dba per-story", { kind: "invoke-role", role: "dba", story: RED_STORY }],
    ["test-strategist per-story", { kind: "invoke-role", role: "test-strategist", story: RED_STORY }],
    ["ux-designer", { kind: "invoke-role", role: "ux-designer", mode: "establish" }],
    ["product-owner author-requests", { kind: "invoke-role", role: "product-owner", mode: "author-requests" }],
  ] as unknown as Array<[string, WorkflowAction]>;

  it.each(DISPATCHED)("%s is executorDispatched", (_label, action) => {
    expect(executorDispatched(action)).toBe(true);
  });

  // The turn that STAYS on the legacy path – the ONLY remaining not-dispatched agent turn after
  // A-full Stages G/H/I + author-requests becoming a metered PO turn: the backlog-resyncing
  // estimate-committed (no shipped manifest). EVERY build turn (RED/GREEN + all self-heal + reflect +
  // the deploy/superseded variants) is executor-dispatched, as are both PO planning turns.
  const NOT_DISPATCHED: Array<[string, WorkflowAction]> = [
    ["architect estimate-committed (re-syncs backlog)", { kind: "invoke-role", role: "architect-reviewer", mode: "estimate-committed" }],
  ] as unknown as Array<[string, WorkflowAction]>;

  it.each(NOT_DISPATCHED)("%s is NOT executorDispatched (stays on perform)", (_label, action) => {
    expect(executorDispatched(action)).toBe(false);
  });
});

describe("outputPathsForAction (Stage 1): each design turn's artifact resolves feature/story-scoped under .consort", () => {
  const CONSORT = "/p/.consort";
  // The channel-relative artifact path each design turn's primary output must land at (derived from
  // the consort-paths helpers = byte-identical to the legacy designArtifactExpectation), + the bare
  // meta agent-log. Feature/story-scoped where the real tree scopes them.
  const CASES: Array<[string, WorkflowAction, Record<string, string>]> = [
    ["spec-author breakdown", { kind: "invoke-role", role: "spec-author", mode: "breakdown" },
      { "feature-spec": `features/${FEATURE}/feature-spec.json`, "agent-log": "agent-log.jsonl" }],
    ["spec-author per-story ACs", { kind: "invoke-role", role: "spec-author", story: RED_STORY },
      { acs: `features/${FEATURE}/stories/${RED_STORY}/acs`, "agent-log": "agent-log.jsonl" }],
    ["spec-author propose", { kind: "invoke-role", role: "spec-author", mode: "propose" },
      { "feature-proposals": "planning/feature-proposals.md" }],
    ["architect-reviewer", { kind: "invoke-role", role: "architect-reviewer", story: RED_STORY },
      { architecture: `features/${FEATURE}/architecture.json`, "agent-log": "agent-log.jsonl" }],
    ["architect estimate", { kind: "invoke-role", role: "architect-reviewer", mode: "estimate" },
      { estimates: "planning/estimates.json" }],
    ["dba", { kind: "invoke-role", role: "dba", story: RED_STORY },
      { "db-design": `features/${FEATURE}/db-design.json`, "agent-log": "agent-log.jsonl" }],
    ["test-strategist", { kind: "invoke-role", role: "test-strategist", story: RED_STORY },
      { "test-list": `features/${FEATURE}/test-list.json`, "agent-log": "agent-log.jsonl" }],
    ["ux-designer", { kind: "invoke-role", role: "ux-designer", mode: "establish" },
      { "design-guide": "design/design-guide.json", "agent-log": "agent-log.jsonl" }],
    ["navigator RED (product)", { kind: "invoke-role", role: "navigator", story: RED_STORY },
      { tests: "tests", "agent-log": "agent-log.jsonl" }],
    ["driver GREEN (product)", { kind: "invoke-role", role: "driver", story: RED_STORY },
      { code: "app", "agent-log": "agent-log.jsonl" }],
  ] as unknown as Array<[string, WorkflowAction, Record<string, string>]>;

  it.each(CASES)("%s: channel-relative output paths", (_label, action, expected) => {
    expect(outputPathsForAction(action, CONSORT, FEATURE)).toEqual(expected);
    // Every path is channel-RELATIVE – none re-encodes the .consort root (the double-encode guard).
    for (const p of Object.values(outputPathsForAction(action, CONSORT, FEATURE))) {
      expect(p.startsWith(".consort"), `${p} must not re-encode .consort`).toBe(false);
      expect(p.startsWith("/"), `${p} must be relative`).toBe(false);
    }
  });
});

// ─── FULL performViaExecutor for the 7 widened design roles (Stage 1b: after the input-source fix) ─
// Now the manifests' input sources carry the REAL scope (feature:features/{feature}/architecture.json,
// feature:design/design-brief.md), so the executor's phase-1 gate resolves them on a real .consort
// tree. This is retirement-map step (2) per role: seed each role's declared inputs at their TRUE
// on-disk scope, SIMULATE the agent writing its artifact into the resolved .consort channel root +
// reconcile materializing the meta agent-log, then assert (a) executor-dispatched (defined), (b) the
// artifact landed under .consort single-level (never double-encoded), (c) the CLI stream matches the
// role's structural commands (claude + reconcile; test-strategist adds its test-list CLI; planning
// modes skip reconcile).
describe("performViaExecutor (Stage 1b): the 7 design roles run FULL through the executor", () => {
  function seed(consortDir: string, relFromConsort: string, body = "seed\n"): void {
    const abs = join(consortDir, relFromConsort);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, body);
  }
  function designRunner(consortDir: string, artifactRel: string, artifactBody: string, role: string) {
    const labels: string[] = [];
    return {
      labels,
      runner: {
        async run(cmd: DriveCommand) {
          if (cmd.kind === "claude") {
            labels.push(`claude:${cmd.role}`);
            const abs = join(consortDir, artifactRel);
            mkdirSync(join(abs, ".."), { recursive: true });
            writeFileSync(abs, artifactBody);
            return;
          }
          if (cmd.kind === "cli") {
            labels.push(`cli:${cmd.bin.replace("consort-", "")}:${cmd.args[0]}`);
            if (cmd.bin.endsWith("-log") && cmd.args[0] === "--reconcile") {
              const events = [
                { timestamp: "2026-08-05T00:00:00Z", level: "info", role, event: "artifact.written", message: "wrote artifact" },
              ];
              // A VALID test-strategist turn SUPERVISES: it logs a `test-analyst:<kind>` dispatch event
              // per enabled analyst (uiTrack defaults on here => behavior/fitness/client). The agent-log
              // validator (testStrategistDispatchedAnalysts) requires these, so the fixture must simulate
              // the fan-out, not a solo turn.
              if (role === "test-strategist") {
                for (const kind of ["behavior", "fitness", "client"]) {
                  events.push({ timestamp: "2026-08-05T00:00:01Z", level: "debug", role, event: "reasoning", message: `test-analyst:${kind} model=sonnet` });
                }
              }
              writeFileSync(join(consortDir, "agent-log.jsonl"), events.map((e) => JSON.stringify(e)).join("\n") + "\n");
            }
            return;
          }
          labels.push(cmd.kind);
        },
      },
    };
  }

  const AC = JSON.stringify({ id: "AC1-x", story_id: RED_STORY, statement: "S", layer: "persistence", given: "g", when: "w", then: "t", status: "draft" }) + "\n";
  const ARCH = JSON.stringify({ feature_id: FEATURE, service_backed: true, layers: [{ role: "driver", module: "app" }], persistence_invariants: [{ id: "I1", type: "unique", table: "sku", brief: "b" }] }) + "\n";
  const DBD = JSON.stringify({ feature_id: FEATURE, tables: [{ name: "sku", columns: [{ name: "id", type: "text", nullable: false }], primary_key: ["id"] }], schema_changes: [], realizes_invariants: ["I1"] }) + "\n";
  const TL = JSON.stringify({ feature_id: FEATURE, ordered_for: "design-momentum", items: [{ id: "T1", ac_id: "AC1-x", kind: "behavior", status: "pending", description: "d", invariant_id: "I1" }] }) + "\n";
  const DG = JSON.stringify({ tokens: { colors: {}, typography: {}, spacing: {}, radius: {}, shadows: {}, breakpoints: {} }, components: { navbar: { class: "nav", notes: "n" } } }) + "\n";
  const PROPOSE = "# Feature A\nscope\n";
  const EST = JSON.stringify([{ feature_id: "FA", name: "Feature A", size: "M", rationale: "r" }]) + "\n";
  const FS = join("features", FEATURE);
  const STORY_ACS = join(FS, "stories", RED_STORY, "acs");

  // [label, action, seed(consortDir) at REAL scope, artifactRel under .consort, artifactBody, expected labels]
  type Case = [string, WorkflowAction, (c: string) => void, string, string, string[]];
  const CASES: Case[] = [
    ["spec-author per-story ACs", { kind: "invoke-role", role: "spec-author", story: RED_STORY } as WorkflowAction,
      (c) => { seed(c, join(FS, "stories", RED_STORY, "story.json"), JSON.stringify({ id: RED_STORY }) + "\n"); seed(c, "product-overview.md"); },
      join(STORY_ACS, "AC1-x.json"), AC, ["claude:spec-author", "cli:log:--reconcile"]],
    ["architect-reviewer per-story", { kind: "invoke-role", role: "architect-reviewer", story: RED_STORY } as WorkflowAction,
      (c) => { seed(c, join(STORY_ACS, "AC1-x.json"), AC); seed(c, "nfrs.md"); },
      join(FS, "architecture.json"), ARCH, ["claude:architect-reviewer", "cli:log:--reconcile"]],
    ["dba per-story", { kind: "invoke-role", role: "dba", story: RED_STORY } as WorkflowAction,
      (c) => seed(c, join(FS, "architecture.json"), ARCH),
      join(FS, "db-design.json"), DBD, ["claude:dba", "cli:log:--reconcile"]],
    ["test-strategist per-story", { kind: "invoke-role", role: "test-strategist", story: RED_STORY } as WorkflowAction,
      (c) => { seed(c, join(STORY_ACS, "AC1-x.json"), AC); seed(c, join(FS, "architecture.json"), ARCH); seed(c, join(FS, "db-design.json"), DBD); },
      join(FS, "test-list.json"), TL, []], // labels asserted specially (extra test-list CLI)
    ["ux-designer", { kind: "invoke-role", role: "ux-designer", mode: "establish" } as WorkflowAction,
      (c) => { seed(c, join("design", "design-brief.md")); seed(c, "product-overview.md"); },
      join("design", "design-guide.json"), DG, ["claude:ux-designer", "cli:log:--reconcile"]],
    ["spec-author propose (plan lane)", { kind: "invoke-role", role: "spec-author", mode: "propose" } as WorkflowAction,
      (c) => { seed(c, "product-overview.md"); seed(c, "nfrs.md"); },
      join("planning", "feature-proposals.md"), PROPOSE, ["claude:spec-author"]],
    ["architect estimate (plan lane)", { kind: "invoke-role", role: "architect-reviewer", mode: "estimate" } as WorkflowAction,
      (c) => seed(c, join("planning", "feature-proposals.md"), PROPOSE),
      join("planning", "estimates.json"), EST, ["claude:architect-reviewer"]],
  ];

  it.each(CASES)("%s: dispatched + artifact under .consort + same CLI stream", async (label, action, seedInputs, artifactRel, artifactBody, expectedLabels) => {
    const projectDir = mkdtempSync(join(tmpdir(), "pve-design-"));
    const consortDir = join(projectDir, ".consort");
    mkdirSync(consortDir, { recursive: true });
    seedInputs(consortDir);
    try {
      const role = action.kind === "invoke-role" ? action.role : "";
      const rec = designRunner(consortDir, artifactRel, artifactBody, role);
      const effects = buildDriveEffects(cfg(consortDir, projectDir, { useManifestSteps: true, runner: rec.runner, loopGranularity: "story" }));
      const bounded = await effects.performViaExecutor!(action, state, routerDeps);

      expect(bounded, `${label} should be executor-dispatched`).toBeDefined();
      expect(existsSync(join(consortDir, artifactRel)), `${label} artifact at .consort/${artifactRel}`).toBe(true);
      expect(existsSync(join(consortDir, ".consort")), `${label} must NOT double-encode .consort`).toBe(false);
      if (role === "test-strategist") {
        // The executor runs reconcile (materialize, phase 4.5) BEFORE the manifest's `after` CLIs
        // (post-turn, phase 6.5) – the SAME reconcile-then-after order as the breakdown golden
        // (a declared executor-path behavior; the legacy path ran the after-CLI then reconcile).
        // So the stream is [claude, reconcile, test-list], not reconcile-last.
        expect(rec.labels[0]).toBe("claude:test-strategist");
        expect(rec.labels).toContain("cli:log:--reconcile");
        expect(rec.labels.some((l) => l.startsWith("cli:test-list:"))).toBe(true);
        expect(rec.labels.indexOf("cli:log:--reconcile"))
          .toBeLessThan(rec.labels.findIndex((l) => l.startsWith("cli:test-list:")));
      } else {
        expect(rec.labels).toEqual(expectedLabels);
      }
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });
});
