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
    // Generalized root-file copy: the kit-owned common/ root CODE files land at the project root (the
    // gap that shipped projects missing the test-capture files). The list is read from the kit dir,
    // never enumerated, so a new kit root file flows automatically.
    expect(r.rootFiles).toEqual(expect.arrayContaining(["consort-capture.ts", "consort-test-reporter.ts"]));
    expect(existsSync(join(proj, "consort-capture.ts"))).toBe(true); // root kit file copied to the project root
    expect(existsSync(join(proj, "consort-test-reporter.ts"))).toBe(true);
    // Project-owned config / scaffold-source files are deliberately NOT copied (would clobber the project).
    expect(r.rootFiles).not.toContain("deploy-targets.yaml");
    expect(existsSync(join(proj, "deploy-targets.yaml"))).toBe(false);
    // playwright.config.ts is E2E-config OWNED by enableE2eForProject (not a blanket root file): a
    // ROOT copy is vestigial for a client/-based project and breaks CI ("Cannot find @playwright/test").
    // It must NOT be blanket-copied to the root here.
    expect(r.rootFiles).not.toContain("playwright.config.ts");
    expect(existsSync(join(proj, "playwright.config.ts"))).toBe(false);
    // The marker is set to the target so the next drive's resync sees the surface current.
    expect(readFileSync(join(proj, ".claude", "agents", ".kit-version"), "utf8").trim()).toBe("9.9.9-test");
  });

  // Self-heal: a pre-fix kit blanket-copied a ROOT playwright.config.ts onto client/-based projects,
  // which breaks CI (root E2E fires on the config's presence but there's no root @playwright/test).
  // Not copying it (above) only helps fresh scaffolds; refreshSurface must REMOVE a stale one so
  // consort-upgrade cleans up already-contaminated projects. Only for a client/ project — a root-app
  // project keeps its root config (enableE2eForProject owns it there).
  it("self-heals a stale root playwright.config.ts on a client/ project (removed), but keeps it on a root-app project", () => {
    // client project with a stale root config
    mkdirSync(join(proj, "client"), { recursive: true });
    writeFileSync(join(proj, "client", "package.json"), JSON.stringify({ name: "c" }));
    writeFileSync(join(proj, "playwright.config.ts"), "// stale root config\n");
    const r = refreshSurface(proj, repoRoot, "9.9.9-test");
    expect(r.removedRootFiles).toContain("playwright.config.ts");
    expect(existsSync(join(proj, "playwright.config.ts"))).toBe(false); // removed

    // root-app project (no client/): a root config is legitimate → NOT removed
    const rootApp = mkdtempSync(join(tmpdir(), "upgrade-rootapp-"));
    writeFileSync(join(rootApp, "playwright.config.ts"), "// legit root-app config\n");
    const r2 = refreshSurface(rootApp, repoRoot, "9.9.9-test");
    expect(r2.removedRootFiles).not.toContain("playwright.config.ts");
    expect(existsSync(join(rootApp, "playwright.config.ts"))).toBe(true); // kept
    rmSync(rootApp, { recursive: true, force: true });
  });

  // Regression: the `.claude/skills/` tree was laid down at scaffold by install.sh and NEVER
  // refreshed on upgrade, so a kit fix that landed in `.claude/agents/<role>.md` (updateAgents) left
  // the parallel skill-doc copy `.claude/skills/consort/agents/<role>.md` frozen at the scaffolded
  // version — the two drifted out of sync. refreshSurface must now also refresh the kit-owned skills
  // subtree so BOTH navigator copies move together.
  it("refreshes the .claude/skills/ tree so the skills navigator copy matches the kit (not frozen at scaffold)", () => {
    // Simulate a stale scaffolded skills copy that an old upgrade would have left behind.
    const skillNav = join(proj, ".claude", "skills", "consort", "agents", "navigator.md");
    mkdirSync(dirname(skillNav), { recursive: true });
    writeFileSync(skillNav, "STALE scaffolded navigator with postgresql://u:p@dbhost.invalid\n");
    const r = refreshSurface(proj, repoRoot, "9.9.9-test");
    expect(r.skills).toBeGreaterThan(0);
    const refreshed = readFileSync(skillNav, "utf8");
    const kitNav = readFileSync(join(repoRoot, "skills", "consort", "agents", "navigator.md"), "utf8");
    expect(refreshed).toBe(kitNav); // refreshed FROM the kit, no longer the stale scaffold copy
    expect(refreshed).not.toContain("u:p@dbhost.invalid"); // the stale literal is gone
  });

  it("leaves a project's scm-utils scripts/lk shim untouched (only kit-owned files move)", () => {
    mkdirSync(join(proj, "scripts"), { recursive: true });
    writeFileSync(join(proj, "scripts", "lk"), "#!/usr/bin/env bash\n# project shim\n");
    refreshSurface(proj, repoRoot, "9.9.9-test");
    expect(readFileSync(join(proj, "scripts", "lk"), "utf8")).toContain("# project shim"); // NOT clobbered
    expect(existsSync(join(proj, "scripts", "run-tests.sh"))).toBe(true); // kit helper still refreshed
  });

  it("moves the SUBSTRATE pin in lockstep: writes .lakebase/scm-utils-ref{,.local} to the version this kit ships", () => {
    // The split-version defect: consort-upgrade bumped only the kit, leaving the local scm-utils
    // pin at the scaffolded/seeded version, so ./scripts/lk kept resolving the OLD substrate (its
    // CI-auth + pipeline.json-gitignore fixes absent). refreshSurface must now pin both scm-utils
    // refs to the version consort depends on, matching the workflows + a fresh scaffold.
    const dep = (JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as { dependencies?: Record<string, string> })
      .dependencies?.["@databricks-solutions/lakebase-scm-utils"] ?? "";
    const expected = "v" + (dep.match(/#v?(\d+\.\d+\.\d+)/)?.[1] ?? dep.match(/^\D*(\d+\.\d+\.\d+)/)?.[1] ?? "");
    expect(expected).toMatch(/^v\d+\.\d+\.\d+$/); // the kit pins an exact scm-utils version
    refreshSurface(proj, repoRoot, "9.9.9-test");
    expect(readFileSync(join(proj, ".lakebase", "scm-utils-ref"), "utf8").trim()).toBe(expected);
    expect(readFileSync(join(proj, ".lakebase", "scm-utils-ref.local"), "utf8").trim()).toBe(expected);
  });
});
