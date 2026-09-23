// Cross-feature test SUPERSESSION: when a new AC intentionally changes behavior
// that PRIOR tests (often from earlier features) encode, the Navigator FLAGS
// those prior tests as superseded-by-this-AC, and the Driver is then permitted to
// PERMISSIVELY REFACTOR only those flagged tests (alongside the code) so the new
// AC's behavior can be honestly GREEN. This is the legitimate counterpart to the
// `test-list-drift` smell (an IN-SCOPE contradiction, which stays blocking): a
// new requirement supersedes an old one, and accumulated tests must follow the
// latest AC. The allowlist is the contract that bounds what the Driver may touch,
// so the honest-GREEN backstop still halts on any UNflagged regression.

import * as fs from "node:fs";
import { cycleDir } from "../../consort/config/consort-paths.js";
import { join } from "node:path";

export interface SupersededTests {
  /** Test files / node-ids the new AC supersedes; the Driver may refactor ONLY these. */
  tests: string[];
  /** Why the prior tests are superseded (the new AC + what behavior changed). */
  reason: string;
  /** True once the Driver has applied a permissive refactor for this allowlist
   *  (bounds the self-heal to one attempt before the honest-GREEN backstop escalates). */
  refactored?: boolean;
}

/** Path to the per-AC superseded-tests allowlist the Navigator writes. */
export function supersededTestsJson(
  tdd: string,
  feature: string,
  story: string,
  ac: string,
): string {
  return join(cycleDir(tdd, feature, story, ac), "superseded-tests.json");
}

/** Read the superseded-tests allowlist for an AC, or undefined when none/malformed.
 *
 * The canonical key is `tests` (what the `flag-superseded` CLI writes). But an
 * assess turn that HAND-WRITES the file (bypassing the CLI, e.g. after a first
 * CLI-flagged round) naturally names the array `superseded_tests` — the same key
 * the human-readable `reason`/`superseded_tests` shape and regression-assessment.json
 * use. When the reader only accepted `tests`, that hand-written file was read as
 * undefined → hasPendingSupersession=false → the honest-GREEN backstop wrongly
 * escalated a fully-superseded failure to the HIL as a "genuine regression" (the
 * navigator's own verdict said "all superseded, no regression"). Tolerate the
 * `superseded_tests` alias, exactly as readRegressionAssessment tolerates
 * `fix`/`fixDirective` — the reader is lenient about the agent-natural key so a
 * correct verdict is never lost to a key-name mismatch. */
export function readSupersededTests(
  tdd: string,
  feature: string,
  story: string,
  ac: string,
): SupersededTests | undefined {
  // TOLERANT READ across BOTH the file AND the key. The canonical writer is the
  // `flag-superseded` CLI (file superseded-tests.json, key `tests`). Two distinct
  // agent hand-writes have escaped that on live captures, each wrongly escalating
  // a fully-superseded verify to the HIL:
  //   1. right file, alias key: superseded-tests.json with `superseded_tests`.
  //   2. WRONG FILE: the navigator concluded supersession but wrote the verdict
  //      into regression-assessment.json as {superseded:true, tests:[...], reason}
  //      (conflating the two assess artifacts), leaving superseded-tests.json
  //      absent -> hasPendingSupersession=false -> "genuine regression, no
  //      superseded tests flagged" escalation, even though the verdict said
  //      superseded:true. So we ALSO honor a supersession payload found in
  //      regression-assessment.json: a truthy `superseded` with a tests array.
  // The canonical file+key still wins; this is the reader being lenient so a
  // correct supersession verdict is never lost to which file/key the agent chose.
  const parseSuperseded = (raw: string): string[] | undefined => {
    const p = JSON.parse(raw) as { tests?: unknown; superseded_tests?: unknown };
    const arr = Array.isArray(p.tests) ? p.tests : Array.isArray(p.superseded_tests) ? p.superseded_tests : undefined;
    return arr && arr.length > 0 && arr.every((t) => typeof t === "string") ? (arr as string[]) : undefined;
  };
  // 1. The canonical supersession file (any of its key aliases).
  const file = supersededTestsJson(tdd, feature, story, ac);
  if (fs.existsSync(file)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as SupersededTests;
      const tests = parseSuperseded(JSON.stringify(parsed));
      if (tests) return { ...parsed, tests };
    } catch {
      /* fall through to the regression-file fallback */
    }
  }
  // 2. Fallback: a supersession verdict the navigator wrote into the WRONG file
  //    (regression-assessment.json with superseded:true + a tests array). Only a
  //    TRUTHY `superseded` flag counts — a regression verdict (no such flag) must
  //    NOT be read as a supersession here. `refactored` cannot live in that file,
  //    so it is always pending (a fresh flag), which is correct.
  const regFile = regressionAssessmentJson(tdd, feature, story, ac);
  if (fs.existsSync(regFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(regFile, "utf8")) as { superseded?: unknown; reason?: string };
      if (parsed.superseded === true) {
        const tests = parseSuperseded(JSON.stringify(parsed));
        if (tests) return { tests, reason: typeof parsed.reason === "string" ? parsed.reason : "superseded (from regression-assessment.json)" };
      }
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** Write/replace the superseded-tests allowlist for an AC (the Navigator's flag). */
export function writeSupersededTests(
  tdd: string,
  feature: string,
  story: string,
  ac: string,
  value: SupersededTests,
): void {
  const file = supersededTestsJson(tdd, feature, story, ac);
  fs.mkdirSync(join(cycleDir(tdd, feature, story, ac)), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
}

/**
 * True when a superseded-tests allowlist exists for the AC AND a permissive
 * refactor has NOT yet been attempted. This is the gate the honest-GREEN verify
 * consults: a flagged-but-not-yet-refactored AC routes to a bounded Driver
 * permissive-refactor turn instead of escalating; an already-attempted one (or
 * one with no allowlist) escalates as a genuine regression.
 */
export function hasPendingSupersession(
  tdd: string,
  feature: string,
  story: string,
  ac: string,
): boolean {
  const s = readSupersededTests(tdd, feature, story, ac);
  return s !== undefined && s.refactored !== true;
}

/** Mark the allowlist as refactored (consume the one permissive-refactor attempt). */
export function markSupersessionRefactored(
  tdd: string,
  feature: string,
  story: string,
  ac: string,
): void {
  const s = readSupersededTests(tdd, feature, story, ac);
  if (!s) return;
  writeSupersededTests(tdd, feature, story, ac, { ...s, refactored: true });
}

// ── Green-failure assessment marker (the reactive supersession trigger) ──────
//
// When the honest-GREEN verify FAILS, the break is often UNFORESEEN (only the
// full-suite run reveals a prior test the new AC superseded). So instead of
// escalating immediately, the first failure routes a NAVIGATOR assess turn: it
// inspects the failing tests and either flag-supersedes them (-> the Driver's
// permissive green) or confirms a genuine regression (-> escalate). This marker
// records that a failure is awaiting / has had that one assessment, bounding the
// loop so a still-failing verify after the assess escalates as a real regression.

export interface GreenFailure {
  /** True once the Navigator has assessed this failure (flagged or not). */
  assessed: boolean;
  /** The verify failure summary the Navigator assesses. */
  summary: string;
  /** The captured tail of the honest-GREEN verify's OWN output (the pytest/vitest failure
   *  lines: failing node-ids + the top error, e.g. "Cannot find module ../../src/pages/X").
   *  The verify already produced this at fail time; recording it here lets the ASSESS turn
   *  START from the real failure instead of re-scanning the tree to rediscover it. This is the
   *  general pre-localization for failures the deterministic gates cannot localize (a missing
   *  client component, a broken import) – the symmetric counterpart to supersededTestRefs/
   *  contractRefs (which only fire for backend column-drops). Advisory; bounded in length. */
  failureOutput?: string;
  /** The Navigator's root-cause diagnosis recorded at assess time (the WHY the
   *  verify failed), so a regression escalation – and any Driver repair – carries
   *  the finding instead of the generic "verify FAILED". */
  diagnosis?: string;
  /** When the Navigator judged the regression DRIVER-FIXABLE: the concrete repair
   *  directive handed to a bounded Driver repair turn. Absent => not driver-fixable
   *  (escalate to HIL with the diagnosis). */
  fixDirective?: string;
  /** DETERMINISTIC contract-clean advisory recorded at the FIRST GREEN-failure: the
   *  precise production-code references to migration-dropped column(s) (hard rule 9),
   *  localized by the `contract-clean` gate. It does NOT short-circuit the Navigator
   *  assess (a column drop also supersedes prior tests, which only the assess flags);
   *  it ENRICHES the assess directive so the Navigator's fix covers these code refs
   *  without having to re-localize them. Advisory, present only when refs were found. */
  contractRefs?: string;
  /** DETERMINISTIC supersession-candidate advisory recorded at the FIRST GREEN-
   *  failure (the test-side counterpart to contractRefs): the precise PRIOR TEST
   *  file:lines that still reference a migration-dropped symbol, so the Navigator's
   *  assess flags EXACTLY these as superseded (path (a)) instead of SEARCHING the
   *  test tree for them. Advisory, present only when a dropped symbol is referenced
   *  by a prior test. */
  supersededTestRefs?: string;
  /** True once the Driver has consumed its repair attempt FOR THE CURRENT assess
   *  round (bounds one assess to one repair; cleared by a re-arm between rounds). */
  repairAttempted?: boolean;
  /** How many assess->repair rounds have been spent on this failure. The build
   *  self-heals across up to MAX_REGRESSION_FIX_ATTEMPTS rounds (re-diagnosing the
   *  RESIDUAL each round: a Driver commonly fixes some-but-not-all flagged items in
   *  one turn, e.g. deletes an orphan module + dedups one block but leaves another),
   *  escalating to the HIL only when a verify still fails after the last round. */
  fixAttempts?: number;
  /** Set when the Navigator assessed the failure as a SPEC-DEFECT: the failing TEST (or the NFR it
   *  realizes) is itself wrong — unrealistic, unsatisfiable, or FLAKY (a methodology defect), not a
   *  code regression the Driver can fix. There is no fixDirective and no supersession, so it would
   *  otherwise fall through to a bare escalation; this carries the design-lane RECOMMENDATION instead:
   *  which role should re-author (`fromRole`, default the test-strategist) + the reason. The drive
   *  routes it to a raise-to-hil that offers `consort-reopen-story --from <fromRole>` (the proportionate
   *  build->design go-back), NOT a Driver repair — the code can't fix a test that is wrong. */
  specDefect?: { fromRole?: string; reason?: string };
}

/** Bound on assess->repair self-heal rounds for one GREEN-verify failure before
 *  the honest-GREEN backstop escalates to the HIL. A single repair often only
 *  partially closes a multi-item build-quality gate (layering / DRY / adherence),
 *  so we re-diagnose + re-repair the residual a few times before giving up. */
export const MAX_REGRESSION_FIX_ATTEMPTS = 3;

export function greenFailureJson(
  tdd: string,
  feature: string,
  story: string,
  ac: string,
): string {
  return join(cycleDir(tdd, feature, story, ac), "green-failure.json");
}

export function readGreenFailure(
  tdd: string,
  feature: string,
  story: string,
  ac: string,
): GreenFailure | undefined {
  const file = greenFailureJson(tdd, feature, story, ac);
  if (!fs.existsSync(file)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as GreenFailure;
  } catch {
    return undefined;
  }
}

export function writeGreenFailure(
  tdd: string,
  feature: string,
  story: string,
  ac: string,
  value: GreenFailure,
): void {
  fs.mkdirSync(cycleDir(tdd, feature, story, ac), { recursive: true });
  fs.writeFileSync(greenFailureJson(tdd, feature, story, ac), JSON.stringify(value, null, 2) + "\n");
}

/** Remove the marker (the verify passed, or the cycle moved on). */
export function clearGreenFailure(
  tdd: string,
  feature: string,
  story: string,
  ac: string,
): void {
  fs.rmSync(greenFailureJson(tdd, feature, story, ac), { force: true });
}

/** An AC whose GREEN verify failed and has NOT yet been assessed by the
 *  Navigator (drives the reactive assess turn). */
export function needsGreenAssess(
  tdd: string,
  feature: string,
  story: string,
  ac: string,
): boolean {
  const gf = readGreenFailure(tdd, feature, story, ac);
  return gf !== undefined && gf.assessed !== true;
}

/**
 * A genuine regression the Navigator assessed AND judged driver-fixable (it
 * recorded a `fixDirective`), whose one bounded repair attempt has not been
 * consumed. This routes a Driver REPAIR turn (the diagnosis + directive injected)
 * instead of a terminal escalation. Symmetric to {@link hasPendingSupersession}:
 * the genuine-regression counterpart that the Driver can act on. An assessed
 * regression WITHOUT a fixDirective (not driver-fixable) escalates to the HIL.
 */
export function hasPendingRegressionFix(
  tdd: string,
  feature: string,
  story: string,
  ac: string,
): boolean {
  const gf = readGreenFailure(tdd, feature, story, ac);
  return gf !== undefined && gf.assessed === true && typeof gf.fixDirective === "string" && gf.fixDirective.length > 0 && gf.repairAttempted !== true;
}

/**
 * The Navigator assessed the failure as a SPEC-DEFECT: the failing test (or its NFR) is itself
 * wrong — unrealistic, unsatisfiable, or flaky — not a code regression. Routes a raise-to-hil that
 * recommends the proportionate build->design go-back (`reopen-story --from <fromRole>`), NOT a Driver
 * repair. Distinct from hasPendingRegressionFix (no fixDirective) and hasPendingSupersession (no
 * superseded-tests): the code cannot fix a test that is wrong, so the design lane must re-author it.
 */
export function hasPendingSpecDefect(
  tdd: string,
  feature: string,
  story: string,
  ac: string,
): boolean {
  const gf = readGreenFailure(tdd, feature, story, ac);
  return gf !== undefined && gf.assessed === true && gf.specDefect !== undefined;
}

/**
 * The Navigator assessed the failure as a genuine regression that is NOT
 * driver-fixable: `assessed` with NO `fixDirective` (the `assess-regression`
 * contract: omit --fix when it needs a human, a design change, or a spec change),
 * and neither a spec-defect nor a supersession pending (those have their own
 * routes). This is a CONFIRMED non-driver-fixable failure: route DIRECTLY to the
 * HIL with the diagnosis (issue #200) instead of re-dispatching bounded Driver
 * green attempts that cannot fix it for the full fixAttempts budget. Also catches
 * the re-diagnosis case: a later assess round that withdraws the directive
 * (repair already attempted) still means "done – escalate now".
 */
export function hasPendingUnfixableRegression(
  tdd: string,
  feature: string,
  story: string,
  ac: string,
): boolean {
  const gf = readGreenFailure(tdd, feature, story, ac);
  return (
    gf !== undefined &&
    gf.assessed === true &&
    !(typeof gf.fixDirective === "string" && gf.fixDirective.length > 0) &&
    gf.specDefect === undefined &&
    !hasPendingSupersession(tdd, feature, story, ac)
  );
}

/** The recommended design-lane re-author scope for a spec-defect (the role whose artifact is wrong),
 *  defaulting to the test-strategist (the test-list owner). Read by the drive to build the reopen
 *  recommendation surfaced at the HIL. */
export function specDefectFromRole(
  tdd: string,
  feature: string,
  story: string,
  ac: string,
): string {
  const gf = readGreenFailure(tdd, feature, story, ac);
  return gf?.specDefect?.fromRole ?? "test-strategist";
}

/** Mark the regression-fix as attempted for the current round + count the round
 *  toward the self-heal cap. */
export function markRegressionFixAttempted(
  tdd: string,
  feature: string,
  story: string,
  ac: string,
): void {
  const gf = readGreenFailure(tdd, feature, story, ac);
  if (!gf) return;
  writeGreenFailure(tdd, feature, story, ac, {
    ...gf,
    repairAttempted: true,
    fixAttempts: (gf.fixAttempts ?? 0) + 1,
  });
}

/** True once the self-heal rounds are exhausted (a still-failing verify must now
 *  escalate to the HIL rather than route another round). */
export function regressionFixExhausted(gf: GreenFailure): boolean {
  return (gf.fixAttempts ?? 0) >= MAX_REGRESSION_FIX_ATTEMPTS;
}

/** Compose the green-failure record the assess turn writes when the Navigator
 *  has assessed a failure (assessed:true + diagnosis/fixDirective from the
 *  assessment). CRITICAL: it PRESERVES the cross-round `fixAttempts` counter from
 *  the prior record – the assess turn must not reset the self-heal cap, or
 *  regressionFixExhausted never fires and the refactor-until-clean loop is
 *  unbounded. Pure + unit-tested so the preservation can't silently regress. */
export function composeAssessedGreenFailure(
  prior: GreenFailure | undefined,
  regression?: { diagnosis?: string; fixDirective?: string; specDefect?: { fromRole?: string; reason?: string } },
): GreenFailure {
  return {
    assessed: true,
    summary: prior?.summary ?? "",
    ...(prior?.fixAttempts !== undefined ? { fixAttempts: prior.fixAttempts } : {}),
    ...(regression?.diagnosis ? { diagnosis: regression.diagnosis } : {}),
    ...(regression?.fixDirective ? { fixDirective: regression.fixDirective } : {}),
    ...(regression?.specDefect ? { specDefect: regression.specDefect } : {}),
  };
}

/** Re-arm a still-failing failure for ANOTHER assess->repair round: clear the
 *  round-scoped assessment (assessed + fixDirective + repairAttempted) so the next
 *  readState routes a FRESH Navigator assess that re-runs the gate on the RESIDUAL,
 *  while preserving the cross-round attempt counter.
 *
 *  CRITICAL (the failure-MODE-change bug): the re-armed record must carry the
 *  summary + failureOutput of the CURRENT verify, not the frozen first-round one.
 *  A repair often CHANGES what fails (e.g. round 1 "app not reachable" -> round 2
 *  "client Vitest suite failed"): if the re-arm preserved the stale first summary,
 *  the next assess reads a failure that no longer matches reality and mis-routes
 *  (chases a phantom). The caller passes the live `result.summary`/`failureOutput`;
 *  they OVERRIDE the prior values (fall back to prior only when a fresh value is
 *  not supplied, e.g. a legacy caller). */
export function rearmRegressionFix(
  tdd: string,
  feature: string,
  story: string,
  ac: string,
  fresh?: { summary?: string; failureOutput?: string },
): void {
  const gf = readGreenFailure(tdd, feature, story, ac);
  if (!gf) return;
  const summary = fresh?.summary ?? gf.summary;
  // A fresh verify that captured NO failureOutput must not resurrect the prior
  // round's output (it belongs to a different, now-fixed failure), so honor an
  // explicitly-passed `fresh` object even when its failureOutput is undefined.
  const failureOutput = fresh ? fresh.failureOutput : gf.failureOutput;
  writeGreenFailure(tdd, feature, story, ac, {
    assessed: false,
    summary,
    fixAttempts: gf.fixAttempts ?? 0,
    ...(failureOutput ? { failureOutput } : {}),
    ...(gf.contractRefs ? { contractRefs: gf.contractRefs } : {}),
    ...(gf.supersededTestRefs ? { supersededTestRefs: gf.supersededTestRefs } : {}),
  });
  // Clear the PRIOR round's diagnosis + supersede flag so the next assess turn
  // re-diagnoses from the CURRENT failing tests, not a stale directive. Without
  // this the loop reused the previous fixDirective (observed: repeating "delete
  // app/models.py" long after that was resolved, while the real failures grew),
  // so the Driver kept applying a no-op repair. Fresh slate per round.
  fs.rmSync(regressionAssessmentJson(tdd, feature, story, ac), { force: true });
  fs.rmSync(supersededTestsJson(tdd, feature, story, ac), { force: true });
}

// ── Navigator's regression assessment (the diagnosis hand-off) ───────────────
//
// When the Navigator assesses a green-failure as a GENUINE regression (not a
// supersession), it records its root-cause diagnosis here – and, when it judges
// the Driver can fix it, a concrete repair directive. This is the inter-agent API
// for the regression path, exactly as superseded-tests.json is for supersession:
// the Navigator WRITES it, and the deterministic `assess-green` effect READS it to
// either route a bounded Driver repair turn (fixDirective present) or escalate to
// the HIL carrying the diagnosis (absent). Without it, assess-green escalates with
// the bare verify summary (the prior, diagnosis-free behavior).

export interface RegressionAssessment {
  /** The Navigator's root-cause finding (the WHY the honest-GREEN verify failed). */
  diagnosis: string;
  /** When the Driver can fix it: what to change. Absent => not driver-fixable. */
  fixDirective?: string;
  /** When the failure is a SPEC-DEFECT (the test/NFR is wrong — unrealistic/unsatisfiable/flaky —
   *  not a code regression): the design-lane re-author scope. Presence routes a raise-to-hil
   *  recommending `reopen-story --from <fromRole>` (default the test-strategist), NOT a Driver repair.
   *  Mutually exclusive with fixDirective in practice (a test that is wrong is not driver-fixable). */
  specDefect?: { fromRole?: string; reason?: string };
}

export function regressionAssessmentJson(
  tdd: string,
  feature: string,
  story: string,
  ac: string,
): string {
  return join(cycleDir(tdd, feature, story, ac), "regression-assessment.json");
}

export function readRegressionAssessment(
  tdd: string,
  feature: string,
  story: string,
  ac: string,
): RegressionAssessment | undefined {
  // TOLERANT READ. The `assess-regression` CLI is the intended writer (canonical
  // file `regression-assessment.json`, field `fixDirective`). But a `claude -p`
  // navigator reliably uses the Write tool yet is FLAKY at shell-escaping a
  // multi-arg CLI call: across three live captures the navigator produced a
  // CORRECT driver-fixable diagnosis but failed to persist it via the CLI – once
  // by hand-writing `assess-regression.json` with a `fix` key (the verb-order
  // filename + the natural key name), twice by abandoning the escaped call
  // entirely. A driver-fixable regression then wrongly escalated to HIL. So we
  // ALSO honor the agent's natural hand-written form: the alternate filename and
  // the `fix` alias. The CLI path is unchanged and still primary; this is
  // belt-and-suspenders so a reliable Write tool records the verdict when the
  // brittle shell call does not. Canonical file wins if both exist.
  const dir = cycleDir(tdd, feature, story, ac);
  const candidates = [
    regressionAssessmentJson(tdd, feature, story, ac), // canonical: regression-assessment.json
    join(dir, "assess-regression.json"), // agent-natural filename (mirrors the CLI verb)
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
      const diagnosis = raw.diagnosis;
      if (typeof diagnosis !== "string" || diagnosis.length === 0) continue;
      // Accept `fixDirective` (canonical) OR `fix` (the agent-natural key alias).
      const fixDirective =
        typeof raw.fixDirective === "string" && raw.fixDirective.length > 0
          ? raw.fixDirective
          : typeof raw.fix === "string" && raw.fix.length > 0
            ? raw.fix
            : undefined;
      // SPEC-DEFECT (the test/NFR is wrong, not the code). Accept a `specDefect` object OR the
      // agent-natural `classification: "spec-defect"` (+ optional fromRole/from_role + reason). A
      // spec-defect is NOT driver-fixable, so it takes precedence over any stray fixDirective.
      const sd = raw.specDefect as { fromRole?: unknown; reason?: unknown } | undefined;
      const isSpecDefect = (sd !== undefined && sd !== null) || raw.classification === "spec-defect";
      let specDefect: { fromRole?: string; reason?: string } | undefined;
      if (isSpecDefect) {
        const fromRole =
          (typeof sd?.fromRole === "string" && sd.fromRole) ||
          (typeof raw.fromRole === "string" && raw.fromRole) ||
          (typeof raw.from_role === "string" && raw.from_role) ||
          undefined;
        const reason =
          (typeof sd?.reason === "string" && sd.reason) ||
          (typeof raw.reason === "string" && raw.reason) ||
          undefined;
        specDefect = { ...(fromRole ? { fromRole } : {}), ...(reason ? { reason } : {}) };
      }
      if (specDefect) return { diagnosis, specDefect };
      return { diagnosis, ...(fixDirective ? { fixDirective } : {}) };
    } catch {
      /* try the next candidate */
    }
  }
  return undefined;
}

export function writeRegressionAssessment(
  tdd: string,
  feature: string,
  story: string,
  ac: string,
  value: RegressionAssessment,
): void {
  fs.mkdirSync(cycleDir(tdd, feature, story, ac), { recursive: true });
  fs.writeFileSync(regressionAssessmentJson(tdd, feature, story, ac), JSON.stringify(value, null, 2) + "\n");
}
