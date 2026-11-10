// Coverage for the .claude/agents/*.md refresher (updateAgents). Pure
// filesystem against tmpdir projects; no live Lakebase. The point: a kit
// bugfix to a role prompt MUST reach an already-scaffolded project, unlike the
// create-time copyMissingMd (which skips existing files), updateAgents
// force-overwrites a drifted agent by default.

import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { updateAgents } from "../../consort/lakebase/update-agents.js";
import { resyncAgentsOnKitDrift } from "../../consort/setup/project-consort-setup.js";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const KIT_AGENTS_DIR = path.join(REPO_ROOT, "skills", "consort", "agents");

const tmpDirs: string[] = [];
afterEach(() => {
  while (tmpDirs.length) {
    const dir = tmpDirs.pop();
    if (dir) try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
  }
});

function mkProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "upd-agents-"));
  tmpDirs.push(dir);
  return dir;
}

function projectAgentsDir(p: string): string {
  return path.join(p, ".claude", "agents");
}

const kitDba = (): string => fs.readFileSync(path.join(KIT_AGENTS_DIR, "dba.md"), "utf-8");

describe("updateAgents: refresh scaffolded .claude/agents/ from the kit", () => {
  it("force-overwrites a DRIFTED (stale) agent def by default – the bugfix reaches the project", () => {
    const p = mkProject();
    fs.mkdirSync(projectAgentsDir(p), { recursive: true });
    fs.writeFileSync(path.join(projectAgentsDir(p), "dba.md"), "STALE buggy dba prompt\n");

    const res = updateAgents({ projectDir: p });
    expect(res.changed).toBe(true);
    expect(res.files.find((f) => f.name === "dba.md")?.outcome).toBe("updated");
    // The project now carries the current kit def, not the stale copy.
    expect(fs.readFileSync(path.join(projectAgentsDir(p), "dba.md"), "utf-8")).toBe(kitDba());
  });

  it("ADDS an agent the project is missing", () => {
    const p = mkProject();
    fs.mkdirSync(projectAgentsDir(p), { recursive: true });
    // project has only dba.md (current); everything else is missing
    fs.writeFileSync(path.join(projectAgentsDir(p), "dba.md"), kitDba());

    const res = updateAgents({ projectDir: p });
    expect(res.files.some((f) => f.name === "navigator.md" && f.outcome === "added")).toBe(true);
    expect(fs.existsSync(path.join(projectAgentsDir(p), "navigator.md"))).toBe(true);
  });

  it("reports UNCHANGED when the project already matches the kit (idempotent)", () => {
    const p = mkProject();
    updateAgents({ projectDir: p }); // first pass seeds everything
    const res = updateAgents({ projectDir: p }); // second pass
    expect(res.changed).toBe(false);
    expect(res.files.every((f) => f.outcome === "unchanged")).toBe(true);
  });

  it("dryRun reports the update but writes nothing", () => {
    const p = mkProject();
    fs.mkdirSync(projectAgentsDir(p), { recursive: true });
    fs.writeFileSync(path.join(projectAgentsDir(p), "dba.md"), "STALE\n");

    const res = updateAgents({ projectDir: p, dryRun: true });
    expect(res.files.find((f) => f.name === "dba.md")?.outcome).toBe("updated");
    // Not written.
    expect(fs.readFileSync(path.join(projectAgentsDir(p), "dba.md"), "utf-8")).toBe("STALE\n");
  });

  it("force:false PRESERVES a drifted agent (project-local edit kept)", () => {
    const p = mkProject();
    fs.mkdirSync(projectAgentsDir(p), { recursive: true });
    fs.writeFileSync(path.join(projectAgentsDir(p), "dba.md"), "LOCALLY EDITED\n");

    const res = updateAgents({ projectDir: p, force: false });
    expect(res.files.find((f) => f.name === "dba.md")?.outcome).toBe("preserved");
    expect(fs.readFileSync(path.join(projectAgentsDir(p), "dba.md"), "utf-8")).toBe("LOCALLY EDITED\n");
  });

  it("creates .claude/agents/ when the project lacks it entirely", () => {
    const p = mkProject();
    const res = updateAgents({ projectDir: p });
    expect(res.changed).toBe(true);
    expect(fs.existsSync(projectAgentsDir(p))).toBe(true);
    expect(res.files.every((f) => f.outcome === "added")).toBe(true);
  });
});

describe("resyncAgentsOnKitDrift: version-aware auto refresh", () => {
  const markerPath = (p: string) => path.join(projectAgentsDir(p), ".kit-version");

  it("refreshes when the stored marker differs from the current kit version, then records it", () => {
    const p = mkProject();
    fs.mkdirSync(projectAgentsDir(p), { recursive: true });
    fs.writeFileSync(path.join(projectAgentsDir(p), "dba.md"), "STALE\n");
    fs.writeFileSync(markerPath(p), "0.0.1-old\n"); // pretend an older kit synced it

    const r = resyncAgentsOnKitDrift(p);
    expect(r.refreshed).toBe(true);
    expect(r.from).toBe("0.0.1-old");
    // dba.md now matches the current kit; marker updated to the current version.
    expect(fs.readFileSync(path.join(projectAgentsDir(p), "dba.md"), "utf-8")).toBe(kitDba());
    expect(fs.readFileSync(markerPath(p), "utf-8").trim()).toBe(r.to);
  });

  it("ALSO refreshes kit-owned CLIENT instrumentation (setup.ts) on the same drift trigger, not just agents", () => {
    const p = mkProject();
    fs.mkdirSync(projectAgentsDir(p), { recursive: true });
    fs.writeFileSync(markerPath(p), "0.0.1-old\n"); // drift
    // A client project whose setup.ts is STALE (missing asyncUtilTimeout — the F9 CI gap).
    fs.mkdirSync(path.join(p, "client", "tests"), { recursive: true });
    fs.writeFileSync(path.join(p, "client", "package.json"), "{}");
    fs.writeFileSync(path.join(p, "client", "tests", "setup.ts"), "// STALE setup — no asyncUtilTimeout\n");

    const r = resyncAgentsOnKitDrift(p);
    expect(r.refreshed).toBe(true);
    // The drift now propagates the kit-owned client instrumentation too — no explicit consort-upgrade.
    const setup = fs.readFileSync(path.join(p, "client", "tests", "setup.ts"), "utf-8");
    expect(setup).not.toContain("STALE setup");
    expect(setup).toContain("asyncUtilTimeout"); // the fix reaches the project via a plain drive kit-move
  });

  it("is a no-op when the marker already matches the current kit version", () => {
    const p = mkProject();
    // First call seeds + writes the marker at the current version.
    const first = resyncAgentsOnKitDrift(p);
    expect(first.refreshed).toBe(true);
    // Corrupt an agent, then re-run: same version => NO refresh (marker matches).
    fs.writeFileSync(path.join(projectAgentsDir(p), "dba.md"), "LOCAL EDIT\n");
    const second = resyncAgentsOnKitDrift(p);
    expect(second.refreshed).toBe(false);
    expect(fs.readFileSync(path.join(projectAgentsDir(p), "dba.md"), "utf-8")).toBe("LOCAL EDIT\n");
  });

  it("refreshes once when no marker exists yet (older scaffold)", () => {
    const p = mkProject();
    fs.mkdirSync(projectAgentsDir(p), { recursive: true });
    fs.writeFileSync(path.join(projectAgentsDir(p), "dba.md"), "STALE\n");
    // no marker file at all
    const r = resyncAgentsOnKitDrift(p);
    expect(r.refreshed).toBe(true);
    expect(fs.readFileSync(path.join(projectAgentsDir(p), "dba.md"), "utf-8")).toBe(kitDba());
  });

  it("COMMITS the refreshed surface in a git repo, leaving a clean tree for the next fork", () => {
    // The drift-resync re-writes tracked .claude/agents; without committing them the run's next
    // experiment/feature fork refuses to fork a dirty tree (the crash after a branch checkout
    // drifted the committed surface from the run pin). It must commit so the tree stays clean.
    const p = mkProject();
    execFileSync("git", ["-C", p, "init", "-q"]);
    execFileSync("git", ["-C", p, "config", "user.email", "t@t"]);
    execFileSync("git", ["-C", p, "config", "user.name", "t"]);
    fs.mkdirSync(projectAgentsDir(p), { recursive: true });
    fs.writeFileSync(path.join(projectAgentsDir(p), "dba.md"), "STALE\n");
    fs.writeFileSync(markerPath(p), "0.0.1-old\n");
    // A client project with a STALE setup.ts committed at baseline — the refreshed instrumentation must be
    // COMMITTED too (threaded as extraPaths), else it sits uncommitted and the promote push never carries
    // it to CI (the F9 "No Items to push" failure).
    fs.mkdirSync(path.join(p, "client", "tests"), { recursive: true });
    fs.writeFileSync(path.join(p, "client", "package.json"), "{}");
    fs.writeFileSync(path.join(p, "client", "tests", "setup.ts"), "// STALE setup — no asyncUtilTimeout\n");
    execFileSync("git", ["-C", p, "add", "-A"]);
    execFileSync("git", ["-C", p, "commit", "-q", "-m", "baseline"]);

    const r = resyncAgentsOnKitDrift(p);
    expect(r.refreshed).toBe(true);
    expect(r.committed).toBe(true);
    // No uncommitted tracked .claude/agents remain – the fork guard would NOT refuse.
    const dirty = execFileSync("git", ["-C", p, "status", "--porcelain", "--", ".claude/agents"], { encoding: "utf8" }).trim();
    expect(dirty).toBe("");
    // The refreshed client setup.ts is COMMITTED (clean working tree) with the kit's fix — so a subsequent
    // push carries it to CI, not left dangling in the working tree.
    const setupDirty = execFileSync("git", ["-C", p, "status", "--porcelain", "--", "client/tests/setup.ts"], { encoding: "utf8" }).trim();
    expect(setupDirty).toBe("");
    const committedSetup = execFileSync("git", ["-C", p, "show", "HEAD:client/tests/setup.ts"], { encoding: "utf8" });
    expect(committedSetup).toContain("asyncUtilTimeout");
    expect(committedSetup).not.toContain("STALE setup");
  });

  it("still refreshes (no throw) when the project is NOT a git repo – commit is a no-op", () => {
    const p = mkProject();
    fs.mkdirSync(projectAgentsDir(p), { recursive: true });
    fs.writeFileSync(path.join(projectAgentsDir(p), "dba.md"), "STALE\n");
    fs.writeFileSync(markerPath(p), "0.0.1-old\n");
    const r = resyncAgentsOnKitDrift(p);
    expect(r.refreshed).toBe(true);
    expect(r.committed).toBe(false); // not-a-git-repo => no-op, but the refresh still happened
    expect(fs.readFileSync(path.join(projectAgentsDir(p), "dba.md"), "utf-8")).toBe(kitDba());
  });
});
