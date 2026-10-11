// A `/design` run must leave the feature branch with its design corpus COMMITTED, not sitting
// uncommitted in the working tree. An uncommitted design output (design-guide.json, theme.css,
// the favicon/app-icon, src/assets) re-dirties the tree and blocks the next experiment fork's
// clean-tree check — the exact state a human/agent otherwise hand-commits ad hoc.
//
// The commit primitive is `commitExperimentCode` (behaviorally covered in
// consort-accept-commit-pending.test.ts: it force-includes the design/architecture corpora and
// allow-lists the new client/src assets). This file guards the WIRING: that drive.cli.ts, when the
// run STOPS AT THE DESIGN BOUND (`stoppedAt.kind === "design-complete"`), commits the corpus.
// drive.cli.ts is a self-invoking bin (relies on the dist's __dirname shim), so it cannot be run
// from source in-process; a static source assertion is the proportionate wiring check (same approach
// as drive-foreign-claim-guard.test.ts / drive-bin-resolution.test.ts).

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const DRIVE_SRC = readFileSync(new URL("../../bin/consort/drive.cli.ts", import.meta.url), "utf8");

describe("consort-drive commits the design corpus when a /design run completes", () => {
  it("imports commitExperimentCode from the pipeline cycle-record module", () => {
    expect(DRIVE_SRC).toMatch(/import\s*\{[^}]*\bcommitExperimentCode\b[^}]*\}\s*from\s*["'][^"']*cycle-record/);
  });

  it("commits only when the drive stopped at the design-complete bound", () => {
    // Anchor the commit to the design-complete stop (not every bounded stop — build/deploy have
    // their own commit paths at accept).
    const idx = DRIVE_SRC.indexOf('stoppedAt?.kind === "design-complete"');
    expect(idx).toBeGreaterThan(-1);
    const region = DRIVE_SRC.slice(idx, idx + 900);
    // It RUNS the commit, with a message that marks it as the design capture.
    expect(region).toMatch(/commitExperimentCode\(/);
    expect(region).toMatch(/design corpus|design:/i);
  });

  it("surfaces a protected-tier commit (design must run on the feature branch), best-effort otherwise", () => {
    const idx = DRIVE_SRC.indexOf('stoppedAt?.kind === "design-complete"');
    const region = DRIVE_SRC.slice(idx, idx + 900);
    // A protected-tier commit re-throws (a real misconfiguration); any other failure is swallowed
    // so a completed design never fails on a bookkeeping commit.
    expect(region).toMatch(/ProtectedBranchCommitError/);
    expect(region).toMatch(/throw e;/);
  });
});
