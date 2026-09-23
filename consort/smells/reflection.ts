// Pre-build reflection gate (speed lever #3): the Navigator, in a "reflect"
// mode, critiques a story's spec slice + test-list BEFORE the build lane and
// writes a per-story verdict. This module owns the verdict artifact + the
// DETERMINISTIC post-turn gate that translates a failed verdict into the
// spec-level blocking smell the existing revise-route/escalation machinery
// already handles (route to the owning author, bounded one revise, then HITL).
//
// Splitting "the LLM writes a verdict" from "the code flags the smell" keeps the
// routing deterministic: the critic only has to record WHAT it found + WHO owns
// it; the orchestrator, not the model, decides the smell + escalation.
//
// Per-story + per-feature isolation: the verdict lives at
// features/<F>/stories/<S>/reflect-verdict.json and the smell carries story_id,
// so concurrent stories/features never share reflect state.

import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "fs";
import { dirname } from "path";
import { reflectVerdictJson } from "../../consort/config/consort-paths.js";
import { writeSmellsLog, hasOpenSmell, resolveOpenSmells, type SmellHit, type SmellName } from "./smells.js";

/** Who owns the fix for a reflection finding, and thus which smell/gate it
 *  routes to: the Spec Author (spec gate) or the Test Strategist (test_list). */
export type ReflectOwner = "spec-author" | "test-strategist";

export interface ReflectFinding {
  /** Which author must fix it (drives the smell + the revise-route). */
  owner: ReflectOwner;
  /** The specific defect (a contradiction, coverage gap, layer conflict, ...). */
  detail: string;
  /** Materiality (issue #201): `blocking` = the build cannot proceed correctly
   *  (a contradiction, an unbuildable/unsatisfiable test, a wrong layer, a required
   *  clause uncovered); `advisory` = a marginal improvement (nice-to-have coverage,
   *  style, hardening). The gate blocks only on `blocking` findings – a verdict of
   *  pure advisories passes, so marginal nitpicks never spend a revise lap.
   *  OPTIONAL for backward compatibility: a finding with NO severity (a verdict
   *  written by an older kit) is treated as `blocking` (fail-safe: an unknown
   *  severity never silently passes). */
  severity?: "blocking" | "advisory";
}

export interface ReflectVerdict {
  version: 1;
  /** True iff the spec slice + test-list are internally consistent + buildable. */
  passed: boolean;
  /** The defects found (empty when passed). */
  findings: ReflectFinding[];
}

/** The smell a given owner's finding routes to (see smells.ts SMELL_CATALOG). */
const SMELL_FOR_OWNER: Record<ReflectOwner, SmellName> = {
  "spec-author": "reflect-spec-defect",
  "test-strategist": "reflect-testlist-defect",
};

/** Write a story's reflect verdict (the Navigator reflect turn's output). */
export function writeReflectVerdict(
  consortDir: string,
  feature: string,
  story: string,
  verdict: ReflectVerdict,
): void {
  const p = reflectVerdictJson(consortDir, feature, story);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(verdict, null, 2) + "\n");
}

/** Invalidate a story's reflect verdict (delete the file). Called when the story
 *  is sent back to its owning author on a revise: the OLD verdict is now stale
 *  (it judged the pre-fix spec/test-list), so it MUST be recomputed against the
 *  corrected artifacts. Without this the stale passed:false verdict persists and
 *  the re-dispatched Navigator reuses it ("a prior verdict already exists") rather
 *  than re-evaluating, so the reflect gate never converges. Idempotent (no-op if
 *  absent). */
export function clearReflectVerdict(consortDir: string, feature: string, story: string): void {
  const p = reflectVerdictJson(consortDir, feature, story);
  if (existsSync(p)) rmSync(p, { force: true });
}

/** Read a story's reflect verdict, or undefined when none has been written. */
export function readReflectVerdict(
  consortDir: string,
  feature: string,
  story: string,
): ReflectVerdict | undefined {
  const p = reflectVerdictJson(consortDir, feature, story);
  if (!existsSync(p)) return undefined;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as ReflectVerdict;
  } catch {
    return undefined;
  }
}

/** The design-lane predicate: has this story's reflection PASSED? A missing or
 *  failed verdict is not passed (the design lane runs / re-runs the critic; a
 *  failed verdict drives the smell + escalation elsewhere). */
export function reflectionPassed(consortDir: string, feature: string, story: string): boolean {
  return readReflectVerdict(consortDir, feature, story)?.passed === true;
}

/** Did the reflect turn produce a readable verdict at all (pass OR fail)? The
 *  reflect turn's deliverable is the verdict file; a passed:false verdict is a
 *  VALID deliverable (it drives the smell + revise-route). This distinguishes
 *  "the critic ran and produced a verdict" from "no verdict on disk", so the
 *  driver can guard a reflect turn that produced nothing (escalate) instead of
 *  silently re-invoking it into a stall. */
export function reflectionVerdictWritten(consortDir: string, feature: string, story: string): boolean {
  return readReflectVerdict(consortDir, feature, story) !== undefined;
}

/** Every reflect smell name (both owners), for the clear-on-pass sweep. */
const REFLECT_SMELLS: readonly SmellName[] = Object.values(SMELL_FOR_OWNER);

/**
 * The DETERMINISTIC reflection gate: read the story's verdict and, when it did
 * NOT pass, flag the spec-level blocking smell(s) for the owning author(s),
 * scoped to the story, so the existing revise-route/escalation machinery routes
 * + bounds + escalates. Returns the defects found (empty when passed).
 *
 * Idempotent + self-clearing (FEIP-8007, reflect-gate convergence):
 *   - a PASSED (or absent) verdict CLEARS any open reflect smell(s) for the story
 *     left over from an earlier failed pass (the named defect is gone, so a
 *     lingering open smell must not keep blocking the gate);
 *   - a FAILED verdict records the owner's smell ONLY when one is not already
 *     open for this (smell, story), so re-running against a still-failing verdict
 *     does not pile up duplicate entries.
 * The one-revise bound stays the smell log's job (priorReviseCount): a genuine
 * re-fire after a revise still escalates to HITL, it just does so without dups.
 */
export function recordReflectionGate(consortDir: string, feature: string, story: string): SmellHit[] {
  const verdict = readReflectVerdict(consortDir, feature, story);
  if (!verdict || verdict.passed) {
    // The gate passes: drain any open reflect smell(s) for this story so a
    // now-resolved defect does not linger + block. `cleared` is an automatic
    // self-resolve (not a `revised`), so it does not spend the revise budget.
    if (verdict?.passed) {
      for (const smell of REFLECT_SMELLS) {
        resolveOpenSmells(consortDir, smell, { story_id: story, kind: "cleared", note: "reflect gate now passes" });
      }
    }
    return [];
  }
  // Severity split (issue #201): a verdict of pure ADVISORY findings does NOT
  // block the gate. Marginal nitpicks (nice-to-have coverage, style) ride the
  // verdict for the human at the spec gate, but they never spend a revise lap –
  // the unbounded churn this gate previously allowed (~8 laps of marginal revises,
  // ~90 min opus). An UNRECORDED severity (a verdict from an older kit) counts as
  // blocking, so a pre-severity verdict can never silently pass.
  const blocking = verdict.findings.filter((f) => (f.severity ?? "blocking") === "blocking");
  if (blocking.length === 0) {
    // Advisory-only: pass the gate + self-clear any lingering open smells, exactly
    // like a passing verdict (the named defect is gone from the blocking set).
    for (const smell of REFLECT_SMELLS) {
      resolveOpenSmells(consortDir, smell, { story_id: story, kind: "cleared", note: "only advisory findings remain (issue #201)" });
    }
    return [];
  }
  // One smell per DISTINCT owner among the BLOCKING findings (a story can have
  // both a spec defect and a test-list defect; each routes to its own author).
  const owners = new Set<ReflectOwner>(blocking.map((f) => f.owner));
  // Defensive: a failed verdict with no attributed owner still must block, not
  // silently pass. Attribute an unowned failure to the spec author (the spec is
  // the upstream source of most design defects).
  if (owners.size === 0) owners.add("spec-author");
  const hits: SmellHit[] = [...owners].map((owner) => {
    const detail = blocking
      .filter((f) => f.owner === owner)
      .map((f) => f.detail)
      .join("; ");
    return {
      smell: SMELL_FOR_OWNER[owner],
      cycle_ids: [],
      detail: `reflection gate: ${detail || "unattributed design defect"}`,
      story_id: story,
    };
  });
  // Idempotent: only write the owner smells that are not already open for this
  // story (a re-run against the same failing verdict re-detects the same defect).
  const fresh = hits.filter((h) => !hasOpenSmell(consortDir, h.smell, story));
  if (fresh.length) writeSmellsLog(consortDir, fresh);
  return hits;
}
