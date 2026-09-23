// BDD coverage for stale green-failure invalidation on resume (issue #202): a
// green-failure.json recorded against a working tree that has since CHANGED (a fix
// landed – a new commit, or uncommitted code edits) must be deleted on read, so the
// drive re-verifies FRESH instead of re-raising an already-fixed defect. Records
// from older kits (no treeState) are kept as-is.

import { describe, it, expect, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  greenFailureJson,
  needsGreenAssess,
  readGreenFailure,
  writeGreenFailure,
} from "../../consort/smells/supersession.js";

const tmpDirs: string[] = [];
function mkRepo(): { project: string; tdd: string } {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "stale-green-failure-"));
  tmpDirs.push(project);
  const git = (args: string[]) => execFileSync("git", args, { cwd: project, stdio: "ignore" });
  git(["init", "-b", "main"]);
  git(["config", "user.email", "test@example.com"]);
  git(["config", "user.name", "test"]);
  fs.writeFileSync(path.join(project, "app.py"), "# app\n");
  git(["add", "-A"]);
  git(["commit", "-m", "base"]);
  return { project, tdd: path.join(project, ".sftdd") };
}
afterEach(() => {
  while (tmpDirs.length) {
    const dir = tmpDirs.pop();
    if (dir) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
    }
  }
});

const F = "F1";
const S = "S1";
const AC = "AC1";

function gitIn(project: string, args: string[]): void {
  execFileSync("git", args, { cwd: project, stdio: "ignore" });
}

describe("green-failure tree-state stamping + staleness (issue #202)", () => {
  it("writeGreenFailure stamps the tree state (HEAD + code-diff fingerprint)", () => {
    const { tdd } = mkRepo();
    writeGreenFailure(tdd, F, S, AC, { summary: "verify failed" });
    const gf = readGreenFailure(tdd, F, S, AC);
    expect(gf?.treeState?.headSha).toMatch(/^[0-9a-f]{40}$/);
    expect(gf?.treeState?.dirtySha).toMatch(/^[0-9a-f]{40}$/);
  });

  it("an UNCHANGED tree keeps the marker live (no false invalidation)", () => {
    const { tdd } = mkRepo();
    writeGreenFailure(tdd, F, S, AC, { summary: "verify failed" });
    expect(needsGreenAssess(tdd, F, S, AC)).toBe(true);
  });

  it("a NEW COMMIT after the record invalidates it (deleted on read, reads as no-failure)", () => {
    const { project, tdd } = mkRepo();
    writeGreenFailure(tdd, F, S, AC, { summary: "verify failed" });
    // The fix lands (committed).
    fs.writeFileSync(path.join(project, "app.py"), "# app\n# fixed\n");
    gitIn(project, ["add", "-A"]);
    gitIn(project, ["commit", "-m", "the fix"]);
    expect(needsGreenAssess(tdd, F, S, AC)).toBe(false);
    expect(fs.existsSync(greenFailureJson(tdd, F, S, AC))).toBe(false);
  });

  it("an UNCOMMITTED code edit after the record also invalidates it", () => {
    const { project, tdd } = mkRepo();
    writeGreenFailure(tdd, F, S, AC, { summary: "verify failed" });
    fs.writeFileSync(path.join(project, "app.py"), "# app\n# fixed but not committed\n");
    expect(readGreenFailure(tdd, F, S, AC)).toBeUndefined();
  });

  it("RUNTIME-ARTIFACT churn alone does NOT invalidate (drive metadata changes every turn)", () => {
    const { project, tdd } = mkRepo();
    writeGreenFailure(tdd, F, S, AC, { summary: "verify failed" });
    // Drive churn: cycle records + workflow state + a new untracked artifact dir entry.
    fs.mkdirSync(path.join(project, ".sftdd", "cycles", F, S), { recursive: true });
    fs.writeFileSync(path.join(project, ".sftdd", "cycles", F, S, "green-failure.log"), "turn output\n");
    fs.mkdirSync(path.join(project, ".lakebase"), { recursive: true });
    fs.writeFileSync(path.join(project, ".lakebase", "workflow-state.json"), "{}\n");
    expect(needsGreenAssess(tdd, F, S, AC)).toBe(true);
  });

  it("a record WITHOUT treeState (an older kit wrote it) is kept as-is (back-compat)", () => {
    const { project, tdd } = mkRepo();
    const file = greenFailureJson(tdd, F, S, AC);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ summary: "legacy record", assessed: false }) + "\n");
    fs.writeFileSync(path.join(project, "app.py"), "# changed\n");
    gitIn(project, ["add", "-A"]);
    gitIn(project, ["commit", "-m", "changed"]);
    expect(needsGreenAssess(tdd, F, S, AC)).toBe(true); // no staleness judgment
  });

  it("a FRESH failure after invalidation re-records against the NEW tree state", () => {
    const { project, tdd } = mkRepo();
    writeGreenFailure(tdd, F, S, AC, { summary: "verify failed" });
    fs.writeFileSync(path.join(project, "app.py"), "# v2\n");
    gitIn(project, ["add", "-A"]);
    gitIn(project, ["commit", "-m", "v2"]);
    expect(readGreenFailure(tdd, F, S, AC)).toBeUndefined();
    // The still-real failure re-records: stamped with the NEW head.
    writeGreenFailure(tdd, F, S, AC, { summary: "verify failed again" });
    const gf = readGreenFailure(tdd, F, S, AC);
    expect(gf?.treeState?.headSha).toBe(
      execFileSync("git", ["rev-parse", "HEAD"], { cwd: project, encoding: "utf8" }).trim(),
    );
    expect(needsGreenAssess(tdd, F, S, AC)).toBe(true);
  });
});
