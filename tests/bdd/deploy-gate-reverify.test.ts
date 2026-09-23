// BDD coverage for the deploy-gate re-verify path (issue #198): when the feature
// deploy-evidence records verify.passed=false, an approve can never advance, so the
// drive must route ONE bounded re-verify (re-run deploy+verify, rewriting evidence)
// and then a terminal HIL – never a repeated approve (the "repeated without
// advancing" stall).

import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { nextTransition, type DriveState } from "../../consort/orchestrator/drive/orchestrator-drive.js";
import { commandsForAction, type DriveEffectsConfig } from "../../consort/orchestrator/drive/orchestrator-effects.js";
import { featureDeployReverifyMarkerJson } from "../../consort/config/consort-paths.js";

const tmpDirs: string[] = [];
function mkProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deploy-reverify-"));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  while (tmpDirs.length) {
    const dir = tmpDirs.pop();
    if (dir) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
    }
  }
});

function deployState(deploy: DriveState["deploy"]): DriveState {
  return { phase: "deploy", breakdownDone: true, storyOrder: [], stories: {}, buildActive: null, deploy };
}

describe("nextTransition: deploy-gate re-verify route (issue #198)", () => {
  it("failed verdict + no retry marker -> ONE bounded re-verify (never the doomed approve)", () => {
    const a = nextTransition(deployState({ deployed: true, gateApproved: false, verifyPassed: false, reverifyAttempted: false }));
    expect(a).toEqual({ kind: "deploy-verify-reverify" });
  });

  it("failed verdict + retry marker PRESENT -> terminal HIL with the recovery (no stall)", () => {
    const a = nextTransition(deployState({ deployed: true, gateApproved: false, verifyPassed: false, reverifyAttempted: true }));
    expect(a.kind).toBe("raise-to-hil");
    if (a.kind === "raise-to-hil") {
      expect(a.source).toBe("deploy-verify-failed");
      expect(a.reason).toMatch(/still fails after a re-deploy \+ re-verify/);
      expect(a.reason).toMatch(/consort-deploy --target local --feature <F>/);
      expect(a.reason).toMatch(/lsof -tiTCP:8000/);
    }
  });

  it("passed verdict + unapproved -> the normal approve (evidence is fresh + green)", () => {
    const a = nextTransition(deployState({ deployed: true, gateApproved: false, verifyPassed: true }));
    expect(a).toEqual({ kind: "approve-deploy-gate" });
  });

  it("no verdict yet (deploy never verified) -> the normal approve path", () => {
    const a = nextTransition(deployState({ deployed: true, gateApproved: false, verifyPassed: undefined }));
    expect(a).toEqual({ kind: "approve-deploy-gate" });
  });

  it("the contamination heal still takes precedence over the re-verify route", () => {
    const a = nextTransition(
      deployState({ deployed: true, gateApproved: false, verifyPassed: false, verifyAssessEligible: true }),
    );
    expect(a).toEqual({ kind: "deploy-verify-heal", role: "navigator", mode: "assess-deploy" });
  });

  it("approved gate -> deploy-complete regardless of the verdict", () => {
    const a = nextTransition(deployState({ deployed: true, gateApproved: true, verifyPassed: true }));
    expect(a).toEqual({ kind: "deploy-complete" });
  });
});

describe("commandsForAction: deploy-verify-reverify", () => {
  function cfgFor(projectDir: string): DriveEffectsConfig {
    return {
      projectDir,
      consortDir: path.join(projectDir, ".sftdd"),
      featureId: "F1",
      runner: { async run() { /* no-op: command assembly only */ } },
      modelForRole: () => "sonnet",
    };
  }

  it("writes the bound marker FIRST, then re-runs the SAME deploy+verify commands as the deploy step", () => {
    const projectDir = mkProject();
    const cfg = cfgFor(projectDir);
    const cmds = commandsForAction({ kind: "deploy-verify-reverify" }, cfg);

    // The marker is on disk (what bounds the retry to one shot).
    const marker = featureDeployReverifyMarkerJson(cfg.consortDir, "F1");
    expect(fs.existsSync(marker)).toBe(true);

    // And the command list is exactly the deploy step's: teardown, then deploy --gate.
    const deployCmds = commandsForAction({ kind: "deploy" }, cfg);
    expect(cmds).toEqual(deployCmds);
    expect(cmds[0]).toMatchObject({ kind: "cli", bin: "consort-deploy" });
    const second = cmds[1];
    expect(second.kind).toBe("cli");
    if (second.kind === "cli") {
      expect(second.bin).toBe("consort-deploy");
      expect(second.args).toContain("--gate");
    }
  });
});
