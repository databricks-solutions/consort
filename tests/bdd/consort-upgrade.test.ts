// The in-flight-safe upgrade core (consort/lakebase/upgrade.ts): the quiesce gate that
// forbids swapping the kit under a running drive, the dual-pin that keeps .local + the
// committed ref in lockstep (no drift), its rollback (instant undo), and the surface
// refresh that brings agents + commands to the target.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { quiesceGate, pinBoth, rollbackPins, refreshSurface } from "../../consort/lakebase/upgrade";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("quiesceGate – only upgrade at a clean stop, never under a running drive", () => {
  it("REFUSES while a drive pid is alive (never hot-swap mid-turn)", () => {
    expect(quiesceGate({ pidAlive: true, atStop: true }).safe).toBe(false);
    expect(quiesceGate({ pidAlive: true, atStop: false }).safe).toBe(false);
  });
  it("ALLOWS when the drive is confirmed DOWN, even if next.json rolled forward (pid-gone is the stop authority)", () => {
    // A completed sprint rolls next.json forward to the next cycle's first step (atStop:false), but
    // with the drive pid gone NOTHING is running — so the upgrade is safe. This is the finished-sprint
    // case the old gate wrongly refused.
    const r = quiesceGate({ pidAlive: false, atStop: false });
    expect(r.safe).toBe(true);
    expect(r.reason).toMatch(/nothing is running|not alive/i);
  });
  it("ALLOWS at a stop with the drive confirmed down", () => {
    expect(quiesceGate({ pidAlive: false, atStop: true }).safe).toBe(true);
  });
  it("REFUSES with liveness UNVERIFIED (no --pid) and next.json not at a clean stop — steer to --pid", () => {
    const r = quiesceGate({ pidAlive: null, atStop: false });
    expect(r.safe).toBe(false);
    expect(r.reason).toMatch(/--pid/);
  });
  it("ALLOWS at a stop with liveness UNVERIFIED (no --pid), but flags it", () => {
    const r = quiesceGate({ pidAlive: null, atStop: true });
    expect(r.safe).toBe(true);
    expect(r.reason).toMatch(/unverified/i);
  });
});

describe("pinBoth + rollbackPins – dual-pin in lockstep, reversible", () => {
  let proj: string;
  beforeEach(() => {
    proj = mkdtempSync(join(tmpdir(), "upgrade-"));
    mkdirSync(join(proj, ".lakebase"), { recursive: true });
  });
  afterEach(() => rmSync(proj, { recursive: true, force: true }));
  const read = (n: string): string | undefined =>
    existsSync(join(proj, ".lakebase", n)) ? readFileSync(join(proj, ".lakebase", n), "utf8").trim() : undefined;

  it("pins .local + committed in LOCKSTEP and records the prior pins for rollback", () => {
    writeFileSync(join(proj, ".lakebase", "kit-ref"), "v0.3.36\n"); // stale committed (the drift)
    writeFileSync(join(proj, ".lakebase", "kit-ref.local"), "v0.3.40\n");
    const r = pinBoth(proj, "v0.3.42");
    expect(read("kit-ref.local")).toBe("v0.3.42");
    expect(read("kit-ref")).toBe("v0.3.42"); // committed moved in lockstep – no more drift
    expect(r.previousLocal).toBe("v0.3.40");
    expect(r.previousCommitted).toBe("v0.3.36");
    expect(r.changed).toBe(true);
    expect(JSON.parse(read("kit-ref.prev")!)).toEqual({ local: "v0.3.40", committed: "v0.3.36" });
  });

  it("rollback restores the prior pins EXACTLY (the instant undo)", () => {
    writeFileSync(join(proj, ".lakebase", "kit-ref"), "v0.3.36\n");
    writeFileSync(join(proj, ".lakebase", "kit-ref.local"), "v0.3.40\n");
    pinBoth(proj, "v0.3.42");
    const rb = rollbackPins(proj);
    expect(rb.restored).toBe(true);
    expect(read("kit-ref.local")).toBe("v0.3.40");
    expect(read("kit-ref")).toBe("v0.3.36");
  });

  it("pinBoth from NO prior pins, then rollback CLEARS both files (back to unpinned)", () => {
    const r = pinBoth(proj, "v0.3.42");
    expect(r.previousLocal).toBeUndefined();
    expect(read("kit-ref.local")).toBe("v0.3.42");
    const rb = rollbackPins(proj);
    expect(rb.restored).toBe(true);
    expect(read("kit-ref.local")).toBeUndefined(); // cleared, not left at the target
    expect(read("kit-ref")).toBeUndefined();
  });

  it("rollback with no kit-ref.prev reports nothing to restore", () => {
    expect(rollbackPins(proj).restored).toBe(false);
  });
});

describe("refreshSurface – brings agents + commands to the target + stamps the sync marker", () => {
  let proj: string;
  beforeEach(() => {
    proj = mkdtempSync(join(tmpdir(), "upgrade-surf-"));
  });
  afterEach(() => rmSync(proj, { recursive: true, force: true }));

  it("refreshes agents + commands + scripts + CI workflows from the kit and stamps the marker", () => {
    const r = refreshSurface(proj, repoRoot, "9.9.9-test");
    expect(r.agents).toBeGreaterThan(0);
    expect(r.commands).toBeGreaterThan(0);
    expect(r.scripts).toBeGreaterThan(0);
    expect(r.workflows).toBeGreaterThan(0);
    expect(existsSync(join(proj, ".claude", "agents", "architect-reviewer.md"))).toBe(true);
    expect(existsSync(join(proj, "scripts", "run-tests.sh"))).toBe(true); // kit-owned helper
    expect(existsSync(join(proj, ".github", "workflows", "merge.yml"))).toBe(true); // CI
    // The marker is set to the target so the next drive's resync sees the surface current.
    expect(readFileSync(join(proj, ".claude", "agents", ".kit-version"), "utf8").trim()).toBe("9.9.9-test");
  });

  it("leaves a project's scm-utils scripts/lk shim untouched (only kit-owned files move)", () => {
    mkdirSync(join(proj, "scripts"), { recursive: true });
    writeFileSync(join(proj, "scripts", "lk"), "#!/usr/bin/env bash\n# project shim\n");
    refreshSurface(proj, repoRoot, "9.9.9-test");
    expect(readFileSync(join(proj, "scripts", "lk"), "utf8")).toContain("# project shim"); // NOT clobbered
    expect(existsSync(join(proj, "scripts", "run-tests.sh"))).toBe(true); // kit helper still refreshed
  });
});
