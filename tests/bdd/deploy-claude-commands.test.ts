// BDD coverage for the .claude/commands scaffold. Hermetic:
// runs against a real kit templates tree + tmpdir; no shell-outs.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  deployClaudeCommands,
  scaffoldStaticAll,
} from "@databricks-solutions/lakebase-scm-utils/lakebase";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, "..", "..");
const REPO_TEMPLATES = path.join(REPO_ROOT, "templates", "project");

function mkTempProject(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `feip7212-${prefix}-`));
}

function rmTempProject(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}

describe("deployClaudeCommands", () => {
  let targetDir: string;
  beforeEach(() => {
    targetDir = mkTempProject("deploy");
  });
  afterEach(() => rmTempProject(targetDir));

  it("writes sprint.md, plan.md, design.md, design.pre-hook.md, build.md, deploy.md, and spike.md under .claude/commands/", async () => {
    const result = await deployClaudeCommands(targetDir, { templatesDir: REPO_TEMPLATES });
    expect(result.written.sort()).toEqual(
      [
        path.join(".claude", "commands", "build.md"),
        path.join(".claude", "commands", "deploy.md"),
        path.join(".claude", "commands", "design.md"),
        path.join(".claude", "commands", "design.pre-hook.md"),
        path.join(".claude", "commands", "plan.md"),
        path.join(".claude", "commands", "spike.md"),
        path.join(".claude", "commands", "sprint.md"),
      ].sort()
    );
    expect(result.skipped).toEqual([]);
    expect(fs.existsSync(path.join(targetDir, ".claude", "commands", "design.md"))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, ".claude", "commands", "build.md"))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, ".claude", "commands", "design.pre-hook.md"))).toBe(true);
  });

  it("substitutes ${KIT_VERSION_AT_SCAFFOLD} with the real kit version", async () => {
    const kitPkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8")) as {
      version: string;
    };
    await deployClaudeCommands(targetDir, { templatesDir: REPO_TEMPLATES });
    const design = fs.readFileSync(path.join(targetDir, ".claude", "commands", "design.md"), "utf8");
    const build = fs.readFileSync(path.join(targetDir, ".claude", "commands", "build.md"), "utf8");
    expect(design).not.toMatch(/\$\{KIT_VERSION_AT_SCAFFOLD\}/);
    expect(build).not.toMatch(/\$\{KIT_VERSION_AT_SCAFFOLD\}/);
    expect(design).toContain(`Pinned to: \`${kitPkg.version}\``);
    expect(build).toContain(`Pinned to: \`${kitPkg.version}\``);
  });

  it("skips existing files by default and reports them in `skipped`", async () => {
    fs.mkdirSync(path.join(targetDir, ".claude", "commands"), { recursive: true });
    const userContent = "# my custom /design\n";
    fs.writeFileSync(path.join(targetDir, ".claude", "commands", "design.md"), userContent);
    const result = await deployClaudeCommands(targetDir, { templatesDir: REPO_TEMPLATES });
    expect(result.skipped).toContain(path.join(".claude", "commands", "design.md"));
    expect(result.written).not.toContain(path.join(".claude", "commands", "design.md"));
    expect(result.written).toContain(path.join(".claude", "commands", "build.md"));
    expect(fs.readFileSync(path.join(targetDir, ".claude", "commands", "design.md"), "utf8")).toBe(
      userContent
    );
  });

  it("overwrites with force=true even when files already exist", async () => {
    fs.mkdirSync(path.join(targetDir, ".claude", "commands"), { recursive: true });
    fs.writeFileSync(path.join(targetDir, ".claude", "commands", "design.md"), "stale\n");
    const result = await deployClaudeCommands(targetDir, {
      templatesDir: REPO_TEMPLATES,
      force: true,
    });
    expect(result.written).toContain(path.join(".claude", "commands", "design.md"));
    expect(result.skipped).not.toContain(path.join(".claude", "commands", "design.md"));
    expect(fs.readFileSync(path.join(targetDir, ".claude", "commands", "design.md"), "utf8")).not.toBe(
      "stale\n"
    );
  });

  it("returns empty arrays when the kit ships no command templates", async () => {
    // Synthesize a templates tree that mimics the kit layout but omits
    // the .claude/commands subdir. The marker file
    // (common/.gitignore.base) MUST exist so the auto-locate logic in
    // scaffold.ts doesn't fall back to the real kit templates.
    const fakeTemplates = mkTempProject("no-commands-templates");
    const fakeCommon = path.join(fakeTemplates, "common");
    fs.mkdirSync(fakeCommon, { recursive: true });
    fs.writeFileSync(path.join(fakeCommon, ".gitignore.base"), "");
    try {
      const result = await deployClaudeCommands(targetDir, { templatesDir: fakeTemplates });
      expect(result.written).toEqual([]);
      expect(result.skipped).toEqual([]);
      expect(fs.existsSync(path.join(targetDir, ".claude", "commands"))).toBe(false);
    } finally {
      rmTempProject(fakeTemplates);
    }
  });

  it("design.md drives via lakebase-sftdd-drive --only design + names the design roles + the pre/post-hook convention", async () => {
    await deployClaudeCommands(targetDir, { templatesDir: REPO_TEMPLATES });
    const design = fs.readFileSync(path.join(targetDir, ".claude", "commands", "design.md"), "utf8");
    expect(design).toMatch(/lakebase-sftdd-drive.*--only design/);
    expect(design).toMatch(/spec-author/);
    expect(design).toMatch(/architect-reviewer/);
    expect(design).toMatch(/test-strategist/);
    expect(design).toMatch(/design\.pre-hook\.md/);
    expect(design).toMatch(/design\.post-hook\.md/);
    expect(design).not.toMatch(/scrum-master/); // orchestration is the deterministic driver now
  });

  it("build.md drives via lakebase-sftdd-drive --only build + names navigator/driver (no scrum-master)", async () => {
    await deployClaudeCommands(targetDir, { templatesDir: REPO_TEMPLATES });
    const build = fs.readFileSync(path.join(targetDir, ".claude", "commands", "build.md"), "utf8");
    expect(build).toMatch(/lakebase-sftdd-drive.*--only build/);
    expect(build).toMatch(/navigator/);
    expect(build).toMatch(/\bdriver\b/);
    expect(build).toMatch(/build\.pre-hook\.md/);
    expect(build).toMatch(/build\.post-hook\.md/);
    expect(build).not.toMatch(/scrum-master/);
  });

  it("sprint.md + spike.md are the Tier-1 orchestrator + the spike entry", async () => {
    await deployClaudeCommands(targetDir, { templatesDir: REPO_TEMPLATES });
    const sprint = fs.readFileSync(path.join(targetDir, ".claude", "commands", "sprint.md"), "utf8");
    const spike = fs.readFileSync(path.join(targetDir, ".claude", "commands", "spike.md"), "utf8");
    expect(sprint).toMatch(/lakebase-sftdd-drive --sprint/);
    expect(sprint).not.toMatch(/scrum-master/);
    expect(spike).toMatch(/lakebase-sftdd-spike/);
  });
});

describe("scaffoldStaticAll integration", () => {
  let targetDir: string;
  beforeEach(() => {
    targetDir = mkTempProject("static");
    // scaffoldStaticAll's installHooks step calls `git config --local`,
    // which requires a real git repo (a bare .git/hooks dir is not enough).
    execSync("git init --quiet", { cwd: targetDir, stdio: "pipe" });
  });
  afterEach(() => rmTempProject(targetDir));

  it("scaffolds .claude/commands by default and reports the paths in claudeCommands", async () => {
    const result = await scaffoldStaticAll({
      targetDir,
      templatesDir: REPO_TEMPLATES,
      language: "nodejs",
    });
    expect(result.claudeCommands.sort()).toEqual(
      [
        path.join(".claude", "commands", "build.md"),
        path.join(".claude", "commands", "deploy.md"),
        path.join(".claude", "commands", "design.md"),
        path.join(".claude", "commands", "design.pre-hook.md"),
        path.join(".claude", "commands", "plan.md"),
        path.join(".claude", "commands", "spike.md"),
        path.join(".claude", "commands", "sprint.md"),
      ].sort()
    );
    expect(fs.existsSync(path.join(targetDir, ".claude", "commands", "design.md"))).toBe(true);
    // The default design.pre-hook.md (which claims a paired feature branch
    // via the substrate before /design phase 1) ships in every scaffold so
    // "every git branch gets a Lakebase branch" is enforced by default.
    expect(fs.existsSync(path.join(targetDir, ".claude", "commands", "design.pre-hook.md"))).toBe(true);
  });

  it("skipCommands=true skips the scaffold and reports an empty claudeCommands list", async () => {
    const result = await scaffoldStaticAll({
      targetDir,
      templatesDir: REPO_TEMPLATES,
      language: "nodejs",
      skipCommands: true,
    });
    expect(result.claudeCommands).toEqual([]);
    expect(fs.existsSync(path.join(targetDir, ".claude", "commands"))).toBe(false);
  });
});
