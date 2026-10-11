// The test-analyst ROSTER renderer: the pure projection that bridges the TS TEST_ANALYST_CATALOGUE
// (which a `claude -p` supervisor agent can't import) into a text block the supervisor reads and
// Task-spawns from. A preconditions PREPARER ("test-analyst-roster", registered in preconditions.ts)
// calls renderTestAnalystRoster with the turn's projectDir; it resolves the project's uiTrack, FILTERS
// the catalogue to the ENABLED analysts (a no-frontend project drops `client`), and emits the enabled
// roster + each analyst's focus prompt + declared inputs as a fenced JSON block appended to the
// supervisor's task. The supervisor spawns ONE general-purpose Task subagent per listed analyst with
// the given focus_prompt, then reconciles + assembles. Pure projection (no disk writes), so it can't
// drift from the catalogue – the single source of truth.

import { enabledAnalysts, type AnalystEnablementContext } from "./test-analyst-catalogue.js";

/** A per-analyst lever override (the optimize sweep's target): patch an enabled analyst's model /
 *  effort / tool_scope in the rendered roster, so the supervisor spawns THAT analyst's Task with the
 *  swept levers. Keyed by analyst kind. Only the set fields override; the rest fall through to the
 *  catalogue default. An override for a disabled/absent kind is simply ignored (never enables one). */
export interface AnalystOverride {
  model?: string;
  effort?: "low" | "default" | "high";
  toolScope?: string[];
}

/** Options for the roster render. `overrides` (optimize-sweep only) patches per-analyst levers; the
 *  normal drive passes none, so the roster is exactly the catalogue defaults. */
export interface RenderRosterOptions {
  overrides?: Record<string, AnalystOverride>;
}

/** Render the enabled-analyst roster for a project as the injected supervisor context block. Pure:
 *  the project-specific input is `uiTrack` (which gates `client`); `opts.overrides` (optimize sweep)
 *  patches per-analyst model/effort/tool_scope. Returns a fenced JSON block the supervisor parses;
 *  empty string only if somehow no analyst is enabled (never, fitness+behavior are unconditional). */
export function renderTestAnalystRoster(ctx: AnalystEnablementContext, opts: RenderRosterOptions = {}): string {
  const overrides = opts.overrides ?? {};
  const analysts = enabledAnalysts(ctx).map((e) => {
    const ov = overrides[e.kind] ?? {};
    // The candidate override WINS over the catalogue default for the swept axes (model enforced as
    // the Task param; effort/tool_scope restated by the supervisor). Absent override = catalogue value.
    const model = ov.model ?? e.model;
    const effort = ov.effort ?? e.effort;
    const toolScope = ov.toolScope ?? e.toolScope;
    return {
      kind: e.kind,
      model,
      // ADVISORY levers: the Task tool has no effort/allowedTools parameter, so the supervisor RESTATES
      // these in each spawn prompt and the subagent self-paces/self-limits. model (above) IS enforced
      // (a real Task param). Omitted when neither the entry nor the override sets one.
      ...(effort ? { effort } : {}),
      ...(toolScope ? { tool_scope: toolScope } : {}),
      inputs: e.inputs,
      focus_prompt: e.focusPrompt,
    };
  });
  if (analysts.length === 0) return "";
  const payload = JSON.stringify({ analysts }, null, 2);
  return (
    `<<TEST-ANALYST ROSTER – spawn ONE Task subagent (subagent_type general-purpose) per entry below, ` +
    `passing its focus_prompt VERBATIM + the story inputs it declares. You MUST set the Task's model to ` +
    `the entry's "model" EXACTLY – never substitute your own model choice. When an entry gives "effort" ` +
    `or "tool_scope", you MUST RESTATE them VERBATIM at the top of that spawn's prompt – "Think at ` +
    `<effort> effort." and "Confine your work to these tools: <tool_scope>." – since the Task tool takes ` +
    `no effort/tool parameters (the analyst self-paces/self-limits on your instruction); do not paraphrase ` +
    `or omit them. These are the ` +
    `ENABLED analysts for THIS project (a no-frontend project omits "client"). Collect each analyst's ` +
    `returned UNORDERED slice, then RECONCILE (discrepancies / overlaps / omissions), ASSEMBLE + ORDER ` +
    `the feature master, and assign the final feature-flat T-ids – see your role prompt for the ` +
    `reconciliation contract.>>\n` +
    "```json\n" + payload + "\n```\n" +
    `<<END TEST-ANALYST ROSTER>>\n`
  );
}
