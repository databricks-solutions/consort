// Design fingerprint for the stale-experiment guardrail.
//
// A story's build experiment is cut to implement a SPECIFIC design (its
// test-list). If the story is later sent back to the design lane and re-authored
// WITHOUT tearing the experiment down (the `withdraw-gate` + `set --status
// designing` hand-surgery, instead of `revise` / `consort-reopen-story`, both of
// which discard the experiment), the rebuild REUSES the still-active experiment
// (nextBuildAction skips cutting a new one when experimentCut is true), so the
// abandoned design's code + tests ride into the accept-merge, surfacing as
// unrelated failures cycles later. No gate flagged the leftover artifacts.
//
// The guardrail: stamp the experiment with a fingerprint of the design it was cut
// to build (the test-list content) at cut time. When the drive would reuse an
// active experiment whose stamped fingerprint no longer matches the CURRENT design
// on disk, the story was re-authored under it – the experiment is STALE – so the
// derivation treats it like a discarded one and forces a fresh re-cut (which drops
// the stale paired branch and re-stamps the current design).
//
// CRITICAL: the fingerprint must hash the test-list's DESIGN identity ONLY, never
// its build-mutable fields. The build DOES rewrite the test-list in place – each
// item's `status` moves pending -> green as the Driver greens it (stockflow-3-88:
// T17..T20 pending -> green). If the raw file were hashed, that status churn would
// shift the fingerprint mid-build and falsely flag the STILL-VALID experiment as
// stale, triggering a re-cut (`--reset-stale-branch`) that DISCARDS the just-built
// GREEN work – on every experiment, the moment its first test greens. So the design
// projection strips the mutable build fields; only a genuine redesign (which tests,
// mapped to which ACs, of what kind) moves the fingerprint.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { storyTestListJson } from "../config/consort-paths.js";

/** Test-list fields the BUILD mutates in place (not design): they must be excluded
 *  from the design fingerprint, or greening a test would falsely mark the experiment
 *  stale. `status` is the live one; the rest are defensive against build-state fields
 *  a future test-list shape may carry (cycle bookkeeping / run timestamps). */
const MUTABLE_TESTLIST_FIELDS = new Set([
  "status",
  "green_at",
  "cycle_ids",
  "cycles",
  "last_run",
  "updated_at",
]);

/** A test-list item projected to its DESIGN identity: every field except the
 *  build-mutable ones (id / ac_id / kind / layer / nfr_id / description / scenario_file
 *  and any other authored field are kept; `status` etc. are dropped). Non-object items
 *  pass through unchanged. Key order is preserved so the canonical JSON is stable. */
function designOnlyItem(item: unknown): unknown {
  if (!item || typeof item !== "object" || Array.isArray(item)) return item;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
    if (!MUTABLE_TESTLIST_FIELDS.has(k)) out[k] = v;
  }
  return out;
}

/**
 * A stable content fingerprint of the design output a story's build implements ,
 * its test-list. Normalized to canonical JSON so incidental formatting churn does
 * not read as a design change, and projected to design identity (build-mutable
 * fields like each item's `status` are EXCLUDED) so a normal build turning tests
 * green never shifts it. The semantic content (the ordered set of tests, each with
 * its ac mapping + kind) is what is hashed. Returns `undefined` when there is no
 * readable/parseable test-list to hash – so a story with no design yet yields NO
 * fingerprint, and an experiment carrying no stamped fingerprint (cut before this
 * guardrail, or with no test-list) is never falsely flagged stale.
 */
export function storyDesignFingerprint(
  consortDir: string,
  feature: string,
  story: string,
): string | undefined {
  try {
    const raw = readFileSync(storyTestListJson(consortDir, feature, story), "utf8");
    const parsed = JSON.parse(raw) as { items?: unknown };
    const items = Array.isArray(parsed.items) ? parsed.items.map(designOnlyItem) : parsed.items;
    const canonical = JSON.stringify({ ...parsed, items });
    return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
  } catch {
    return undefined;
  }
}
