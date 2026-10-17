// P4 (control semantics): the ux-designer IA refinement directive and the navigator reflect
// criterion must pin and check CONTROL semantics (type + option source + reachable states), not
// only that a surface is NAMED in ia.md. This is what would have caught the stockflow S2 location
// filter — a native <datalist> whose options came from the filtered rows, so an empty/other
// location was unselectable and the empty-state was reachable only via a URL bypass. The
// reflect-ia-defect routing to the ux-designer is already shipped; these assert the prompts that
// now emit it on a control-usability defect, not just a missing-surface one.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildTaskBody, type DriveEffectsConfig } from "../../consort/orchestrator/drive/orchestrator-effects";
import type { WorkflowAction } from "../../consort/orchestrator/drive/orchestrator-drive";

const FEATURE = "F1-stock-visibility";
const STORY = "S2-stock-by-location-table";

let projectDir: string;
let consortDir: string;
beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), "control-semantics-"));
  consortDir = join(projectDir, ".consort");
  mkdirSync(consortDir, { recursive: true });
});
afterEach(() => rmSync(projectDir, { recursive: true, force: true }));

function cfg(): DriveEffectsConfig {
  return {
    projectDir,
    consortDir,
    featureId: FEATURE,
    runner: { async run() {} },
    modelForRole: () => "sonnet",
    approver: "human-proxy",
    deployTarget: "local",
    uiTrack: true,
  };
}

const IA = { kind: "invoke-role", role: "ux-designer", story: STORY, mode: "ia" } as Extract<WorkflowAction, { kind: "invoke-role" }>;
const REFLECT = { kind: "invoke-role", role: "navigator", story: STORY, buildMode: "reflect" } as Extract<WorkflowAction, { kind: "invoke-role" }>;

describe("P4: ux-designer IA directive pins control semantics", () => {
  it("requires each interactive control to declare TYPE and OPTION SOURCE", () => {
    const body = buildTaskBody(IA, cfg());
    expect(body).toMatch(/OPTION SOURCE/);
    expect(body).toMatch(/combobox/i);
    expect(body).toMatch(/datalist/i); // names the anti-pattern it must not reach for
  });

  it("requires the empty/other state to be reachable THROUGH the control", () => {
    const body = buildTaskBody(IA, cfg());
    expect(body).toMatch(/ALL distinct locations/);
    expect(body).toMatch(/EMPTY or other location is selectable/i);
  });
});

describe("P4: navigator reflect criterion checks control usability (routes reflect-ia-defect)", () => {
  it("ux-designer is a routable reflect owner in the verdict schema", () => {
    expect(buildTaskBody(REFLECT, cfg())).toMatch(/"owner":"spec-author"\|"test-strategist"\|"architect-reviewer"\|"ux-designer"/);
  });

  it("emits a ux-designer finding when a control cannot reach an asserted state (not just a missing surface)", () => {
    const body = buildTaskBody(REFLECT, cfg());
    expect(body).toMatch(/control-SEMANTICS check is the twin of the surface-existence check/);
    expect(body).toMatch(/reachable THROUGH the control/);
    expect(body).toMatch(/option source must cover the asserted values/i);
  });
});
