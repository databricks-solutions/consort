// the role agent definitions are scaffolded into the project's
// .claude/agents/ so Claude Code can discover + spawn them (the deterministic
// driver spawns them; there is no scrum-master agent). Hermetic: real kit
// skills tree + tmpdir; no shell-outs.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  deployClaudeAgents,
  deployClaudeSkills,
  scaffoldStaticAll,
  PROJECT_SKILLS,
} from "@databricks-solutions/lakebase-scm-utils/lakebase";
import { ALL_AGENT_ROLES } from "../../scripts/sftdd/agent-models";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, "..", "..");
const REPO_TEMPLATES = path.join(REPO_ROOT, "templates", "project");

function mkTemp(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `feip7510-${prefix}-`));
}
function rmTemp(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}

describe("deployClaudeAgents", () => {
  let targetDir: string;
  beforeEach(() => {
    targetDir = mkTemp("agents");
  });
  afterEach(() => rmTemp(targetDir));

  it("writes one <role>.md under .claude/agents/ for every AgentRole", async () => {
    const result = await deployClaudeAgents(targetDir, { templatesDir: REPO_TEMPLATES });
    const expected = ALL_AGENT_ROLES.map((r) => path.join(".claude", "agents", `${r}.md`)).sort();
    expect(result.written.sort()).toEqual(expected);
    expect(result.skipped).toEqual([]);
    for (const role of ALL_AGENT_ROLES) {
      expect(fs.existsSync(path.join(targetDir, ".claude", "agents", `${role}.md`))).toBe(true);
    }
  });

  it("does NOT scaffold a scrum-master agent (the orchestrator is the deterministic driver)", async () => {
    await deployClaudeAgents(targetDir, { templatesDir: REPO_TEMPLATES });
    expect(fs.existsSync(path.join(targetDir, ".claude", "agents", "scrum-master.md"))).toBe(false);
    expect(fs.existsSync(path.join(targetDir, ".claude", "agents", "orchestrator.md"))).toBe(false);
    // Only the spawnable role agents are scaffolded.
    const entries = fs.readdirSync(path.join(targetDir, ".claude", "agents")).filter((f) => f.endsWith(".md"));
    expect(entries.sort()).toEqual(ALL_AGENT_ROLES.map((r) => `${r}.md`).sort());
  });

  it("skips existing agent files by default and reports them in skipped", async () => {
    fs.mkdirSync(path.join(targetDir, ".claude", "agents"), { recursive: true });
    fs.writeFileSync(path.join(targetDir, ".claude", "agents", "driver.md"), "# custom driver\n");
    const result = await deployClaudeAgents(targetDir, { templatesDir: REPO_TEMPLATES });
    expect(result.skipped).toContain(path.join(".claude", "agents", "driver.md"));
    expect(result.written).not.toContain(path.join(".claude", "agents", "driver.md"));
    expect(fs.readFileSync(path.join(targetDir, ".claude", "agents", "driver.md"), "utf8")).toBe(
      "# custom driver\n"
    );
  });

  it("overwrites with force=true", async () => {
    fs.mkdirSync(path.join(targetDir, ".claude", "agents"), { recursive: true });
    fs.writeFileSync(path.join(targetDir, ".claude", "agents", "driver.md"), "stale\n");
    const result = await deployClaudeAgents(targetDir, { templatesDir: REPO_TEMPLATES, force: true });
    expect(result.written).toContain(path.join(".claude", "agents", "driver.md"));
    expect(fs.readFileSync(path.join(targetDir, ".claude", "agents", "driver.md"), "utf8")).not.toBe("stale\n");
  });
});

describe("scaffoldStaticAll integration: claudeAgents", () => {
  let targetDir: string;
  beforeEach(() => {
    targetDir = mkTemp("static");
    execSync("git init --quiet", { cwd: targetDir, stdio: "pipe" });
  });
  afterEach(() => rmTemp(targetDir));

  it("scaffolds .claude/agents by default and reports them in claudeAgents", async () => {
    const result = await scaffoldStaticAll({
      targetDir,
      templatesDir: REPO_TEMPLATES,
      language: "nodejs",
    });
    expect(result.claudeAgents.sort()).toEqual(
      ALL_AGENT_ROLES.map((r) => path.join(".claude", "agents", `${r}.md`)).sort()
    );
  });

  it("skipCommands=true also skips the agents scaffold", async () => {
    const result = await scaffoldStaticAll({
      targetDir,
      templatesDir: REPO_TEMPLATES,
      language: "nodejs",
      skipCommands: true,
    });
    expect(result.claudeAgents).toEqual([]);
    expect(fs.existsSync(path.join(targetDir, ".claude", "agents"))).toBe(false);
  });
});

const skillRel = (skill: string): string => path.join(".claude", "skills", skill);

describe("deployClaudeSkills", () => {
  let targetDir: string;
  beforeEach(() => {
    targetDir = mkTemp("skills");
  });
  afterEach(() => rmTemp(targetDir));

  const REL = skillRel("software-design-principles");

  it("copies every PROJECT_SKILLS skill dir (whole, SKILL.md + references) into .claude/skills/", async () => {
    const result = await deployClaudeSkills(targetDir, { templatesDir: REPO_TEMPLATES });
    expect(result.written.sort()).toEqual(PROJECT_SKILLS.map(skillRel).sort());
    expect(result.skipped).toEqual([]);
    // The engineering canon + the three workflow skills + the two Databricks
    // parents the agents/commands reference are all present, manifests intact.
    for (const skill of PROJECT_SKILLS) {
      expect(fs.existsSync(path.join(targetDir, skillRel(skill), "SKILL.md")), `${skill}/SKILL.md`).toBe(true);
    }
    expect(fs.existsSync(path.join(targetDir, REL, "references"))).toBe(true);
    // lakebase-sftdd-workflows ships its agents/ subtree so @lakebase-sftdd-workflows/agents/* resolves.
    expect(
      fs.existsSync(path.join(targetDir, skillRel("lakebase-sftdd-workflows"), "agents", "navigator.md"))
    ).toBe(true);
  });

  it("skips an existing skill dir by default and reports it in skipped", async () => {
    fs.mkdirSync(path.join(targetDir, REL), { recursive: true });
    fs.writeFileSync(path.join(targetDir, REL, "SKILL.md"), "# custom\n");
    const result = await deployClaudeSkills(targetDir, { templatesDir: REPO_TEMPLATES });
    expect(result.skipped).toContain(REL);
    expect(result.written).not.toContain(REL);
    expect(fs.readFileSync(path.join(targetDir, REL, "SKILL.md"), "utf8")).toBe("# custom\n");
  });

  it("overwrites with force=true", async () => {
    fs.mkdirSync(path.join(targetDir, REL), { recursive: true });
    fs.writeFileSync(path.join(targetDir, REL, "SKILL.md"), "stale\n");
    const result = await deployClaudeSkills(targetDir, { templatesDir: REPO_TEMPLATES, force: true });
    expect(result.written).toContain(REL);
    expect(fs.readFileSync(path.join(targetDir, REL, "SKILL.md"), "utf8")).not.toBe("stale\n");
  });
});

describe("scaffoldStaticAll integration: claudeSkills", () => {
  let targetDir: string;
  beforeEach(() => {
    targetDir = mkTemp("static-skills");
    execSync("git init --quiet", { cwd: targetDir, stdio: "pipe" });
  });
  afterEach(() => rmTemp(targetDir));

  it("scaffolds .claude/skills by default and reports every PROJECT_SKILLS in claudeSkills", async () => {
    const result = await scaffoldStaticAll({
      targetDir,
      templatesDir: REPO_TEMPLATES,
      language: "nodejs",
    });
    expect(result.claudeSkills.sort()).toEqual(PROJECT_SKILLS.map(skillRel).sort());
    for (const skill of PROJECT_SKILLS) {
      expect(fs.existsSync(path.join(targetDir, skillRel(skill), "SKILL.md")), `${skill}/SKILL.md`).toBe(true);
    }
  });

  it("skipCommands=true also skips the skills scaffold", async () => {
    const result = await scaffoldStaticAll({
      targetDir,
      templatesDir: REPO_TEMPLATES,
      language: "nodejs",
      skipCommands: true,
    });
    expect(result.claudeSkills).toEqual([]);
    expect(fs.existsSync(path.join(targetDir, ".claude", "skills"))).toBe(false);
  });
});
