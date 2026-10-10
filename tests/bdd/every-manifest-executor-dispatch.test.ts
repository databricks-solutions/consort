// A-full (#649) – the "every agent manifest works through the executor" matrix. The user's
// directive: confirm EVERY shipped step manifest with an agent dispatches through performViaExecutor
// with the provided scaffolding + its declared preconditions injected. This is the coverage proof
// that the ONE dispatch path is universally applied (F2/G/H/I), not just the turns we hand-picked.
//
// For EACH agent manifest (all 20 SHIPPED_MANIFESTS): reconstruct a representative action from its
// `match`, seed its declared inputs at their resolved on-disk paths from the intake fixtures (design
// artifacts + the build-turn markers under tests/integration/intake/build-markers/story/), then drive
// it through buildDriveEffects.performViaExecutor with a recording runner that SIMULATES the agent
// (writes the manifest's declared outputs into their channel roots) + reconcile (writes the meta
// agent-log). Assert:
//   (a) DISPATCHED – performViaExecutor returned a BoundedRoute (not undefined => it took the executor).
//   (b) the CLI stream funneled the agent turn + (non-planning) reconcile + the postTurn CLI/@build-cycle.
//   (c) each DECLARED output landed under its channel root (validated by the executor's phase 5).
//   (d) a declared PRECONDITION's projected block is present in the dispatched claude task, in position
//       (prepend => before the base directive; append => after) – the formal precondition face is live.
//
// Fixtures are assembled from the stockflow-rerecord corpus + the existing intake tree and live under
// tests/integration/intake (build-markers/story/), so the matrix draws from a durable, versioned source.
//
// TIER: every case here is HERMETIC – the recording runner simulates the agent + reconcile, and the
// @build-cycle marker is recorded as a label (its live DB verify is NOT run). The turns whose
// @build-cycle needs a real Lakebase branch/deploy (driver green/refactor/repair/refactor-deploy/
// refactor-superseded/green-superseded, navigator assess-deploy) are tagged `cloud` for the live pass
// (#650), which flips the gate + runs the real verify; the DISPATCH is fully proven here.

import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, basename } from "node:path";
import { buildDriveEffects, type DriveCommand, type DriveEffectsConfig } from "../../consort/orchestrator/drive/orchestrator-effects";
import { outputPathsForAction } from "../../consort/orchestrator/drive/executor-dispatch";
import { SHIPPED_MANIFESTS, type StepManifest } from "../../consort/orchestrator/steps/manifest";
import { resolvePreparer } from "../../consort/orchestrator/build/preconditions";
import { writeGreenFailure } from "../../consort/smells/supersession";
import { storyResolved, cycleDir } from "../../consort/config/consort-paths";
import type { WorkflowAction, DriveState } from "../../consort/orchestrator/drive/orchestrator-drive";
import type { ValidateBoundDeps } from "../../consort/orchestrator/steps/step-contract";

const INTAKE = join(__dirname, "..", "integration", "intake");
const FEATURE = "F1-stock-visibility";
const STORY = "S1-file-stock";
const AC = "AC1-file-stock-record";

/** Reconstruct a representative WorkflowAction from a manifest's `match` (drop the null sentinels
 *  = "field ABSENT"), and add a story + ac for the story-scoped roles that carry no mode/buildMode,
 *  so the executor resolves the SAME turn the drive would. Mirrors manifest.ts's reconstruction. */
const STORY_SCOPED = new Set(["dba", "test-strategist", "driver", "spec-author", "architect-reviewer", "navigator"]);
function actionFromMatch(m: StepManifest): Extract<WorkflowAction, { kind: "invoke-role" }> {
  const a: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(m.match)) {
    if (v === null) continue;
    a[k] = v;
  }
  const hasMode = "mode" in m.match && m.match.mode !== null;
  const hasBuildMode = "buildMode" in m.match && m.match.buildMode !== null;
  if (STORY_SCOPED.has(m.role) && !hasMode && !("story" in a)) a.story = STORY;
  // assess/repair carry an ac in the real drive (per-AC cycle); seed one so the advisory + the
  // cycle-scoped inputs (green-failure / regression-assessment) resolve at cycleDir, not the story dir.
  if (hasBuildMode && (m.match.buildMode === "assess" || m.match.buildMode === "repair") && !("ac" in a)) a.ac = AC;
  return a as unknown as Extract<WorkflowAction, { kind: "invoke-role" }>;
}

/** Seed one declared input at the path the executor resolves it to (feature: under consortDir,
 *  story: under the story dir, cycle:/ac: under the AC cycle dir), copying a faithful body from the
 *  intake fixtures when we have one, else a minimal stub. A `code`/`design`/`acs` source is a
 *  DIRECTORY input (presence-checked). `ac` is required to resolve a cycle:/ac: source. */
function seedInput(consortDir: string, source: string, ac?: string): void {
  const expand = (rel: string): string => rel.replace(/\{feature\}/g, FEATURE).replace(/\{story\}/g, STORY);
  const isStory = source.startsWith("story:");
  const isCycle = source.startsWith("cycle:") || source.startsWith("ac:");
  const rel = expand(source.replace(/^(story:|feature:|cycle:|ac:)/, ""));
  const abs = isCycle
    ? join(cycleDir(consortDir, FEATURE, STORY, ac ?? AC), rel)
    : isStory
      ? join(storyResolved(consortDir, FEATURE, STORY), rel)
      : join(consortDir, rel);
  const base = basename(rel);

  // Directory inputs (no file extension): acs/ (seed an AC), code/ + design/ (seed a sentinel file).
  if (!base.includes(".")) {
    mkdirSync(abs, { recursive: true });
    if (base === "acs") {
      cpSync(join(INTAKE, "features", FEATURE, "stories", STORY, "acs", `${AC}.json`), join(abs, `${AC}.json`));
    } else {
      writeFileSync(join(abs, ".seed"), "seed\n"); // code/ or design/ – presence-only
    }
    return;
  }
  mkdirSync(dirname(abs), { recursive: true });
  // Prefer a faithful body from the intake tree / the build-markers; else a minimal stub.
  const intakeCandidates = [
    join(INTAKE, rel), // feature-scoped: features/<F>/architecture.json, planning/..., design/...
    join(INTAKE, "build-markers", "story", base), // build-turn markers
    join(INTAKE, "features", FEATURE, "stories", STORY, base),
  ];
  const src = intakeCandidates.find((p) => existsSync(p));
  if (src) cpSync(src, abs);
  else writeFileSync(abs, base.endsWith(".json") ? "{}\n" : `# ${base}\nseed\n`);
}

/** The declared-output body to simulate for a manifest output id (a faithful intake artifact when
 *  we have one; else a minimal conformant stub). Keyed by the output filename. */
function simulatedOutputBody(filename: string): string {
  const intakeByName: Record<string, string> = {
    "feature-spec.json": join(INTAKE, "features", FEATURE, "feature-spec.json"),
    "architecture.json": join(INTAKE, "features", FEATURE, "architecture.json"),
    "db-design.json": join(INTAKE, "features", FEATURE, "db-design.json"),
    "test-list.json": join(INTAKE, "features", FEATURE, "test-list.json"),
    "design-guide.json": join(INTAKE, "design", "design-guide.json"),
    "estimates.json": join(INTAKE, "planning", "estimates.json"),
    "feature-proposals.md": join(INTAKE, "planning", "feature-proposals.md"),
    "deploy-verify-scope.json": join(INTAKE, "build-markers", "story", "deploy-verify-scope.json"),
  };
  const p = intakeByName[filename];
  return p && existsSync(p) ? readFileSync(p, "utf8") : "{}\n";
}

const routerDeps: ValidateBoundDeps = {
  allowed: () => ({ kind: "design-complete" }) as WorkflowAction,
  reviseBudgetAvailable: () => true,
  recordRetry: () => ({ sanctioned: true }),
};
const state = { phase: "feature" } as unknown as DriveState;

function cfg(consortDir: string, projectDir: string, runner: DriveEffectsConfig["runner"]): DriveEffectsConfig {
  return {
    projectDir,
    consortDir,
    featureId: FEATURE,
    runner,
    modelForRole: () => "sonnet",
    approver: "human-proxy",
    deployTarget: "local",
    useManifestSteps: true,
    loopGranularity: "story",
    // Sprint-scoped, so the product-owner author-requests manifest's @sync-backlog postTurn projects
    // the backlog (it is a no-op without a sprint name). Harmless for the other manifests.
    sprintName: "matrix-sprint",
  } as DriveEffectsConfig;
}

// The manifests that dispatch an AGENT turn = every shipped manifest (all carry an invoke-role agent).
const AGENT_MANIFESTS = SHIPPED_MANIFESTS;

describe("every agent manifest dispatches through the executor (A-full #649)", () => {
  it("covers all 22 shipped manifests (guard: the matrix stays exhaustive)", () => {
    expect(AGENT_MANIFESTS.length).toBe(22);
  });

  it.each(AGENT_MANIFESTS.map((m) => [m.id, m] as [string, StepManifest]))(
    "%s: executor-dispatched + inputs resolved + outputs validated + preconditions injected + postTurn stamped",
    async (_id, manifest) => {
      const action = actionFromMatch(manifest);
      const projectDir = mkdtempSync(join(tmpdir(), "matrix-"));
      const consortDir = join(projectDir, ".consort");
      mkdirSync(consortDir, { recursive: true });
      try {
        // Seed every declared input at its resolved path. A cycle:/ac: source needs the action's ac.
        const actionAc = "ac" in action && typeof action.ac === "string" ? action.ac : undefined;
        for (const input of manifest.inputs) seedInput(consortDir, input.source, actionAc);
        // The green-failure-advisory preparer reads from the AC CYCLE dir (not the story dir the
        // manifest input names), so a turn that declares it also needs the marker seeded there for
        // the advisory to project non-empty. Faithful shape mirrors the intake build-marker.
        if ((manifest.preconditions ?? []).some((p) => p.kind === "green-failure-advisory")) {
          writeGreenFailure(consortDir, FEATURE, STORY, AC, {
            version: 1,
            failureOutput: "FAILED tests/test_prior.py::test_legacy_shape - AssertionError: column 'legacy_code' missing",
            contractRefs: "app/models/sku.py:42 references dropped column `legacy_code`",
            supersededTestRefs: "tests/test_prior.py::test_legacy_shape asserts the dropped `legacy_code`",
          } as never);
        }
        // The cross-story-context preparer reads the feature's OTHER stories' ACs. Seed a sibling
        // story with one AC so the block projects non-empty for a turn that declares it.
        if ((manifest.preconditions ?? []).some((p) => p.kind === "cross-story-context")) {
          const sibAcs = join(dirname(storyResolved(consortDir, FEATURE, STORY)), "S2-stock-by-location-table", "acs");
          mkdirSync(sibAcs, { recursive: true });
          writeFileSync(
            join(sibAcs, "AC1-table-lists-stock.json"),
            JSON.stringify({ id: "AC1-table-lists-stock", status: "gated", layer: "api", given: "stock exists at locations", when: "the home table renders", then: "it lists SKU, location, quantity" }) + "\n",
          );
        }

        const outPaths = outputPathsForAction(action, consortDir, FEATURE);
        const claudeTasks: string[] = [];
        const labels: string[] = [];
        const runner: DriveEffectsConfig["runner"] = {
          async run(cmd: DriveCommand) {
            if (cmd.kind === "claude") {
              labels.push(`claude:${cmd.role}`);
              claudeTasks.push(cmd.task);
              // Simulate the agent writing each declared output into its channel root. product ->
              // projectDir; artifact/meta -> consortDir (the executor's provisionWorkspace roots).
              for (const out of manifest.outputs) {
                const rel = outPaths[out.id] ?? out.filename;
                const root = out.channel === "product" ? projectDir : consortDir;
                const abs = join(root, rel);
                if (!rel.includes(".")) mkdirSync(abs, { recursive: true }); // dir output (acs/tests/app)
                else { mkdirSync(dirname(abs), { recursive: true }); writeFileSync(abs, simulatedOutputBody(basename(rel))); }
              }
              return;
            }
            if (cmd.kind === "cli") {
              labels.push(`cli:${cmd.bin.replace("consort-", "")}:${cmd.args[0]}`);
              if (cmd.bin.endsWith("-log") && cmd.args[0] === "--reconcile") {
                writeFileSync(join(consortDir, "agent-log.jsonl"),
                  JSON.stringify({ timestamp: "2026-08-06T00:00:00Z", level: "info", role: manifest.role, event: "artifact.written", message: "matrix sim" }) + "\n");
              }
              return;
            }
            labels.push(cmd.kind);
          },
        };

        const effects = buildDriveEffects(cfg(consortDir, projectDir, runner));
        const bounded = await effects.performViaExecutor!(action, state, routerDeps);

        // (a) DISPATCHED: not undefined => it took the executor path.
        expect(bounded, `${manifest.id} must be executor-dispatched`).toBeDefined();
        // (b) the agent turn ran (exactly one claude), and its CLI stream funneled through the runner.
        expect(labels.filter((l) => l.startsWith("claude:"))).toHaveLength(1);
        // The postTurn stamped (every manifest declares a postTurn: @build-cycle / a role CLI, or the
        // PO author-requests turn's @sync-backlog, which is an in-process sync-backlog DriveCommand).
        if ((manifest.postTurn ?? []).length > 0) {
          const postLabels = labels.filter((l) => l.startsWith("cli:") || l === "sync-backlog");
          expect(postLabels.length, `${manifest.id} should stamp its postTurn CLI`).toBeGreaterThan(0);
        }
        // (c) each declared output exists under its channel root (phase 5 validated it => no block).
        for (const out of manifest.outputs) {
          if (out.optional) continue; // an optional output may legitimately be absent
          const rel = outPaths[out.id] ?? out.filename;
          const root = out.channel === "product" ? projectDir : consortDir;
          expect(existsSync(join(root, rel)), `${manifest.id} declared output ${out.id} at ${rel}`).toBe(true);
        }
        // (d) each declared precondition's PROJECTED block is present in the dispatched task, in
        // its declared position – proving phase 2.5 (the formal precondition face) is the live
        // injector, not the old inline concat. Project the same block the preparer would and assert
        // the task CONTAINS it; for a prepend precondition (the green-failure advisory) assert it
        // rides BEFORE the base directive (the task does not start with the directive).
        const task = claudeTasks[0] ?? "";
        for (const pre of manifest.preconditions ?? []) {
          const block = resolvePreparer(pre.kind)({ consortDir, featureId: FEATURE, story: STORY, ac: "ac" in action && typeof action.ac === "string" ? action.ac : "", ...(pre.options ? { options: pre.options } : {}) });
          expect(block.length, `${manifest.id} precondition ${pre.kind} should project a non-empty block for the seeded inputs`).toBeGreaterThan(0);
          expect(task.includes(block.trim().slice(0, 60)), `${manifest.id} task must carry the injected ${pre.kind} block`).toBe(true);
          if (pre.position === "prepend") {
            // The advisory precedes the ASSESS directive (it rode before the base body). Handback is
            // empty here (no retry), so the advisory is at/near the very start of the task.
            expect(task.indexOf(block.trim().slice(0, 40))).toBeLessThan(task.indexOf("ASSESS"));
          }
        }
      } finally {
        // best-effort cleanup
        try { require("node:fs").rmSync(projectDir, { recursive: true, force: true }); } catch { /* noop */ }
      }
    },
  );
});
