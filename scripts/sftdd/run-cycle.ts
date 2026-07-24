import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { join } from "path";
import { getConnection } from "@databricks-solutions/lakebase-scm-utils/lakebase";
import type { DsnResult } from "@databricks-solutions/lakebase-scm-utils/lakebase";
import {
  acLayerToTag,
  readOutcomes,
  recordTagRun,
  tagRunCount,
  writeOutcomes,
  type AcLayer,
  type ExperimentTag,
} from "./experiment";
import { emitAgentLogEvent, type AgentLogEventInput } from "./agent-log";
import { readAcLayer as readAcLayerFromPaths } from "./sftdd-paths.js";

/**
 * Emit a cycle event to the centralized agent log from the SUBSTRATE, not
 * agent prose. The Navigator/Driver call beginCycle/markGreen/markRefactored
 * as the authoritative RED/GREEN/REFACTOR transitions, so emitting here makes
 * every cycle logged deterministically (the agent need not remember to). Same
 * pattern as the Human Proxy logging its gate decisions. Best-effort:
 * logging is observability, never a reason to fail a cycle.
 */
function logCycleEvent(sftddDir: string, event: AgentLogEventInput): void {
  try {
    emitAgentLogEvent(event, { sftddDir });
  } catch {
    // swallow: never let logging break a cycle transition
  }
}

export type CycleStage = "PLAN" | "RED" | "GREEN" | "REFACTOR";
export type CycleVerdict = "passed" | "failed" | "skipped";

export interface CycleArtifact {
  cycle_id: string;
  feature_id: string;
  story_id: string;
  ac_id: string;
  test_id: string;
  test_description: string;
  /**
   * P8b (hybrid-a, layer-batched build): when a single RED cycle covers a BATCH
   * of test-list items (one layer's tests written + greened together), this lists
   * ALL covered test ids; `test_id` stays the first for back-compat. A per-test
   * (loopGranularity=ac) cycle omits it. Read via coveredTestIds(), never raw, so
   * an empty array can never silently mean "covers nothing".
   */
  test_ids?: string[];
  /** The batch key `(layer, n)` a batch cycle belongs to (P8b); absent per-test. */
  chunk?: string;
  experiment_slug?: string;
  branch_id?: string;
  navigator_plan?: string;
  navigator_verdict?: CycleVerdict;
  driver_changes?: string;
  refactor_notes?: string;
  red_at?: string;
  green_at?: string;
  refactored_at?: string;
  smell_flags?: string[];
  /**
   * AC layer the Driver dispatched on. Stamped at beginCycle
   * time: caller may pass it explicitly, otherwise the substrate looks
   * up the AC file under stories and lifts AC.layer. When set,
   * markGreen enforces the runner contract: outcomes.json must record
   * at least one run for the matching tag before the cycle is allowed
   * to advance.
   */
  layer?: AcLayer;
}

/**
 * Walk every story under `<sftddDir>/features/<featureId>/stories/` and
 * return the matching AC's `layer` value. Used by beginCycle to
 * auto-stamp the layer on the cycle artifact without forcing callers
 * to thread it through. Returns undefined when the AC file is absent
 * or the field is missing (a brownfield project that pre-dates the
 * layer enum).
 */
export function readAcLayer(sftddDir: string, featureId: string, acId: string): AcLayer | undefined {
  // Single source of truth: delegate to sftdd-paths so the AC-layer read lives in
  // exactly one place. Re-exported under this name for the existing importers.
  return readAcLayerFromPaths(sftddDir, featureId, acId);
}

/**
 * The test-list items a cycle covers. A batch cycle (P8b) lists them in
 * `test_ids`; a per-test cycle has the single `test_id`. EMPTY-ARRAY GUARD (a
 * known test-strategist defect class): a present-but-empty `test_ids: []` falls
 * back to `test_id`, NEVER to "covers nothing" , else a batch cycle with an
 * empty list would silently green/stall zero tests and the story never
 * completes. Returns [] only when there is genuinely no test id at all.
 */
export function coveredTestIds(c: Pick<CycleArtifact, "test_id" | "test_ids">): string[] {
  if (c.test_ids && c.test_ids.length > 0) return c.test_ids;
  return c.test_id ? [c.test_id] : [];
}

export interface CycleScope {
  sftddDir: string;
  feature_id: string;
  story_id: string;
  ac_id: string;
  experiment_slug?: string;
  branch_id?: string;
}

function cyclesDir(scope: CycleScope): string {
  return join(scope.sftddDir, "cycles", scope.feature_id, scope.story_id, scope.ac_id);
}

export function nextCycleId(scope: CycleScope): string {
  const dir = cyclesDir(scope);
  if (!existsSync(dir)) return "cycle-001";
  const ids = readdirSync(dir)
    .filter((f) => /^cycle-\d+\.json$/.test(f))
    .map((f) => parseInt(f.match(/cycle-(\d+)/)![1], 10))
    .sort((a, b) => a - b);
  const next = (ids.at(-1) ?? 0) + 1;
  return `cycle-${String(next).padStart(3, "0")}`;
}

export function writeCycleArtifact(scope: CycleScope, artifact: CycleArtifact): string {
  const dir = cyclesDir(scope);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${artifact.cycle_id}.json`);
  writeFileSync(file, JSON.stringify(artifact, null, 2) + "\n");
  return file;
}

export function readCycleArtifact(scope: CycleScope, cycleId: string): CycleArtifact | null {
  const file = join(cyclesDir(scope), `${cycleId}.json`);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8"));
}

export function listCycles(scope: CycleScope): CycleArtifact[] {
  const dir = cyclesDir(scope);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")));
}

export interface OpenBranchDsnArgs {
  instance: string;
  branch_id: string;
}

/**
 * Open a DSN against the experiment's Lakebase branch so the test runner
 * (Vitest / Jest / Pytest / Flyway / etc.) can connect to a real per-branch DB.
 * Returned DSN strings are scoped to the experiment branch – not staging, not prod.
 */
export async function openBranchDsn(args: OpenBranchDsnArgs): Promise<DsnResult> {
  return getConnection({
    instance: args.instance,
    branch: args.branch_id,
    output: "dsn",
  });
}

export interface BeginCycleArgs extends CycleScope {
  test_id: string;
  test_description: string;
  navigator_plan?: string;
  /**
   * AC layer for this cycle. Explicit value wins; otherwise
   * the substrate derives it from the AC file under the story dir. When
   * resolved, the cycle artifact carries it and markGreen enforces the
   * runner contract (at least one recorded run for the matching tag).
   */
  layer?: AcLayer;
  /** P8b: the batch's covered test ids (when this RED cycle covers a layer-batch
   *  of items). `test_id` should be the first of these for back-compat. */
  test_ids?: string[];
  /** P8b: the batch key `(layer, n)` this cycle belongs to. */
  chunk?: string;
}

export function beginCycle(args: BeginCycleArgs): CycleArtifact {
  const cycle_id = nextCycleId(args);
  const layer = args.layer ?? readAcLayer(args.sftddDir, args.feature_id, args.ac_id);
  const artifact: CycleArtifact = {
    cycle_id,
    feature_id: args.feature_id,
    story_id: args.story_id,
    ac_id: args.ac_id,
    test_id: args.test_id,
    test_description: args.test_description,
    experiment_slug: args.experiment_slug,
    branch_id: args.branch_id,
    navigator_plan: args.navigator_plan,
    red_at: new Date().toISOString(),
    layer,
    ...(args.test_ids && args.test_ids.length > 0 ? { test_ids: args.test_ids } : {}),
    ...(args.chunk ? { chunk: args.chunk } : {}),
  };
  writeCycleArtifact(args, artifact);
  logCycleEvent(args.sftddDir, {
    role: "navigator",
    level: "info",
    event: "cycle.red",
    feature_id: args.feature_id,
    cycle_id,
    slots: {
      test_id: args.test_id,
      ac: args.ac_id,
      asserts: args.test_description,
      layer,
      // Always carry the batch size (1 for a per-AC cycle, N for a story batch),
      // so a story-level RED reads as "N test(s)" instead of looking like a single
      // T1 cycle. Keep the full list in metadata for traceability.
      batch: args.test_ids && args.test_ids.length > 0 ? args.test_ids.length : 1,
    },
  });
  return artifact;
}

export interface RecordRunnerOutcomeArgs {
  scope: CycleScope;
  cycleId: string;
  /** Experiment slug whose outcomes.json receives the per-tag bump. */
  experimentSlug: string;
  /** True iff the runner reported a pass. */
  passed: boolean;
  /**
   * Layer the runner ran for. Defaults to the cycle artifact's stamped
   * layer; pass this explicitly if the cycle is layer-less (legacy)
   * but you still want to record the run.
   */
  layer?: AcLayer;
}

export interface RecordRunnerOutcomeResult {
  cycle: CycleArtifact;
  tag: ExperimentTag;
  /** Total runs recorded for this tag after the increment (pass + fail). */
  runsForTag: number;
}

/**
 * Record a runner outcome for the current cycle (phase 3).
 * Drivers call this after invoking the runner mapped to the current
 * cycle's layer (the tagToRunner table in SKILL.md), passing
 * `passed: true` on green and `passed: false` on red-with-real-failure
 * (not on red-by-design from the Navigator's failing test).
 *
 * Throws if no layer can be resolved for the cycle: the Driver must
 * supply one explicitly or the AC must declare its layer.
 */
export function recordRunnerOutcome(args: RecordRunnerOutcomeArgs): RecordRunnerOutcomeResult {
  const cycle = readCycleArtifact(args.scope, args.cycleId);
  if (!cycle) throw new Error(`cycle ${args.cycleId} not found`);
  const layer = args.layer ?? cycle.layer;
  if (!layer) {
    throw new Error(
      `cycle ${args.cycleId} has no layer and recordRunnerOutcome was called without one. ` +
        "Either stamp AC.layer or pass {layer} explicitly."
    );
  }
  const tag = acLayerToTag(layer);
  const outcomes =
    readOutcomes(args.scope.sftddDir, args.scope.feature_id, args.scope.story_id, args.experimentSlug) ?? {
      status: "running",
    };
  recordTagRun(outcomes, tag, args.passed);
  writeOutcomes(args.scope.sftddDir, args.scope.feature_id, args.scope.story_id, args.experimentSlug, outcomes);
  // Stamp the layer back onto the cycle when it was inferred from the
  // argument so subsequent reads see it.
  if (!cycle.layer && args.layer) {
    cycle.layer = args.layer;
    writeCycleArtifact(args.scope, cycle);
  }
  return { cycle, tag, runsForTag: tagRunCount(outcomes, tag) };
}

export function markGreen(
  scope: CycleScope,
  cycleId: string,
  driverChanges?: string
): CycleArtifact {
  const a = readCycleArtifact(scope, cycleId);
  if (!a) throw new Error(`cycle ${cycleId} not found`);

  // Phase 3 runner contract: when the cycle is tagged with a
  // layer, the Driver MUST have invoked a runner (recordRunnerOutcome)
  // before calling markGreen. Zero runs for the matching tag almost
  // always means the runner-dispatch map was wrong (npm test invoked
  // for an [E2E] row, [Infra] row with no runner wired, etc.).
  if (a.layer && a.experiment_slug) {
    const outcomes = readOutcomes(scope.sftddDir, scope.feature_id, scope.story_id, a.experiment_slug);
    const tag = acLayerToTag(a.layer);
    const runs = outcomes ? tagRunCount(outcomes, tag) : 0;
    if (runs === 0) {
      throw new Error(
        `markGreen refused: cycle ${cycleId} is tagged [${a.layer}] but outcomes.json ` +
          `records zero runs for "${tag}" on experiment "${a.experiment_slug}". The ` +
          "Driver must call recordRunnerOutcome before markGreen so the substrate can " +
          "verify the right runner fired (see SKILL.md tagToRunner table)."
      );
    }
  }

  a.green_at = new Date().toISOString();
  a.driver_changes = driverChanges;
  a.navigator_verdict = "passed";
  writeCycleArtifact(scope, a);
  logCycleEvent(scope.sftddDir, {
    role: "driver",
    level: "info",
    event: "cycle.green",
    feature_id: scope.feature_id,
    cycle_id: cycleId,
    slots: { test_id: a.test_id, ac: a.ac_id ?? "unknown", change: driverChanges ?? "minimal honest code" },
  });
  return a;
}

export function markRefactored(scope: CycleScope, cycleId: string, refactorNotes?: string): CycleArtifact {
  const a = readCycleArtifact(scope, cycleId);
  if (!a) throw new Error(`cycle ${cycleId} not found`);
  a.refactored_at = new Date().toISOString();
  a.refactor_notes = refactorNotes;
  writeCycleArtifact(scope, a);
  logCycleEvent(scope.sftddDir, {
    role: "driver",
    level: "info",
    event: "cycle.refactored",
    feature_id: scope.feature_id,
    cycle_id: cycleId,
    slots: { ac: a.ac_id ?? "unknown", change: refactorNotes ?? "structure improved", test_id: a.test_id },
  });
  return a;
}

export function flagSmells(scope: CycleScope, cycleId: string, smells: string[]): CycleArtifact {
  const a = readCycleArtifact(scope, cycleId);
  if (!a) throw new Error(`cycle ${cycleId} not found`);
  a.smell_flags = [...new Set([...(a.smell_flags ?? []), ...smells])];
  writeCycleArtifact(scope, a);
  return a;
}
