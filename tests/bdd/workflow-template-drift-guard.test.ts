// Drift guard: consort's BUNDLED scaffold workflow templates must stay byte-identical to the
// pinned scm-utils templates consort ships with.
//
// WHY THIS EXISTS: consort keeps its OWN copy of the scaffold workflow templates under
// `templates/project/common/.github/workflows/*.yml`, and its kit refresh (upgrade.ts
// KIT_SURFACE_PATHS) rewrites a project's `.github/workflows` FROM those copies. At PROMOTE,
// scm-merge (scm-utils) compares a project's workflows against the BUNDLED scm-utils templates
// and self-heals any drift by committing the refresh onto the PR head — which re-triggers the
// entire `pr.yml` CI (a REDUNDANT run every promote). So if consort's copies lag the scm-utils
// version it pins, each promotion wastes a CI run (observed: consort shipped `apply` while the
// pinned scm-utils shipped `apply-tier`). This guard fails the moment they diverge.
//
// WHAT TO DO WHEN THIS FAILS — this is the tiered-upgrade checklist. A tiered (scm-utils ->
// consort) upgrade that bumps the pinned scm-utils AND changes a scaffold workflow leaves
// consort's own copies stale. Re-sync them from the bundled (pinned) scm-utils:
//   npm ci   # if node_modules lags the pinned version in package-lock.json
//   cp node_modules/@databricks-solutions/lakebase-scm-utils/templates/project/common/.github/workflows/*.yml \
//      templates/project/common/.github/workflows/
// then re-run this test. Keep this in the consort repoint/release ritual whenever scm-utils moves.
//
// NOTE: scripts/run-tests.sh is intentionally NOT guarded here. Its Playwright E2E block is
// appended per-project by scm-utils' `enableE2eForProject` (never inline in consort's template),
// so a byte-equality check would false-fire. Its non-e2e body parity is the separate e2e-assembly
// convergence effort, documented in the run-tests.sh template header.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CONSORT_WF = join(REPO_ROOT, "templates/project/common/.github/workflows");
const SCMUTILS_WF = join(
  REPO_ROOT,
  "node_modules/@databricks-solutions/lakebase-scm-utils/templates/project/common/.github/workflows",
);

describe("scaffold workflow templates stay in parity with the pinned scm-utils (no promote-time self-heal → no redundant PR CI)", () => {
  for (const file of ["merge.yml", "pr.yml", "cleanup-orphans.yml"]) {
    it(`${file}: consort's bundled copy is byte-identical to the bundled scm-utils copy`, () => {
      const consort = readFileSync(join(CONSORT_WF, file), "utf8");
      const scmUtils = readFileSync(join(SCMUTILS_WF, file), "utf8");
      expect(
        consort,
        `${file} drifted from the pinned scm-utils — re-sync templates/project/common/.github/workflows/${file} ` +
          `from node_modules/@databricks-solutions/lakebase-scm-utils (see this test's header for the tiered-upgrade steps)`,
      ).toBe(scmUtils);
    });
  }
});
