// Park the currently-claimed feature and SWITCH the dashboard to another — the consort half of the
// "shelve a built-but-undeployed feature and go drive another" workflow.
//
// WHY this exists. The SCM claim lives in `.lakebase/workflow-state.json` and `lakebase-scm-park-feature`
// (scm-utils) frees it while KEEPING the paired branch. But the dashboard reads the CURRENT feature from
// `.consort/next.json`'s `feature` field (apps/dashboard/lib/consort.ts), which only the drive rewrites
// (at stop). So after parking + adopting/claiming another feature out-of-band, the dashboard keeps
// showing the PRIOR feature. This operation closes that gap: it parks the SCM claim AND re-points the
// consort bookkeeping (`next.json`) at the target feature, so the dashboard follows immediately.
//
// It deliberately does NOT touch `.consort/workflow-state.json`'s `phase_feature_id`: leaving it on the
// parked feature is correct — the target feature's own drive owner-mismatches and re-derives its phase
// (gates/workflow-phase.ts), while the parked feature keeps its coarse phase for a clean resume. Resuming
// is itself free: `lakebase-scm-claim-feature-branch <parked>` re-claims from scaffold-complete and
// reuses the kept paired branch as-is.
//
// Pure orchestration over injected seams (the lk-shim park spawn, the SCM claim read, the next.json
// repoint) so it is unit-testable without spawning a child process or hitting Lakebase.

import { findFeatureDir } from "../../config/consort-paths.js";
import { basename } from "node:path";

export class ParkSwitchError extends Error {
  constructor(
    message: string,
    public readonly code: "unknown-target-feature" | "park-failed",
  ) {
    super(message);
    this.name = "ParkSwitchError";
  }
}

export interface ParkSwitchArgs {
  consortDir: string;
  /** The feature to switch TO (as typed; resolved to its canonical `.consort/features/<F>` id). */
  toFeature: string;
}

export interface ParkSwitchDeps {
  /** Read the currently-claimed feature id from the SCM state (for reporting), or null if none. */
  readClaimedFeature: () => string | null;
  /** Free the current SCM claim, KEEPING the paired branch (lakebase-scm-park-feature). Throws on failure. */
  parkClaim: () => Promise<void>;
  /** Re-point the consort bookkeeping (next.json) at the target feature. */
  repointNext: (canonicalFeatureId: string) => void;
}

export interface ParkSwitchResult {
  /** The feature whose claim was freed (branch kept), or null if nothing was claimed. */
  parkedFeatureId: string | null;
  /** The canonical id the dashboard now points at. */
  switchedToFeatureId: string;
}

/**
 * Resolve `toFeature` to the canonical feature id the dashboard keys by — the `.consort/features/<F>`
 * directory basename — so a user-typed slug or different case still points at the real feature (and a
 * typo fails loud instead of writing a dangling pointer the dashboard can't match to a feature).
 */
export function resolveCanonicalFeature(consortDir: string, toFeature: string): string {
  const dir = findFeatureDir(consortDir, toFeature);
  if (!dir) {
    throw new ParkSwitchError(
      `No feature "${toFeature}" under ${consortDir}/features. Pass the feature id of a real .consort/features/<F> directory.`,
      "unknown-target-feature",
    );
  }
  return basename(dir);
}

/**
 * Park the current claim (keep its branch) and switch the dashboard to `toFeature`. Order matters:
 * resolve + validate the target FIRST (so a typo never parks the current claim for nothing), read the
 * claimed feature for the report, park, then repoint. A park failure surfaces as `park-failed` and the
 * bookkeeping is left untouched (no half-switch).
 */
export async function parkAndSwitch(
  args: ParkSwitchArgs,
  deps: ParkSwitchDeps,
): Promise<ParkSwitchResult> {
  const canonical = resolveCanonicalFeature(args.consortDir, args.toFeature);
  const parked = deps.readClaimedFeature();
  try {
    await deps.parkClaim();
  } catch (err) {
    throw new ParkSwitchError(
      `Failed to park the current claim: ${err instanceof Error ? err.message : String(err)}`,
      "park-failed",
    );
  }
  deps.repointNext(canonical);
  return { parkedFeatureId: parked, switchedToFeatureId: canonical };
}
