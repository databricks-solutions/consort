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

import { readAcLayer, type CycleArtifact } from "./run-cycle.js";
import {
  storyTestProgress,
  firstReviewPendingAc,
  firstRefactorPendingAc,
  reviewPending,
  refactorPending,
} from "./cycle-record.js";
import { needsGreenAssess, hasPendingRegressionFix } from "./supersession.js";
import { driverPhaseForTdd, type StoryArtifactProbe, type DriveContext } from "./orchestrator-derive.js";
import type { DriveEscalation } from "./orchestrator-drive.js";
import { readGates } from "./gates.js";
import { PHASE_OWNER_KEY } from "./workflow-phase.js";
import { storyDeployVerified } from "./deploy.js";
import {
  deployVerifyNeedsAssess,
  deployVerifyRefactorPending as deployVerifyRefactorPendingMarker,
} from "./deploy-verify-assess.js";
import { readWorkflowState, SCM_STATES } from "@databricks-solutions/lakebase-scm-utils/lakebase";
import { firstPendingEscalation } from "./escalation.js";
import { specLevelSmell, priorReviseCount, isBuildRefactorRoutableSmell } from "./smells.js";
import { reflectionPassed, reflectionVerdictWritten } from "./reflection.js";
import { readCanon, architectNovelty } from "./architecture-canon.js";
import {
  cyclesRootDir,
  workflowStateJson,
  featureSpecJson,
  featureDeployEvidenceJson,
  featureRequestMd,
  hasEstimates,
  storyAcIds,
  storyTestListJson,
  readAcArchitecturalNotes,
  architectureJson,
} from "./sftdd-paths.js";

/** Every recorded cycle artifact for a story, across all of its ACs. */
function storyCycles(sftddDir: string, featureId: string, story: string): CycleArtifact[] {
  const base = path.join(cyclesRootDir(sftddDir), featureId, story);
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
export function readDriveContext(sftddDir: string, featureId: string, projectDir?: string): DriveContext {
  const ws = readJson(workflowStateJson(sftddDir));
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

  const spec = readJson(featureSpecJson(sftddDir, featureId));
  const proposed = spec !== undefined;
  const breakdownDone = Array.isArray(spec?.stories) && (spec!.stories as unknown[]).length > 0;
  const requestsAuthored = fs.existsSync(featureRequestMd(sftddDir, featureId));

  // Deploy is "done" once the Release Engineer produced deploy-evidence.json
  // (the deploy actually ran). The deploy gate's approval is read strictly via
  // readGates (the authoritative gate model), tolerant of a missing/legacy file.
  const deployed = fs.existsSync(featureDeployEvidenceJson(sftddDir, featureId));
  const gateApproved = readGateApproved(featureId, sftddDir, "deploy");

  // Promote: the SCM workflow-state (.lakebase/workflow-state.json, project root)
  // is the source of truth for prepare-pr / wait-ci / merge (the SCM ladder
  // feature-claimed -> pr-ready -> ci-green -> merged). The `promote` HITL gate
  // (the PR acceptance, BEFORE the merge) lives in the TDD gate model. projectDir
  // defaults to the parent of .tdd.
  const proj = projectDir ?? path.dirname(sftddDir);
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
    prApproved: readGateApproved(featureId, sftddDir, "promote"),
    merged: scmState === "merged",
  };

  return {
    phase: driverPhaseForTdd(tddPhase),
    breakdownDone,
    planning: { proposed, estimated: hasEstimates(sftddDir), requestsAuthored },
    deploy: { deployed, gateApproved },
    promote,
  };
}

/** Read one gate's approved-ness from the authoritative gate model, tolerant of
 *  a missing/legacy gates.json (conservative false). */
function readGateApproved(featureId: string, sftddDir: string, gate: "deploy" | "promote"): boolean {
  try {
    return readGates(featureId, { sftddDir }).gates[gate].status === "approved";
  } catch {
    return false;
  }
}

/** Construct a probe bound to a project's .tdd dir + feature. `buildActive` (the
 *  pipeline's currently-building story) is the fallback story scope for a
 *  smell-derived escalation that did not carry one, so revise-routing knows which
 *  story to send back. */
export function diskArtifactProbe(
  sftddDir: string,
  featureId: string,
  buildActive?: string | null,
): StoryArtifactProbe {
  return {
    hasAcs(story) {
      return storyAcIds(sftddDir, featureId, story).length > 0;
    },

    architectAnnotated(story) {
      const acs = storyAcIds(sftddDir, featureId, story);
      if (acs.length === 0) return false; // no ACs yet -> nothing to annotate
      // The Architect is "done" with a story only once its DISTINCTIVE outputs
      // are on disk, NOT merely the AC `layer`. `layer` is a REQUIRED ac.schema
      // field the SPEC-AUTHOR fills, so keying on it made architectAnnotated true
      // the moment the spec-author wrote the ACs -> the architect-reviewer was
      // ALWAYS skipped (no architecture.json, no architectural_notes, and the
      // layering/NFR/service_backed gate checks had nothing to validate). Key on
      // the architect's own products: architectural_notes on every AC + the
      // feature architecture.json (service_backed + layers + nfrs).
      const everyAcNoted = acs.every((ac) => readAcArchitecturalNotes(sftddDir, featureId, ac) !== undefined);
      return everyAcNoted && fs.existsSync(architectureJson(sftddDir, featureId));
    },

    architectProjectable(story) {
      // Project this story's per-AC notes from the canon (no architect turn) when:
      // the feature architecture.json already exists (an earlier story's architect
      // authored it, with its feature-specific layers/invariants), the project
      // canon is established, and the story is NOT novel (every AC maps onto a
      // known canon layer). Otherwise the architect is dispatched , to author
      // architecture.json on the feature's first story, or clean a novel story +
      // amend the canon. An AC missing its layer is not projectable (nothing to
      // anchor a note on), so it also dispatches.
      if (!fs.existsSync(architectureJson(sftddDir, featureId))) return false;
      const canon = readCanon(sftddDir);
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
      if (priorReviseCount(sftddDir, "architect-canon-gap", story) > 0) return false;
      const acs = storyAcIds(sftddDir, featureId, story);
      if (acs.length === 0) return false;
      const layers = acs.map((ac) => readAcLayer(sftddDir, featureId, ac));
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
      const file = storyTestListJson(sftddDir, featureId, story);
      if (!fs.existsSync(file)) return false;
      try {
        const data = JSON.parse(fs.readFileSync(file, "utf8")) as { items?: unknown };
        return Array.isArray(data.items) && data.items.length > 0;
      } catch {
        return false;
      }
    },

    reflectionPassed(story) {
      // The pre-build reflection critic's per-story verdict (passed:true). A
      // missing/failed verdict is false: the design lane runs (or re-runs) the
      // critic, and a failed verdict drives the smell -> revise-route -> HITL.
      return reflectionPassed(sftddDir, featureId, story);
    },

    reflectionVerdictWritten(story) {
      // Whether the reflect turn produced a readable verdict at all (pass OR
      // fail). The expectation guard uses this so a reflect turn that writes
      // nothing escalates rather than looping.
      return reflectionVerdictWritten(sftddDir, featureId, story);
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
      const p = storyTestProgress(sftddDir, featureId, story);
      if (p.total === 0) {
        // Legacy / pre-test-list fallback: any RED counts as "tests written".
        return storyCycles(sftddDir, featureId, story).some((c) => Boolean(c.red_at));
      }
      return p.openRed.length > 0 || p.allGreen;
    },

    codeWritten(story) {
      const p = storyTestProgress(sftddDir, featureId, story);
      if (p.total === 0) {
        const reds = storyCycles(sftddDir, featureId, story).filter((c) => Boolean(c.red_at));
        return reds.length > 0 && reds.every((c) => Boolean(c.green_at));
      }
      return p.allGreen;
    },

    reviewPendingAc(story) {
      return firstReviewPendingAc(sftddDir, featureId, story);
    },

    refactorPendingAc(story) {
      return firstRefactorPendingAc(sftddDir, featureId, story);
    },

    reviewPending(story) {
      return reviewPending(sftddDir, featureId, story);
    },

    refactorPending(story) {
      return refactorPending(sftddDir, featureId, story);
    },

    assessGreenFailureAc(story) {
      // The open RED cycle's AC, when its GREEN verify failed + has NOT yet been
      // assessed by the Navigator (a green-failure marker with assessed:false).
      let acId: string | undefined;
      try {
        acId = storyTestProgress(sftddDir, featureId, story).openRed[0]?.ac_id;
      } catch {
        acId = undefined;
      }
      if (!acId) return null;
      return needsGreenAssess(sftddDir, featureId, story, acId) ? acId : null;
    },

    repairRegressionFixAc(story) {
      // The open RED cycle's AC, when the Navigator assessed its green-failure as
      // a DRIVER-FIXABLE regression (recorded a fix directive) and the one repair
      // attempt has not been consumed. Routes a bounded Driver repair turn.
      let acId: string | undefined;
      try {
        acId = storyTestProgress(sftddDir, featureId, story).openRed[0]?.ac_id;
      } catch {
        acId = undefined;
      }
      if (!acId) return null;
      return hasPendingRegressionFix(sftddDir, featureId, story, acId) ? acId : null;
    },

    storyDeployVerified(story) {
      return storyDeployVerified(sftddDir, featureId, story);
    },

    deployVerifyAssessEligible(story) {
      // A contamination-classified deploy-verify failure (marker written by the
      // deploy step) not yet assessed + under the one-shot cap: routes the
      // story-level Navigator ASSESS-DEPLOY turn.
      return deployVerifyNeedsAssess(sftddDir, featureId, story);
    },

    deployVerifyRefactorPending(story) {
      // The Navigator assessed + recorded a scope set the Driver has not yet
      // refactored: routes the Driver SCOPE-DEPLOY turn.
      return deployVerifyRefactorPendingMarker(sftddDir, featureId, story);
    },

    pendingEscalation(): DriveEscalation | null {
      const e = firstPendingEscalation(sftddDir, featureId);
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
        // ux-adherence, import-time-build-coupling) whose owning AC ALREADY has a
        // refactor pending is NOT a terminal halt , the Driver's refactor turn is
        // the remediation the Navigator's REVIEW just prescribed. Suppress the
        // escalation so the build dispatches that refactor instead of raising to
        // HIL. refactorAc preserves behavior + resolves the smell; if the refactor
        // never lands, the smell re-surfaces with no refactor pending and halts.
        if (isBuildRefactorRoutableSmell(name) && story && firstRefactorPendingAc(sftddDir, featureId, story)) {
          return null;
        }
        const spec = specLevelSmell(name);
        if (spec && story && priorReviseCount(sftddDir, name, story) < 1) {
          base.routable = { story, owning_role: spec.owning_role, gate: spec.gate_to_rerun };
        }
      }
      return base;
    },
  };
}
