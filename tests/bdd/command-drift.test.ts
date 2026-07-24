// Coverage for the .claude/commands/*.md drift detector and the
// detectScaffoldedDrift umbrella that unifies workflow + command
// surfaces. Pure filesystem; no live Lakebase.

import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  detectCommandDrift,
  detectScaffoldedDrift,
} from "@databricks-solutions/lakebase-scm-utils/lakebase";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const KIT_COMMANDS_DIR = path.join(
  REPO_ROOT,
  "templates",
  "project",
  "common",
  ".claude",
  "commands"
);

const tmpDirs: string[] = [];
afterEach(() => {
  while (tmpDirs.length) {
    const dir = tmpDirs.pop();
    if (dir) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }
});

function mkProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "feip7424-"));
  tmpDirs.push(dir);
  fs.mkdirSync(path.join(dir, ".claude", "commands"), { recursive: true });
  fs.mkdirSync(path.join(dir, ".github", "workflows"), { recursive: true });
  return dir;
}

function kitVersion(): string {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
  return pkg.version as string;
}

function deployCommand(projectDir: string, name: string, pinnedVersion?: string): void {
  const src = path.join(KIT_COMMANDS_DIR, name);
  const dst = path.join(projectDir, ".claude", "commands", name);
  const version = pinnedVersion ?? kitVersion();
  const content = fs.readFileSync(src, "utf8").replace(/\$\{KIT_VERSION_AT_SCAFFOLD\}/g, version);
  fs.writeFileSync(dst, content);
}

// A real scaffold resolves {{LAKEBASE_KIT_VERSION}} in the workflow templates as
// it writes them; the fixture must do the same so the umbrella's workflow
// surface reads "unchanged" (detect substitutes before comparing).
function deployWorkflow(projectDir: string, name: string): void {
  const src = path.join(
    REPO_ROOT, "templates", "project", "common", ".github", "workflows", name
  );
  const dst = path.join(projectDir, ".github", "workflows", name);
  const content = fs
    .readFileSync(src, "utf8")
    .replace(/\{\{LAKEBASE_KIT_VERSION\}\}/g, kitVersion());
  fs.writeFileSync(dst, content);
}

describe("detectCommandDrift", () => {
  it("reports overall=ok when plan.md, design.md, build.md, and deploy.md match the kit", () => {
    const dir = mkProject();
    deployCommand(dir, "sprint.md");
    deployCommand(dir, "plan.md");
    deployCommand(dir, "design.md");
    deployCommand(dir, "build.md");
    deployCommand(dir, "deploy.md");
    deployCommand(dir, "spike.md");
    const report = detectCommandDrift({ kitDir: REPO_ROOT, projectDir: dir });
    expect(report.overall).toBe("ok");
    const byName = (n: string) => report.files.find((f) => f.name === n)!;
    expect(byName("design.md").status).toBe("unchanged");
    expect(byName("design.md").pinned_version).toBe(kitVersion());
    expect(byName("design.md").kit_version).toBe(kitVersion());
    expect(byName("build.md").status).toBe("unchanged");
  });

  it("detects drift when the project has customized the command body", () => {
    const dir = mkProject();
    deployCommand(dir, "design.md");
    deployCommand(dir, "build.md");
    const customized = fs
      .readFileSync(path.join(dir, ".claude", "commands", "design.md"), "utf8")
      .replace("# /design", "# /design (project-customized)");
    fs.writeFileSync(path.join(dir, ".claude", "commands", "design.md"), customized);
    const report = detectCommandDrift({ kitDir: REPO_ROOT, projectDir: dir });
    expect(report.overall).toBe("drift");
    const design = report.files.find((f) => f.name === "design.md")!;
    expect(design.status).toBe("drifted");
    expect(design.diff).toBeTruthy();
    expect(design.diff).toMatch(/project-customized/);
  });

  it("does not flag drift when only the pinned kit version differs (version-pin neutralized)", () => {
    const dir = mkProject();
    // Project was scaffolded against an older kit version.
    deployCommand(dir, "sprint.md", "0.1.0-old");
    deployCommand(dir, "plan.md", "0.1.0-old");
    deployCommand(dir, "design.md", "0.1.0-old");
    deployCommand(dir, "build.md", "0.1.0-old");
    deployCommand(dir, "deploy.md", "0.1.0-old");
    deployCommand(dir, "spike.md", "0.1.0-old");
    const report = detectCommandDrift({ kitDir: REPO_ROOT, projectDir: dir });
    expect(report.overall).toBe("ok");
    const design = report.files.find((f) => f.name === "design.md")!;
    expect(design.status).toBe("unchanged");
    expect(design.pinned_version).toBe("0.1.0-old");
    expect(design.kit_version).toBe(kitVersion());
  });

  it("flags missing command files when the kit ships a template the project lacks", () => {
    const dir = mkProject();
    deployCommand(dir, "design.md");
    // build.md intentionally not deployed.
    const report = detectCommandDrift({ kitDir: REPO_ROOT, projectDir: dir });
    expect(report.overall).toBe("drift");
    const build = report.files.find((f) => f.name === "build.md")!;
    expect(build.status).toBe("missing");
  });

  it("ignores hook files entirely (project-owned, never in the report)", () => {
    const dir = mkProject();
    deployCommand(dir, "sprint.md");
    deployCommand(dir, "plan.md");
    deployCommand(dir, "design.md");
    deployCommand(dir, "build.md");
    deployCommand(dir, "deploy.md");
    deployCommand(dir, "spike.md");
    for (const hook of ["design.pre-hook.md", "design.post-hook.md", "build.pre-hook.md", "build.post-hook.md"]) {
      fs.writeFileSync(path.join(dir, ".claude", "commands", hook), "# project-owned hook\n");
    }
    const report = detectCommandDrift({ kitDir: REPO_ROOT, projectDir: dir });
    expect(report.overall).toBe("ok");
    expect(report.files.map((f) => f.name)).toEqual(expect.arrayContaining(["design.md", "build.md"]));
    expect(report.files.find((f) => f.name.includes("hook"))).toBeUndefined();
  });

  it("flags extra non-hook command files without counting them against overall ok", () => {
    const dir = mkProject();
    deployCommand(dir, "sprint.md");
    deployCommand(dir, "plan.md");
    deployCommand(dir, "design.md");
    deployCommand(dir, "build.md");
    deployCommand(dir, "deploy.md");
    deployCommand(dir, "spike.md");
    fs.writeFileSync(path.join(dir, ".claude", "commands", "custom.md"), "# project-only\n");
    const report = detectCommandDrift({ kitDir: REPO_ROOT, projectDir: dir });
    expect(report.overall).toBe("ok");
    const custom = report.files.find((f) => f.name === "custom.md")!;
    expect(custom.status).toBe("extra");
  });

  it("undefined pinned_version when a project command file omits the `Pinned to:` line", () => {
    const dir = mkProject();
    deployCommand(dir, "build.md");
    // Hand-rolled design.md without a pinned-to line.
    fs.writeFileSync(
      path.join(dir, ".claude", "commands", "design.md"),
      "# /design (hand-rolled, no version pin)\n"
    );
    const report = detectCommandDrift({ kitDir: REPO_ROOT, projectDir: dir });
    const design = report.files.find((f) => f.name === "design.md")!;
    expect(design.status).toBe("drifted");
    expect(design.pinned_version).toBeUndefined();
  });

  it("reports overall=ok and empty file list when no .claude/commands exists", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "feip7424-empty-"));
    tmpDirs.push(dir);
    const report = detectCommandDrift({ kitDir: REPO_ROOT, projectDir: dir });
    // Missing project dir means every kit template registers as "missing".
    expect(report.overall).toBe("drift");
    expect(report.files.every((f) => f.status === "missing")).toBe(true);
  });

  it("sorts files drifted > missing > extra > unchanged for deterministic display", () => {
    const dir = mkProject();
    deployCommand(dir, "design.md"); // unchanged
    // sprint.md + plan.md + build.md + deploy.md + spike.md missing
    fs.writeFileSync(path.join(dir, ".claude", "commands", "custom.md"), "extra\n");
    const report = detectCommandDrift({ kitDir: REPO_ROOT, projectDir: dir });
    const order = report.files.map((f) => f.status);
    expect(order).toEqual(["missing", "missing", "missing", "missing", "missing", "extra", "unchanged"]);
  });
});

describe("detectScaffoldedDrift umbrella", () => {
  it("returns overall=ok when both surfaces are in-sync", () => {
    const dir = mkProject();
    deployCommand(dir, "sprint.md");
    deployCommand(dir, "plan.md");
    deployCommand(dir, "design.md");
    deployCommand(dir, "build.md");
    deployCommand(dir, "deploy.md");
    deployCommand(dir, "spike.md");
    for (const name of ["pr.yml", "merge.yml", "cleanup-orphans.yml"]) {
      deployWorkflow(dir, name);
    }
    const report = detectScaffoldedDrift({ kitDir: REPO_ROOT, projectDir: dir });
    expect(report.overall).toBe("ok");
    expect(report.workflows.overall).toBe("ok");
    expect(report.commands.overall).toBe("ok");
  });

  it("returns overall=drift when the command surface drifts even if workflows are clean", () => {
    const dir = mkProject();
    deployCommand(dir, "build.md");
    fs.writeFileSync(path.join(dir, ".claude", "commands", "design.md"), "# customized\n");
    for (const name of ["pr.yml", "merge.yml", "cleanup-orphans.yml"]) {
      deployWorkflow(dir, name);
    }
    const report = detectScaffoldedDrift({ kitDir: REPO_ROOT, projectDir: dir });
    expect(report.overall).toBe("drift");
    expect(report.workflows.overall).toBe("ok");
    expect(report.commands.overall).toBe("drift");
  });

  it("returns overall=drift when the workflow surface drifts even if commands are clean", () => {
    const dir = mkProject();
    deployCommand(dir, "sprint.md");
    deployCommand(dir, "plan.md");
    deployCommand(dir, "design.md");
    deployCommand(dir, "build.md");
    deployCommand(dir, "deploy.md");
    deployCommand(dir, "spike.md");
    // pr.yml + merge.yml + cleanup-orphans.yml all missing.
    const report = detectScaffoldedDrift({ kitDir: REPO_ROOT, projectDir: dir });
    expect(report.overall).toBe("drift");
    expect(report.workflows.overall).toBe("drift");
    expect(report.commands.overall).toBe("ok");
  });
});
