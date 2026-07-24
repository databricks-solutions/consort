// scripts/sftdd.sh is the convenient launcher that opens a Claude Code
// session; the slash commands invoke the deterministic driver (no scrum-master
// agent). Hermetic: real templates + tmpdir.

import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { deployScripts } from "@databricks-solutions/lakebase-scm-utils/lakebase";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, "..", "..");
const REPO_TEMPLATES = path.join(REPO_ROOT, "templates", "project");

const tmpDirs: string[] = [];
afterEach(() => {
  while (tmpDirs.length) {
    const d = tmpDirs.pop();
    if (d) fs.rmSync(d, { recursive: true, force: true });
  }
});
function mkDir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "feip7510-tdd-"));
  tmpDirs.push(d);
  return d;
}

describe("scripts/sftdd.sh launcher", () => {
  it("is scaffolded into scripts/ as an executable file", async () => {
    const dir = mkDir();
    const scripts = await deployScripts(dir, { templatesDir: REPO_TEMPLATES });
    expect(scripts).toContain("sftdd.sh");
    const stat = fs.statSync(path.join(dir, "scripts", "sftdd.sh"));
    expect(stat.mode & 0o111, "tdd.sh must be executable").not.toBe(0);
  });

  it("opens a plain claude session (no scrum-master agent) and seeds an optional command", () => {
    const sh = fs.readFileSync(
      path.join(REPO_TEMPLATES, "common", "scripts", "sftdd.sh"),
      "utf8"
    );
    // Bare: open an interactive session; the slash commands drive the workflow.
    expect(sh).toMatch(/exec claude$/m);
    // Seeded: first turn is the chosen slash command.
    expect(sh).toMatch(/exec claude "\/\$phase \$\*"/);
    // The orchestrator is the driver now, NOT an LLM scrum-master agent.
    expect(sh).not.toMatch(/scrum-master/);
    // Guards: needs the claude CLI + a scaffolded .claude/agents/.
    expect(sh).toMatch(/command -v claude/);
    expect(sh).toMatch(/\.claude\/agents/);
  });
});
