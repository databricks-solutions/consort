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
export type BuildTurn = "red" | "green" | "review" | "refactor" | "assess" | "repair" | "reflect" | "reconcile" | "reauthor";

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

// ── Runtime vocabularies ────────────────────────────────────────────────────
// The unions above are compile-time only; a validator (the model-config doctor) needs the
// vocabularies at RUNTIME to check a project's per-step config keys/values. These const arrays are
// that single runtime home. The `satisfies` below makes tsc FAIL if an array lists a value that is
// NOT in its union; the `_assert*` aliases below make tsc FAIL if a union member is MISSING from its
// array — so the arrays can never silently drift from the types. Still zero imports (lowest layer).

/** Every BUILD turn, at runtime (order = the loop's natural order). */
export const ALL_BUILD_TURNS = ["red", "green", "review", "refactor", "assess", "repair", "reflect", "reconcile", "reauthor"] as const satisfies readonly BuildTurn[];
/** Every DESIGN step, at runtime. */
export const ALL_DESIGN_STEPS = ["breakdown", "propose", "acs", "estimate", "architect", "dba", "test-list", "ux"] as const satisfies readonly DesignStep[];
/** Every per-invocation TurnKey (build turns + design steps) a role's model/effort map may key on. */
export const ALL_TURN_KEYS = [...ALL_BUILD_TURNS, ...ALL_DESIGN_STEPS] as const satisfies readonly TurnKey[];
/** Every `--effort` level, at runtime. */
export const ALL_EFFORT_LEVELS = ["default", "low", "medium", "high", "xhigh", "max"] as const satisfies readonly EffortLevel[];

// Completeness guards: a union member missing from its array makes the Exclude a non-`never` type,
// so the `true` assignment fails to typecheck (naming exactly which key drifted).
type _MissingBuildTurn = Exclude<BuildTurn, (typeof ALL_BUILD_TURNS)[number]>;
type _MissingDesignStep = Exclude<DesignStep, (typeof ALL_DESIGN_STEPS)[number]>;
type _MissingEffort = Exclude<EffortLevel, (typeof ALL_EFFORT_LEVELS)[number]>;
const _assertBuildTurns: _MissingBuildTurn extends never ? true : _MissingBuildTurn = true;
const _assertDesignSteps: _MissingDesignStep extends never ? true : _MissingDesignStep = true;
const _assertEffort: _MissingEffort extends never ? true : _MissingEffort = true;
void _assertBuildTurns;
void _assertDesignSteps;
void _assertEffort;
