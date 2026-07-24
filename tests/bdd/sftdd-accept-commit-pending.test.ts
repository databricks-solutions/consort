import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { gitInit } from "@databricks-solutions/lakebase-scm-utils/git";
import { exec } from "@databricks-solutions/lakebase-scm-utils/util";
import { commitExperimentCode } from "../../scripts/sftdd/cycle-record.js";

// Regression guard for the accept-merge dirty-tree abort: a supersession/repair
// turn can edit CODE on the experiment branch outside any green/refactor commit,
// leaving an uncommitted change. mergePaired then `git checkout <feature>` and
// git ABORTS ("local changes would be overwritten"). The accept path now calls
// commitExperimentCode first, which commits pending CODE (so the checkout
// succeeds) while leaving the churny .sftdd/.tdd/.lakebase runtime state
// UNcommitted (so it cannot diverge from the feature branch).

const tmpDirs: string[] = [];

afterEach(() => {
  while (tmpDirs.length) {
    const dir = tmpDirs.pop();
    if (dir) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
    }
  }
});

function mkTmp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lbscm-accept-"));
  tmpDirs.push(dir);
  return dir;
}

async function configIdentity(cwd: string): Promise<void> {
  await exec("git config user.email test@example.com", { cwd });
  await exec("git config user.name 'Test User'", { cwd });
}

const MIGRATION = "alembic/versions/20260626_drop_inventory_code.py";

async function writeMigration(dir: string, body: string): Promise<void> {
  const full = path.join(dir, MIGRATION);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body, "utf8");
}

describe("commitExperimentCode (accept-merge clean-tree precondition)", () => {
  it("commits pending experiment CODE so checkout no longer aborts, but leaves .sftdd runtime uncommitted", async () => {
    const dir = mkTmp();
    await gitInit(dir);
    await configIdentity(dir);

    // Base commit on main, then a divergent feature branch (the merge target).
    await writeMigration(dir, "def downgrade():\n    pass  # base\n");
    await exec("git add -A && git commit -m base", { cwd: dir });
    await exec("git checkout -b feature", { cwd: dir });
    await writeMigration(dir, "def downgrade():\n    pass  # feature-version\n");
    await exec("git add -A && git commit -m feature-work", { cwd: dir });

    // On the EXPERIMENT branch (cut from base): a repair turn edits the migration
    // but never commits it, and runtime state churns (untracked .sftdd). The
    // experiment line is a real experiment branch, never a protected tier , the
    // build-commit guard (FEIP-8023) refuses a tier target.
    await exec("git checkout -b experiment main", { cwd: dir });
    await writeMigration(
      dir,
      "def downgrade():\n    pass  # base\n    op.alter_column('stock','inventory_code',nullable=False)\n",
    );
    fs.mkdirSync(path.join(dir, ".sftdd"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".sftdd/workflow-state.json"), '{"phase":"build"}\n', "utf8");

    // Precondition: with the dirty CODE file, the accept checkout ABORTS.
    await expect(exec("git checkout feature", { cwd: dir })).rejects.toThrow();
    await exec("git checkout experiment", { cwd: dir }).catch(() => undefined);

    // The fix: commit pending experiment code.
    const committed = await commitExperimentCode(dir, "accept: commit pending experiment work");
    expect(committed).toBe(true);

    // The migration (CODE) is now committed; the .sftdd runtime state is NOT.
    const status = await exec("git status --porcelain", { cwd: dir });
    expect(status).not.toMatch(/alembic\/versions/);
    // The churny runtime state stays uncommitted (git collapses the untracked
    // dir to ".sftdd/" in --porcelain).
    expect(status).toMatch(/\.sftdd\//);

    // And the accept checkout now succeeds (no uncommitted code to overwrite).
    await expect(exec("git checkout feature", { cwd: dir })).resolves.toBeDefined();
  });

  it("stages new source under the allow-listed roots but NEVER a stray untracked file at the repo root", async () => {
    // The live F1 stall: a design-lane agent wrote mis-quoted junk (a file named
    // `"`) to the repo root. The allow-list commit must stage real code (app/) and
    // leave the junk untracked, so it never rides onto the experiment branch.
    const dir = mkTmp();
    await gitInit(dir);
    await configIdentity(dir);
    await writeMigration(dir, "def downgrade():\n    pass\n");
    await exec("git add -A && git commit -m base", { cwd: dir });
    await exec("git checkout -b experiment", { cwd: dir }); // build commits land on the experiment branch (FEIP-8023)

    // New real source under app/, plus stray agent junk at the root.
    fs.mkdirSync(path.join(dir, "app", "services"), { recursive: true });
    fs.writeFileSync(path.join(dir, "app/services/parser.py"), "def parse(): ...\n", "utf8");
    fs.writeFileSync(path.join(dir, '"'), '"component =\n', "utf8"); // the mis-quoted junk
    fs.writeFileSync(path.join(dir, "scratch.log"), "noise\n", "utf8"); // other root junk

    const committed = await commitExperimentCode(dir, "green: parser");
    expect(committed).toBe(true);

    // The last commit contains the app source but neither junk file.
    const files = await exec("git show --name-only --pretty=format: HEAD", { cwd: dir });
    expect(files).toMatch(/app\/services\/parser\.py/);
    expect(files).not.toMatch(/scratch\.log/);
    expect(files).not.toContain('"');
    // And the junk remains untracked (not lost, just not committed).
    const status = await exec("git status --porcelain", { cwd: dir });
    expect(status).toMatch(/scratch\.log/);
  });

  it("commits a root-level uv.lock (real dependency lockfile) so promote's prepare-pr finds a clean tree", async () => {
    // The live promote stall: the first `uv run` in the build generated uv.lock
    // at the repo root, but the allow-list staged untracked files only by source
    // extension or source-root prefix, so `.lock` at the root was left
    // uncommitted through every green, and scm-prepare-pr then refused the PR on
    // the dirty tree. A real dependency lock/manifest must ride the commit + PR.
    const dir = mkTmp();
    await gitInit(dir);
    await configIdentity(dir);
    await writeMigration(dir, "def downgrade():\n    pass\n");
    await exec("git add -A && git commit -m base", { cwd: dir });
    await exec("git checkout -b experiment", { cwd: dir }); // build commits land on the experiment branch (FEIP-8023)

    fs.mkdirSync(path.join(dir, "app"), { recursive: true });
    fs.writeFileSync(path.join(dir, "app/main.py"), "app = 1\n", "utf8");
    fs.writeFileSync(path.join(dir, "uv.lock"), "# resolved deps\n", "utf8"); // root lockfile
    fs.writeFileSync(path.join(dir, "scratch.log"), "noise\n", "utf8"); // root junk (still excluded)

    const committed = await commitExperimentCode(dir, "green: initial app + deps");
    expect(committed).toBe(true);

    const files = await exec("git show --name-only --pretty=format: HEAD", { cwd: dir });
    expect(files).toMatch(/uv\.lock/);
    expect(files).toMatch(/app\/main\.py/);
    expect(files).not.toMatch(/scratch\.log/);

    // The tree is now clean of the lockfile (prepare-pr would pass); junk remains.
    const status = await exec("git status --porcelain", { cwd: dir });
    expect(status).not.toMatch(/uv\.lock/);
    expect(status).toMatch(/scratch\.log/);
  });

  it("is a no-op (returns false) on an already-clean code tree", async () => {
    const dir = mkTmp();
    await gitInit(dir);
    await configIdentity(dir);
    await writeMigration(dir, "def downgrade():\n    pass\n");
    await exec("git add -A && git commit -m base", { cwd: dir });
    await exec("git checkout -b experiment", { cwd: dir }); // build commits land on the experiment branch (FEIP-8023)

    const committed = await commitExperimentCode(dir, "accept: nothing pending");
    expect(committed).toBe(false);
  });
});
