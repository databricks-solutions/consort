// BDD coverage for the shipped-migration-immutability gate
// (consort/architecture/migration-history-clean.ts) + its wiring into the
// honest-GREEN path (greenOpenCycle), issue #196.
//
// A migration present at the feature's fork point shipped with a MERGED feature and
// is immutable history: editing/deleting/renaming it rewrites schema history and
// corrupts any branch where the original already ran (DuplicateObject / divergence).
// The honest-GREEN verify PASSES on doctored history (that is why this ships
// silently), so the gate diffs the migration dirs against the fork point on every
// cycle and flips a passing verify into a routed revert + flag-premise repair.

import { describe, it, expect, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { checkShippedMigrationImmutable } from "../../consort/architecture/migration-history-clean.js";
import { beginNextPendingCycle, greenOpenCycle, type GreenVerifier } from "../../consort/pipeline/cycle-record.js";

const tmpDirs: string[] = [];
function mkProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "migration-history-clean-"));
  tmpDirs.push(dir);
  return dir;
}
function write(dir: string, rel: string, body: string): void {
  const abs = path.join(dir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body);
}
afterEach(() => {
  while (tmpDirs.length) {
    const dir = tmpDirs.pop();
    if (dir) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
    }
  }
});

function git(dir: string, args: string[]): void {
  execFileSync("git", args, { cwd: dir, stdio: "ignore" });
}
function commitAll(dir: string, msg: string): void {
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-m", msg]);
}
/** A repo on main with one SHIPPED migration committed; returns the dir on main. */
function mkRepoWithShippedMigration(): string {
  const dir = mkProject();
  git(dir, ["init", "-b", "main"]);
  git(dir, ["config", "user.email", "test@example.com"]);
  git(dir, ["config", "user.name", "test"]);
  write(dir, "alembic/versions/20260921000000_create_stock.py", "def upgrade():\n    pass\n");
  write(dir, "app.py", "# app\n");
  commitAll(dir, "base: create stock table");
  return dir;
}

describe("checkShippedMigrationImmutable", () => {
  it("is clean when the branch only ADDS a new migration", () => {
    const dir = mkRepoWithShippedMigration();
    git(dir, ["checkout", "-b", "feature/f2"]);
    write(dir, "alembic/versions/20260922000000_add_index.py", "def upgrade():\n    pass\n");
    commitAll(dir, "feature: add index");
    const r = checkShippedMigrationImmutable({ projectDir: dir });
    expect(r.clean).toBe(true);
    expect(r.violations).toHaveLength(0);
  });

  it("flags an EDITED shipped migration with a revert + flag-premise directive", () => {
    const dir = mkRepoWithShippedMigration();
    git(dir, ["checkout", "-b", "feature/f2"]);
    write(dir, "alembic/versions/20260921000000_create_stock.py", "def upgrade():\n    pass  # doctored\n");
    commitAll(dir, "doctor the shipped migration");
    const r = checkShippedMigrationImmutable({ projectDir: dir });
    expect(r.clean).toBe(false);
    expect(r.violations).toEqual([{ status: "M", file: "alembic/versions/20260921000000_create_stock.py" }]);
    expect(r.remediation).toMatch(/SHIPPED-MIGRATION-IMMUTABILITY/);
    expect(r.remediation).toMatch(/git checkout [0-9a-f]{12} -- alembic\/versions\/20260921000000_create_stock\.py/);
    expect(r.remediation).toMatch(/flag-superseded/);
  });

  it("flags a DELETED shipped migration", () => {
    const dir = mkRepoWithShippedMigration();
    git(dir, ["checkout", "-b", "feature/f2"]);
    fs.rmSync(path.join(dir, "alembic/versions/20260921000000_create_stock.py"));
    commitAll(dir, "delete the shipped migration");
    const r = checkShippedMigrationImmutable({ projectDir: dir });
    expect(r.clean).toBe(false);
    expect(r.violations[0]).toEqual({ status: "D", file: "alembic/versions/20260921000000_create_stock.py" });
  });

  it("flags a RENAMED shipped migration by its old (shipped) path", () => {
    const dir = mkRepoWithShippedMigration();
    git(dir, ["checkout", "-b", "feature/f2"]);
    git(dir, ["mv", "alembic/versions/20260921000000_create_stock.py", "alembic/versions/20260921000000_renamed.py"]);
    commitAll(dir, "rename the shipped migration");
    const r = checkShippedMigrationImmutable({ projectDir: dir });
    expect(r.clean).toBe(false);
    expect(r.violations[0].status).toBe("R");
    expect(r.violations[0].file).toBe("alembic/versions/20260921000000_create_stock.py");
  });

  it("the boundary is the fork point: a migration MERGED after an earlier feature is shipped for the next one", () => {
    const dir = mkRepoWithShippedMigration();
    // Feature 1 adds a migration and merges it to main (it SHIPS).
    git(dir, ["checkout", "-b", "feature/f1"]);
    write(dir, "alembic/versions/20260921120000_add_quantity_check.py", "def upgrade():\n    pass\n");
    commitAll(dir, "f1: add the check");
    git(dir, ["checkout", "main"]);
    git(dir, ["merge", "--no-ff", "feature/f1", "-m", "merge f1"]);
    // Feature 2 forks from the merged main: editing THAT migration is a violation.
    git(dir, ["checkout", "-b", "feature/f2"]);
    write(dir, "alembic/versions/20260921120000_add_quantity_check.py", "def upgrade():\n    pass  # doctored\n");
    commitAll(dir, "doctor f1's shipped migration");
    const r = checkShippedMigrationImmutable({ projectDir: dir });
    expect(r.clean).toBe(false);
    expect(r.violations).toEqual([{ status: "M", file: "alembic/versions/20260921120000_add_quantity_check.py" }]);
  });

  it("a migration added EARLIER IN THE SAME feature (post-fork) is NOT flagged", () => {
    const dir = mkRepoWithShippedMigration();
    git(dir, ["checkout", "-b", "feature/f2"]);
    write(dir, "alembic/versions/20260922000000_add_index.py", "def upgrade():\n    pass\n");
    commitAll(dir, "f2: add index (story 1)");
    write(dir, "alembic/versions/20260922000000_add_index.py", "def upgrade():\n    pass  # refined (story 2)\n");
    commitAll(dir, "f2: refine index (story 2, same feature)");
    const r = checkShippedMigrationImmutable({ projectDir: dir });
    expect(r.clean).toBe(true);
  });

  it("advisory: a non-git project reports clean with a skippedReason (never a false failure)", () => {
    const dir = mkProject();
    write(dir, "alembic/versions/x.py", "def upgrade():\n    pass\n");
    const r = checkShippedMigrationImmutable({ projectDir: dir });
    expect(r.clean).toBe(true);
    expect(r.skippedReason).toBe("not a git repo");
  });

  it("advisory: an unresolvable explicit parent ref reports clean with a skippedReason", () => {
    const dir = mkRepoWithShippedMigration();
    const r = checkShippedMigrationImmutable({ projectDir: dir, parentRef: "origin/nope" });
    expect(r.clean).toBe(true);
    expect(r.skippedReason).toBe("no parent-tier ref resolves");
  });
});

// greenOpenCycle wiring: the gate runs even when the honest verify PASSES, so a
// Driver that doctors shipped history to green a mis-premised test still routes a
// revert + flag-premise repair BEFORE anything merges (issue #196).
describe("greenOpenCycle: shipped-migration mutation is caught proactively at GREEN", () => {
  const F = "F2";
  const S = "S2";
  const writeJson = (file: string, obj: unknown): void => fs.writeFileSync(file, JSON.stringify(obj, null, 2) + "\n");
  const pass: GreenVerifier = async () => ({ passed: true, summary: "all tests green" });

  function scaffold(dir: string): string {
    const tdd = path.join(dir, ".sftdd");
    const acsDir = path.join(tdd, "features", F, "stories", S, "acs");
    fs.mkdirSync(acsDir, { recursive: true });
    writeJson(path.join(acsDir, "AC1.json"), { id: "AC1", layer: "API", text: "non-negative quantity check" });
    const items = [{ id: "T24", description: "story adds a CHECK migration", ac_id: "AC1", status: "pending" }];
    writeJson(path.join(tdd, "features", F, "stories", S, "test-list-per-story.json"), { feature_id: F, story_id: S, items });
    writeJson(path.join(tdd, "features", F, "test-list.json"), { feature_id: F, items });
    const expDir = path.join(tdd, "experiments", F, S, "exp1");
    fs.mkdirSync(expDir, { recursive: true });
    fs.writeFileSync(path.join(expDir, "branch.txt"), "experiment-s2-exp1");
    writeJson(path.join(expDir, "outcomes.json"), { status: "running" });
    return tdd;
  }

  it("a PASSING verify + a doctored shipped migration converts to a routed repair (does not green)", async () => {
    const project = mkRepoWithShippedMigration();
    git(project, ["checkout", "-b", "feature/f2"]);
    write(project, "alembic/versions/20260921000000_create_stock.py", "def upgrade():\n    pass  # doctored\n");
    commitAll(project, "doctor the shipped migration");
    const tdd = scaffold(project);

    beginNextPendingCycle({ consortDir: tdd, featureId: F, story: S });
    const r = await greenOpenCycle({ consortDir: tdd, featureId: F, story: S, verify: pass });

    expect(r.recorded).toBe(false);
    expect(r.needsAssess).toBe(true);
    expect(r.summary).toMatch(/SHIPPED-MIGRATION-IMMUTABILITY/);
  });

  it("a PASSING verify + only a new migration greens normally", async () => {
    const project = mkRepoWithShippedMigration();
    git(project, ["checkout", "-b", "feature/f2"]);
    write(project, "alembic/versions/20260922000000_add_check.py", "def upgrade():\n    pass\n");
    commitAll(project, "feature: add check migration");
    const tdd = scaffold(project);

    beginNextPendingCycle({ consortDir: tdd, featureId: F, story: S });
    const r = await greenOpenCycle({ consortDir: tdd, featureId: F, story: S, verify: pass });

    expect(r.recorded).toBe(true);
  });
});
