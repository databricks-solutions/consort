// BDD coverage for the raise-to-hil escalation record: routes that derive
// raise-to-hil from a MARKER (spec-defect, confirmed-unfixable, deploy-verify-failed)
// previously halted WITHOUT a record under .consort/escalations/ – so consort-next
// derived no HIL option (awaiting_human:false) and the dashboard fell back to the
// last gate instead of showing the escalation. The effect now ensures the record
// exists (idempotently) before the halt.

import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { commandsForAction, type DriveEffectsConfig } from "../../consort/orchestrator/drive/orchestrator-effects.js";

const tmpDirs: string[] = [];
function mkProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hil-escalation-record-"));
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

function cfgFor(projectDir: string): DriveEffectsConfig {
  return {
    projectDir,
    consortDir: path.join(projectDir, ".sftdd"),
    featureId: "F1",
    runner: { async run() { /* no-op */ } },
    modelForRole: () => "sonnet",
  };
}

function escalationFiles(consortDir: string): string[] {
  const dir = path.join(consortDir, "escalations");
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")) : [];
}

describe("commandsForAction: raise-to-hil records the escalation before the halt", () => {
  it("writes a record with source + reason + story for a marker-derived route", () => {
    const projectDir = mkProject();
    const cfg = cfgFor(projectDir);
    const cmds = commandsForAction(
      { kind: "raise-to-hil", source: "spec-defect", reason: "the test asserts a migration that should not exist", story: "S1" },
      cfg,
    );
    expect(cmds).toEqual([]);
    const files = escalationFiles(cfg.consortDir);
    expect(files).toHaveLength(1);
    const rec = JSON.parse(fs.readFileSync(path.join(cfg.consortDir, "escalations", files[0]), "utf8"));
    expect(rec.source).toBe("spec-defect");
    expect(rec.reason).toMatch(/should not exist/);
    expect(rec.story_id).toBe("S1");
    expect(rec.feature_id).toBe("F1");
    expect(rec.how_to_resolve).toMatch(/consort-resolve-escalation/);
  });

  it("is idempotent: a re-derived raise returns the SAME record, no duplicate", () => {
    const projectDir = mkProject();
    const cfg = cfgFor(projectDir);
    const action = { kind: "raise-to-hil" as const, source: "green-unfixable", reason: "no fix directive", story: "S1" };
    commandsForAction(action, cfg);
    commandsForAction(action, cfg);
    expect(escalationFiles(cfg.consortDir)).toHaveLength(1);
  });

  it("writes nothing for a raise without source/reason (degenerate, must not create junk)", () => {
    const projectDir = mkProject();
    const cfg = cfgFor(projectDir);
    commandsForAction({ kind: "raise-to-hil", source: "", reason: "" }, cfg);
    expect(escalationFiles(cfg.consortDir)).toHaveLength(0);
  });
});
