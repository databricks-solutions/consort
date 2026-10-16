// Guards Fix #1: the BUILD-lane RED authoring directive carries the migration-reversibility
// canon inline. The full canon lives in navigator.md, but a cheaper red-turn model buried it in
// the long agent doc and authored a dynamic/blind `downgrade base` — which the honest-GREEN
// `reversible-invariant-round-trip` verify then rejected, dead-locking the assess/repair loop.
// Reinforcing it inline in the RED task body (in lockstep with checkTestlistMigrationRevision)
// is what prevents the smell at authoring time.

import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildTaskBody, type DriveEffectsConfig } from "../../consort/orchestrator/drive/orchestrator-effects";
import type { WorkflowAction } from "../../consort/orchestrator/drive/orchestrator-drive";

const FEATURE = "F1-stock-visibility";
const STORY = "S1-file-stock";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function cfg(consortDir: string): DriveEffectsConfig {
  return {
    projectDir: join(consortDir, ".."),
    consortDir,
    featureId: FEATURE,
    runner: { async run() {} },
    modelForRole: () => "sonnet",
    approver: "human-proxy",
    deployTarget: "local",
  };
}

/** Seed the minimum the RED directive reads: a pending test-list item for the story. */
function seedRedProject(): string {
  const project = mkdtempSync(join(tmpdir(), "red-canon-"));
  dirs.push(project);
  const consortDir = join(project, ".consort");
  const storyDir = join(consortDir, "features", FEATURE, "stories", STORY);
  mkdirSync(join(storyDir, "acs"), { recursive: true });
  const items = [
    { id: "T1", description: "the create migration round-trips", ac_id: "AC1-file-stock-record", status: "pending", invariant_id: "PI6-migration-reversible", kind: "fitness" },
  ];
  const writeJson = (p: string, o: unknown): void => writeFileSync(p, JSON.stringify(o, null, 2) + "\n");
  writeJson(join(storyDir, "test-list-per-story.json"), { feature_id: FEATURE, story_id: STORY, items });
  writeJson(join(consortDir, "features", FEATURE, "test-list.json"), { feature_id: FEATURE, items });
  writeJson(join(storyDir, "acs", "AC1-file-stock-record.json"), { id: "AC1-file-stock-record", layer: "E2E", text: "file a stock record" });
  return consortDir;
}

describe("RED authoring directive: migration-reversibility canon is injected inline", () => {
  const RED = { kind: "invoke-role", role: "navigator", story: STORY } as Extract<WorkflowAction, { kind: "invoke-role" }>;

  it("pins down_revision, forbids a relative `-1` and a blind `base`, and names @pytest.mark.migration + the gate", () => {
    const body = buildTaskBody(RED, cfg(seedRedProject()));
    expect(body).toContain("down_revision");
    expect(body, "forbids a relative downgrade -1").toMatch(/downgrade -1/);
    expect(body, "forbids a blind/dynamic downgrade base").toMatch(/downgrade` base|downgrade base/i);
    expect(body).toMatch(/@pytest\.mark\.migration/);
    expect(body, "names the deterministic gate").toContain("checkTestlistMigrationRevision");
  });

  it("mandates schema-recreation (not data-survival) and warns the create-table case is unsatisfiable", () => {
    const body = buildTaskBody(RED, cfg(seedRedProject()));
    expect(body).toMatch(/SCHEMA RECREATION/);
    expect(body, "warns a create-table data-survival assertion dead-locks into HIL").toMatch(/UNSATISFIABLE/);
    expect(body).toMatch(/round-trip/);
  });
});
