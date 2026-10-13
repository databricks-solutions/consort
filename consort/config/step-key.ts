// The per-invocation KEY a role's effort/model config is applied on ("apply to the step, not
// the role"): a BUILD turn OR a DESIGN step. These are PURE type unions with ZERO imports – the
// lowest config layer, so ANY layer (the config-file primitive, the settings resolver, the drive
// effects) may name them without an import cycle. The action->key MAP (turnKeyForAction) needs a
// WorkflowAction and so stays UP in drive/turn-key.ts, which re-exports these for its callers.

/** The BUILD turns whose effort/model can differ within the navigator/driver loop.
 *  Each is a DISTINCT kind of work, so each can pick its own model/effort ("apply to
 *  the turn, not the role"):
 *   navigator (judgment): red (author tests), review (critique code), assess (scope
 *     contamination-fragile tests before a refactor/deploy).
 *   driver (code): green (implement), refactor (restructure code), repair (fix a
 *     regression a prior story's build broke).
 *  The specialized drive buildModes collapse onto these base families – they are the
 *  same KIND of work, differing only in what triggered them:
 *   refactor-deploy / refactor-superseded -> refactor;  assess-deploy / assess-refactor
 *   -> assess;  green-superseded -> green.
 *   reflect (the design-lane critic that grades completed code) is its own tunable turn:
 *     the optimize sweep measured it distinctly (haiku+low won), so it keys separately
 *     rather than riding the navigator scalar. */
export type BuildTurn = "red" | "green" | "review" | "refactor" | "assess" | "repair" | "reflect" | "reconcile";

/** The DESIGN/planning steps a role can be invoked for. A role runs different
 *  TASKS across these steps (spec-author BREAKDOWN vs per-story AC authoring;
 *  architect ESTIMATE vs per-story ARCHITECT notes), so a lever that wins on one
 *  step need not win on another – effort/model are keyed on the step, not the role. */
export type DesignStep =
  | "breakdown" // spec-author: enumerate the feature's stories
  | "propose" // spec-author: project feature-proposals (planning)
  | "acs" // spec-author: author a story's acceptance criteria
  | "estimate" // architect-reviewer: planning estimates
  | "architect" // architect-reviewer: per-story architecture notes
  | "dba" // dba: per-story physical schema
  | "test-list" // test-strategist: per-story test list
  | "ux"; // ux-designer: the project style guide (once)

/** The full per-invocation key effort/model can be applied on: a BUILD turn OR a
 *  DESIGN step. This is the "apply to the step, not the role" axis – the champion
 *  walk sweeps per invocation, so a winner is persisted keyed on the exact step it
 *  was measured on. A single-turn role with no key falls back to its scalar. */
export type TurnKey = BuildTurn | DesignStep;

/** `--effort` levels `claude -p` accepts, plus "default" (omit the flag). */
export type EffortLevel = "default" | "low" | "medium" | "high" | "xhigh" | "max";
