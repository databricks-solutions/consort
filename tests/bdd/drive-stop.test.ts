// BDD coverage for consort-drive --stop (issue #204.3): halting a drive must kill
// the REAL orchestrator + its whole process tree (executor children included),
// never a launcher pid. The drive records its own pid in .consort/drive.pid;
// --stop reads it, tree-kills it, and cleans up; a stale/absent pid file is a
// clean no-op, not an error.

import { describe, it, expect, afterEach } from "vitest";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { drivePidPath, stopDrive, writeDrivePid } from "../../bin/consort/drive.cli.js";

const tmpDirs: string[] = [];
function mkConsort(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "drive-stop-"));
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

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function plantPid(consortDir: string, pid: number): void {
  fs.mkdirSync(consortDir, { recursive: true });
  fs.writeFileSync(drivePidPath(consortDir), JSON.stringify({ pid }) + "\n");
}

describe("writeDrivePid", () => {
  it("records THIS process's own pid", () => {
    const consortDir = mkConsort();
    writeDrivePid(consortDir);
    const rec = JSON.parse(fs.readFileSync(drivePidPath(consortDir), "utf8")) as { pid: number };
    expect(rec.pid).toBe(process.pid);
  });
});

describe("stopDrive", () => {
  it("kills the recorded live pid (whole tree) + removes the pid file, exit 0", async () => {
    const consortDir = mkConsort();
    const sleeper = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
    expect(sleeper.pid).toBeDefined();
    plantPid(consortDir, sleeper.pid!);
    await new Promise((r) => setTimeout(r, 100));

    const rc = await stopDrive(consortDir);

    expect(rc).toBe(0);
    // tree-kill delivers the signal; death is async – poll for the exit.
    const deadline = Date.now() + 3000;
    while (alive(sleeper.pid!) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(alive(sleeper.pid!)).toBe(false);
    expect(fs.existsSync(drivePidPath(consortDir))).toBe(false);
  });

  it("a STALE pid file (dead pid) is a clean no-op: file removed, exit 0", async () => {
    const consortDir = mkConsort();
    const sleeper = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
    const deadPid = sleeper.pid!;
    sleeper.kill("SIGKILL");
    await new Promise((r) => setTimeout(r, 100));
    plantPid(consortDir, deadPid);

    const rc = await stopDrive(consortDir);

    expect(rc).toBe(0);
    expect(fs.existsSync(drivePidPath(consortDir))).toBe(false);
  });

  it("no pid file at all -> exit 1 (nothing to stop)", async () => {
    expect(await stopDrive(mkConsort())).toBe(1);
  });
});
