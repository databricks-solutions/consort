// Feature-complete symmetric cross-story RECONCILIATION gate. The per-story
// cross-story-context (cross-story-context.ts) is ASYMMETRIC: a story is reviewed
// against the siblings that ALREADY have ACs, so the FIRST story (designed before
// its siblings had any ACs) is never checked against the later ones. Nothing
// re-checks the whole set once every story's ACs exist.
//
// This gate closes that: once EVERY story is gate-approved (design-complete is
// imminent, before the design-corpus commit), the Navigator runs ONE feature-scoped
// `reconcile` turn over ALL stories with the full feature context, and writes a
// feature-level verdict. Each finding names the OWNING story + its author, so this
// gate flags the SAME per-owner reflect smell (reflect-{spec,testlist,architecture,ia}
// -defect) scoped to that story — reopening it through the existing revise-route /
// escalation machinery (reviseStory un-gates it; the per-story reflect budget bounds
// it; a re-fire past the cap hard-halts to HITL). No new smell, no new budget: the
// reconcile pass REUSES the reflect door, feature-scoped.
//
// Mirrors reflection.ts (the LLM writes the verdict; the code flags the smell), one
// level up (feature, not story). The verdict is cleared on any story revise (so a
// reconcile-triggered heal re-runs the pass fresh); a passing verdict lets
// design-complete proceed.

import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "fs";
import { dirname } from "path";
import { reconcileVerdictJson } from "../../consort/config/consort-paths.js";
import { writeSmellsLog, hasOpenSmell, resolveOpenSmells, type SmellHit } from "./smells.js";
import { SMELL_FOR_OWNER, REFLECT_SMELLS, type ReflectOwner } from "./reflection.js";

export interface ReconcileFinding {
  /** Which author must fix it (drives the per-owner smell + revise-route). */
  owner: ReflectOwner;
  /** The story that OWNS the fix — the one reopened on a revise. A cross-story defect names the
   *  story to change (e.g. an earlier story whose AC contradicts a later gated sibling). */
  story: string;
  /** The specific cross-story defect (a contradiction with a gated sibling AC; a mandated not-null
   *  field no sibling submit AC supplies; cross-story behavior overlap; a mis-anchored invariant). */
  detail: string;
  /** The exact story AC id(s) the finding concerns, when AC-scoped (carried into the revise so a
   *  test_list/spec defect can scope the re-author). Omit for a whole-story finding. */
  ac_ids?: string[];
  /** `blocking` reopens the owning story; `advisory` rides the verdict for the human but spends no
   *  revise lap. Absent ⇒ blocking (fail-safe, mirrors ReflectFinding). */
  severity?: "blocking" | "advisory";
}

export interface ReconcileVerdict {
  version: 1;
  /** True iff the stories are mutually consistent (no blocking cross-story defect). */
  passed: boolean;
  findings: ReconcileFinding[];
}

/** Write the feature's reconcile verdict (the Navigator reconcile turn's output). */
export function writeReconcileVerdict(consortDir: string, feature: string, verdict: ReconcileVerdict): void {
  const p = reconcileVerdictJson(consortDir, feature);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(verdict, null, 2) + "\n");
}

/** Read the feature's reconcile verdict, or undefined when none written. */
export function readReconcileVerdict(consortDir: string, feature: string): ReconcileVerdict | undefined {
  const p = reconcileVerdictJson(consortDir, feature);
  if (!existsSync(p)) return undefined;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as ReconcileVerdict;
  } catch {
    return undefined;
  }
}

/** Invalidate the reconcile verdict (delete it). Called whenever ANY story is revised: the OLD
 *  verdict judged the pre-fix set, so the reconcile pass MUST re-run against the corrected stories
 *  once they re-gate. Without this a stale passed:false verdict persists and the pass never
 *  converges. Idempotent (no-op if absent). */
export function clearReconcileVerdict(consortDir: string, feature: string): void {
  const p = reconcileVerdictJson(consortDir, feature);
  if (existsSync(p)) rmSync(p, { force: true });
}

/** The design-lane predicate: has the feature-complete reconciliation PASSED? A missing or failed
 *  verdict is not passed (the lane runs / re-runs the reconcile turn, and a failed verdict drives the
 *  per-owner smell + revise-route for the owning story). */
export function reconcilePassed(consortDir: string, feature: string): boolean {
  const v = readReconcileVerdict(consortDir, feature);
  if (!v) return false;
  // "Done" = NO blocking finding (passed, or advisory-only). Aligned with recordReconcileGate, which
  // flags a smell iff there IS a blocking finding — so blocking>0 ⟺ a flag ⟺ not passed. Checking the
  // blocking count (not v.passed) keeps the drive from re-invoking the reconcile turn forever on an
  // advisory-only (passed:false) verdict that raises no smell.
  return (v.findings ?? []).filter((f) => (f.severity ?? "blocking") === "blocking").length === 0;
}

/** Did the reconcile turn produce a readable verdict at all (pass OR fail)? The deliverable is the
 *  verdict file; a passed:false verdict is a VALID deliverable (it drives the revise-route), so this
 *  distinguishes "ran + produced a verdict" from "nothing on disk" (guard a no-output turn). */
export function reconcileVerdictWritten(consortDir: string, feature: string): boolean {
  return readReconcileVerdict(consortDir, feature) !== undefined;
}

/**
 * The DETERMINISTIC reconcile gate: read the feature verdict and, when it did NOT pass, flag the
 * per-owner reflect smell for EACH blocking finding, SCOPED TO THE FINDING'S STORY, so the existing
 * revise-route/escalation machinery reopens that gated story at the owner's gate. Returns the hits.
 *
 * Idempotent + self-clearing (mirrors recordReflectionGate):
 *  - a PASSED (or absent) verdict drains any open reflect smell(s) left from an earlier failed pass
 *    (safe: the gate runs only once every story is gated, so no PER-STORY reflect smell is open —
 *    any open reflect-*-defect is this gate's own);
 *  - a FAILED verdict records a finding's owner smell for its story ONLY when one is not already open
 *    (a re-run against the same verdict does not pile up duplicates).
 * The one-revise bound stays the reflect budget's job (priorReflectReviseCount per story): a genuine
 * re-fire after a reconcile revise still escalates to HITL.
 */
export function recordReconcileGate(consortDir: string, feature: string): SmellHit[] {
  const verdict = readReconcileVerdict(consortDir, feature);
  const blocking = (verdict?.findings ?? []).filter((f) => (f.severity ?? "blocking") === "blocking");
  if (!verdict || verdict.passed || blocking.length === 0) {
    // Pass / absent / advisory-only: drain any open reflect smell(s) this gate raised so a now-resolved
    // cross-story defect does not linger + block design-complete. `cleared` spends no revise budget.
    if (verdict?.passed || (verdict && blocking.length === 0 && verdict.findings.length > 0)) {
      for (const smell of REFLECT_SMELLS) {
        resolveOpenSmells(consortDir, smell, { kind: "cleared", note: "feature-complete reconciliation now passes" });
      }
    }
    return [];
  }
  // One smell per DISTINCT (owner, story) among the blocking findings — a cross-story defect reopens the
  // specific owning story at the owning author's gate.
  const byKey = new Map<string, { owner: ReflectOwner; story: string; details: string[]; ac_ids: Set<string> }>();
  for (const f of blocking) {
    const key = `${f.owner}__${f.story}`;
    const e = byKey.get(key) ?? { owner: f.owner, story: f.story, details: [], ac_ids: new Set<string>() };
    e.details.push(f.detail);
    for (const id of f.ac_ids ?? []) e.ac_ids.add(id);
    byKey.set(key, e);
  }
  const hits: SmellHit[] = [...byKey.values()].map((e) => ({
    smell: SMELL_FOR_OWNER[e.owner],
    cycle_ids: [],
    detail: `feature-complete reconciliation: ${e.details.join("; ") || "cross-story defect"}`,
    story_id: e.story,
    ...(e.ac_ids.size > 0 ? { ac_ids: [...e.ac_ids] } : {}),
  }));
  // Idempotent: only write a (smell, story) that is not already open.
  const fresh = hits.filter((h) => !hasOpenSmell(consortDir, h.smell, h.story_id));
  if (fresh.length) writeSmellsLog(consortDir, fresh);
  return hits;
}
