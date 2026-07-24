// Split-readiness guard for the lakebase-scm-utils extraction (Track C, Phase 0).
//
// The SCM + substrate modules under scripts/{lakebase,github,git,util} must NOT
// import from scripts/sftdd/, so they can move to the standalone lakebase-scm-utils
// package without dragging the SFTDD orchestration with them. The dependency
// direction is one-way: SFTDD depends on the substrate, never the reverse.
//
// A small, EXPLICIT allowlist captures the accepted composition points that
// legitimately reach into sftdd and stay on the kit (SFTDD) side at the split:
// the project scaffolders (create-project / adopt-*) and the scm-doctor CLI's
// injected stale-branch finder (the module scm-doctor.ts itself is sftdd-free;
// the CLI wires the finder in and relocates to the kit at split time). Any NEW
// sftdd import from an SCM-core module fails this test.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const SCM_DIRS = ["scripts/lakebase", "scripts/github", "scripts/git", "scripts/util"];

// Accepted sftdd-importing composition points (relative to repo root). These stay
// on the SFTDD side of the split; everything else under the SCM dirs must be clean.
const ALLOWLIST = new Set<string>([
  "scripts/lakebase/create-project.ts",
  "scripts/lakebase/create-project.cli.ts",
  "scripts/lakebase/adopt-sftdd.ts",
  "scripts/lakebase/adopt-lakebase-project.ts",
  "scripts/lakebase/resolve-sftdd-dir.cli.ts",
  "scripts/lakebase/scm-doctor.cli.ts",
]);

/** A relative import whose path segments include an `sftdd/` dir. */
const SFTDD_IMPORT = /from\s+["'](?:\.\.\/)+sftdd\//;

function walkTs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(REPO_ROOT, dir))) {
    const rel = `${dir}/${entry}`;
    const abs = join(REPO_ROOT, rel);
    if (statSync(abs).isDirectory()) out.push(...walkTs(rel));
    else if (entry.endsWith(".ts")) out.push(rel);
  }
  return out;
}

describe("SCM core carries no sftdd import (lakebase-scm-utils split-readiness)", () => {
  const importers = SCM_DIRS.flatMap(walkTs).filter((rel) =>
    SFTDD_IMPORT.test(readFileSync(join(REPO_ROOT, rel), "utf8")),
  );

  it("no SCM/substrate module imports scripts/sftdd/ outside the accepted allowlist", () => {
    const offenders = importers.filter((rel) => !ALLOWLIST.has(rel));
    expect(offenders, `unexpected sftdd import(s) in SCM core: ${offenders.join(", ")}`).toEqual([]);
  });

  it("scm-doctor.ts (SCM core) is sftdd-free (the finder is injected via RunDoctorDeps)", () => {
    expect(importers).not.toContain("scripts/lakebase/scm-doctor.ts");
  });
});
