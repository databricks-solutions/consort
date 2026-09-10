// #3 fail-closed guard: a `consort-experiment cut` on a DIRTY working tree must hard-fail BEFORE it
// forks/records the experiment. Otherwise createPairedBranch's git checkout is blocked (or silently
// skipped, like its best-effort .env sync), leaving the tree on the FEATURE branch while the
// experiment is recorded as active – so the next role (Navigator RED) runs on the wrong branch,
// finds a prior pass's files, and burns its budget into a PROTOCOL VIOLATION. Refusing before any
// mutation keeps experimentCut false, so the lane halts/retries instead of building on a branch that
// was never checked out. A clean tree (the normal path) is unaffected.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cutExperiment } from "../../consort/experiment/experiment.js";

function git(cwd: string, ...args: string[]): void {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cut-dirty-"));
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "t@t.co");
  git(dir, "config", "user.name", "t");
  writeFileSync(join(dir, "README.md"), "x\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "init");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const args = () => ({
  instance: "inst-1",
  consortDir: join(dir, ".lakebase"),
  projectDir: dir,
  featureId: "F1-x",
  storyId: "S1-x",
  experimentSlug: "exp1",
  branch: "experiment/F1-x/S1-x/exp1",
  parentBranch: "feature/F1-x",
});

describe("cutExperiment is fail-closed on uncommitted TRACKED source, but tolerates untracked + .consort churn (#3)", () => {
  it("throws BEFORE forking on an uncommitted TRACKED source change (createPairedBranch never called)", async () => {
    writeFileSync(join(dir, "README.md"), "uncommitted change\n"); // modify a TRACKED file
    let forked = false;
    await expect(
      cutExperiment(args(), {
        createPairedBranch: (async () => {
          forked = true;
          return {} as never;
        }) as never,
        deletePairedBranch: (async () => {}) as never,
      }),
    ).rejects.toThrow(/dirty|uncommitted|working tree/i);
    expect(forked, "createPairedBranch must NOT run on a dirty tree (no fork, no record)").toBe(false);
  });

  it("gets PAST the dirty guard to the paired cut when the tree is clean (control)", async () => {
    // Clean tree (only committed files): the guard passes, so createPairedBranch is reached. A
    // sentinel throw from it proves reach without needing a full valid paired-branch return.
    let forked = false;
    await expect(
      cutExperiment(args(), {
        createPairedBranch: (async () => {
          forked = true;
          throw new Error("REACHED_PAIRED_CUT");
        }) as never,
        deletePairedBranch: (async () => {}) as never,
      }),
    ).rejects.toThrow(/REACHED_PAIRED_CUT/);
    expect(forked, "a clean tree reaches createPairedBranch").toBe(true);
  });

  it("TOLERATES untracked files (a new design artifact / unrelated tool config) – the normal design->build handoff is not blocked", async () => {
    // Untracked files ride onto the fork harmlessly (the build's allow-list commit never stages
    // them); only uncommitted TRACKED source is the fork-corrupting case. So an untracked file must
    // NOT block the cut – this is the over-block the blanket check caused, now fixed.
    writeFileSync(join(dir, "brand-new-untracked.txt"), "not committed, not tracked\n");
    writeFileSync(join(dir, ".isaac-config.json"), "{}\n"); // an unrelated tool's untracked config
    let forked = false;
    await expect(
      cutExperiment(args(), {
        createPairedBranch: (async () => {
          forked = true;
          throw new Error("REACHED_PAIRED_CUT");
        }) as never,
        deletePairedBranch: (async () => {}) as never,
      }),
    ).rejects.toThrow(/REACHED_PAIRED_CUT/);
    expect(forked, "untracked files are tolerated – the cut reaches createPairedBranch").toBe(true);
  });

  it("TOLERATES a dirty TRACKED runtime-artifact ref (.lakebase/scm-utils-ref) – a re-pin never blocks the cut", async () => {
    // The paired-branch bookkeeping under .lakebase/ (the committed scm-utils-ref / kit-ref) is a
    // runtime artifact: a checkout/re-pin dirties it, but it never rides onto the fork as source. So
    // a dirty TRACKED .lakebase/*-ref must NOT block the cut (mirrors scm-utils' RUNTIME_ARTIFACT_IGNORE),
    // whereas a dirty tracked SOURCE file still does (the case above). Commit the ref first so it is
    // TRACKED, then modify it – the guard must still reach createPairedBranch.
    const refFile = join(dir, ".lakebase", "scm-utils-ref");
    mkdirSync(join(dir, ".lakebase"), { recursive: true });
    writeFileSync(refFile, "v0.2.26\n");
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "pin scm-utils-ref");
    writeFileSync(refFile, "v0.2.27\n"); // tracked dirty runtime ref (a re-pin)
    let forked = false;
    await expect(
      cutExperiment(args(), {
        createPairedBranch: (async () => {
          forked = true;
          throw new Error("REACHED_PAIRED_CUT");
        }) as never,
        deletePairedBranch: (async () => {}) as never,
      }),
    ).rejects.toThrow(/REACHED_PAIRED_CUT/);
    expect(forked, "a dirty tracked .lakebase/*-ref is tolerated – the cut reaches createPairedBranch").toBe(true);
  });

  it("COMMITS the design corpus churn on the feature branch BEFORE forking (persists it + cleans the tree)", async () => {
    // The build lane mutates tracked corpus files (per-cycle test-list/AC status) under the artifact
    // root every cycle, but its green-commit helper EXCLUDES .consort to avoid experiment-branch
    // divergence – so the interactive path otherwise leaves that corpus uncommitted and re-dirties
    // the tree at the next cut. cutExperiment must PERSIST it (commit on the current/feature branch)
    // before forking: neither leave it uncommitted (spec history lost + tree re-dirtied) nor let a
    // tracked corpus modification block the cut. consortDir is the artifact root here.
    const corpusDir = join(dir, ".lakebase", "features", "F1-x", "stories", "S1-x");
    mkdirSync(corpusDir, { recursive: true });
    const corpusFile = join(corpusDir, "test-list.json");
    writeFileSync(corpusFile, JSON.stringify({ status: "initial" }));
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "seed corpus");
    writeFileSync(corpusFile, JSON.stringify({ status: "cycle-1-churn" })); // per-cycle mutation
    let forked = false;
    await expect(
      cutExperiment(args(), {
        createPairedBranch: (async () => {
          forked = true;
          throw new Error("REACHED_PAIRED_CUT");
        }) as never,
        deletePairedBranch: (async () => {}) as never,
      }),
    ).rejects.toThrow(/REACHED_PAIRED_CUT/);
    expect(forked, "corpus churn is persisted, not blocking – the cut reaches createPairedBranch").toBe(true);
    const dirty = execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: dir, encoding: "utf8" }).trim();
    expect(dirty, "the design corpus churn was committed on the feature branch (tree clean)").toBe("");
  });

  it("COMMITS the UX designer's materialized theme (client/src/styles/{theme,global}.css) before forking", async () => {
    // Regression (v0.3.84): the UX designer now MATERIALIZES the design system into TRACKED code —
    // client/src/styles/theme.css (:root generated from the guide) + global.css (its component
    // classes). Those are design-lane output, but they live outside .consort/, so left uncommitted
    // they trip the fail-closed tracked-source guard and REFUSE the fork ("experiment cut needs a
    // clean tree"). cutExperiment must persist them on the feature branch pre-fork, like the corpus.
    const stylesDir = join(dir, "client", "src", "styles");
    mkdirSync(stylesDir, { recursive: true });
    writeFileSync(join(stylesDir, "theme.css"), ":root { --color-brand: #ff3621; }\n");
    writeFileSync(join(stylesDir, "global.css"), ".card { background: var(--color-card); }\n");
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "seed scaffold theme");
    // The UX designer re-skins the theme to the guide (indigo) + authors its component vocabulary.
    writeFileSync(join(stylesDir, "theme.css"), ":root { --color-brand-indigo: #4840BB; }\n");
    writeFileSync(join(stylesDir, "global.css"), ".hero-value { font-size: var(--text-hero); }\n");
    let forked = false;
    await expect(
      cutExperiment(args(), {
        createPairedBranch: (async () => {
          forked = true;
          throw new Error("REACHED_PAIRED_CUT");
        }) as never,
        deletePairedBranch: (async () => {}) as never,
      }),
    ).rejects.toThrow(/REACHED_PAIRED_CUT/);
    expect(forked, "the materialized theme is persisted, not blocking – the cut reaches createPairedBranch").toBe(true);
    const dirty = execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: dir, encoding: "utf8" }).trim();
    expect(dirty, "theme.css + global.css were committed on the feature branch (tree clean)").toBe("");
  });
});
