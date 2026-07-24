// FEIP-8023: driving a feature whose recorded SCM claim names a DIFFERENT
// feature (a prior feature shipped out-of-band, .lakebase/workflow-state.json
// never reconciled) must be refused loud , otherwise the drive derives the
// experiment's parent from the stale predecessor branch and commits build output
// onto the wrong branch.
//
// The DECISION is the pure `isForeignFeatureClaim` (behaviorally covered in
// scm-workflow-state.test.ts). This file guards the WIRING: that the feature
// drive path in drive.cli.ts consults it and refuses (returns 2) before running
// the driver. drive.cli.ts is a self-invoking bin that relies on the dist's
// __dirname shim, so it cannot be imported or run from source in-process; a
// static source assertion (the same approach as drive-bin-resolution.test.ts) is
// the proportionate wiring check without a full dist build.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const DRIVE_SRC = readFileSync(new URL("../../scripts/sftdd/drive.cli.ts", import.meta.url), "utf8");

describe("lakebase-sftdd-drive wires the foreign-claim refusal (FEIP-8023)", () => {
  it("imports the isForeignFeatureClaim decision from the SCM workflow state module", () => {
    expect(DRIVE_SRC).toMatch(/import\s*\{[^}]*\bisForeignFeatureClaim\b[^}]*\}\s*from\s*["']@databricks-solutions\/lakebase-scm-utils\/lakebase/);
  });

  it("refuses the feature drive (returns 2) when the claim is foreign, before running the driver", () => {
    // The guard block: consult isForeignFeatureClaim on the drive's own project,
    // print a refusal, and bail non-zero.
    expect(DRIVE_SRC).toMatch(/isForeignFeatureClaim\s*\(/);
    // Anchor the guard to a refusal message + a non-zero return so it is not a
    // dead reference (the message and exit are the shipped behavior).
    const guardRegion = DRIVE_SRC.slice(DRIVE_SRC.indexOf("isForeignFeatureClaim("));
    expect(guardRegion).toMatch(/refusing to drive/i);
    expect(guardRegion).toMatch(/return 2;/);
    // Points the operator at the remedy, not a bare failure.
    expect(guardRegion).toMatch(/claim|reconcile|resume/i);
  });
});
