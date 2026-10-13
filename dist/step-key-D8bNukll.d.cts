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
type BuildTurn = "red" | "green" | "review" | "refactor" | "assess" | "repair" | "reflect" | "reconcile";
/** The DESIGN/planning steps a role can be invoked for. A role runs different
 *  TASKS across these steps (spec-author BREAKDOWN vs per-story AC authoring;
 *  architect ESTIMATE vs per-story ARCHITECT notes), so a lever that wins on one
 *  step need not win on another – effort/model are keyed on the step, not the role. */
type DesignStep = "breakdown" | "propose" | "acs" | "estimate" | "architect" | "dba" | "test-list" | "ux";
/** The full per-invocation key effort/model can be applied on: a BUILD turn OR a
 *  DESIGN step. This is the "apply to the step, not the role" axis – the champion
 *  walk sweeps per invocation, so a winner is persisted keyed on the exact step it
 *  was measured on. A single-turn role with no key falls back to its scalar. */
type TurnKey = BuildTurn | DesignStep;
/** `--effort` levels `claude -p` accepts, plus "default" (omit the flag). */
type EffortLevel = "default" | "low" | "medium" | "high" | "xhigh" | "max";

export type { BuildTurn as B, EffortLevel as E, TurnKey as T };
