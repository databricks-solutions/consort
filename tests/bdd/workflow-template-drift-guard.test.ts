// Drift guard: consort's BUNDLED scaffold templates must stay byte-identical to the pinned
// scm-utils templates consort ships with — the WHOLE `templates/project/common/` surface
// (`.github/workflows/*.yml` AND the root kit files `consort-capture.ts`,
// `consort-test-reporter.ts`, `playwright.config.ts`), not just the workflows.
//
// WHY THIS EXISTS: consort keeps its OWN copy of the scm-utils scaffold templates under
// `templates/project/common/`, and its kit refresh (upgrade.ts `refreshSurface`) rewrites a
// project's kit surface FROM those copies on `consort-upgrade`. So if consort's bundled copies
// lag the scm-utils version it pins, every upgraded/rehydrated project gets STALE kit files.
// Two ways this has bitten us:
//   1. Workflows: at PROMOTE, scm-merge (scm-utils) compares a project's workflows against the
//      BUNDLED scm-utils templates and self-heals drift by committing onto the PR head — a
//      REDUNDANT `pr.yml` CI run every promote (observed: consort shipped `apply` vs the pinned
//      `apply-tier`).
//   2. Root kit files (2026-10-20): consort's bundle lacked the 0.3.4 root test-capture files
//      (`consort-capture.ts`, `consort-test-reporter.ts`), so a rehydrated clone could not start
//      Vitest/Playwright and the driver halted the build on a `scaffold-defect` HIL.
// This guard fails the moment the bundle and the pinned scm-utils diverge on ANY of those files.
//
// ROOT CAUSE OF THE STALENESS — and the release rule. consort's `node_modules` scm-utils, and
// therefore its vendored bundle, go stale when a repoint is done as a SURGICAL LOCK EDIT (bump
// package.json + the lock's version/resolved/integrity, no install). That updates the PIN but
// NOT `node_modules` and NOT the bundle. Proven 2026-10-20: 0.3.1->0.3.4 were all surgical lock
// edits, so `node_modules` sat at 0.3.1 while the pin said 0.3.4. REPOINT scm-utils in consort
// with a REAL install, never a surgical lock edit, then RE-VENDOR the bundle:
//   rm -rf node_modules/@databricks-solutions/lakebase-scm-utils \
//     && npm install --save-exact @databricks-solutions/lakebase-scm-utils@<ver>   # node_modules moves to the pin
//   # re-normalize the lock's `resolved` proxy->registry (see the publish-path doc)
//   cp -R node_modules/@databricks-solutions/lakebase-scm-utils/templates/project/common/. \
//      templates/project/common/     # re-vendor the WHOLE common tree (root files + scripts + workflows)
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
const CONSORT_COMMON = join(REPO_ROOT, "templates/project/common");
const SCMUTILS_COMMON = join(REPO_ROOT, "node_modules/@databricks-solutions/lakebase-scm-utils/templates/project/common");
const CONSORT_WF = join(CONSORT_COMMON, ".github/workflows");
const SCMUTILS_WF = join(SCMUTILS_COMMON, ".github/workflows");

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

// Root-level kit files under common/ are refreshed by consort-upgrade's refreshSurface too, so they
// must ALSO stay byte-identical to the pinned scm-utils — the drift that shipped projects missing the
// 0.3.4 test-capture files and halted the build on a `scaffold-defect`. These are the kit-owned code
// files (not the project-owned config / scaffold-source ones refreshSurface deliberately skips).
describe("scaffold ROOT kit files stay in parity with the pinned scm-utils (refreshSurface ships them on upgrade)", () => {
  for (const file of ["consort-capture.ts", "consort-test-reporter.ts", "playwright.config.ts"]) {
    it(`${file}: consort's bundled copy is byte-identical to the bundled scm-utils copy`, () => {
      const consort = readFileSync(join(CONSORT_COMMON, file), "utf8");
      const scmUtils = readFileSync(join(SCMUTILS_COMMON, file), "utf8");
      expect(
        consort,
        `${file} drifted from the pinned scm-utils — repoint via a REAL npm install + re-vendor the whole ` +
          `templates/project/common/ tree (see this test's header); a surgical lock edit leaves it stale`,
      ).toBe(scmUtils);
    });
  }
});
