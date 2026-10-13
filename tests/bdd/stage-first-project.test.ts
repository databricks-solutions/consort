// Hermetic test for the first-project example seed stager (the `lakebase-stage-first-project`
// bin's core). Copies the REAL bundled seed into a temp project's .consort/ and asserts the
// mapping the drive expects: intake at the .consort root + design/, the brand asset alongside
// the brief, and one feature-request.md per seed feature. No network, no Lakebase.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { stageFirstProject, commitStagedSeed } from "../../bin/lakebase/stage-first-project.cli.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SEED_DIR = path.join(REPO_ROOT, "examples", "first-project", "stockflow-seed");

describe("stageFirstProject (first-project example seed stager)", () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "stage-fp-"));
    // A fresh project already has a .consort/ (create-project bootstraps it); mirror that so
    // resolveConsortDir picks it instead of falling back to a legacy name.
    fs.mkdirSync(path.join(projectDir, ".consort"), { recursive: true });
  });
  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it("stages intake into .consort/ and the brand asset alongside the brief", () => {
    const r = stageFirstProject({ projectDir, seedDir: SEED_DIR });
    const c = path.join(projectDir, ".consort");
    for (const rel of [
      "product-overview.md",
      "nfrs.md",
      "design/design-brief.md",
      "design/assets/warehouse.png",
    ]) {
      expect(fs.existsSync(path.join(c, rel)), `${rel} should be staged`).toBe(true);
    }
    // The brief references the icon as `assets/warehouse.png` alongside it, so they must be siblings.
    expect(fs.existsSync(path.join(c, "design", "design-brief.md"))).toBe(true);
    expect(fs.existsSync(path.join(c, "design", "assets", "warehouse.png"))).toBe(true);
    expect(r.staged.length).toBeGreaterThanOrEqual(4);
  });

  it("stages the UX establish design system so a seeded run skips establish (guide + ia skeleton + client CSS)", () => {
    const r = stageFirstProject({ projectDir, seedDir: SEED_DIR });
    const c = path.join(projectDir, ".consort");
    // Canon docs -> .consort/design/ (design-guide.json present => designGuideReady => establish skipped).
    for (const rel of ["design/design-guide.json", "design/design-guide.md", "design/ia.md"]) {
      expect(fs.existsSync(path.join(c, rel)), `${rel} should be staged`).toBe(true);
    }
    // Materialized design system -> client/src/styles/.
    for (const rel of ["client/src/styles/theme.css", "client/src/styles/global.css"]) {
      expect(fs.existsSync(path.join(projectDir, rel)), `${rel} should be staged`).toBe(true);
    }
    // The scaffold's STYLE_GUIDE.md is a general doc, NOT part of the seeded establish output.
    expect(r.staged.some((s) => s.endsWith("STYLE_GUIDE.md"))).toBe(false);
    // ia.md is the establish SKELETON (per-feature screens, no per-story AC refs) so per-story IA refine still runs.
    const ia = fs.readFileSync(path.join(c, "design", "ia.md"), "utf8");
    expect(ia).toContain("## Screens");
    expect(/\(S\d\)|AC\d/.test(ia), "seeded ia.md must be the skeleton (no per-story AC refs)").toBe(false);
  });

  it("stages one feature-request.md per seed feature, at features/<id>/feature-request.md", () => {
    const r = stageFirstProject({ projectDir, seedDir: SEED_DIR });
    // Every seed feature-request lands under its own feature dir.
    expect(r.features).toContain("F1-stock-visibility");
    expect(r.features).toContain("F6-split-tracking-code");
    for (const f of r.features) {
      const fr = path.join(projectDir, ".consort", "features", f, "feature-request.md");
      expect(fs.existsSync(fr), `${f}/feature-request.md should exist`).toBe(true);
    }
    // Spot-check that content copied verbatim: F6 carries the DROP requirement (the seed fix).
    const f6 = fs.readFileSync(
      path.join(projectDir, ".consort", "features", "F6-split-tracking-code", "feature-request.md"),
      "utf8",
    );
    expect(f6.toLowerCase()).toContain("drop");
    expect(f6).toContain("tracking_code");
  });

  it("stages the pre-registration to .consort/registration.json (activates the registered-breakdown guard)", () => {
    const r = stageFirstProject({ projectDir, seedDir: SEED_DIR });
    const regPath = path.join(projectDir, ".consort", "registration.json");
    expect(fs.existsSync(regPath), "registration.json should be staged").toBe(true);
    expect(r.staged.some((s) => s.endsWith("registration.json"))).toBe(true);
    const reg = JSON.parse(fs.readFileSync(regPath, "utf8"));
    // The canonical F1 breakdown the guard enforces against (matches the recorded corpus).
    expect(reg.feature_id).toBe("F1-stock-visibility");
    expect(reg.stories.map((s: { id: string }) => s.id)).toEqual([
      "S1-file-stock",
      "S2-stock-by-location-table",
      "S3-sku-detail-view",
    ]);
  });

  it("does NOT stage feature-proposals (the Spec Author regenerates them in /plan)", () => {
    stageFirstProject({ projectDir, seedDir: SEED_DIR });
    expect(fs.existsSync(path.join(projectDir, ".consort", "planning", "feature-proposals.md"))).toBe(false);
  });

  it("throws a clear error when the bundled seed is missing (packaging fault)", () => {
    expect(() => stageFirstProject({ projectDir, seedDir: path.join(projectDir, "nope") })).toThrow(
      /seed not found/,
    );
  });

  it("is idempotent (re-staging overwrites without error)", () => {
    stageFirstProject({ projectDir, seedDir: SEED_DIR });
    expect(() => stageFirstProject({ projectDir, seedDir: SEED_DIR })).not.toThrow();
  });
});

describe("commitStagedSeed (first fork sees a clean tree)", () => {
  let projectDir: string;
  const git = (...a: string[]): string =>
    execFileSync("git", a, { cwd: projectDir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

  afterEach(() => {
    if (projectDir) fs.rmSync(projectDir, { recursive: true, force: true });
  });

  /** A git repo with one initial commit, mirroring the scaffold the stager runs against. */
  function gitProject(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "commit-seed-"));
    execFileSync("git", ["init", "-q"], { cwd: dir });
    execFileSync("git", ["config", "user.email", "t@example.com"], { cwd: dir });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
    fs.writeFileSync(path.join(dir, "README.md"), "# scaffold\n");
    execFileSync("git", ["add", "README.md"], { cwd: dir });
    execFileSync("git", ["commit", "-qm", "initial"], { cwd: dir });
    return dir;
  }

  it("commits exactly the staged seed paths and leaves a clean tree", () => {
    projectDir = gitProject();
    const r = stageFirstProject({ projectDir, seedDir: SEED_DIR });
    const res = commitStagedSeed(projectDir, r.staged);
    expect(res.committed).toBe(true);
    // the staged files are now tracked at HEAD
    const tracked = git("ls-files").split("\n").filter(Boolean);
    for (const rel of r.staged) expect(tracked, `${rel} should be committed`).toContain(rel);
    // and the work tree is clean, so the first `/design <F>` fork is not refused
    expect(git("status", "--porcelain").trim()).toBe("");
    // the seed landed in a single scoped commit
    expect(git("log", "-1", "--format=%s").trim()).toMatch(/stage StockFlow first-project seed/);
  });

  it("is a no-op (not an error) when there is nothing to commit (idempotent re-stage)", () => {
    projectDir = gitProject();
    const r = stageFirstProject({ projectDir, seedDir: SEED_DIR });
    commitStagedSeed(projectDir, r.staged); // first commit
    stageFirstProject({ projectDir, seedDir: SEED_DIR }); // re-copy: byte-identical, no diff
    const res = commitStagedSeed(projectDir, r.staged);
    expect(res.committed).toBe(false);
    expect(res.reason).toMatch(/no changes/);
  });

  it("is a no-op (not an error) outside a git work tree", () => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "commit-seed-nogit-"));
    fs.mkdirSync(path.join(projectDir, ".consort"), { recursive: true });
    const r = stageFirstProject({ projectDir, seedDir: SEED_DIR });
    const res = commitStagedSeed(projectDir, r.staged);
    expect(res.committed).toBe(false);
    expect(res.reason).toMatch(/not a git work tree/);
  });
});
