// The action->key MAP for the per-invocation KEY a role's effort/model config is applied on
// ("apply to the step, not the role"). The KEY TYPES themselves (BuildTurn/DesignStep/TurnKey/
// EffortLevel) are PURE unions with zero imports, so they live in the lowest config layer
// (consort/config/step-key.ts); this module imports them DOWN and RE-EXPORTS them so its long-
// standing callers (which import the types from here) keep working unchanged. The MAP stays here
// because it needs a WorkflowAction. Both the settings resolver and the drive effects derive the
// key from this ONE place – without an import cycle.

import type { WorkflowAction } from "./orchestrator-drive.js";
import type { BuildTurn, DesignStep, TurnKey, EffortLevel } from "../../config/step-key.js";
export type { BuildTurn, DesignStep, TurnKey, EffortLevel } from "../../config/step-key.js";

/** Map an invoke-role action to its TurnKey – the per-invocation step the config's
 *  effort/model can be keyed on ("apply to the step, not the role"). BUILD turns:
 *  navigator review|red, driver refactor|green (reflect is a design-lane critic on
 *  the base model, so no key). DESIGN steps: spec-author breakdown|propose|acs,
 *  architect-reviewer estimate|architect, dba, test-strategist test-list, ux-designer
 *  ux. Returns undefined only for actions with no distinct step (fall back to scalar). */
export function turnKeyForAction(action: WorkflowAction): TurnKey | undefined {
  if (action.kind !== "invoke-role") return undefined;
  // Build turns first (buildMode-carrying navigator/driver turns). Each specialized
  // buildMode collapses onto its base BuildTurn family – the same KIND of work, so it
  // picks that family's model/effort. (reflect is the design-lane critic, no build key.)
  if ("buildMode" in action) {
    switch (action.buildMode) {
      case "reflect":
        return "reflect"; // design-lane critic, tuned as its own turn (sweep: haiku+low)
      case "reconcile":
        return "reconcile"; // feature-complete symmetric cross-story reconciliation — its OWN step key (NOT red)
      case "review":
        return "review";
      case "refactor":
      case "refactor-deploy":
      case "refactor-superseded": // BUGFIX: previously fell through to undefined
        return "refactor";
      case "assess":
      case "assess-deploy":
      case "assess-refactor":
        return "assess";
      case "repair":
        return "repair";
      case "green-superseded":
        return "green";
    }
  }
  // Planning-mode design steps.
  if ("mode" in action) {
    if (action.role === "spec-author" && action.mode === "breakdown") return "breakdown";
    if (action.role === "spec-author" && action.mode === "propose") return "propose";
    if (action.role === "architect-reviewer" && (action.mode === "estimate" || action.mode === "estimate-committed")) return "estimate";
    // UX Designer: establish (project-level) + per-story ia refinement both resume
    // under the "ux" role key (per-story scoping is the manifest's resumeKeyFrom),
    // mirroring the architect returning "architect" for every story.
    if (action.role === "ux-designer") return "ux";
    // author-requests is human input, no agent turn – no key.
    return undefined;
  }
  // Story-scoped design steps (no mode/buildMode, has a story).
  if ("story" in action && action.story) {
    if (action.role === "spec-author") return "acs";
    if (action.role === "architect-reviewer") return "architect";
    if (action.role === "dba") return "dba";
    if (action.role === "test-strategist") return "test-list";
  }
  // Plain build turns (no buildMode): navigator RED, driver GREEN.
  if (action.role === "navigator") return "red";
  if (action.role === "driver") return "green";
  return undefined;
}
