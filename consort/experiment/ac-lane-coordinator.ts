// Parallel per-AC verify (#5) — the COORDINATOR (P0 lane plan + P2 fan-out).
//
// Fans a contract story's ACs out at the AC level. The ACs of a contract story
// are NOT fully independent: the first AC authors the contract migration; the
// rest build on it. So the schedule is:
//
//   1. the FIRST AC runs SERIAL in the main experiment worktree (it authors the
//      migration), through its RED -> GREEN cycles;
//   2. the remaining ACs fan out CONCURRENTLY, each in its own isolated lane
//      (withAcLane: worktree + COW branch forked off the EXPERIMENT BRANCH, which
//      now carries AC1's committed migration), driving only THAT AC's RED -> GREEN
//      cycles — bounded by `concurrency`, failures isolated.
//
// (An immutable Lakebase SNAPSHOT as the fan-out base was the original idea, but
// it is refused for a non-root branch — "not allowed to snapshot non-root branch",
// live-confirmed. A plain COW child off the experiment branch is an equally-stable
// base: nothing writes the experiment branch during the parallel phase.)
//
// The per-AC REVIEW / REFACTOR / deploy-verify / accept are NOT done per lane;
// they run ONCE at story-close on the MERGED result via the normal serial drive,
// so `nextTransition` (the hardest coupling) is never touched. The merge step
// (P3) folds the lane branches back before that resume.
//
// Concurrency + failure isolation reuse the already-built, previously-dormant
// `runExperimentsInParallel` scheduler (the N-way experiment-race framework); the
// leaf operations are injected so this stays hermetic.

import { runExperimentsInParallel } from "./parallel-runner.js";

/** One fan-out lane. Usually one whole AC; a HEAVY multi-kind AC splits into per-kind-group lanes
 *  (e.g. AC4 -> AC4.e2e + AC4.unit) so its authoring parallelizes. `laneId` is the unique worktree/
 *  branch token; `ac` is the AC it belongs to (two split lanes share it); `kinds`, when set, scopes
 *  the lane to that AC's tests of those kinds (absent => the whole AC). */
export interface AcLaneSpec {
  laneId: string;
  ac: string;
  kinds?: string[];
}

export interface AcLanePlan {
  /** "sequential" = no fan-out (lever off, or too few ACs to be worth it): drive
   *  every AC serially, byte-identical to today. "parallel" = serialFirst then fan out. */
  mode: "sequential" | "parallel";
  /** The migration-authoring AC that runs serial first (then the snapshot). In the DEFAULT
   *  (S2) plan this AC also completes its full build serially before the others fan out. */
  serialFirst?: string;
  /** opt-in (migrationPrepStep): a dedicated migration-PREP step authors + commits ONLY the shared
   *  contract migration serially; then ALL ACs — including this one — fan out as lanes (the prep AC's
   *  lane just VERIFIES the schema-diff against the committed migration). Set instead of `serialFirst`
   *  in this mode, so AC1's build overlaps the fan-out instead of gating it. */
  migrationPrep?: string;
  /** The ACs (by id) that fan out — back-compat view. One entry per AC regardless of splitting. */
  parallelLanes: string[];
  /** The ACTUAL lanes to run (the canonical fan-out unit). One per AC, except a multi-kind AC which
   *  (when splitting is on) contributes ONE kind-scoped lane PER KIND. Empty in sequential mode. */
  laneSpecs: AcLaneSpec[];
  /** All ACs in order (sequential mode drives these in order). */
  order: string[];
}

export interface PlanAcLanesArgs {
  /** The story's ACs in design order (the first authors the contract migration). */
  acOrder: string[];
  /** The `build.parallelAcLanes` lever. Off => always sequential (default behavior). */
  enabled: boolean;
  /** Minimum fan-out width to bother parallelizing (serialFirst + at least this many
   *  lanes). Default 2: below it the merge overhead isn't worth it. */
  minParallelLanes?: number;
  /** opt-in: author the contract migration in a dedicated serial PREP step, then fan out ALL ACs
   *  (incl AC1 as a verify-only lane) instead of running AC1's whole build on the serial path. Off
   *  (default) => the proven plan (serialFirst builds fully, then AC2..n fan out). */
  migrationPrepStep?: boolean;
  /** opt-in: split a multi-kind AC into ONE LANE PER KIND so each kind's authoring parallelizes. Needs
   *  `acKinds`. Off (default) => one lane per AC. */
  splitAcsByKind?: boolean;
  /** Per-AC test-kind composition (ac -> the distinct kinds present among its tests), the structural
   *  input the split decision reads. Absent for an AC => treated as single-kind (never split). */
  acKinds?: Record<string, string[]>;
}

/** Expand ONE fan-out AC into its lane spec(s). With splitting on, a multi-kind AC fans out into ONE
 *  LANE PER KIND — no guessing which kind is "heavy", NO combining two kinds onto one lane (the bug that
 *  traded one long pole for another). Each kind's authoring sits alone on its own lane, so the ACTUAL
 *  cost driver (whichever kind it is) is isolated on the critical path. A single-kind AC (or no kind
 *  data) stays exactly one whole-AC lane. Derived from the AC's real composition, never assumed. */
function lanesForAc(ac: string, args: PlanAcLanesArgs): AcLaneSpec[] {
  if (!args.splitAcsByKind) return [{ laneId: ac, ac }];
  const distinct = [...new Set(args.acKinds?.[ac] ?? [])].sort(); // stable id order
  if (distinct.length < 2) return [{ laneId: ac, ac }]; // one kind (or none) => nothing to split
  return distinct.map((k) => ({ laneId: `${ac}.${k}`, ac, kinds: [k] }));
}

/**
 * Decide the lane schedule, DETERMINISTICALLY from the story's structure (AC count + per-AC kinds) —
 * no NLP, no file-conflict prediction; runtime isolation + the merge-conflict fallback keep it safe.
 * Two levels: (1) a serial FLOOR — the shared migration — authored up front (as serialFirst's full
 * build by default, or as a dedicated migrationPrep step when opted in); (2) the FAN-OUT units, one
 * lane per AC, except a multi-kind AC which splits into ONE LANE PER KIND. Degrades to sequential
 * when the lever is off or there are too few lanes to be worth the merge overhead.
 */
export function planAcLanes(args: PlanAcLanesArgs): AcLanePlan {
  const order = args.acOrder;
  const minParallel = args.minParallelLanes ?? 2;
  const laneCount = order.length - 1; // ACs beyond the migration owner — the worth-it threshold
  if (!args.enabled || order.length === 0 || laneCount < minParallel) {
    return { mode: "sequential", parallelLanes: [], laneSpecs: [], order };
  }
  // The migration owner is always order[0]. In migrationPrep mode it authors ONLY the migration
  // serially and then fans out as a lane like the rest; otherwise it builds fully on the serial path.
  const laneAcs = args.migrationPrepStep ? order : order.slice(1);
  const laneSpecs = laneAcs.flatMap((ac) => lanesForAc(ac, args));
  return {
    mode: "parallel",
    ...(args.migrationPrepStep ? { migrationPrep: order[0] } : { serialFirst: order[0] }),
    parallelLanes: laneAcs,
    laneSpecs,
    order,
  };
}

export interface AcLaneFanOutGate {
  /** The `build.parallelAcLanes` lever. */
  leverOn: boolean;
  /** This is a contract story — the only shape with a serial-first migration AC. */
  isContractStory: boolean;
  /** The dispatching role; only a plain navigator/driver build turn may delegate. */
  role: string;
  /** A buildMode is set (repair / green-superseded / ...), i.e. NOT a plain RED/GREEN turn. */
  hasBuildMode: boolean;
  /** The CONSORT_AC_LANE sentinel: this drive IS a coordinator-spawned sub-lane and must
   *  never re-delegate (infinite fan-out). Keyed off this sentinel, NOT the human-facing
   *  CONSORT_SCOPE_AC scope var, so a stale/ambient scope cannot gate the top-level drive. */
  isSubLane: boolean;
  /** The story's AC count (storyAcOrder length). */
  acCount: number;
  /** The once-per-story fan-out marker already exists (the fan-out ran this run). MUST be
   *  read from gitignored runtime state so a committed/restored marker can't force serial. */
  markerExists: boolean;
  /** RESUME entry: this turn is the SERIAL-FIRST AC's per-AC REVIEW (buildMode "review",
   *  ac === serial-first), reached because the run was RESUMED from the fan-out-begin anchor
   *  (serial-first AC already built + swept, sibling lanes not yet built). A FRESH run triggers
   *  the fan-out at story-zero on a plain RED turn (no buildMode); a resumed run re-enters with
   *  the serial-first AC green, so the pending action is its review — which `hasBuildMode` would
   *  otherwise refuse. This flag marks THAT specific review as a legitimate fan-out trigger, so a
   *  recorded fan-out-begin anchor is resumable/REPLAYABLE without re-authoring the serial-first
   *  AC. It is NOT a blanket buildMode bypass: it is only ever set for the serial-first AC's
   *  review, and the once-per-story marker still prevents any post-fan-out re-trigger. */
  serialFirstReview?: boolean;
  /** Minimum ACs to bother parallelizing (serial-first + >=2 lanes). Default 3. */
  minAcs?: number;
}

/**
 * The single decision point for the parallel-lane fan-out TRIGGER: whether a build turn
 * should delegate the whole story to the coordinator. Extracted as a pure predicate so it
 * is unit-testable in isolation — both silent-serial regressions live here: an ambient
 * CONSORT_SCOPE_AC that must NOT gate (use the `isSubLane` sentinel instead), and a stale
 * committed `.ac-lanes-done` marker that must be read from gitignored runtime state.
 */
export function shouldFanOutAcLanes(g: AcLaneFanOutGate): boolean {
  const minAcs = g.minAcs ?? 3;
  return (
    g.leverOn &&
    g.isContractStory &&
    (g.role === "navigator" || g.role === "driver") &&
    (!g.hasBuildMode || !!g.serialFirstReview) &&
    !g.isSubLane &&
    !g.markerExists &&
    g.acCount >= minAcs
  );
}

export interface AcLaneOutcome {
  /** The AC this lane belongs to (two split lanes of one AC share it). */
  ac: string;
  /** The lane's unique id (== ac for a whole-AC lane; `<ac>.e2e`/`<ac>.unit` for a split AC). */
  laneId: string;
  status: "succeeded" | "failed";
  error?: string;
}

export interface RunAcLanesArgs {
  plan: AcLanePlan;
  /** Max in-flight lanes (from the plan's `budget.concurrent_branches`). */
  concurrency: number;
  /** Drive ONE AC's RED -> GREEN cycles in the MAIN experiment worktree (serial). */
  driveSerial: (ac: string) => Promise<void>;
  /** Drive ONE lane in its OWN isolated worktree (the real impl wraps withAcLane: worktree + COW
   *  branch forked off the experiment branch). The spec names the AC + (for a split AC) the kind
   *  subset to scope to; laneId is the unique worktree/branch token. */
  driveInLane: (spec: AcLaneSpec) => Promise<void>;
  /** S3 (migration-prep plan only): author + commit ONLY the contract drop migration serially in the
   *  main worktree — the minimal shared artifact every lane forks from — WITHOUT running the prep AC's
   *  full test build. Called in place of driveSerial when plan.migrationPrep is set; then ALL ACs
   *  (incl the prep AC) fan out. Absent on the default (S2) plan. */
  driveMigrationPrep?: (ac: string) => Promise<void>;
  /** Snapshot the FAN-OUT-BEGIN state — AC1 built + committed, story still open — right BEFORE the
   *  lanes fan out. Lets a later run resume AT the fan-out instead of re-authoring AC1. Runs once,
   *  after serialFirst, before the race. Optional: absent => no snapshot. NOTE (S2): the supersession
   *  sweep no longer runs here — the lanes DEFER it and the one-shot LLM retarget runs POST-MERGE off
   *  the critical path (see runParallelAcLanesLive), so this anchor is un-swept and a resume defers too. */
  snapshotBeforeFanout?: () => void | Promise<void>;
}

export interface RunAcLanesResult {
  outcomes: AcLaneOutcome[];
  /** Peak concurrent lanes observed (parallel mode); 1 in sequential mode. */
  peakInFlight: number;
}

/**
 * Execute the lane schedule. Sequential mode drives every AC in order (today's
 * behavior). Parallel mode drives serialFirst, snapshots, then fans the rest out
 * through the bounded-concurrency scheduler. A lane failure is isolated (recorded
 * as a failed outcome) and does NOT abort the other lanes — the coordinator's
 * caller (the merge step) decides how to handle a failed lane (re-run sequentially).
 */
export async function runAcLanes(args: RunAcLanesArgs): Promise<RunAcLanesResult> {
  const { plan } = args;
  if (plan.mode === "sequential") {
    const outcomes: AcLaneOutcome[] = [];
    for (const ac of plan.order) {
      try {
        await args.driveSerial(ac);
        outcomes.push({ ac, laneId: ac, status: "succeeded" });
      } catch (e) {
        outcomes.push({ ac, laneId: ac, status: "failed", error: e instanceof Error ? e.message : String(e) });
        break; // serial: a failed AC halts the story (same as today's single lane)
      }
    }
    return { outcomes, peakInFlight: 1 };
  }

  // Parallel. Two shapes:
  //  - DEFAULT (S2): the serial-first AC builds fully, then AC2..n fan out.
  //  - S3 (migrationPrep): a dedicated prep authors ONLY the migration, then ALL ACs fan out (incl AC1).
  const outcomes: AcLaneOutcome[] = [];
  const prepAc = plan.migrationPrep ?? plan.serialFirst!;
  const runPrep = plan.migrationPrep ? (args.driveMigrationPrep ?? args.driveSerial) : args.driveSerial;
  try {
    await runPrep(prepAc);
    // In the default plan the serial-first AC is BUILT here (a succeeded outcome). In the S3 plan the
    // prep only authored the migration — the prep AC's build happens in its lane below, so do NOT record
    // it as a completed AC here (it fans out with the rest).
    if (!plan.migrationPrep) outcomes.push({ ac: prepAc, laneId: prepAc, status: "succeeded" });
  } catch (e) {
    // The migration-authoring step failed: nothing to fan out from. Halt.
    outcomes.push({ ac: prepAc, laneId: prepAc, status: "failed", error: e instanceof Error ? e.message : String(e) });
    return { outcomes, peakInFlight: 1 };
  }

  // S2: the cross-story supersession sweep used to run HERE (a 13-16min serial GATE before any
  // parallelism), so the lanes forked a superseded-clean base. It no longer does: the lanes DEFER
  // the supersession at runtime (the same cheap deselect the serial-first AC uses — no commit needed),
  // and the one-shot LLM RETARGET runs POST-MERGE, off the critical path (runParallelAcLanesLive). So
  // fan-out begins the moment AC1 commits the migration — the sweep is no longer a pre-fan-out gate.

  // Snapshot the fan-out-begin state (AC1 built + committed, story open) BEFORE the lanes fan out, so
  // a later run can resume AT the fan-out instead of re-authoring AC1. (Un-swept now; a resume defers.)
  if (args.snapshotBeforeFanout) {
    await args.snapshotBeforeFanout();
  }

  // Fan out the LANE SPECS (one per AC, or two for a split heavy AC). The scheduler keys on laneId
  // (unique); each result maps back to its AC via the spec, so a split AC's two lanes both resolve to it.
  const byLaneId = new Map(plan.laneSpecs.map((s) => [s.laneId, s]));
  const race = await runExperimentsInParallel<void>({
    experiments: plan.laneSpecs.map((s) => ({ slug: s.laneId })),
    concurrency: args.concurrency,
    runner: async (input) => {
      await args.driveInLane(byLaneId.get(input.slug)!);
    },
  });
  for (const r of race.results) {
    const spec = byLaneId.get(r.slug)!;
    outcomes.push(
      r.status === "succeeded"
        ? { ac: spec.ac, laneId: spec.laneId, status: "succeeded" }
        : { ac: spec.ac, laneId: spec.laneId, status: "failed", error: r.error.message },
    );
  }
  return { outcomes, peakInFlight: race.peak_in_flight };
}
