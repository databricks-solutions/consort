// consort-cycle arg-guard: the gate subcommands' --feature/--story contract. Regression for the live-
// caught bug — the SYMMETRIC reconcile-gate is FEATURE-scoped (judges all stories), so it must be exempt
// from the global --story requirement that every per-story subcommand needs; the drive invokes it as
// `consort-cycle reconcile-gate --feature F` (no --story), and the global guard was exiting 2 → HIL.

import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { main } from "../../bin/consort/cycle.cli.js";

const tmpDirs: string[] = [];
function mk(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "cycle-gate-"));
  tmpDirs.push(d);
  return d;
}
afterEach(() => {
  while (tmpDirs.length) {
    const d = tmpDirs.pop();
    if (d) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } }
  }
});

describe("consort-cycle gate arg-guard", () => {
  it("reconcile-gate is FEATURE-scoped: accepts --feature with NO --story (does not exit 2)", async () => {
    const dir = mk();
    // No reconcile verdict on disk → recordReconcileGate reads none → passes + prints, returns 0.
    const code = await main(["reconcile-gate", "--feature", "F1", "--consort-dir", dir]);
    expect(code).toBe(0);
  });

  it("a per-story gate (ia-gate) STILL requires --story (exits 2 without it)", async () => {
    const dir = mk();
    const code = await main(["ia-gate", "--feature", "F1", "--consort-dir", dir]);
    expect(code).toBe(2);
  });

  it("every subcommand still requires --feature", async () => {
    const dir = mk();
    expect(await main(["reconcile-gate", "--consort-dir", dir])).toBe(2);
  });
});
