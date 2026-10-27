import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mergeAcLanes, blockMergePyTestFile } from "../../consort/experiment/ac-lane-merge";

// LIVE against REAL git (no injected git seam, no mocks): proves the merge-all
// folds clean lane branches back and ABORTS a conflicting one (routing it to the
// sequential fallback) without corrupting the experiment branch.

let repo: string;
const git = (a: string[]) => execFileSync("git", a, { cwd: repo, encoding: "utf8" });

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "ac-merge-live-"));
  git(["init", "-q", "-b", "experiment"]);
  git(["config", "user.email", "t@t"]);
  git(["config", "user.name", "t"]);
  writeFileSync(join(repo, "migration.py"), "v1\n");
  writeFileSync(join(repo, "base.py"), "base\n");
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "base"]);
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe("mergeAcLanes — LIVE (real git): merge-all + conflict -> sequential fallback", () => {
  it("merges a disjoint lane clean, ABORTS a conflicting lane, leaves the experiment branch intact", () => {
    // Lane AC2: a DISJOINT change (its own test file) — will merge clean.
    git(["checkout", "-q", "-b", "ac-lane-ac2", "experiment"]);
    writeFileSync(join(repo, "test_ac2.py"), "def test_ac2(): pass\n");
    git(["add", "-A"]);
    git(["commit", "-q", "-m", "AC2 green"]);

    // Lane AC3: edits the SHARED migration.py (the round-trip-touches-the-migration case).
    git(["checkout", "-q", "-b", "ac-lane-ac3", "experiment"]);
    writeFileSync(join(repo, "migration.py"), "v1\n+ ac3 downgrade\n");
    git(["add", "-A"]);
    git(["commit", "-q", "-m", "AC3 green"]);

    // Back on the experiment branch, migration.py ALSO changed (another lane / AC1
    // follow-up) so AC3's merge genuinely conflicts.
    git(["checkout", "-q", "experiment"]);
    writeFileSync(join(repo, "migration.py"), "v1\n+ experiment change\n");
    git(["add", "-A"]);
    git(["commit", "-q", "-m", "experiment migration edit"]);

    const result = mergeAcLanes({
      projectDir: repo,
      lanes: [
        { ac: "AC2", gitBranch: "ac-lane-ac2" },
        { ac: "AC3", gitBranch: "ac-lane-ac3" },
      ],
    });

    expect(result.merged).toEqual(["AC2"]);
    expect(result.conflicted.map((c) => c.ac)).toEqual(["AC3"]);

    // AC2's disjoint file landed on the experiment branch.
    expect(existsSync(join(repo, "test_ac2.py"))).toBe(true);
    // AC3's conflicting merge was ABORTED: migration.py is the experiment version,
    // not a half-merged / conflict-marker file.
    expect(readFileSync(join(repo, "migration.py"), "utf8")).toBe("v1\n+ experiment change\n");
    expect(readFileSync(join(repo, "migration.py"), "utf8")).not.toContain("<<<<<<<");
    // The tree is clean (no aborted-merge residue).
    expect(git(["status", "--porcelain"]).trim()).toBe("");
    // The clean lane branch was deleted; the conflicted one is kept for the re-run.
    const branches = git(["branch", "--format=%(refname:short)"]).split("\n").map((s) => s.trim());
    expect(branches).not.toContain("ac-lane-ac2");
    expect(branches).toContain("ac-lane-ac3");
  });

  // THE REAL fan-out merge case (live): every AC lane APPENDS its own disjoint test functions to the
  // SAME per-story test file. Concurrent EOF appends collide as a git text conflict even though the
  // additions are disjoint — which dropped 2 of 3 ACs to the sequential fallback live. The union-merge
  // scoping in mergeAcLanes must fold BOTH lanes' appends in cleanly, losing no test, with no conflict
  // markers and no repo-wide attribute residue.
  it("BLOCK-merges disjoint per-AC appends to a SHARED story test file (no conflict, no test lost)", () => {
    const testFile = join(repo, "tests", "test_story.py");
    execFileSync("mkdir", ["-p", join(repo, "tests")]);
    writeFileSync(testFile, "def test_ac1_a(): pass\ndef test_ac1_b(): pass\n");
    git(["add", "-A"]);
    git(["commit", "-q", "-m", "AC1 tests"]);

    git(["checkout", "-q", "-b", "ac-lane-ac2", "experiment"]);
    writeFileSync(testFile, readFileSync(testFile, "utf8") + "def test_ac2(): pass\n");
    git(["add", "-A"]); git(["commit", "-q", "-m", "AC2 green"]);

    git(["checkout", "-q", "-b", "ac-lane-ac4", "experiment"]);
    writeFileSync(testFile, readFileSync(testFile, "utf8") + "def test_ac4(): pass\n");
    git(["add", "-A"]); git(["commit", "-q", "-m", "AC4 green"]);

    git(["checkout", "-q", "experiment"]);
    const priorAttrs = existsSync(join(repo, ".git", "info", "attributes"))
      ? readFileSync(join(repo, ".git", "info", "attributes"), "utf8") : null;

    const result = mergeAcLanes({
      projectDir: repo,
      lanes: [{ ac: "AC2", gitBranch: "ac-lane-ac2" }, { ac: "AC4", gitBranch: "ac-lane-ac4" }],
    });

    // BOTH lanes merged clean — no conflict, no sequential fallback.
    expect(result.merged).toEqual(["AC2", "AC4"]);
    expect(result.conflicted).toEqual([]);
    // Every test survived the union; no conflict markers.
    const merged = readFileSync(testFile, "utf8");
    for (const t of ["test_ac1_a", "test_ac1_b", "test_ac2", "test_ac4"]) expect(merged).toContain(`def ${t}(`);
    expect(merged).not.toContain("<<<<<<<");
    expect(git(["status", "--porcelain"]).trim()).toBe("");
    // Repo-wide merge behavior is UNCHANGED afterward: we never write .git/info/attributes.
    const afterAttrs = existsSync(join(repo, ".git", "info", "attributes"))
      ? readFileSync(join(repo, ".git", "info", "attributes"), "utf8") : null;
    expect(afterAttrs).toBe(priorAttrs);
  });

  // THE LIVE-CROSSING REGRESSION: two lanes append BOILERPLATE-HEAVY pytest functions (identical
  // `import` / blank / decorator lines) to the shared story test file. git's `merge=union` driver
  // (the prior fix) aligned those identical lines across the two DIFFERENT functions and interleaved
  // the divergent lines — stitching lane A's decorated header onto lane B's body, so a body that
  // referenced a symbol imported only in its original sibling raised NameError at the story-close
  // verify (-> HIL). The block-merge must keep each function WHOLE: its own header, imports, and body.
  it("keeps boilerplate-heavy functions WHOLE (the union-cross regression: header never torn from body)", () => {
    const f = join(repo, "tests", "test_s3.py");
    execFileSync("mkdir", ["-p", join(repo, "tests")]);
    writeFileSync(f, "import pytest\n\n\n@pytest.mark.testid(\"T42\")\ndef test_base():\n    assert True\n");
    git(["add", "-A"]); git(["commit", "-q", "-m", "base test"]);

    // Lane AC3 appends a round-trip test that imports CheckViolation and uses it in ITS body.
    git(["checkout", "-q", "-b", "ac-lane-ac3", "experiment"]);
    writeFileSync(
      f,
      readFileSync(f, "utf8") +
        "\n@pytest.mark.testid(\"T58\")\ndef test_round_trip():\n    import uuid\n\n    import sqlalchemy as sa\n    from psycopg.errors import CheckViolation\n\n    x = sa.text(\"x\")\n    assert isinstance(x, CheckViolation) or True\n",
    );
    git(["add", "-A"]); git(["commit", "-q", "-m", "AC3 T58"]);

    // Lane AC2 appends a backfill test with the SAME import/blank boilerplate preamble.
    git(["checkout", "-q", "-b", "ac-lane-ac2", "experiment"]);
    writeFileSync(
      f,
      readFileSync(f, "utf8") +
        "\n@pytest.mark.testid(\"T50\")\ndef test_backfill():\n    import uuid\n\n    import sqlalchemy as sa\n\n    from app.database import engine\n\n    assert engine is not None\n",
    );
    git(["add", "-A"]); git(["commit", "-q", "-m", "AC2 T50"]);

    git(["checkout", "-q", "experiment"]);
    const result = mergeAcLanes({
      projectDir: repo,
      lanes: [{ ac: "AC2", gitBranch: "ac-lane-ac2" }, { ac: "AC3", gitBranch: "ac-lane-ac3" }],
    });

    expect(result.merged).toEqual(["AC2", "AC3"]);
    expect(result.conflicted).toEqual([]);
    const merged = readFileSync(f, "utf8");
    // Every test survived, no conflict markers.
    for (const t of ["test_base", "test_round_trip", "test_backfill"]) expect(merged).toContain(`def ${t}(`);
    expect(merged).not.toContain("<<<<<<<");
    // NOT CROSSED: the only block that imports CheckViolation is the one that USES it — the symbol
    // and its use stay in the same function. Slice each function body and assert containment.
    const bodyOf = (name: string) => {
      const start = merged.indexOf(`def ${name}(`);
      const rest = merged.slice(start);
      const next = rest.slice(1).search(/\n(?:@|def |async def |class )/);
      return next === -1 ? rest : rest.slice(0, next + 1);
    };
    expect(bodyOf("test_round_trip")).toContain("CheckViolation");
    expect(bodyOf("test_backfill")).not.toContain("CheckViolation");
    // The file is syntactically parseable (python -c compile) — no torn function.
    writeFileSync(join(repo, "_check.py"), `import ast,sys; ast.parse(open(${JSON.stringify(f)}).read()); print("OK")`);
    const out = execFileSync("python3", [join(repo, "_check.py")], { encoding: "utf8" });
    expect(out.trim()).toBe("OK");
  });
});

describe("blockMergePyTestFile — pure top-level-block union (no line interleave)", () => {
  const base = 'import pytest\n\n\ndef test_a():\n    assert 1\n';
  it("unions each side's NEW functions WHOLE and keeps base blocks unchanged", () => {
    const ours = base + '\n\ndef test_ours():\n    import os\n    assert os\n';
    const theirs = base + '\n\ndef test_theirs():\n    import sys\n    assert sys\n';
    const out = blockMergePyTestFile(base, ours, theirs)!;
    expect(out).toContain("def test_a(");
    expect(out).toContain("def test_ours(");
    expect(out).toContain("def test_theirs(");
    // test_ours' import stays inside test_ours (not torn into test_theirs).
    const oursSlice = out.slice(out.indexOf("def test_ours("), out.indexOf("def test_theirs("));
    expect(oursSlice).toContain("import os");
    expect(oursSlice).not.toContain("import sys");
  });

  it("REFUSES (returns null -> sequential fallback) when a side EDITED a base block", () => {
    const ours = 'import pytest\n\n\ndef test_a():\n    assert 2\n'; // base block body changed
    const theirs = base + '\n\ndef test_new():\n    assert 1\n';
    expect(blockMergePyTestFile(base, ours, theirs)).toBeNull();
  });

  it("REFUSES when a side DELETED a base block", () => {
    const ours = 'import pytest\n\n\ndef test_new():\n    assert 1\n'; // test_a removed
    const theirs = base;
    expect(blockMergePyTestFile(base, ours, theirs)).toBeNull();
  });
});
