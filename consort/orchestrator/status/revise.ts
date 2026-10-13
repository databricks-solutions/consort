// The revise SELF-HEAL, a deterministic state-machine transition.
//
// When a SPEC-level blocking smell still has its one-revise-per-(smell,story)
// budget, the driver (orchestrator-drive `revise-route`) sends the story back to
// its owning author and resumes – instead of hard-halting to the HIL. That
// circle-back is a pure workflow transition over pipeline.json + the design
// artifacts, so it lives here in the state-machine layer, NOT in the smoke-only
// Human Proxy. The Human Proxy (or a real human) only makes the yes/no gate
// decision; the transition it triggers is this.
//
// The transition: (1) record the PO's `revise` choice as a gate event (auditable
// as a self-heal, not an invisible auto-edit), (2) reset the story to `designing`
// via reviseStory (discard the experiment, reopen the gate, free the lane), (3)
// STALE the owning author's artifact + deliver the verdict as a smell-aware
// hand-back brief so the author actually RE-AUTHORS (without this the design lane
// re-approves the identical artifact and the same smell re-fires – the revise
// heals nothing), and (4) resolve the smell as `revised`, spending the budget so
// a second escape of the SAME smell on the SAME story hard-halts.

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { emitAgentLogEvent } from "../../../consort/logging/agent-log.js";
import {
  featureTestListJson,
  storyTestListJson,
  storyIaCoverageJson,
  specReviseScopeJson,
  testListPatchJson,
  acsDir,
  handbackFile,
  storyAcIds,
  resolveConsortDir,
} from "../../../consort/config/consort-paths.js";
import { readPipeline, updatePipeline, reviseStory, setStoryStatus } from "../../../consort/pipeline/story-pipeline.js";
import {
  markSmellResolved,
  composeReviseBrief,
  readSmellsLog,
  specLevelSmell,
  resolveAllOpenSmellsForStory,
  isReflectSmell,
  resolveOpenReflectSmellsForStory,
  bumpReflectReviseCount,
  storyTestListFingerprint,
  openSmellScopeAcIds,
} from "../../../consort/smells/smells.js";
import { clearReflectVerdict, readReflectVerdict } from "../../../consort/smells/reflection.js";
import { clearReconcileVerdict } from "../../../consort/smells/reconcile.js";
import { resetStoryBuildState } from "../../../consort/pipeline/cycle-record.js";
import { analystOrderedJson } from "../../../consort/test-list/fan-out-plan.js";
import { resolveEscalationsForStory } from "../../../consort/gates/escalation.js";

/** Default author identity recorded on a headless self-heal. A real interactive
 *  decision passes the human's identity through `approver`. */
export const REVISE_APPROVER = "human-proxy";

/**
 * Stale the owning author's artifact for a story so the design lane RE-INVOKES
 * that author on a revise (the teeth that make revise non-hollow). Always clears
 * the story's test list (remove its items from the master test-list.json + delete
 * the per-story view) so testListReady reads false and the test-strategist
 * re-runs. A `spec`-gate revise also clears the story's ACs so the spec-author
 * re-drafts — SCOPED to `specAcScope` (the spec-author's own flagged ac_ids) when
 * given, so ONLY those AC files are cleared and every OTHER AC (with its architect
 * notes) is PRESERVED on disk; a `spec-revise-scope.json` marker records the cleared
 * ids so `specRevisePending` re-invokes the spec-author (a single missing AC is
 * invisible to the whole-story `hasAcs`). With no scope → the full AC wipe
 * (whole-story re-decomposition). This mirrors the test_list scoped re-derive:
 * preserve what the finding did not flag, instead of ditch-and-recreate.
 */
export function staleStoryArtifactsForRevise(
  consortDir: string,
  featureId: string,
  story: string,
  gate: "spec" | "test_list" | "architecture" | "ia",
  scopeAcIds?: string[],
  specAcScope?: string[],
): void {
  // Invalidate the (now stale) reflect verdict: it judged the PRE-fix spec +
  // test-list, so it MUST be recomputed against the corrected artifacts. Applies
  // to every gate (a spec/architecture/test_list revise all change what the
  // reflection critiqued). Without this the stale passed:false verdict persists,
  // the re-dispatched Navigator reuses it instead of re-evaluating, and the
  // reflect gate never converges (it loops the Navigator to the stall guard).
  clearReflectVerdict(consortDir, featureId, story);
  // The feature-complete reconciliation verdict judged the PRE-fix set of stories, so any story revise
  // (incl. one the reconcile-gate itself routed) invalidates it — clear it so the symmetric pass re-runs
  // against the corrected stories once they re-gate. Idempotent; feature-level.
  clearReconcileVerdict(consortDir, featureId);
  // The test list is cleared for THIS story (its items from the master + the per-story view) so
  // testListReady reads false and the test-strategist re-runs. HOW it re-runs splits by revise shape:
  //  - DIRECTED PATCH (a clean, AC-scoped reflect-testlist defect): the reflect finding names the exact
  //    fix, so KEEP analyst-ordered.json as the edit source and drop a patch marker — the test-strategist
  //    edits that list in place (keeping every other item + its T-id) instead of re-running the fan-out,
  //    which would re-roll the whole scope nondeterministically (the observed 33→22 swing + reflect
  //    bounces). The test-strategist re-appends the edited ordered list to the (cleared) master.
  //  - FULL re-derive (a whole-story/coupled test_list defect, or a spec/architecture/ia revise that
  //    changed the ACs/arch/IA): drop analyst-ordered.json so the fan-out bin re-derives the whole story,
  //    and clear any stale patch marker.
  // An ARCHITECTURE revise PRESERVES the test-list. The architect re-annotates (clearArchitecturalNotes
  // below → architectAnnotated false → architect re-runs) and reflect re-runs (verdict cleared above), but
  // a ui_seams / notes change does NOT require re-deriving the (non-deterministic, costly) test-list — the
  // test items are unchanged. Blind-clearing it re-rolled a correct list for a one-line seam add (observed
  // live: AC3 ui_seams gained 5 lookup seams, and the whole story's tests re-derived 37→19). If the
  // architecture change genuinely invalidates a test (e.g. a layer re-assignment making a client test
  // wrong-mechanism), the deterministic test_list conformance gate (checkClientKindLayerCoherence et al.)
  // + reflect re-catch it against the PRESERVED list and route to test_list THEN — a cheap targeted pass,
  // not a blind whole-story re-roll. The spec/ia/test_list gates still clear (their artifacts changed).
  if (gate !== "architecture") {
    const scoped = gate === "test_list" && !!scopeAcIds && scopeAcIds.length > 0;
    const clearAcs = new Set(storyAcIds(consortDir, featureId, story));
    const master = featureTestListJson(consortDir, featureId);
    if (existsSync(master)) {
      try {
        const data = JSON.parse(readFileSync(master, "utf8")) as { items?: Array<{ ac_id?: string }> };
        if (Array.isArray(data.items)) {
          data.items = data.items.filter((it) => !it.ac_id || !clearAcs.has(it.ac_id));
          writeFileSync(master, JSON.stringify(data, null, 2) + "\n");
        }
      } catch {
        // Leave the master as-is on a parse error; deleting the per-story view
        // below still forces a re-run.
      }
    }
    const perStory = storyTestListJson(consortDir, featureId, story);
    if (existsSync(perStory)) rmSync(perStory, { force: true });
    const ordered = analystOrderedJson(consortDir, featureId, story);
    const patchMarker = testListPatchJson(consortDir, featureId, story);
    if (scoped) {
      // PATCH: keep analyst-ordered.json (the edit source) + mark the flagged ACs for the directive.
      writeFileSync(patchMarker, JSON.stringify({ ac_ids: scopeAcIds }, null, 2) + "\n");
    } else {
      // FULL re-derive: drop the ordered list (the fan-out re-derives the whole story) + clear any stale
      // patch marker so the directive picks the fan-out, not a patch.
      if (existsSync(ordered)) rmSync(ordered, { force: true });
      if (existsSync(patchMarker)) rmSync(patchMarker, { force: true });
    }
  }

  if (gate === "spec") {
    // SCOPED (B, spec analogue): clear ONLY the spec-author's flagged AC file(s) and record them in the
    // marker so specRevisePending re-invokes the spec-author to re-author just those — every OTHER AC
    // (content + its architect notes) survives on disk. No scope ⇒ the full AC wipe (whole-story
    // re-decomposition), and clear any stale marker. A scoped-but-empty storyAcIds guards the degenerate
    // case (nothing on disk) → fall through to full.
    const marker = specReviseScopeJson(consortDir, featureId, story);
    if (specAcScope && specAcScope.length > 0) {
      clearStoryAcs(consortDir, featureId, story, specAcScope);
      writeFileSync(marker, JSON.stringify({ ac_ids: specAcScope }, null, 2) + "\n");
    } else {
      clearStoryAcs(consortDir, featureId, story);
      if (existsSync(marker)) rmSync(marker, { force: true });
    }
  } else if (gate === "architecture") {
    clearArchitecturalNotes(consortDir, featureId, story);
  } else if (gate === "ia") {
    // The IA changed (a surface was added for a user-facing AC), so the architect must
    // re-tag E2E layers against it: clear the per-story IA coverage marker (iaRefined ->
    // false, the ux ia refinement re-runs) AND the architectural_notes (architectAnnotated
    // -> false, the architect re-runs). The test-list + reflect verdict are already cleared
    // above, so they re-derive after.
    rmSync(storyIaCoverageJson(consortDir, featureId, story), { force: true });
    clearArchitecturalNotes(consortDir, featureId, story);
  }
}

/** Delete a story's AC files (json + md) so `hasAcs` reads false and the design lane
 *  RE-INVOKES the spec-author to re-decompose. Used by a `spec`-gate revise and by the
 *  reflect co-heal when a spec-author reflect defect is open under a non-spec primary.
 *  SCOPED to `acIds` (the flagged ACs): delete ONLY those AC files (json + md), leaving
 *  every other AC — and its embedded architect notes — intact; a scoped clear is paired
 *  with the spec-revise-scope marker so the drive still re-invokes the spec-author for
 *  the one missing AC. No `acIds` ⇒ wipe all (the whole-story re-decomposition). */
export function clearStoryAcs(consortDir: string, featureId: string, story: string, acIds?: string[]): void {
  const dir = acsDir(consortDir, featureId, story);
  if (!existsSync(dir)) return;
  const scope = acIds && acIds.length > 0 ? new Set(acIds) : undefined;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json") && !f.endsWith(".md")) continue;
    // AC files are named <ac_id>.json / <ac_id>.md; a scoped clear removes only the flagged ids.
    if (scope) {
      const base = f.replace(/\.(json|md)$/, "");
      if (!scope.has(base)) continue;
    }
    rmSync(join(dir, f), { force: true });
  }
}

/** True iff a `reflect-spec-defect` smell is OPEN (unresolved) for the story — i.e.
 *  the last reflect attributed a defect to the spec-author. Unscoped smells
 *  (story_id undefined) count (feature-wide reflect defects), matching the driver's
 *  smellMatches semantics. Best-effort: an unreadable log reads as "none open". */
export function hasOpenReflectSpecDefect(consortDir: string, story: string): boolean {
  let log;
  try {
    log = readSmellsLog(consortDir);
  } catch {
    return false;
  }
  return log.detected.some(
    (d) => !d.resolution && d.smell === "reflect-spec-defect" && (d.story_id === undefined || d.story_id === story),
  );
}

/** True iff a `reflect-ia-defect` smell is OPEN for the story — the last reflect attributed
 *  a defect to the ux-designer (a user-facing AC whose surface the IA does not name). Same
 *  semantics as hasOpenReflectSpecDefect; best-effort. */
export function hasOpenReflectIaDefect(consortDir: string, story: string): boolean {
  let log;
  try {
    log = readSmellsLog(consortDir);
  } catch {
    return false;
  }
  return log.detected.some(
    (d) => !d.resolution && d.smell === "reflect-ia-defect" && (d.story_id === undefined || d.story_id === story),
  );
}

/**
 * Clear each AC's architectural_notes so architectAnnotated reads false and the
 * design lane re-dispatches the ARCHITECT (who re-annotates + re-evaluates the
 * persistence invariants). The ACs themselves stay (this is not a
 * re-decomposition); only the architect's product is staled. Projection is
 * separately disabled for this story after a revise (architectProjectable checks
 * priorReviseCount), so the architect runs live rather than re-projecting the gap.
 */
export function clearArchitecturalNotes(consortDir: string, featureId: string, story: string, acIds?: string[]): void {
  const dir = acsDir(consortDir, featureId, story);
  if (!existsSync(dir)) return;
  // SCOPED (#4): clear notes ONLY for the flagged AC(s) when `acIds` is given, so the UNFLAGGED ACs keep
  // their valid notes — the architect re-annotates just the cleared ones (its directive fills only ACs
  // that LACK notes), and the test-list re-derive sees the kept ACs' notes unchanged (no cascade churn:
  // S1's revise cleared all 3 ACs though only AC2 was flagged, re-rolling AC1/AC3 for nothing). No acIds
  // ⇒ clear all (the whole-story re-annotate).
  const scope = acIds && acIds.length > 0 ? new Set(acIds) : undefined;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    if (scope && !scope.has(f.replace(/\.json$/, ""))) continue;
    const p = join(dir, f);
    try {
      const ac = JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
      if ("architectural_notes" in ac) {
        delete ac.architectural_notes;
        writeFileSync(p, JSON.stringify(ac, null, 2) + "\n");
      }
    } catch {
      // Leave an unparseable AC as-is; the architect turn will surface it.
    }
  }
}

export interface ReviseSelfHealArgs {
  featureId: string;
  /** The story to send back to its owning author + resume. */
  story: string;
  /** The blocking smell being resolved (e.g. reflect-testlist-defect, ac-overlap). */
  smell: string;
  /** The owning author the verdict routes to. */
  routedTo: "spec-author" | "test-strategist" | "architect-reviewer" | "ux-designer";
  /** The gate to re-open + re-run (Gate 1 spec / Gate 2 architecture / Gate 3
   *  test_list / the ia refinement). */
  gate: "spec" | "test_list" | "architecture" | "ia";
  /** The verdict (the smell's detail): the author's brief on resume. */
  reason: string;
  /** The deciding identity (a real human, or the headless proxy). */
  approver?: string;
  consortDir?: string;
}

export interface ReviseSelfHealResult {
  decided: "revise";
  story: string;
  routedTo: string;
  /** True iff an open matching smell was found + marked resolved. */
  resolvedSmell: boolean;
}

/**
 * Apply the revise self-heal transition (see module header). The driver only
 * emits this AFTER the pure transition already decided the escalation was
 * routable (budget not yet spent), so it always spends from 0 -> 1.
 */
export function applyReviseSelfHeal(args: ReviseSelfHealArgs): ReviseSelfHealResult {
  const consortDir = args.consortDir ?? resolveConsortDir();
  const approver = args.approver ?? REVISE_APPROVER;
  const at = new Date().toISOString();

  // Fingerprint the test-list BEFORE staleStoryArtifactsForRevise removes it, so
  // a reflect revise can stamp "the list looked like THIS when I sent it back".
  // The next re-design's reflect budget compares the fresh list against this: an
  // unchanged list means the strategist made no progress (stuck -> hard halt).
  const preReviseTestListSha = storyTestListFingerprint(consortDir, args.featureId, args.story);

  // 1. Record the PO's revise decision (the human's choice) as a gate event.
  try {
    emitAgentLogEvent(
      {
        role: "product-owner",
        level: "info",
        event: "gate.modified",
        feature_id: args.featureId,
        slots: {
          gate: args.gate,
          decision: "revise",
          routed_to: args.routedTo,
          smell: args.smell,
          story: args.story,
          verdict: args.reason,
          approver,
        },
      },
      { consortDir },
    );
  } catch {
    // Logging is observability, never block the heal.
  }

  // 2. Reset the story to designing (discard experiment + reopen gate + free lane).
  updatePipeline(consortDir, args.featureId, (p) => reviseStory(p, args.story, { approver, at, reason: args.reason }));

  // 2a. Reset the story's BUILD state (Finding 27). reviseStory only flips the
  // pipeline status; the build lane derives "pending" from the cycle records on
  // disk, so a status-only revise leaves every stale green_at behind. Once the
  // design lane regenerates a same-id test-list those cycles re-match and the
  // story reads allGreen, so the drive skips RED/GREEN straight back to deploy and
  // re-fails on the same stale build. Clearing the cycles makes it genuinely
  // re-drive – the SAME reset the `experiment discard --revise` door already does.
  resetStoryBuildState(consortDir, args.featureId, args.story);

  // 2b. Force the owning author to actually RE-AUTHOR: stale its artifact so the
  // design lane re-invokes it, and deliver the verdict as a smell-aware hand-back
  // brief (composeReviseBrief FORCES missing coverage for a reflect defect, keeps
  // the open-question escape only for the redundancy case).
  // SCOPED re-derive (B): preserve what the finding did NOT flag, instead of ditch-and-recreate. Read the
  // verdict's findings ONCE here (staleStoryArtifactsForRevise clears the verdict next):
  //  - scopeAcIds (clean-UNCOUPLED): a test_list OR spec defect whose EVERY finding is owned by the
  //    primary gate's role AND carries ac_ids. Drives `scoped` — skip the coupled architect/test co-heal —
  //    and the test_list sidecar. A coupled defect (another role's finding alongside) or any ac_id-less
  //    finding ⇒ undefined (the full co-heal path).
  //  - specAcScope: the SPEC-author's OWN flagged ac_ids, for ANY spec revise that carries them (coupled
  //    or not). It scopes the AC-FILE clear so only those ACs are re-authored and every other AC (with its
  //    architect notes) survives on disk — the architect/test/ux co-heal still runs for a coupled defect.
  const findings = readReflectVerdict(consortDir, args.featureId, args.story)?.findings ?? [];
  const allOwnedBy = (role: string): boolean =>
    findings.length > 0 && findings.every((f) => f.owner === role && Array.isArray(f.ac_ids) && f.ac_ids.length > 0);
  let scopeAcIds: string[] | undefined;
  if ((args.gate === "test_list" && allOwnedBy("test-strategist")) || (args.gate === "spec" && allOwnedBy("spec-author"))) {
    scopeAcIds = [...new Set(findings.flatMap((f) => f.ac_ids ?? []))];
  }
  // #4 (deterministic flag): the pre-reflect test-list conformance gate records its smell with the
  // flagged ac_id(s) but writes NO reflect verdict, so `findings` is empty and the scope above stays
  // undefined — which forced a WHOLE-STORY clear (every architect note re-annotated, every test item
  // re-rolled) for a structural defect that named one or two items. When there is no verdict to scope
  // from, read the OPEN flag's ac_id(s): a test_list flag then takes the SCOPED patch path (edit just
  // those items, no architect co-heal), exactly as a clean reflect-testlist defect would.
  if (scopeAcIds === undefined && args.gate === "test_list" && findings.length === 0) {
    const flagAcIds = openSmellScopeAcIds(consortDir, args.smell, args.story);
    if (flagAcIds.length > 0) scopeAcIds = flagAcIds;
  }
  // The spec-author's own flagged ac_ids (any gate) — scopes the AC-file clear both when spec is the
  // PRIMARY routed role (specAcScope, below) and when it is a secondary co-heal under a non-spec primary.
  const specDefectAcIds = [
    ...new Set(findings.filter((f) => f.owner === "spec-author" && Array.isArray(f.ac_ids)).flatMap((f) => f.ac_ids ?? [])),
  ];
  const specAcScope = args.gate === "spec" ? specDefectAcIds : [];
  // #4 — the ACs the architect must RE-ANNOTATE: the ACs the findings flagged (their notes are stale
  // against the fix). Scope the co-heal note-clear to these so the UNFLAGGED ACs keep their valid notes
  // and the architect re-annotates only the changed ones (no cascade re-roll). Only when EVERY finding
  // carries ac_ids (a clean scope); a whole-story finding (no ac_ids) ⇒ undefined ⇒ clear all.
  const archScope =
    findings.length > 0 && findings.every((f) => Array.isArray(f.ac_ids) && (f.ac_ids?.length ?? 0) > 0)
      ? [...new Set(findings.flatMap((f) => f.ac_ids ?? []))]
      : undefined;
  const scoped = !!scopeAcIds;
  staleStoryArtifactsForRevise(
    consortDir,
    args.featureId,
    args.story,
    args.gate,
    scopeAcIds,
    specAcScope.length > 0 ? specAcScope : undefined,
  );
  try {
    const hb = handbackFile(consortDir, args.featureId, args.routedTo, args.story);
    mkdirSync(dirname(hb), { recursive: true });
    writeFileSync(hb, composeReviseBrief({ smell: args.smell, gate: args.gate, reason: args.reason, scoped, acIds: specAcScope }));
  } catch {
    // The brief is best-effort observability; never block the heal.
  }

  // 2c. A reflect defect couples the design roles: a test-list gap is often rooted
  // in an architecture under-declaration (an undeclared column/invariant), and the
  // reflect owner model has no architect slot, so such a defect is routed to the
  // spec-author or test-strategist, neither of whom can fix architecture.json.
  // Re-run the FULL design lane for the story: stale the architect's product too
  // and hand the SAME defect brief to the architect and the test-strategist, so
  // whoever must fix it re-runs with the context. Budgeted per-STORY (the probe
  // checks priorReflectReviseCount), so this is ONE re-design; a second reflection
  // failure is the hard halt.
  const reflect = isReflectSmell(args.smell);
  if (reflect) {
    // A SCOPED test-list defect is uncoupled (test-strategist-only) — do NOT force the architect to
    // re-run; only the flagged ACs' test items re-derive. The full/coupled path re-runs the architect, but
    // SCOPED (#4) to the flagged ACs' notes (archScope) so the unflagged ACs keep theirs and only the
    // changed ACs are re-annotated — a whole-story finding (archScope undefined) still clears all.
    if (!scoped) clearArchitecturalNotes(consortDir, args.featureId, args.story, archScope);
    // Re-author EVERY design owner that has an open reflect finding for the story —
    // not just architect + test-strategist. The gap this closes: a single reflect
    // pass can flag BOTH a test-list defect and a SPEC defect, and revisableSmell
    // routes to whichever open smell is FIRST (often the test-strategist, gate
    // test_list). This co-heal then re-ran architect + test-strategist but NOT the
    // spec-author, and staleStoryArtifactsForRevise clears the ACs only on a `spec`
    // gate — so the spec defect was never re-authored, yet resolveOpenReflectSmells
    // below spends its budget as `revised`. It therefore re-fires on the NEXT reflect
    // and burns the reflect budget straight to a needless HIL (observed live: an
    // actor-field AC-contract gap looped 4 laps to raise-to-hil). So when a
    // spec-author reflect defect is open and spec was NOT the primary gate, ALSO
    // stale the ACs (re-decomposition) so the spec-author genuinely re-drafts.
    const specDefectOpen = args.routedTo !== "spec-author" && hasOpenReflectSpecDefect(consortDir, args.story);
    if (specDefectOpen && args.gate !== "spec") {
      // SCOPED (B): clear ONLY the spec-author's flagged AC file(s) + mark them (so specRevisePending
      // re-invokes the spec-author for just those) — the rest survive. No scoped ids ⇒ the full wipe.
      const marker = specReviseScopeJson(consortDir, args.featureId, args.story);
      if (specDefectAcIds.length > 0) {
        clearStoryAcs(consortDir, args.featureId, args.story, specDefectAcIds);
        writeFileSync(marker, JSON.stringify({ ac_ids: specDefectAcIds }, null, 2) + "\n");
      } else {
        clearStoryAcs(consortDir, args.featureId, args.story);
        if (existsSync(marker)) rmSync(marker, { force: true });
      }
    }
    // An IA defect open under a non-ia primary: the ux ia refinement must re-run too, so stale
    // the per-story IA coverage marker (iaRefined -> false), mirroring the spec co-heal above.
    const iaDefectOpen = args.routedTo !== "ux-designer" && hasOpenReflectIaDefect(consortDir, args.story);
    if (iaDefectOpen && args.gate !== "ia") rmSync(storyIaCoverageJson(consortDir, args.featureId, args.story), { force: true });
    // A SCOPED test-list defect re-runs ONLY the test-strategist (via the main design lane); no coupled
    // co-heal roles. The full/coupled path re-runs the architect (+ spec-author/ux-designer when their
    // findings are open, below).
    // An IA revise (gate "ia") only couples the ARCHITECT (re-tag E2E layers against the surface the ux
    // just added to ia.md). The test-strategist re-derives its list from the (unchanged) ACs via the lane
    // — handing it the reflect-ia-defect brief only makes it hedge "I didn't change ia.md … the seams
    // still need a home" (an IA fix it cannot make in a test list), confusing narration for no work. So
    // an ia revise co-heals the architect ONLY; every other reflect gate re-briefs architect + test-strategist.
    const coHealRoles: Array<"spec-author" | "architect-reviewer" | "test-strategist" | "ux-designer"> = scoped
      ? []
      : args.gate === "ia"
        ? ["architect-reviewer"]
        : ["architect-reviewer", "test-strategist"];
    if (specDefectOpen) coHealRoles.unshift("spec-author");
    if (iaDefectOpen) coHealRoles.push("ux-designer");
    for (const role of coHealRoles) {
      if (role === args.routedTo) continue;
      try {
        const hb = handbackFile(consortDir, args.featureId, role, args.story);
        mkdirSync(dirname(hb), { recursive: true });
        const gate =
          role === "architect-reviewer" ? "architecture" : role === "spec-author" ? "spec" : role === "ux-designer" ? "ia" : "test_list";
        // The spec-author co-heal is SCOPED just like the primary: its AC files were cleared only for
        // specDefectAcIds, so hand it the scoped brief ("re-author ONLY those; the rest are preserved")
        // — without the ids it gets the whole-story "re-derive FRESH" brief and wanders into other ACs.
        const acIds = role === "spec-author" ? specDefectAcIds : undefined;
        writeFileSync(hb, composeReviseBrief({ smell: args.smell, gate, reason: args.reason, acIds }));
      } catch {
        // Best-effort brief; never block the heal.
      }
    }
  }

  // Issue #201: the cap counts LAPS, not resolved entries – bump ONCE for this whole
  // co-heal pass, BEFORE the resolve (so the seed-if-absent never counts this lap's
  // own entries). A multi-owner, multi-finding lap costs exactly one lap of budget.
  if (reflect) bumpReflectReviseCount(consortDir, args.story);
  // 3. Resolve the smell(s) as `revised` (spends the budget; a re-fire is a hard
  // halt). A reflect defect CO-HEALS: resolve EVERY open reflect smell for the
  // story in this one revise, so a sibling reflect smell does not immediately
  // re-route or halt before the full re-design has run.
  const resolvedSmell = reflect
    ? resolveOpenReflectSmellsForStory(
        consortDir,
        args.story,
        `revised by ${approver}: full design re-run (${args.gate} gate)`,
        preReviseTestListSha,
      ) > 0
    : markSmellResolved(consortDir, args.smell, {
        story_id: args.story,
        kind: "revised",
        note: `revised by ${approver}: routed to ${args.routedTo} (${args.gate} gate)`,
      });
  return { decided: "revise", story: args.story, routedTo: args.routedTo, resolvedSmell };
}

/** A blocking SPEC-level smell open against a story, mapped to its owning author
 *  + gate. This is the SAME derivation the driver's revise-route uses (the probe's
 *  routable field), factored out so the operator-facing `pipeline revise` reaches
 *  the identical self-heal instead of a hollow reset (Findings 22 + 23). Returns
 *  the FIRST open, unresolved, spec-level revisable smell for the story, or null. */
export function revisableSmellForStory(
  consortDir: string,
  featureId: string,
  story: string,
): { smell: string; routedTo: "spec-author" | "test-strategist" | "architect-reviewer" | "ux-designer"; gate: "spec" | "test_list" | "architecture" | "ia" } | null {
  let log;
  try {
    log = readSmellsLog(consortDir);
  } catch {
    return null;
  }
  for (const d of log.detected) {
    if (d.resolution) continue;
    // A smell entry scoped to a DIFFERENT story does not apply; an unscoped one
    // (story_id undefined) may (feature-wide reflect defects), matching the
    // driver's smellMatches semantics.
    if (d.story_id !== undefined && d.story_id !== story) continue;
    const spec = specLevelSmell(d.smell);
    if (!spec) continue;
    return { smell: d.smell, routedTo: spec.owning_role, gate: spec.gate_to_rerun };
  }
  return null;
}

export interface ReviseStoryOutcome {
  /** self-heal = a blocking smell drove a full re-author brief + budget spend;
   *  plain = no blocking smell, a bare reset back to designing. */
  mode: "self-heal" | "plain";
  story: string;
  smell?: string;
  routedTo?: string;
}

/**
 * The operator `pipeline revise` transition. When a blocking spec-level smell is
 * open against the story (the reflect gate, ac-overlap, etc.), run the SAME rich
 * self-heal the driver's auto-route uses: reset to designing, stale + re-brief the
 * owning author (composeReviseBrief FORCES the missing coverage for a reflect
 * defect), AND resolve the smell as `revised`. That last step is what Finding 23
 * was missing (the hollow reset left the smell open, so the next drive re-blocked
 * at action 000) and what makes the loop converge (Finding 22): the spent budget
 * turns a re-fire of the same smell into a hard halt instead of an infinite loop.
 * With no blocking smell, falls back to the plain reset (a PO-initiated revise).
 */
export function reviseStoryWithSelfHeal(
  consortDir: string,
  featureId: string,
  story: string,
  opts: { approver: string; reason: string; at?: string },
): ReviseStoryOutcome {
  const routable = revisableSmellForStory(consortDir, featureId, story);
  if (routable) {
    applyReviseSelfHeal({
      featureId,
      story,
      smell: routable.smell,
      routedTo: routable.routedTo,
      gate: routable.gate,
      reason: opts.reason,
      approver: opts.approver,
      consortDir,
    });
    return { mode: "self-heal", story, smell: routable.smell, routedTo: routable.routedTo };
  }
  updatePipeline(consortDir, featureId, (p) =>
    reviseStory(p, story, {
      approver: opts.approver,
      at: opts.at ?? new Date().toISOString(),
      reason: opts.reason,
    }),
  );
  // Finding 27: even the plain reset must clear the stale build cycles, or the
  // (still-present) test-list reads allGreen off them and the build lane skips.
  resetStoryBuildState(consortDir, featureId, story);
  return { mode: "plain", story };
}

export interface RebuildStoryResult {
  /** Cycle artifacts were removed (the story's build was cleared). */
  cyclesCleared: boolean;
  /** How many per-story test-list items were flipped back to `pending`. */
  testItemsReset: number;
  /** Explicit HIL escalation files resolved (deploy-verify / driver-green halts). */
  escalationsCleared: string[];
  /** Blocking smells resolved for the story. */
  smellsCleared: string[];
  /** The prior experiment was marked discarded so the drive re-forks it clean. */
  experimentReset: boolean;
}

/**
 * `pipeline rebuild-story`: the explicit, sanctioned "re-drive this story from a
 * clean slate" operator op (Finding 27), so recovering a story after a caught
 * false-GREEN (or any build-lane defect) never requires hand-deleting kit-internal
 * state (`rm -rf .consort/cycles/...`). It clears EVERY on-disk source that would
 * otherwise make the re-drive skip the build or immediately re-halt:
 *   1. the build cycle records + test-list statuses (resetStoryBuildState), so the
 *      story reads pending again and the lane re-runs RED/GREEN;
 *   2. the story's explicit HIL escalation files AND its blocking smells – the two
 *      escalation sources, either of which alone would pin it back to raise-to-hil;
 *   3. the prior experiment record (-> discarded), so the drive re-cuts a FRESH
 *      experiment branch (with --reset-stale-branch) instead of reusing the
 *      polluted one.
 * It then puts the story back on the single build lane (status building + active).
 * Single-lane invariant: refuses (throws) when the lane is busy with a DIFFERENT
 * story. Throws when the story is not in the pipeline.
 */
export function rebuildStory(
  consortDir: string,
  featureId: string,
  story: string,
  opts?: { approver?: string; at?: string },
): RebuildStoryResult {
  const at = opts?.at ?? new Date().toISOString();
  const pipeline = readPipeline(consortDir, featureId);
  const entry = pipeline.stories[story];
  if (!entry) throw new Error(`rebuild-story: story ${story} is not in the pipeline for ${featureId}`);
  if (pipeline.build_active !== null && pipeline.build_active !== story) {
    throw new Error(
      `rebuild-story: the build lane is busy on ${pipeline.build_active}; ` +
        `complete, revise, or discard it before rebuilding ${story}.`,
    );
  }

  const build = resetStoryBuildState(consortDir, featureId, story);
  const escalationsCleared = resolveEscalationsForStory(consortDir, featureId, story, at);
  const smellsCleared = resolveAllOpenSmellsForStory(
    consortDir,
    story,
    `cleared for rebuild-story by ${opts?.approver ?? "operator"}`,
  );

  // Re-fork the experiment on the next cut: a discarded experiment record makes
  // the drive re-cut (experimentCut reads false) and pass --reset-stale-branch, so
  // the rebuild forks a clean paired branch off feature HEAD rather than reusing
  // the branch that carries the discarded build's schema.
  // Pipeline mutations under the lock, re-reading fresh so a concurrent writer can neither clobber
  // nor be clobbered by this rebuild's whole-file write.
  let experimentReset = false;
  updatePipeline(consortDir, featureId, (p) => {
    const e = p.stories[story];
    if (e?.experiment && e.experiment.status !== "discarded") {
      e.experiment.status = "discarded";
      e.experiment.closed_at = at;
      experimentReset = true;
    }
    // Put the story back on the single build lane from the clean slate.
    setStoryStatus(p, story, "building");
    p.build_active = story;
    const idx = p.build_queue.indexOf(story);
    if (idx !== -1) p.build_queue.splice(idx, 1);
  });

  return {
    cyclesCleared: build.cyclesCleared,
    testItemsReset: build.testItemsReset,
    escalationsCleared,
    smellsCleared,
    experimentReset,
  };
}

/** On `discard`, a story leaves the sprint, so any blocking smell against it must
 *  be resolved too (kind `cleared`, NOT `revised`: discard does not re-author, so
 *  it does not spend the one-revise budget) or the next drive re-blocks on a smell
 *  for a story that is gone. Returns the cleared smell name, or null when none. */
export function clearStoryBlockingSmellOnDiscard(
  consortDir: string,
  featureId: string,
  story: string,
  approver: string,
): string | null {
  const routable = revisableSmellForStory(consortDir, featureId, story);
  if (!routable) return null;
  markSmellResolved(consortDir, routable.smell, {
    story_id: story,
    kind: "cleared",
    note: `discarded by ${approver}`,
  });
  return routable.smell;
}
