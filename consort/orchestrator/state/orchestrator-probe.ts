// The real StoryArtifactProbe (deterministic-driver phase 3b): read the
// per-story design + build facts that live as on-disk artifacts, not in
// pipeline.json, so deriveDriveState can build an accurate DriveState.
//
// Aligned to the substrate's OWN readers/writers so it is self-consistent with
// what the driver's role effects produce:
//   - ACs:        stories/<S>/story.json `acs` (id list, or acs/<AC>.json files)
//   - layers:     stories/<S>/acs/<AC>.json `layer` (via run-cycle's readAcLayer)
//   - test list:  stories/<S>/test-list.json
//   - RED/GREEN:  cycles/<feature>/<S>/<AC>/cycle-NNN.json `red_at`/`green_at`

import * as fs from "node:fs";
import * as path from "node:path";

import { readAcLayer, type CycleArtifact } from "../../pipeline/run-cycle.js";
import {
  storyTestProgress,
  firstReviewPendingAc,
  firstRefactorPendingAc,
  reviewPending,
  refactorPending,
} from "../../pipeline/cycle-record.js";
import { needsGreenAssess, hasPendingRegressionFix, hasPendingSupersession, hasPendingSpecDefect, specDefectFromRole, hasPendingUnfixableRegression, readGreenFailure } from "../../smells/supersession.js";
import { driverPhaseForTdd, type StoryArtifactProbe, type DriveContext } from "./orchestrator-derive.js";
import { storyDesignFingerprint } from "../../pipeline/design-fingerprint.js";
import type { DriveEscalation } from "../workflow/workflow-vocabulary.js";
import { readGates } from "../../gates/gates.js";
import { PHASE_OWNER_KEY } from "../../gates/workflow-phase.js";
import { resolveProjectSettings } from "../../config/consort-config-file.js";
import { storyDeployVerified } from "../../deploy/deploy.js";
import {
  deployVerifyNeedsAssess,
  deployVerifyRefactorPending as deployVerifyRefactorPendingMarker,
} from "../../smells/deploy-verify-assess.js";
import {
  refactorVerifyNeedsAssess as refactorVerifyNeedsAssessMarker,
  refactorVerifyRefactorPending as refactorVerifyRefactorPendingMarker,
} from "../../smells/refactor-verify-assess.js";
import { readWorkflowState, SCM_STATES } from "@databricks-solutions/lakebase-scm-utils/lakebase";
import { firstPendingEscalation } from "../../gates/escalation.js";
import { specLevelSmell, priorReviseCount, isBuildRefactorRoutableSmell, isReflectSmell, priorReflectReviseCount, REFLECT_REVISE_CAP, storyTestListFingerprint, lastReflectReviseFingerprint, lastReflectReviseSmell } from "../../smells/smells.js";
import { reflectionPassed, reflectionVerdictWritten } from "../../smells/reflection.js";
import { testListConforms as testListConformsFor } from "../../smells/testlist-conformance.js";
import { iaConforms as iaConformsFor } from "../../smells/ia-conformance.js";
import { reconcilePassed as reconcilePassedFor } from "../../smells/reconcile.js";
import { readCanon, architectNovelty } from "../../architecture/architecture-canon.js";
import {
  cyclesRootDir,
  workflowStateJson,
  featureSpecJson,
  featureDeployEvidenceJson,
  featureDeployReverifyMarkerJson,
  featureRequestMd,
  hasEstimates,
  storyAcIds,
  storyTestListJson,
  readAcArchitecturalNotes,
  architectureJson,
  dbDesignJson,
  intakeReadyOnDisk,
  intakeApprovedOnDisk,
  iaMd,
  storyIaCoverageJson,
  specReviseScopeJson,
  acsDir,
  storiesDir,
  storyJson,
} from "../../config/consort-paths.js";
import { analystOrderedJson } from "../../test-list/fan-out-plan.js";
import { checkDbDesign } from "../validators/conformance/artifact-conformance.js";

/** True iff the story is a UI story — its story.json carries the PO's human-authoritative
 *  `requires_e2e: true` (set at breakdown). Available BEFORE the architect assigns AC layers, so
 *  it is the correct "this renders a surface" signal at the ia-projection decision point. */
function storyRequiresE2e(consortDir: string, featureId: string, story: string): boolean {
  try {
    return (JSON.parse(fs.readFileSync(storyJson(consortDir, featureId, story), "utf8")) as { requires_e2e?: unknown }).requires_e2e === true;
  } catch {
    return false;
  }
}

/** Every recorded cycle artifact for a story, across all of its ACs. */
function storyCycles(consortDir: string, featureId: string, story: string): CycleArtifact[] {
  const base = path.join(cyclesRootDir(consortDir), featureId, story);
  if (!fs.existsSync(base)) return [];
  const out: CycleArtifact[] = [];
  for (const acDir of fs.readdirSync(base)) {
    const dir = path.join(base, acDir);
    let isDir = false;
    try {
      isDir = fs.statSync(dir).isDirectory();
    } catch {
      isDir = false;
    }
    if (!isDir) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!/^cycle-\d+\.json$/.test(f)) continue;
      try {
        out.push(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as CycleArtifact);
      } catch {
        /* skip a malformed cycle */
      }
    }
  }
  return out;
}

function readJson(file: string): Record<string, unknown> | undefined {
  if (!fs.existsSync(file)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/**
 * Read the coarse driver context (phase + planning/deploy sub-flags +
 * breakdownDone) from the project's persisted state:
 *   - phase            <- workflow-state.json `phase`, mapped via driverPhaseForTdd
 *   - breakdownDone    <- feature-spec.json has a non-empty `stories`
 *   - planning.proposed         <- feature-spec.json exists (Spec Author proposed)
 *   - planning.requestsAuthored <- feature-request.md exists (PO authored)
 *   - deploy.deployed / gateApproved <- gates.json `deploy` gate (present / approved)
 *
 * Best-effort + tolerant: a missing/malformed file yields the conservative
 * (not-yet-done) reading, so the driver re-derives a safe DriveState.
 */
export function readDriveContext(consortDir: string, featureId: string, projectDir?: string): DriveContext {
  const ws = readJson(workflowStateJson(consortDir));
  // The coarse `phase` slot is per-PROJECT, so trust it only when it was written
  // FOR this feature (FEIP-8022): an un-owned or foreign-owned phase would leak a
  // prior feature's phase into this one (F2 inheriting F1's "deploy"). When it is
  // not this feature's, fall back to "feature" and let nextTransition re-derive
  // the true phase from THIS feature's own artifacts (deploy-evidence, gates, SCM
  // state, all computed below). Legacy files (no owner) are treated as un-owned.
  const phaseOwner = typeof ws?.[PHASE_OWNER_KEY] === "string" ? (ws[PHASE_OWNER_KEY] as string) : undefined;
  const rawPhase = typeof ws?.phase === "string" ? (ws.phase as string) : undefined;
  // "planning" is sprint-scoped (written with no feature owner), so it is
  // legitimately global and always honored. Every OTHER phase is a feature's
  // lifecycle phase (discovery/design/implementation/review/deploy/promote/
  // shipped/done); honor it only for the feature it was stamped for, else a prior
  // feature's phase leaks into this one. Unstamped/foreign feature-lifecycle
  // phases fall back to "feature" so nextTransition re-derives from this feature.
  const honorPhase = rawPhase === "planning" || phaseOwner === featureId;
  const tddPhase = honorPhase && rawPhase ? rawPhase : "feature";

  const spec = readJson(featureSpecJson(consortDir, featureId));
  const proposed = spec !== undefined;
  // Intake is the precondition of proposing: the Spec Author proposes FROM product-overview.md +
  // nfrs.md, so both must exist before `/plan` advances. Headless the Human Proxy has deposited the
  // recorded seeds (reads true); a fresh interactive project has neither (false), so the drive first
  // dispatches the PO intake turn. ONE shared derivation with the sprint-planning path (the split
  // that let `--sprint` skip intake). (design-brief.md is a UI/design-lane input, not a plan precond.)
  const intakeReady = intakeReadyOnDisk(consortDir);
  const breakdownDone = Array.isArray(spec?.stories) && (spec!.stories as unknown[]).length > 0;
  const requestsAuthored = fs.existsSync(featureRequestMd(consortDir, featureId));
  // In a single-feature drive the backlog IS this one committed feature; its
  // feature-request.md on disk proves it was selected (backlog gate) + authored.
  const backlogCommitted = requestsAuthored;

  // Deploy is "done" once the Release Engineer produced deploy-evidence.json
  // (the deploy actually ran). The deploy gate's approval is read strictly via
  // readGates (the authoritative gate model), tolerant of a missing/legacy file.
  const deployed = fs.existsSync(featureDeployEvidenceJson(consortDir, featureId));
  const gateApproved = readGateApproved(featureId, consortDir, "deploy");
  // The evidence VERDICT (issue #198): `deployed` above only proves the deploy RAN.
  // A failed verify leaves approvable-looking state that no approve can clear, so
  // the derivation needs the verdict itself to route a re-verify (bounded once)
  // instead of the stall. Tolerant: absent/malformed evidence reads undefined.
  const verifyPassed = readDeployVerifyPassed(consortDir, featureId);
  const reverifyAttempted = fs.existsSync(featureDeployReverifyMarkerJson(consortDir, featureId));
  // Feature-ship deploy-verify self-heal: a feature-scope contamination marker
  // (no story) makes the deploy phase route the ASSESS/SCOPE turns before the
  // gate, mirroring the per-story self-heal. Read at feature scope (storyId omitted).
  const verifyAssessEligible = deployVerifyNeedsAssess(consortDir, featureId);
  const verifyRefactorPending = deployVerifyRefactorPendingMarker(consortDir, featureId);

  // Promote: the SCM workflow-state (.lakebase/workflow-state.json, project root)
  // is the source of truth for prepare-pr / wait-ci / merge (the SCM ladder
  // feature-claimed -> pr-ready -> ci-green -> merged). The `promote` HITL gate
  // (the PR acceptance, BEFORE the merge) lives in the TDD gate model. projectDir
  // defaults to the parent of .tdd.
  const proj = projectDir ?? path.dirname(consortDir);
  let scmState: string | undefined;
  try {
    scmState = readWorkflowState(proj)?.state;
  } catch {
    scmState = undefined;
  }
  const atOrPast = (target: string): boolean => {
    if (!scmState) return false;
    const i = (SCM_STATES as readonly string[]).indexOf(scmState);
    const t = (SCM_STATES as readonly string[]).indexOf(target);
    return i >= 0 && t >= 0 && i >= t;
  };
  const promote = {
    prReady: atOrPast("pr-ready"),
    ciGreen: atOrPast("ci-green"),
    prApproved: readGateApproved(featureId, consortDir, "promote"),
    merged: scmState === "merged",
  };

  // Build-loop granularity (story | ac | hybrid-a) from the SAME single source
  // the effects layer reads (resolveConsortSettings -> resolveProjectSettings ->
  // .lakebase/consort-config.json). Without this, ctx.loop was undefined, so
  // deriveDriveState always ran the "story" review/refactor branch while the
  // effects/roleTaskBody layer read the file's real "hybrid-a" -> the review
  // action was derived story-scoped (no `ac`, verdict looked for at the story
  // root) but RENDERED per-AC (prompt "AC undefined", verdict written to
  // .../undefined/review-verdict.json). The story-root verdict never appeared,
  // so the identical review action re-derived every tick and the drive's
  // "repeated without advancing state" guard hard-halted the capture. Reading
  // loop from the one config file here makes derive and effects agree.
  const loop = resolveProjectSettings(proj).build.loopGranularity;
  // Thread the #3 batch lever from the SAME config read. effectiveLoopForStory
  // reads it to decide whether a CONTRACT story stays on the fine `ac` loop or
  // (lever on) runs the normal batched loop. Without it here, deriveDriveState
  // ran effectiveLoopForStory WITHOUT the flag -> "ac" for a contract story,
  // while the effects layer (buildTaskBody / buildCycleCommand) passed the flag
  // -> "story". Derive routed the story-close review per-AC (reviewAc) while the
  // post-turn cycle CLI recorded it story-level (reviewStory) — so build.reviewAc
  // never advanced and the review protocol hard-halted (the SAME derive-vs-effects
  // disagreement the loop thread above fixed, reopened under the batch lever).
  const batchContractStories = resolveProjectSettings(proj).build.batchContractStories ?? false;

  return {
    phase: driverPhaseForTdd(tddPhase),
    breakdownDone,
    loop,
    batchContractStories,
    planning: { intakeReady, intakeApproved: intakeApprovedOnDisk(consortDir), proposed, estimated: hasEstimates(consortDir), backlogCommitted, requestsAuthored },
    deploy: { deployed, gateApproved, verifyAssessEligible, verifyRefactorPending, verifyPassed, reverifyAttempted },
    promote,
  };
}

/** The feature deploy-evidence's verify verdict: true/false from
 *  deploy-evidence.json's verify.passed, undefined when the file is absent or
 *  malformed (tolerant: a missing verdict never masquerades as a pass). */
function readDeployVerifyPassed(consortDir: string, featureId: string): boolean | undefined {
  try {
    const ev = JSON.parse(fs.readFileSync(featureDeployEvidenceJson(consortDir, featureId), "utf8")) as {
      verify?: { passed?: boolean };
    };
    return typeof ev.verify?.passed === "boolean" ? ev.verify.passed : undefined;
  } catch {
    return undefined;
  }
}

/** Read one gate's approved-ness from the authoritative gate model, tolerant of
 *  a missing/legacy gates.json (conservative false). */
function readGateApproved(featureId: string, consortDir: string, gate: "deploy" | "promote"): boolean {
  try {
    return readGates(featureId, { consortDir }).gates[gate].status === "approved";
  } catch {
    return false;
  }
}

/** Construct a probe bound to a project's .tdd dir + feature. `buildActive` (the
 *  pipeline's currently-building story) is the fallback story scope for a
 *  smell-derived escalation that did not carry one, so revise-routing knows which
 *  story to send back. */
export function diskArtifactProbe(
  consortDir: string,
  featureId: string,
  buildActive?: string | null,
): StoryArtifactProbe {
  // The Architect is "done" with a story only once its DISTINCTIVE outputs are on disk, NOT merely
  // the AC `layer` (a REQUIRED ac.schema field the SPEC-AUTHOR fills). Key on the architect's own
  // products: architectural_notes on every AC + the feature architecture.json. Shared by
  // architectAnnotated AND iaRefined's coverage-by-presence back-compat.
  const isArchitectAnnotated = (story: string): boolean => {
    const acs = storyAcIds(consortDir, featureId, story);
    if (acs.length === 0) return false; // no ACs yet -> nothing to annotate
    const everyAcNoted = acs.every((ac) => readAcArchitecturalNotes(consortDir, featureId, ac) !== undefined);
    return everyAcNoted && fs.existsSync(architectureJson(consortDir, featureId));
  };
  return {
    hasAcs(story) {
      return storyAcIds(consortDir, featureId, story).length > 0;
    },

    specRevisePending(story) {
      // A SCOPED spec revise cleared ONLY the flagged AC file(s) and recorded them in the marker; the
      // other ACs stay on disk so hasAcs cannot see the gap. Re-invoke the spec-author while any marked
      // ac_id's file is still absent; self-clears once they are re-authored (then the architect re-tags).
      const marker = specReviseScopeJson(consortDir, featureId, story);
      if (!fs.existsSync(marker)) return false;
      let ids: string[] = [];
      try {
        ids = (JSON.parse(fs.readFileSync(marker, "utf8")) as { ac_ids?: string[] }).ac_ids ?? [];
      } catch {
        return false; // an unreadable marker is not a pending signal
      }
      const dir = acsDir(consortDir, featureId, story);
      return ids.some((ac) => !fs.existsSync(path.join(dir, `${ac}.json`)));
    },

    iaRefined(story) {
      // The IA analogue of architectAnnotated: this story's surfaces are reconciled
      // into ia.md, marked by its per-story coverage file (written by a live ux `ia`
      // turn or by project-ia-notes). Keyed on the marker + ia.md existing (the
      // establish seeds ia.md; no skeleton yet -> not refined, so the lazy-establish
      // fallback runs first).
      if (!fs.existsSync(iaMd(consortDir))) return false;
      if (fs.existsSync(storyIaCoverageJson(consortDir, featureId, story))) return true;
      // Coverage-by-presence (back-compat): a story the architect has ALREADY annotated was
      // designed before the per-story IA refinement existed (an older kit, or a mid-flight story
      // at upgrade) — the IA already covers it, so it does not need (and must not re-run) ux-ia.
      // In the NEW order the architect runs AFTER ux-ia, so a new-kit story only reaches
      // architectAnnotated via a stamped marker anyway; this only changes migrated/in-flight stories.
      return isArchitectAnnotated(story);
    },

    iaProjectable(story) {
      // Mirror architectProjectable: a feature's FIRST UI story runs a LIVE ux `ia`
      // turn to reconcile the feature's surfaces into ia.md; once ANY sibling story
      // of this feature is covered, the rest PROJECT (no turn) — their surfaces are
      // already named. Not projectable until the IA skeleton exists (establish
      // first) or if this story is already covered.
      if (!fs.existsSync(iaMd(consortDir))) return false;
      if (fs.existsSync(storyIaCoverageJson(consortDir, featureId, story))) return false;
      // A story already sent back on a reflect-ia-defect revise must NOT be
      // re-projected: the no-turn projection re-stamps the coverage marker without
      // adding the surface ia.md lacks, so the next reflect re-flags the same gap
      // and the loop burns revise laps to HIL healing nothing. Force the ux-designer
      // ia turn to run LIVE so it actually names the missing surface (mirrors
      // architectProjectable's architect-canon-gap guard).
      if (priorReviseCount(consortDir, "reflect-ia-defect", story) > 0) return false;
      // A UI story must run the ux `ia` turn LIVE, not project: sibling-coverage is screen-level, but
      // each UI story typically ADDS seams (a column, a region, an empty state) the sibling's ia.md does
      // not yet name. Projecting re-stamps coverage WITHOUT those seams, so the architect's declared
      // ui_seams then miss and the deterministic IA gate bounces a revise lap (the live S2/S3 churn: both
      // projected + both lapped; S1 ran live + was clean). The "UI story" signal MUST be one that exists
      // at THIS point — before the architect. The AC `layer` is assigned by the ARCHITECT (a later step),
      // so it is not yet readable here (checking it was a no-op that left the laps in). `requires_e2e` is
      // the PO's human-authoritative flag set at breakdown on story.json, available now. A story without
      // it (a non-UI/backend story) has no surface to add and may still project.
      if (storyRequiresE2e(consortDir, featureId, story)) return false;
      const stories = storiesDir(consortDir, featureId);
      if (!fs.existsSync(stories)) return false;
      let siblingCovered = false;
      try {
        for (const sib of fs.readdirSync(stories)) {
          if (sib === story) continue;
          if (fs.existsSync(storyIaCoverageJson(consortDir, featureId, sib))) {
            siblingCovered = true;
            break;
          }
        }
      } catch {
        /* unreadable stories dir -> not projectable (run the live turn) */
      }
      return siblingCovered;
    },

    architectAnnotated(story) {
      return isArchitectAnnotated(story);
    },

    dbaDesigned() {
      // The DBA is "done" once the physical schema realizes the architect's
      // contract: keyed on the SAME check the spec gate uses (checkDbDesign). A
      // not-service_backed feature has nothing to realize, so checkDbDesign is ok
      // without a DBA turn and this returns true (the lane skips straight to the
      // test strategist). Only consulted after architectAnnotated, so
      // architecture.json exists here; false until it does (the architect owns the
      // contract the DBA realizes).
      const archFile = architectureJson(consortDir, featureId);
      if (!fs.existsSync(archFile)) return false;
      let archContent: string;
      try {
        archContent = fs.readFileSync(archFile, "utf8");
      } catch {
        return false;
      }
      const dbFile = dbDesignJson(consortDir, featureId);
      let dbContent: string | undefined;
      if (fs.existsSync(dbFile)) {
        try {
          dbContent = fs.readFileSync(dbFile, "utf8");
        } catch {
          dbContent = undefined;
        }
      }
      return checkDbDesign(dbContent, archContent).ok;
    },

    architectProjectable(story) {
      // Project this story's per-AC notes from the canon (no architect turn) when:
      // the feature architecture.json already exists (an earlier story's architect
      // authored it, with its feature-specific layers/invariants), the project
      // canon is established, and the story is NOT novel (every AC maps onto a
      // known canon layer). Otherwise the architect is dispatched – to author
      // architecture.json on the feature's first story, or clean a novel story +
      // amend the canon. An AC missing its layer is not projectable (nothing to
      // anchor a note on), so it also dispatches.
      if (!fs.existsSync(architectureJson(consortDir, featureId))) return false;
      const canon = readCanon(consortDir);
      if (!canon) return false;
      // The feature that ESTABLISHED the canon runs the architect for its own
      // stories, it does not project against the canon it is itself building
      // (that self-conform routed F1's own later stories through the architect
      // gap-route). Projection is a LATER-feature optimization; only features
      // other than established_by project.
      if (canon.established_by === featureId) return false;
      // A story already sent back on an architect-canon-gap revise must NOT be
      // re-projected (that would re-emit the same blind note and heal nothing):
      // force the ARCHITECT to run live (re-annotate + amend the canon).
      if (priorReviseCount(consortDir, "architect-canon-gap", story) > 0) return false;
      const acs = storyAcIds(consortDir, featureId, story);
      if (acs.length === 0) return false;
      const layers = acs.map((ac) => readAcLayer(consortDir, featureId, ac));
      if (layers.some((l) => !l)) return false;
      return !architectNovelty(canon, layers.map((l) => ({ layer: l! }))).novel;
    },

    testListReady(story) {
      // Read the SAME canonical per-story file the Test Strategist's writer
      // produces (storyTestListJson), and check its real field: a StoryTestList
      // is { feature_id, story_id, ordered_for?, items[] }. Ready == at least
      // one scoped test item. Path + field both come from the single source of
      // truth so producer + probe cannot drift (the old code read a different
      // file name AND a non-existent `tests` field, so it never saw the list).
      // B4 (deterministic fan-out): the step is NOT ready unless the fan-out bin produced its ordered
      // list (analyst-ordered.json). This fail-closes the solo-author path — the test-strategist cannot
      // advance past the test_list step by hand-writing the master; it must run consort-fan-out-analysts
      // (which the revise co-heal clears, so a revise re-runs it). Checked BEFORE the item check so a
      // skipped-bin hand-written master still reads not-ready and re-routes the test-strategist.
      if (!fs.existsSync(analystOrderedJson(consortDir, featureId, story))) return false;
      const file = storyTestListJson(consortDir, featureId, story);
      if (!fs.existsSync(file)) return false;
      try {
        const data = JSON.parse(fs.readFileSync(file, "utf8")) as { items?: unknown };
        return Array.isArray(data.items) && data.items.length > 0;
      } catch {
        return false;
      }
    },

    testListConforms(story) {
      // The DETERMINISTIC pre-reflect gate: run the structural conformance checks
      // (client-kind↔layer, e2e coverage, jsdom-vacuous assertion) over the story's
      // test-list. Vacuously true when no test-list yet (never pre-empts before
      // testListReady). A false here routes flag-testlist-nonconformance BEFORE the
      // LLM reflect, so a structural defect never costs an LLM lap.
      return testListConformsFor(consortDir, featureId, story);
    },

    iaConforms(story) {
      // The DETERMINISTIC pre-reflect AC↔IA gate (#3): every E2E AC's declared ui_seams
      // must be named in ia.md. Vacuously true when there is no ia.md, or no AC declares
      // ui_seams (fail-open — never a false positive). A false here routes
      // flag-ia-nonconformance to the ia refinement BEFORE the LLM reflect lap.
      return iaConformsFor(consortDir, featureId, story);
    },

    reconcilePassed() {
      // Feature-level: the symmetric cross-story reconciliation turn has produced a verdict with NO
      // blocking cross-story defect. False until it runs (so the design lane runs it once every story
      // is gated); a blocking verdict stays false + its reconcile-gate smell routes the owning story's
      // revise, so the lane only advances to design-complete once the whole set is mutually consistent.
      return reconcilePassedFor(consortDir, featureId);
    },

    designFingerprint(story) {
      return storyDesignFingerprint(consortDir, featureId, story);
    },

    reflectionPassed(story) {
      // The pre-build reflection critic's per-story verdict (passed:true). A
      // missing/failed verdict is false: the design lane runs (or re-runs) the
      // critic, and a failed verdict drives the smell -> revise-route -> HITL.
      return reflectionPassed(consortDir, featureId, story);
    },

    reflectionVerdictWritten(story) {
      // Whether the reflect turn produced a readable verdict at all (pass OR
      // fail). The expectation guard uses this so a reflect turn that writes
      // nothing escalates rather than looping.
      return reflectionVerdictWritten(consortDir, featureId, story);
    },

    // The build loop is TEST-LIST-DRIVEN: the Navigator/Driver hand off ONE test
    // at a time (write RED -> make GREEN) until EVERY test-list item is green.
    // `testsWritten` = "the Navigator has nothing to write right now" (a RED
    // already awaits the Driver, OR all tests are green); `codeWritten` = "every
    // test-list item has a GREEN cycle". With nextBuildAction's order
    // (!testsWritten -> navigator; !codeWritten -> driver) this yields the
    // interleaved per-test handoff: RED T1 -> GREEN T1 -> RED T2 -> ... Without
    // it the loop advanced after a single test and stalled at await-acceptance
    // with the rest of the list unbuilt (the live stall).
    testsWritten(story) {
      const p = storyTestProgress(consortDir, featureId, story);
      if (p.total === 0) {
        // Legacy / pre-test-list fallback: any RED counts as "tests written".
        return storyCycles(consortDir, featureId, story).some((c) => Boolean(c.red_at));
      }
      return p.openRed.length > 0 || p.allGreen;
    },

    codeWritten(story) {
      const p = storyTestProgress(consortDir, featureId, story);
      if (p.total === 0) {
        const reds = storyCycles(consortDir, featureId, story).filter((c) => Boolean(c.red_at));
        return reds.length > 0 && reds.every((c) => Boolean(c.green_at));
      }
      return p.allGreen;
    },

    reviewPendingAc(story) {
      return firstReviewPendingAc(consortDir, featureId, story);
    },

    refactorPendingAc(story) {
      return firstRefactorPendingAc(consortDir, featureId, story);
    },

    reviewPending(story) {
      return reviewPending(consortDir, featureId, story);
    },

    refactorPending(story) {
      return refactorPending(consortDir, featureId, story);
    },

    assessGreenFailureAc(story) {
      // The open RED cycle's AC, when its GREEN verify failed + has NOT yet been
      // assessed by the Navigator (a green-failure marker with assessed:false).
      let acId: string | undefined;
      try {
        acId = storyTestProgress(consortDir, featureId, story).openRed[0]?.ac_id;
      } catch {
        acId = undefined;
      }
      if (!acId) return null;
      return needsGreenAssess(consortDir, featureId, story, acId) ? acId : null;
    },

    repairRegressionFixAc(story) {
      // The open RED cycle's AC, when the Navigator assessed its green-failure as
      // a DRIVER-FIXABLE regression (recorded a fix directive) and the one repair
      // attempt has not been consumed. Routes a bounded Driver repair turn.
      let acId: string | undefined;
      try {
        acId = storyTestProgress(consortDir, featureId, story).openRed[0]?.ac_id;
      } catch {
        acId = undefined;
      }
      if (!acId) return null;
      return hasPendingRegressionFix(consortDir, featureId, story, acId) ? acId : null;
    },

    greenSupersededFailureAc(story) {
      // The open RED cycle's AC, when the Navigator assessed its green-failure as a
      // SUPERSESSION (wrote superseded-tests.json) and the permissive re-green has
      // not yet been consumed (marker not refactored). Routes the LABELED Driver
      // green-superseded turn so the recorder writes a distinct, replay-filtered dir.
      let acId: string | undefined;
      try {
        acId = storyTestProgress(consortDir, featureId, story).openRed[0]?.ac_id;
      } catch {
        acId = undefined;
      }
      if (!acId) return null;
      return hasPendingSupersession(consortDir, featureId, story, acId) ? acId : null;
    },

    specDefectAc(story) {
      // The open RED cycle's AC, when the Navigator assessed its green-failure as a SPEC-DEFECT
      // (the test/NFR itself is wrong — unrealistic/unsatisfiable/flaky, not a code regression).
      // Routes a raise-to-hil recommending the design-lane re-author, NOT a Driver repair.
      let acId: string | undefined;
      try {
        acId = storyTestProgress(consortDir, featureId, story).openRed[0]?.ac_id;
      } catch {
        acId = undefined;
      }
      if (!acId) return null;
      return hasPendingSpecDefect(consortDir, featureId, story, acId) ? acId : null;
    },

    specDefectFromRole(story) {
      let acId: string | undefined;
      try {
        acId = storyTestProgress(consortDir, featureId, story).openRed[0]?.ac_id;
      } catch {
        acId = undefined;
      }
      return acId ? specDefectFromRole(consortDir, featureId, story, acId) : "test-strategist";
    },

    greenUnfixableAc(story) {
      // The open RED cycle's AC, when the Navigator assessed its green-failure as a
      // genuine regression with NO fix directive (confirmed NOT driver-fixable,
      // issue #200). Routes DIRECTLY to raise-to-hil with the diagnosis – never
      // back to doomed Driver green attempts for the full fixAttempts budget.
      let acId: string | undefined;
      try {
        acId = storyTestProgress(consortDir, featureId, story).openRed[0]?.ac_id;
      } catch {
        acId = undefined;
      }
      if (!acId) return null;
      return hasPendingUnfixableRegression(consortDir, featureId, story, acId) ? acId : null;
    },

    greenUnfixableDiagnosis(story) {
      // The assessed diagnosis for greenUnfixableAc, carried into the HIL reason.
      let acId: string | undefined;
      try {
        acId = storyTestProgress(consortDir, featureId, story).openRed[0]?.ac_id;
      } catch {
        acId = undefined;
      }
      if (!acId) return undefined;
      return readGreenFailure(consortDir, featureId, story, acId)?.diagnosis;
    },

    storyDeployVerified(story) {
      return storyDeployVerified(consortDir, featureId, story);
    },

    deployVerifyAssessEligible(story) {
      // A contamination-classified deploy-verify failure (marker written by the
      // deploy step) not yet assessed + under the one-shot cap: routes the
      // story-level Navigator ASSESS-DEPLOY turn.
      return deployVerifyNeedsAssess(consortDir, featureId, story);
    },

    deployVerifyRefactorPending(story) {
      // The Navigator assessed + recorded a scope set the Driver has not yet
      // refactored: routes the Driver SCOPE-DEPLOY turn.
      return deployVerifyRefactorPendingMarker(consortDir, featureId, story);
    },

    refactorVerifyAssessEligible(story) {
      // A refactor-verify failure (marker written by refactorStory) not yet
      // assessed + under the one-shot cap: routes the story-level Navigator
      // supersession ASSESS turn instead of the terminal HIL.
      return refactorVerifyNeedsAssessMarker(consortDir, featureId, story);
    },

    refactorVerifyRefactorPending(story) {
      // The Navigator flagged superseded prior tests the Driver has not yet
      // permissively refactored: routes the Driver permissive-refactor turn.
      return refactorVerifyRefactorPendingMarker(consortDir, featureId, story);
    },

    pendingEscalation(): DriveEscalation | null {
      const e = firstPendingEscalation(consortDir, featureId);
      if (!e) return null;
      const base: DriveEscalation = {
        id: e.id,
        source: e.source,
        reason: e.reason,
        ...(e.story_id ? { story_id: e.story_id } : {}),
      };
      // revise-routing: a smell-derived escalation (`smell:<name>`) for
      // a SPEC-level smell is recoverable IF a story scope is known (the smell's
      // own, else the active build story) AND the one-revise-per-(smell,story)
      // budget is not yet spent. Explicit escalation files + build-level smells
      // are never routable -> they keep the terminal raise-to-hil halt.
      if (e.source.startsWith("smell:")) {
        const name = e.source.slice("smell:".length);
        const story = e.story_id ?? buildActive ?? undefined;
        // Build-level self-heal: a refactor-fixable build smell (layering-violation,
        // ux-adherence, import-time-build-coupling) whose owning story/AC ALREADY has
        // a refactor pending is NOT a terminal halt – the Driver's refactor turn is
        // the remediation the Navigator's REVIEW just prescribed. Suppress the
        // escalation so the build dispatches that refactor instead of raising to
        // HIL. refactorStory/refactorAc preserves behavior + resolves the smell; if
        // the refactor never lands, the smell re-surfaces with no refactor pending
        // and halts.
        //
        // The refactor-pending signal is GRANULARITY-SPECIFIC and MUST mirror the
        // router (orchestrator-drive nextBuildAction), which branches on loop:
        //   - "story": refactorStoryPending = refactorPending() [story review.json]
        //   - "ac" AND "hybrid-a": refactorAc = firstRefactorPendingAc() [AC review.json]
        // Checking ONLY the AC path let a routable smell (ux-adherence on S3) escape
        // to HIL in a story-loop run, because the per-AC review.json is empty there
        // while the story review requested the refactor. Suppress when EITHER is
        // pending: the two are mutually exclusive per loop mode (a story loop never
        // writes per-AC review.json; ac/hybrid never write story review.json), so the
        // OR reconstructs the router's branch exactly for all three granularities
        // without over-suppressing.
        if (
          isBuildRefactorRoutableSmell(name) &&
          story &&
          (refactorPending(consortDir, featureId, story) ||
            firstRefactorPendingAc(consortDir, featureId, story))
        ) {
          return null;
        }
        const spec = specLevelSmell(name);
        if (spec && story) {
          // Reflect defects use a PROGRESS-BASED per-STORY budget. The reflect critic
          // now emits ALL of a story's findings in ONE exhaustive verdict (see
          // navigator.md REFLECT + the reflect context packet), so the typical shape
          // is a single co-heal revise that converges in 1-2 laps — NOT the old
          // one-finding-per-lap enumeration that inflated the revise count and pushed
          // legitimately-converging designs into HIL at the cap. REFLECT_REVISE_CAP
          // is therefore safe HEADROOM (rarely reached now) for the two cases that
          // legitimately need another lap: a genuinely-NEW defect the batch fix
          // reveals, or residual piecemeal from a critic that under-batches. The
          // PRIMARY convergence guard is the fingerprint progress check, NOT the cap:
          // a re-design is allowed only while (a) under REFLECT_REVISE_CAP and (b) the
          // PRIOR revise actually CHANGED the test-list — real progress. A revise that
          // produced NO change (the strategist is stuck, re-emitting the same list)
          // hard-halts instead of looping. Other spec smells keep their simple
          // per-(smell,story) budget.
          let budgetSpent: boolean;
          if (isReflectSmell(name)) {
            const revises = priorReflectReviseCount(consortDir, story);
            if (revises >= REFLECT_REVISE_CAP) {
              budgetSpent = true;
            } else if (revises === 0) {
              budgetSpent = false; // first revise always allowed
            } else if (lastReflectReviseSmell(consortDir, story) === "reflect-architecture-defect") {
              // The prior revise was an ARCHITECTURE revise, which PRESERVES the test-list by design
              // (status/revise.ts clears it only for gate !== "architecture"). So an UNCHANGED test-list
              // fingerprint here is EXPECTED, not a stuck test-strategist — the fingerprint progress check
              // would false-stall and send a legitimately-new testlist defect (e.g. an endpoint the
              // architecture revise just moved) straight to HIL. Grant the revise: the test-strategist
              // has not yet had a lap against the revised architecture.
              budgetSpent = false;
            } else {
              // Progress check: the current test-list must differ from what the
              // last revise sent back. Unchanged => no progress => stop.
              const lastSha = lastReflectReviseFingerprint(consortDir, story);
              const curSha = storyTestListFingerprint(consortDir, featureId, story);
              budgetSpent = lastSha !== null && lastSha === curSha;
            }
          } else {
            budgetSpent = priorReviseCount(consortDir, name, story) >= 1;
          }
          if (!budgetSpent) {
            base.routable = { story, owning_role: spec.owning_role, gate: spec.gate_to_rerun };
          }
        }
      }
      return base;
    },
  };
}
