// Pre-condition PREPARERS: the ONE source of truth for the deterministic CONTEXT a BUILD
// turn is pre-conditioned with before dispatch. A preparer is a PURE PROJECTION of on-disk
// `.consort` (never authored, so it cannot drift): given the workspace .consort + the action's
// feature/story/ac (+ optional knobs), it returns a text BLOCK the build-instructions phase
// appends to the prompt.
//
// Two tracks consume THESE preparers, so a turn is pre-conditioned identically no matter
// which dispatched it:
//   - the real drive's `roleTaskBody` (consort/orchestrator/drive/orchestrator-effects.ts) – positioned
//     (the context-pack rides AFTER the directive; the green-failure advisory rides BEFORE
//     "ASSESS ..."), and
//   - the executor's PREPARE-PRECONDITIONS phase (turn/step-executor.ts) – declared on
//     the step's `preconditions()` face + appended to its instructions.
//
// See PRE-CONDITIONING-AS-CONTRACT.md (this dir). The context-pack projection already lives
// in build-context.ts (the ONE buildContextPack); this module adds the green-failure
// advisory projection + the KIND -> preparer registry the executor + roleTaskBody resolve.

import { buildContextPack } from "./build-context.js";
import { readGreenFailure } from "../../smells/supersession.js";
import { renderTestAnalystRoster } from "../../test-list/test-analyst-roster.js";
import { resolveProjectSettings } from "../../config/consort-config-file.js";

/** The scope a preparer projects against (a pure read of on-disk `.consort`). */
export interface PreparerContext {
  consortDir: string;
  featureId: string;
  story: string;
  /** The AC in ac-loop; "" at story scope. */
  ac: string;
  /** The project root. Threaded so a preparer can resolve project-level config (e.g. the
   *  test-analyst-roster preparer reads project.uiTrack to gate the `client` analyst). Optional
   *  for back-compat with preparers that project only from consortDir; absent => "". */
  projectDir?: string;
  /** Preparer-specific knobs (e.g. context-pack's { skipTestLoop }). */
  options?: Record<string, unknown>;
}

/** A preparer: a pure projection of on-disk artifacts to a prompt text block ("" when the
 *  source is absent – the best-effort degrade the phase surfaces as an empty-warning). */
export type PreconditionPreparer = (ctx: PreparerContext) => string;

/**
 * The green-failure advisory: the deterministic PRE-LOCALIZATION the orchestrator recorded
 * into `green-failure.json` at verify-failure time, projected as the assess turn's leading
 * "start HERE" block so the Navigator does NOT re-scan the tree to rediscover a failure the
 * verify already reported. THREE sub-blocks, in fixed order – the verify's own captured
 * failure output (the general pre-localizer), then the contract-clean code refs, then the
 * superseded-test candidates. Byte-identical to the block `roleTaskBody`'s assess branch
 * assembled inline (this is the migration to the orchestrator family: one projection, two
 * consumers). Empty when there is no marker or none of the three fields are present.
 */
export function buildGreenFailureAdvisory(consortDir: string, featureId: string, story: string, ac: string): string {
  const gfAssess = ac ? readGreenFailure(consortDir, featureId, story, ac) : undefined;
  // The verify's OWN captured failure output (failing node-ids + top error, e.g. "Cannot
  // find module ../../src/pages/StockViewPage"). The general pre-localization for failures
  // the deterministic column-drop gates CANNOT localize (a missing client component, a
  // broken import) – so the Navigator starts from the REAL failure instead of re-scanning
  // the tree to rediscover what the verify already reported.
  const failureAdvisory = gfAssess?.failureOutput
    ? `THE VERIFY'S OWN FAILURE OUTPUT (start HERE – it names the failing test(s) + the root error; do NOT re-run` +
      ` or re-scan the tree to rediscover this). Read the referenced file(s) directly to confirm the cause:\n` +
      `\`\`\`\n${gfAssess.failureOutput}\n\`\`\`\n\n`
    : "";
  // DETERMINISTIC contract-clean advisory: when the first GREEN-failure found production
  // code still referencing a migration-dropped column, the gate localized the exact
  // file:line refs. Inject them so the Navigator's regression fix covers them WITHOUT
  // having to re-localize (the live ceiling), while it still independently flags the
  // superseded prior tests below. Empty when no contract refs were found.
  const contractAdvisory = gfAssess?.contractRefs
    ? `DETERMINISTIC contract-clean has ALREADY localized the production-code references to the migration-` +
      `dropped column(s) below – you do NOT need to re-find them. Record EXACTLY these as a driver-fixable` +
      ` regression via assess-regression --fix (path (b)), AND SEPARATELY flag any prior tests that assert the` +
      ` dropped column as superseded (path (a)) – a column drop needs BOTH the code fix and the test refactor` +
      ` in the same repair turn:\n${gfAssess.contractRefs}\n\n`
    : "";
  // The test-side counterpart: DETERMINISTIC pre-localization of the PRIOR TESTS that
  // reference the dropped symbol, so the Navigator flags EXACTLY these as superseded
  // (path (a)) instead of searching the test tree.
  const supersededAdvisory = gfAssess?.supersededTestRefs ? `${gfAssess.supersededTestRefs}\n\n` : "";
  // DETERMINISTIC test-authoring-smell advisory: checkTestSmells localized a known
  // smell (broad-integrity-except, delete-teardown, loose-locator, ...) with its
  // exact per-occurrence fix. These are SURGICALLY driver-fixable IN PLACE, so the
  // assess must record a driver fixDirective (path (b)) that applies the fix to the
  // TEST file – NOT a spec-defect reopen (the F1/F6 blanket-except teardown churn).
  const testSmellAdvisory = gfAssess?.testSmellRefs
    ? `DETERMINISTIC test-authoring smell(s) localized below with the EXACT fix per occurrence. This is` +
      ` NOT a spec-defect and NOT a reason to reopen the story from the test-strategist – the fix is a` +
      ` SURGICAL, in-place edit to the TEST file (e.g. narrow a blanket \`except Exception\` to the specific` +
      ` error, or drop a pointless best-effort teardown), and the app is correct. Record it as a driver-fixable` +
      ` repair via assess-regression --fix (path (b)) whose fix directive is EXACTLY the per-smell fix below;` +
      ` do NOT recommend consort-reopen-story:\n${gfAssess.testSmellRefs}\n\n`
    : "";
  return failureAdvisory + contractAdvisory + supersededAdvisory + testSmellAdvisory;
}

/**
 * The KIND -> preparer registry. Adding a pre-condition kind = register a pure projection
 * HERE (the executor + roleTaskBody resolve it by name), never a new hardcoded prompt-
 * assembly site. `context-pack` reuses the extracted buildContextPack (one source of truth);
 * `green-failure-advisory` reuses the projection above.
 */
export const PRECONDITION_PREPARERS: Record<string, PreconditionPreparer> = {
  "context-pack": (ctx) =>
    buildContextPack(ctx.consortDir, ctx.featureId, ctx.story, ctx.ac, {
      skipTestLoop: !!(ctx.options && (ctx.options as { skipTestLoop?: boolean }).skipTestLoop),
    }),
  "green-failure-advisory": (ctx) => buildGreenFailureAdvisory(ctx.consortDir, ctx.featureId, ctx.story, ctx.ac),
  // The test-analyst roster: project the ENABLED test-analyst catalogue (client gated on the
  // project's uiTrack) into the test-strategist supervisor's turn so it Task-spawns one analyst
  // subagent per enabled kind. Reads project.uiTrack from projectDir; absent => true.
  "test-analyst-roster": (ctx) => {
    const projectDir = ctx.projectDir ?? "";
    const uiTrack = projectDir ? resolveProjectSettings(projectDir).project.uiTrack : true;
    // Per-analyst lever overrides (the optimize sweep's target) ride the precondition `options`,
    // so they are per-turn (parallel-safe – no env, no shared file). The normal drive sets none.
    const overrides = (ctx.options as { analystOverrides?: Record<string, { model?: string; effort?: "low" | "default" | "high"; toolScope?: string[] }> } | undefined)?.analystOverrides;
    return renderTestAnalystRoster({ projectDir, uiTrack }, overrides ? { overrides } : {});
  },
};

/** Resolve a precondition KIND to its preparer. THROWS loud on an unknown kind – a manifest/
 *  contract-authoring bug the orchestrator must never silently no-op (mirrors resolveValidator). */
export function resolvePreparer(kind: string): PreconditionPreparer {
  const p = PRECONDITION_PREPARERS[kind];
  if (!p) {
    const known = Object.keys(PRECONDITION_PREPARERS).join(", ");
    throw new Error(`preconditions: unknown preparer kind "${kind}" – register it in PRECONDITION_PREPARERS (known: ${known}).`);
  }
  return p;
}
