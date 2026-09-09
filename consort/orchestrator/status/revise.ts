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
  acsDir,
  handbackFile,
  storyAcIds,
  resolveConsortDir,
} from "../../../consort/config/consort-paths.js";
import { readPipeline, writePipeline, reviseStory, setStoryStatus } from "../../../consort/pipeline/story-pipeline.js";
import {
  markSmellResolved,
  composeReviseBrief,
  readSmellsLog,
  specLevelSmell,
  resolveAllOpenSmellsForStory,
  isReflectSmell,
  resolveOpenReflectSmellsForStory,
  storyTestListFingerprint,
} from "../../../consort/smells/smells.js";
import { clearReflectVerdict } from "../../../consort/smells/reflection.js";
import { resetStoryBuildState } from "../../../consort/pipeline/cycle-record.js";
import { resolveEscalationsForStory } from "../../../consort/gates/escalation.js";

/** Default author identity recorded on a headless self-heal. A real interactive
 *  decision passes the human's identity through `approver`. */
export const REVISE_APPROVER = "human-proxy";

/**
 * Stale the owning author's artifact for a story so the design lane RE-INVOKES
 * that author on a revise (the teeth that make revise non-hollow). Always clears
 * the story's test list (remove its items from the master test-list.json + delete
 * the per-story view) so testListReady reads false and the test-strategist
 * re-runs. A `spec`-gate revise also clears the story's ACs (a re-decomposition)
 * so hasAcs reads false and the spec-author re-drafts.
 */
export function staleStoryArtifactsForRevise(
  consortDir: string,
  featureId: string,
  story: string,
  gate: "spec" | "test_list" | "architecture",
): void {
  // Invalidate the (now stale) reflect verdict: it judged the PRE-fix spec +
  // test-list, so it MUST be recomputed against the corrected artifacts. Applies
  // to every gate (a spec/architecture/test_list revise all change what the
  // reflection critiqued). Without this the stale passed:false verdict persists,
  // the re-dispatched Navigator reuses it instead of re-evaluating, and the
  // reflect gate never converges (it loops the Navigator to the stall guard).
  clearReflectVerdict(consortDir, featureId, story);
  const acIds = new Set(storyAcIds(consortDir, featureId, story));
  const master = featureTestListJson(consortDir, featureId);
  if (existsSync(master)) {
    try {
      const data = JSON.parse(readFileSync(master, "utf8")) as { items?: Array<{ ac_id?: string }> };
      if (Array.isArray(data.items)) {
        data.items = data.items.filter((it) => !it.ac_id || !acIds.has(it.ac_id));
        writeFileSync(master, JSON.stringify(data, null, 2) + "\n");
      }
    } catch {
      // Leave the master as-is on a parse error; deleting the per-story view
      // below still forces a re-run.
    }
  }
  const perStory = storyTestListJson(consortDir, featureId, story);
  if (existsSync(perStory)) rmSync(perStory, { force: true });

  if (gate === "spec") {
    clearStoryAcs(consortDir, featureId, story);
  } else if (gate === "architecture") {
    clearArchitecturalNotes(consortDir, featureId, story);
  }
}

/** Delete a story's AC files (json + md) so `hasAcs` reads false and the design lane
 *  RE-INVOKES the spec-author to re-decompose. Used by a `spec`-gate revise and by the
 *  reflect co-heal when a spec-author reflect defect is open under a non-spec primary. */
export function clearStoryAcs(consortDir: string, featureId: string, story: string): void {
  const dir = acsDir(consortDir, featureId, story);
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir)) {
    if (f.endsWith(".json") || f.endsWith(".md")) rmSync(join(dir, f), { force: true });
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

/**
 * Clear each AC's architectural_notes so architectAnnotated reads false and the
 * design lane re-dispatches the ARCHITECT (who re-annotates + re-evaluates the
 * persistence invariants). The ACs themselves stay (this is not a
 * re-decomposition); only the architect's product is staled. Projection is
 * separately disabled for this story after a revise (architectProjectable checks
 * priorReviseCount), so the architect runs live rather than re-projecting the gap.
 */
export function clearArchitecturalNotes(consortDir: string, featureId: string, story: string): void {
  const dir = acsDir(consortDir, featureId, story);
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
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
  routedTo: "spec-author" | "test-strategist" | "architect-reviewer";
  /** The gate to re-open + re-run (Gate 1 spec / Gate 2 architecture / Gate 3
   *  test_list). */
  gate: "spec" | "test_list" | "architecture";
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
  const pipeline = readPipeline(consortDir, args.featureId);
  reviseStory(pipeline, args.story, { approver, at, reason: args.reason });
  writePipeline(consortDir, pipeline);

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
  staleStoryArtifactsForRevise(consortDir, args.featureId, args.story, args.gate);
  try {
    const hb = handbackFile(consortDir, args.featureId, args.routedTo, args.story);
    mkdirSync(dirname(hb), { recursive: true });
    writeFileSync(hb, composeReviseBrief({ smell: args.smell, gate: args.gate, reason: args.reason }));
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
    clearArchitecturalNotes(consortDir, args.featureId, args.story);
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
    if (specDefectOpen && args.gate !== "spec") clearStoryAcs(consortDir, args.featureId, args.story);
    const coHealRoles = specDefectOpen
      ? (["spec-author", "architect-reviewer", "test-strategist"] as const)
      : (["architect-reviewer", "test-strategist"] as const);
    for (const role of coHealRoles) {
      if (role === args.routedTo) continue;
      try {
        const hb = handbackFile(consortDir, args.featureId, role, args.story);
        mkdirSync(dirname(hb), { recursive: true });
        const gate = role === "architect-reviewer" ? "architecture" : role === "spec-author" ? "spec" : "test_list";
        writeFileSync(hb, composeReviseBrief({ smell: args.smell, gate, reason: args.reason }));
      } catch {
        // Best-effort brief; never block the heal.
      }
    }
  }

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
): { smell: string; routedTo: "spec-author" | "test-strategist" | "architect-reviewer"; gate: "spec" | "test_list" | "architecture" } | null {
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
  const pipeline = readPipeline(consortDir, featureId);
  reviseStory(pipeline, story, {
    approver: opts.approver,
    at: opts.at ?? new Date().toISOString(),
    reason: opts.reason,
  });
  writePipeline(consortDir, pipeline);
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
  let experimentReset = false;
  if (entry.experiment && entry.experiment.status !== "discarded") {
    entry.experiment.status = "discarded";
    entry.experiment.closed_at = at;
    experimentReset = true;
  }

  // Put the story back on the single build lane from the clean slate.
  setStoryStatus(pipeline, story, "building");
  pipeline.build_active = story;
  const idx = pipeline.build_queue.indexOf(story);
  if (idx !== -1) pipeline.build_queue.splice(idx, 1);
  writePipeline(consortDir, pipeline);

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
