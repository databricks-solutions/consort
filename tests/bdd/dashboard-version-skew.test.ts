// The dashboard launcher must never reuse a server running a DIFFERENT kit bundle than the one
// now launching: a long-lived server started before a `consort-upgrade` keeps serving the OLD
// dashboard bundle, so an upgraded project (e.g. v0.3.106) could be viewed through the pre-fix
// v0.3.102 UI. runningRecord(expectVersion) rejects the mismatch; staleServer finds it to replace.
// Hermetic: a REAL listening port (so the port-probe passes) + this process's own pid (alive).

import { describe, it, expect, afterEach } from "vitest";
import { createServer, type Server } from "node:net";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { writeRecord, runningRecord, staleServer } from "../../bin/consort/dashboard.cli";

const servers: Server[] = [];
const dirs: string[] = [];
afterEach(() => {
  for (const s of servers.splice(0)) s.close();
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

/** A real TCP listener on 127.0.0.1 so the launcher's port-probe (waitListening) succeeds. */
function listen(): Promise<number> {
  return new Promise((resolve) => {
    const srv = createServer();
    servers.push(srv);
    srv.listen(0, "127.0.0.1", () => resolve((srv.address() as { port: number }).port));
  });
}

function tmpProject(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "dash-skew-"));
  dirs.push(d);
  return d;
}

describe("dashboard launcher — version skew", () => {
  it("rejects a running server on a DIFFERENT kit version (reused only on a match)", async () => {
    const projectDir = tmpProject();
    const port = await listen();
    // A server recorded as the OLD bundle, genuinely alive (our pid) + answering (the port above).
    writeRecord(projectDir, { pid: process.pid, port, host: "127.0.0.1", url: `http://127.0.0.1:${port}/`, startedAt: new Date().toISOString(), version: "0.3.102" });

    // The current launch is v0.3.106 → the v0.3.102 server is NOT "the running one".
    expect(await runningRecord(projectDir, "0.3.106")).toBeNull();
    // …and it's identified as the stale server to replace.
    const stale = await staleServer(projectDir, "0.3.106");
    expect(stale?.version).toBe("0.3.102");
    // A launch on the SAME version reuses it (no needless relaunch).
    expect((await runningRecord(projectDir, "0.3.102"))?.port).toBe(port);
    // No stale server when the versions already match.
    expect(await staleServer(projectDir, "0.3.102")).toBeNull();
  });

  it("treats a legacy record with NO version as a mismatch (so it gets replaced, not reused)", async () => {
    const projectDir = tmpProject();
    const port = await listen();
    // Records written before the version field existed (exactly the my-stockflow-5 case).
    writeRecord(projectDir, { pid: process.pid, port, host: "127.0.0.1", url: `http://127.0.0.1:${port}/`, startedAt: new Date().toISOString() });
    expect(await runningRecord(projectDir, "0.3.106")).toBeNull();
    expect((await staleServer(projectDir, "0.3.106"))?.port).toBe(port);
  });

  it("version-agnostic lookup still finds any live server (back-compat callers)", async () => {
    const projectDir = tmpProject();
    const port = await listen();
    writeRecord(projectDir, { pid: process.pid, port, host: "127.0.0.1", url: `http://127.0.0.1:${port}/`, startedAt: new Date().toISOString(), version: "0.3.102" });
    expect((await runningRecord(projectDir))?.port).toBe(port);
  });
});
