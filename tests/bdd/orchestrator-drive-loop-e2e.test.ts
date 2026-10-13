// Full driver loop, hermetic e2e (deterministic-driver phase 3b hardening).
//
// Drives a whole feature through runDriver with REPLAY effects: perform(action)
// plays each role by writing the artifact it would produce + drives the REAL
// pipeline state transitions (surface/approve/dispatch/await/accept/complete +
// cut experiment), stubbing only the Lakebase/external bits (experiment branch
// ops, deploy). readState is the real deriveDriveState + diskArtifactProbe +
// readDriveContext. This catches stalls / ordering / state-derivation gaps in
// the loop deterministically, with no claude calls or live Lakebase.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runDriver, type DriveEffects } from "../../consort/orchestrator/drive/orchestrator-run";
import { deriveDriveState } from "../../consort/orchestrator/state/orchestrator-derive";
import { diskArtifactProbe, readDriveContext } from "../../consort/orchestrator/state/orchestrator-probe";
import type { WorkflowAction } from "../../consort/orchestrator/drive/orchestrator-drive";
import { writeCycleArtifact } from "../../consort/pipeline/run-cycle";
import { acReviewJson, storyReviewJson, reconcileVerdictJson } from "../../consort/config/consort-paths";
import {
  readPipeline,
  writePipeline,
  surfaceForGate,
  approveStoryGate,
  dispatchNext,
  awaitAcceptance,
  acceptStory,
  completeActive,
  cutStoryExperiment,
  syncBreakdownToPipeline,
} from "../../consort/pipeline/story-pipeline";

const AT = "2026-06-07T00:00:00.000Z";

let consortDir: string;
beforeEach(() => {
  consortDir = mkdtempSync(join(tmpdir(), "drive-e2e-"));
});
afterEach(() => {
  rmSync(consortDir, { recursive: true, force: true });
});

function featureDir(feature: string): string {
  return join(consortDir, "features", feature);
}
function storyDir(feature: string, story: string): string {
  return join(featureDir(feature), "stories", story);
}
function writeJson(file: string, data: unknown): void {
  writeFileSync(file, JSON.stringify(data));
}
function setPhase(feature: string, phase: string): void {
  // Stamp the phase's owning feature, exactly as the production set-phase runner
  // does (FEIP-8022): the coarse phase is honored only for its feature.
  writeJson(join(consortDir, "workflow-state.json"), { phase, phase_feature_id: feature });
}
function ac(story: string): string {
  return `${story}-AC1`;
}

/** Seed a feature in the FEATURE phase with a feature-request, empty pipeline. */
function seedFeature(feature: string): void {
  mkdirSync(featureDir(feature), { recursive: true });
  writeFileSync(join(featureDir(feature), "feature-request.md"), "# request\n");
  writePipeline(consortDir, { version: 1, feature_id: feature, stories: {}, build_queue: [], build_active: null });
  setPhase(feature, "implementation"); // -> driver "feature" phase
}

/** Replay effects: perform(action) plays roles + drives real pipeline state. */
function replayEffects(feature: string, stories: string[]) {
  const log: WorkflowAction[] = [];
  const eff: DriveEffects = {
    async readState() {
      return deriveDriveState(
        readPipeline(consortDir, feature),
        diskArtifactProbe(consortDir, feature),
        readDriveContext(consortDir, feature),
      );
    },
    onAction(a) {
      log.push(a);
    },
    async perform(action) {
      const p = () => readPipeline(consortDir, feature);
      const save = (pl: ReturnType<typeof p>) => writePipeline(consortDir, pl);
      switch (action.kind) {
        case "invoke-role": {
          if ("mode" in action) {
            if (action.role === "spec-author" && action.mode === "breakdown") {
              for (const s of stories) {
                mkdirSync(storyDir(feature, s), { recursive: true });
                writeJson(join(storyDir(feature, s), "story.json"), { id: s, acs: [] });
              }
              syncBreakdownToPipeline(consortDir, feature);
            }
            // propose / author-requests + ux establish/ia: planning / UI track, not exercised here
            return;
          }
          if ("buildMode" in action && action.buildMode === "reconcile") {
            // Feature-complete reconciliation (story-less): simulate a passing verdict so the drive
            // advances to design-complete (the happy path — stories mutually consistent).
            writeJson(reconcileVerdictJson(consortDir, feature), { version: 1, passed: true, findings: [] });
            return;
          }
          const s = action.story;
          if (action.role === "spec-author") {
            // draft ACs (story.json acs + the AC file, no layer yet)
            writeJson(join(storyDir(feature, s), "story.json"), { id: s, acs: [ac(s)] });
            mkdirSync(join(storyDir(feature, s), "acs"), { recursive: true });
            writeJson(join(storyDir(feature, s), "acs", `${ac(s)}.json`), { id: ac(s) });
          } else if (action.role === "architect-reviewer") {
            // The architect's distinctive output: `layer` + architectural_notes
            // on each AC (both the architect's, stamped in phase 7.1; the
            // spec-author writes neither) + the feature architecture.json.
            // architectAnnotated keys on notes + architecture.json, NOT on `layer`
            // alone, so the architect actually runs (it was silently skipped when
            // the probe keyed on a bare layer).
            writeJson(join(storyDir(feature, s), "acs", `${ac(s)}.json`), {
              id: ac(s),
              layer: "API",
              architectural_notes: "boundary validates + delegates to the service; repository owns persistence",
            });
            writeJson(join(featureDir(feature), "architecture.json"), {
              feature_id: feature,
              service_backed: true,
              layers: [
                { role: "boundary", module: "app/main.py" },
                { role: "service", module: "app/services" },
                { role: "repository", module: "app/repositories" },
              ],
              nfrs: [],
            });
          } else if (action.role === "dba") {
            // The DBA's product: db-design.json realizing the architecture's
            // persistence contract (none declared here, so just >=1 table). Runs
            // between the architect and the test-strategist.
            writeJson(join(featureDir(feature), "db-design.json"), {
              feature_id: feature,
              tables: [{ name: "items", columns: [{ name: "id", type: "uuid", nullable: false }] }],
              realizes_invariants: [],
            });
          } else if (action.role === "test-strategist") {
            // The real flow: the role RUNS the consort-fan-out-analysts bin (which writes the ordered
            // list analyst-ordered.json — testListReady's B4 precondition) then appends to the master;
            // the driver's deterministic scope step produces the canonical per-story list
            // (storyTestListJson = test-list-per-story.json, field `items`) the probe reads. Replay
            // BOTH net artifacts directly (the bin's ordered list + the per-story view).
            writeJson(join(storyDir(feature, s), "analyst-ordered.json"), {
              items: [{ id: "T1", description: "t", ac_id: ac(s), status: "pending" }],
            });
            writeJson(join(storyDir(feature, s), "test-list-per-story.json"), {
              feature_id: feature,
              story_id: s,
              items: [{ id: "T1", description: "t", ac_id: ac(s), status: "pending" }],
            });
          } else if (action.role === "navigator") {
            if (action.buildMode === "reflect") {
              // Pre-build reflection: the clean-design happy path passes in one
              // turn (per-story verdict the reflectionPassed probe reads).
              writeJson(join(storyDir(feature, s), "reflect-verdict.json"), {
                version: 1,
                passed: true,
                findings: [],
              });
            } else if (action.buildMode === "review") {
              // Story-level REVIEW (the default granularity): simulate "looks good"
              // (no refactor requested), recorded once at the story's cycles root.
              writeJson(storyReviewJson(consortDir, feature, s), { reviewed_at: AT, refactor_requested: false });
            } else {
              writeCycleArtifact(
                { consortDir, feature_id: feature, story_id: s, ac_id: ac(s) },
                { cycle_id: "cycle-001", feature_id: feature, story_id: s, ac_id: ac(s), test_id: "T1", test_description: "t", red_at: AT },
              );
            }
          } else if (action.role === "driver") {
            if (action.buildMode === "refactor") {
              writeJson(storyReviewJson(consortDir, feature, s), { reviewed_at: AT, refactor_requested: true, refactored_at: AT });
            } else {
              writeCycleArtifact(
                { consortDir, feature_id: feature, story_id: s, ac_id: ac(s) },
                { cycle_id: "cycle-001", feature_id: feature, story_id: s, ac_id: ac(s), test_id: "T1", test_description: "t", red_at: AT, green_at: AT },
              );
            }
          }
          return;
        }
        case "surface-gate": {
          const pl = p();
          surfaceForGate(pl, action.story);
          save(pl);
          return;
        }
        case "approve-gate": {
          const pl = p();
          approveStoryGate(pl, action.story, { approver: "human-proxy", at: AT });
          save(pl);
          return;
        }
        case "dispatch": {
          const pl = p();
          dispatchNext(pl);
          save(pl);
          return;
        }
        case "cut-experiment": {
          const pl = p();
          cutStoryExperiment(pl, action.story, {
            slug: `${action.story}-exp`,
            branch: `exp/${action.story}`,
            parent: `feature/${feature}`,
          });
          save(pl);
          return;
        }
        case "await-acceptance": {
          // The story deploy (release-engineer) wrote passing STORY-scoped
          // deploy-evidence (reachable + verify), the teeth the driver requires
          // before accept; then the pipeline marks it awaiting.
          writeJson(join(storyDir(feature, action.story), "deploy-evidence.json"), {
            schema_version: 1,
            feature_id: feature,
            story_id: action.story,
            target: "local",
            url: "http://localhost:8000/",
            reachable: true,
            verify: { passed: true },
            deployed_at: AT,
          });
          const pl = p();
          awaitAcceptance(pl, action.story);
          save(pl);
          return;
        }
        case "accept": {
          const pl = p();
          acceptStory(pl, action.story, { approver: "human-proxy", at: AT });
          save(pl);
          return;
        }
        case "complete": {
          const pl = p();
          completeActive(pl);
          save(pl);
          return;
        }
        case "planning-complete":
          setPhase(feature, "discovery");
          return;
        case "feature-complete":
          setPhase(feature, "deploy");
          return;
        case "deploy":
          // The Release Engineer's deploy produces deploy-evidence.json
          // (reachable + verify passed); the probe keys `deployed` off it.
          writeJson(join(featureDir(feature), "deploy-evidence.json"), {
            schema_version: 1,
            feature_id: feature,
            target: "local",
            url: "http://localhost:8000/",
            reachable: true,
            verify: { passed: true },
            deployed_at: AT,
          });
          return;
        case "approve-deploy-gate":
          // A full, schema-valid gates.json so the probe's strict readGates
          // sees the deploy gate approved.
          writeJson(join(featureDir(feature), "gates.json"), {
            feature_id: feature,
            schema_version: 1,
            gates: {
              spec: { status: "open", history: [] },
              plan: { status: "open", history: [] },
              test_list: { status: "open", history: [] },
              promote: { status: "open", history: [] },
              deploy: { status: "approved", history: [] },
            },
          });
          return;
        case "done":
          setPhase(feature, "shipped");
          return;
        case "design-complete":
          return;
      }
    },
  };
  return { eff, log };
}

describe("driver full loop (hermetic, replay roles + real pipeline state)", () => {
  it("drives a 2-story feature from breakdown through accept + deploy to the promote boundary", async () => {
    const feature = "F1";
    seedFeature(feature);
    const { eff, log } = replayEffects(feature, ["S1", "S2"]);

    // Stop the moment the feature enters the promote phase: that phase drives the
    // SCM workflow (prepare-pr / wait-ci / merge), which needs a real git remote +
    // PR and is covered by the fake-world full-loop test + scm-workflow-e2e-live.
    // This e2e's value is the REAL pipeline/probe through the TDD + deploy loop.
    const result = await runDriver(eff, { stopWhen: (a) => a.kind === "deploy-complete" });

    // Reached the promote boundary cleanly (no stall): the TDD loop + deploy ran.
    expect(result.stoppedAtBound).toBe(true);
    expect(result.iterations).toBeGreaterThan(0);
    const finalPipeline = readPipeline(consortDir, feature);
    // Both stories built + accepted (done), lane idle.
    for (const s of ["S1", "S2"]) {
      expect(finalPipeline.stories[s].status, `${s} status`).toBe("done");
      expect(finalPipeline.stories[s].acceptance?.decision, `${s} accepted`).toBe("accepted");
      expect(finalPipeline.stories[s].experiment?.status, `${s} experiment merged`).toBe("merged");
    }
    expect(finalPipeline.build_active).toBeNull();

    // Streaming: S1 enters the build lane before S2 finishes designing.
    const s1Cut = log.findIndex((a) => a.kind === "cut-experiment" && a.story === "S1");
    const s2Approved = log.findIndex((a) => a.kind === "approve-gate" && a.story === "S2");
    expect(s1Cut).toBeGreaterThanOrEqual(0);
    expect(s2Approved).toBeGreaterThan(s1Cut);

    // Serialized: S1 leaves the lane (accept) before S2 is cut.
    const s1Accept = log.findIndex((a) => a.kind === "accept" && a.story === "S1");
    const s2Cut = log.findIndex((a) => a.kind === "cut-experiment" && a.story === "S2");
    expect(s1Accept).toBeGreaterThanOrEqual(0);
    expect(s2Cut).toBeGreaterThan(s1Accept);
  });
});
