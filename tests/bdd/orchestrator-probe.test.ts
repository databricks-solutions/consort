// diskArtifactProbe (phase 3b) tests: lay out real on-disk artifacts in a temp
// .tdd dir (using the substrate's own cycle writer) and assert the probe reads
// the per-story design + build facts deriveDriveState needs.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { diskArtifactProbe, readDriveContext } from "../../consort/orchestrator/state/orchestrator-probe";
import { writeCycleArtifact, type CycleArtifact } from "../../consort/pipeline/run-cycle";
import { markSmellResolved, priorReviseCount, writeSmellsLog } from "../../consort/smells/smells";

let consortDir: string;
const FEATURE = "F1";

beforeEach(() => {
  consortDir = mkdtempSync(join(tmpdir(), "drive-probe-"));
});
afterEach(() => {
  rmSync(consortDir, { recursive: true, force: true });
});

function storyDir(story: string): string {
  return join(consortDir, "features", FEATURE, "stories", story);
}
function writeStory(story: string, acs: string[]): void {
  mkdirSync(storyDir(story), { recursive: true });
  writeFileSync(join(storyDir(story), "story.json"), JSON.stringify({ id: story, acs }));
}
function writeAcLayer(story: string, ac: string, layer: string): void {
  const dir = join(storyDir(story), "acs");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${ac}.json`), JSON.stringify({ id: ac, layer }));
}
function writeAcNotes(story: string, ac: string, layer: string, notes: string): void {
  const dir = join(storyDir(story), "acs");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${ac}.json`), JSON.stringify({ id: ac, layer, architectural_notes: notes }));
}
function writeArchitecture(): void {
  const dir = join(consortDir, "features", FEATURE);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "architecture.json"), JSON.stringify({ feature_id: FEATURE, service_backed: true, layers: [], nfrs: [] }));
}
function writeTestList(story: string, items: unknown[]): void {
  // The canonical per-story list (storyTestListJson): a StoryTestList with an
  // `items[]` field, written as test-list-per-story.json – the exact file +
  // field the probe's testListReady reads.
  mkdirSync(storyDir(story), { recursive: true });
  writeFileSync(join(storyDir(story), "test-list-per-story.json"), JSON.stringify({ items }));
}
/** The deterministic fan-out's ordered-list artifact — B4: testListReady requires it (the bin ran). */
function writeAnalystOrdered(story: string): void {
  mkdirSync(storyDir(story), { recursive: true });
  writeFileSync(join(storyDir(story), "analyst-ordered.json"), JSON.stringify({ items: [{ id: "T1" }] }));
}
function cycle(story: string, ac: string, id: string, extra: Partial<CycleArtifact>): void {
  writeCycleArtifact(
    { consortDir, feature_id: FEATURE, story_id: story, ac_id: ac },
    {
      cycle_id: id,
      feature_id: FEATURE,
      story_id: story,
      ac_id: ac,
      test_id: `${ac}-t1`,
      test_description: "t",
      ...extra,
    },
  );
}

describe("diskArtifactProbe: design facts", () => {
  it("hasAcs reflects story.json acs (and is false when the story file is absent)", () => {
    const probe = diskArtifactProbe(consortDir, FEATURE);
    expect(probe.hasAcs("S1")).toBe(false);
    writeStory("S1", ["AC1", "AC2"]);
    expect(probe.hasAcs("S1")).toBe(true);
    writeStory("S2", []);
    expect(probe.hasAcs("S2")).toBe(false);
  });

  it("specRevisePending re-invokes the spec-author while a scope-marked AC file is missing, and self-clears once re-authored", () => {
    const probe = diskArtifactProbe(consortDir, FEATURE);
    writeStory("S4", ["AC1", "AC2"]);
    writeAcLayer("S4", "AC1", "API");
    writeAcLayer("S4", "AC2", "API");
    expect(probe.specRevisePending("S4")).toBe(false); // no marker
    // a scoped spec revise cleared AC2 and recorded it; AC2.json is absent → pending
    rmSync(join(storyDir("S4"), "acs", "AC2.json"), { force: true });
    writeFileSync(join(storyDir("S4"), "spec-revise-scope.json"), JSON.stringify({ ac_ids: ["AC2"] }));
    expect(probe.specRevisePending("S4")).toBe(true);
    // the spec-author re-authors AC2 → the marked AC is present again → no longer pending
    writeAcLayer("S4", "AC2", "API");
    expect(probe.specRevisePending("S4")).toBe(false);
  });

  it("hasAcs detects acs/<AC>.json files even when story.json acs is not backfilled", () => {
    // The live failure mode: the Spec Author wrote acs/<AC>.{md,json} but left
    // story.json `acs` null. Disk is the truth, so the probe must see them;
    // otherwise the story looks un-drafted forever and the driver stalls
    // re-issuing the same invoke-role.
    const probe = diskArtifactProbe(consortDir, FEATURE);
    mkdirSync(storyDir("S3"), { recursive: true });
    writeFileSync(join(storyDir("S3"), "story.json"), JSON.stringify({ id: "S3", acs: null }));
    expect(probe.hasAcs("S3")).toBe(false); // no acs/ files yet
    writeAcLayer("S3", "AC1-file", "API"); // writes acs/AC1-file.json
    writeFileSync(join(storyDir("S3"), "acs", "AC2-reject.json"), JSON.stringify({ id: "AC2-reject" }));
    expect(probe.hasAcs("S3")).toBe(true);
  });

  it("architectAnnotated requires the architect's OWN output (architectural_notes + architecture.json), NOT a bare `layer`", () => {
    // The bug this guards: keying architectAnnotated on `layer` alone made it true
    // the instant `layer` appeared, so if anything wrote `layer` early the
    // architect-reviewer was skipped – no architecture.json + no layering/
    // service_backed enforcement ever ran. `layer` is the architect's field
    // (optional in ac.schema, stamped in phase 7.1), so this keys on the
    // architect's DISTINCTIVE output instead.
    const probe = diskArtifactProbe(consortDir, FEATURE);
    writeStory("S1", ["AC1", "AC2"]);
    expect(probe.architectAnnotated("S1")).toBe(false);
    // Even WITH a layer on each AC, the architect has NOT run yet (no notes / arch).
    writeAcLayer("S1", "AC1", "API");
    writeAcLayer("S1", "AC2", "Infra");
    expect(probe.architectAnnotated("S1")).toBe(false); // layer alone != annotated
    // Architect adds architectural_notes to each AC...
    writeAcNotes("S1", "AC1", "API", "boundary validates + delegates to the service");
    writeAcNotes("S1", "AC2", "Infra", "repository is the only layer touching the ORM");
    expect(probe.architectAnnotated("S1")).toBe(false); // still no architecture.json
    // ...and writes the feature architecture.json -> NOW annotated.
    writeArchitecture();
    expect(probe.architectAnnotated("S1")).toBe(true);
  });

  it("iaRefined: the per-story IA coverage marker, with coverage-by-presence back-compat", () => {
    const probe = diskArtifactProbe(consortDir, FEATURE);
    const iaMdPath = join(consortDir, "design", "ia.md");
    const marker = (story: string) => join(storyDir(story), "ia-coverage.json");
    writeStory("S1", ["AC1"]);
    // No ia.md skeleton yet -> never refined (the establish/lazy-fallback runs first).
    expect(probe.iaRefined("S1")).toBe(false);
    mkdirSync(join(consortDir, "design"), { recursive: true });
    writeFileSync(iaMdPath, "# IA\n## Screens\n## Navigation\n## User flows\n");
    // ia.md exists but this story has no marker and is not yet architected -> needs ux-ia.
    expect(probe.iaRefined("S1")).toBe(false);
    // The per-story coverage marker (a live ux ia turn, or project-ia-notes) -> refined.
    writeFileSync(marker("S1"), JSON.stringify({ story: "S1", reconciled_at: "2026-01-01T00:00:00Z" }));
    expect(probe.iaRefined("S1")).toBe(true);
    // Coverage-by-presence back-compat: a story the architect ALREADY annotated (an older kit, no
    // marker) counts as refined, so the new kit does NOT re-run ux-ia on already-designed stories.
    writeStory("S2", ["AC1"]);
    writeAcNotes("S2", "AC1", "API", "boundary validates + delegates to the service");
    writeArchitecture();
    expect(probe.architectAnnotated("S2")).toBe(true);
    expect(probe.iaRefined("S2")).toBe(true); // no marker, but architected -> covered by presence
  });

  it("iaProjectable: a feature's first UI story runs a live ux turn, later stories project", () => {
    const probe = diskArtifactProbe(consortDir, FEATURE);
    mkdirSync(join(consortDir, "design"), { recursive: true });
    writeFileSync(join(consortDir, "design", "ia.md"), "# IA\n## Screens\n## Navigation\n## User flows\n");
    writeStory("S1", ["AC1"]);
    writeStory("S2", ["AC1"]);
    // No sibling covered yet -> the first story is NOT projectable (runs a live ux ia turn).
    expect(probe.iaProjectable("S1")).toBe(false);
    // Once a sibling story is covered, the rest PROJECT (no turn) — surfaces already named.
    writeFileSync(join(storyDir("S1"), "ia-coverage.json"), JSON.stringify({ story: "S1" }));
    expect(probe.iaProjectable("S2")).toBe(true);
    expect(probe.iaProjectable("S1")).toBe(false); // already covered -> nothing to project
  });

  it("iaProjectable: a UI story (story.json requires_e2e) does NOT project even when a sibling is covered (the S2/S3 lap fix)", () => {
    // Live-caught churn: S2/S3 each PROJECTED (sibling S1 covered) → the architect declared seams the
    // projected ia.md did not name → the IA gate flagged → a full revise lap. A UI story must run the ux
    // ia turn LIVE, like the first story. The signal is story.json `requires_e2e` (the PO's flag, set at
    // breakdown + readable here) — NOT the AC `layer`, which the architect assigns in a LATER step (so it
    // is unset at this decision point; checking it was a no-op that left the laps in).
    mkdirSync(join(consortDir, "design"), { recursive: true });
    writeFileSync(join(consortDir, "design", "ia.md"), "# IA\n## Screens\n");
    writeStory("S1", ["AC1"]);
    writeFileSync(join(storyDir("S1"), "ia-coverage.json"), JSON.stringify({ story: "S1" })); // sibling covered
    // A NON-UI story (no requires_e2e) still projects — nothing to add to ia.md.
    writeStory("S3", ["AC1"]);
    expect(diskArtifactProbe(consortDir, FEATURE).iaProjectable("S3")).toBe(true);
    // A UI story (requires_e2e:true on story.json) does NOT project — it must refine ia.md live.
    mkdirSync(storyDir("S2"), { recursive: true });
    writeFileSync(join(storyDir("S2"), "story.json"), JSON.stringify({ id: "S2", acs: ["AC1"], requires_e2e: true }));
    expect(diskArtifactProbe(consortDir, FEATURE).iaProjectable("S2")).toBe(false);
  });

  it("iaProjectable: a story sent back on a reflect-ia-defect revise is NOT projectable (forces a live ux ia turn to heal ia.md)", () => {
    // The bug this guards (found live): the reflect critic flags a story's E2E ACs asserting a surface
    // ia.md does not name (reflect-ia-defect -> revise -> ux-designer). On the next derivation the
    // no-turn projection re-stamps the coverage marker WITHOUT adding the missing surface, so the next
    // reflect re-flags the same gap and the loop burns revise laps to HIL healing nothing. Mirror
    // architectProjectable's architect-canon-gap guard: once revised, the ux ia turn must run LIVE.
    const probe = diskArtifactProbe(consortDir, FEATURE);
    mkdirSync(join(consortDir, "design"), { recursive: true });
    writeFileSync(join(consortDir, "design", "ia.md"), "# IA\n## Screens\n## Navigation\n## User flows\n");
    writeStory("S1", ["AC1"]);
    writeStory("S2", ["AC1"]);
    // S1 covered -> S2 would normally PROJECT (its surface already named by a sibling).
    writeFileSync(join(storyDir("S1"), "ia-coverage.json"), JSON.stringify({ story: "S1" }));
    expect(probe.iaProjectable("S2")).toBe(true);
    // But once S2 was sent back on a reflect-ia-defect revise, the projection heals nothing -> live turn.
    writeSmellsLog(consortDir, [{ smell: "reflect-ia-defect", cycle_ids: [], story_id: "S2", detail: "ia gap" }]);
    markSmellResolved(consortDir, "reflect-ia-defect", { story_id: "S2", kind: "revised" });
    expect(priorReviseCount(consortDir, "reflect-ia-defect", "S2")).toBe(1);
    expect(diskArtifactProbe(consortDir, FEATURE).iaProjectable("S2")).toBe(false);
  });

  it("testListReady requires a non-empty test list AND the fan-out's ordered-list artifact (B4)", () => {
    const probe = diskArtifactProbe(consortDir, FEATURE);
    expect(probe.testListReady("S1")).toBe(false);
    writeTestList("S1", []);
    expect(probe.testListReady("S1")).toBe(false);
    writeTestList("S1", [{ id: "T1" }]);
    // B4: a non-empty master alone is NOT ready — the fan-out bin must have produced analyst-ordered.json
    // (fail-closes the solo-author path: a hand-written master without the bin stays not-ready).
    expect(probe.testListReady("S1")).toBe(false);
    writeAnalystOrdered("S1");
    expect(probe.testListReady("S1")).toBe(true);
  });
});

describe("diskArtifactProbe: build facts from cycle artifacts", () => {
  it("testsWritten once a RED cycle exists; codeWritten once every RED is GREEN", () => {
    const probe = diskArtifactProbe(consortDir, FEATURE);
    expect(probe.testsWritten("S1")).toBe(false);
    expect(probe.codeWritten("S1")).toBe(false);

    // Navigator writes RED for AC1.
    cycle("S1", "AC1", "cycle-001", { red_at: "2026-06-07T10:00:00Z" });
    expect(probe.testsWritten("S1")).toBe(true);
    expect(probe.codeWritten("S1")).toBe(false); // RED not yet GREEN

    // Driver turns it GREEN.
    cycle("S1", "AC1", "cycle-001", { red_at: "2026-06-07T10:00:00Z", green_at: "2026-06-07T10:05:00Z" });
    expect(probe.codeWritten("S1")).toBe(true);

    // A new RED in another AC drops codeWritten until it too is GREEN.
    cycle("S1", "AC2", "cycle-001", { red_at: "2026-06-07T10:10:00Z" });
    expect(probe.codeWritten("S1")).toBe(false);
    cycle("S1", "AC2", "cycle-001", { red_at: "2026-06-07T10:10:00Z", green_at: "2026-06-07T10:12:00Z" });
    expect(probe.codeWritten("S1")).toBe(true);
  });

  it("scopes cycles per story (S2's cycles do not affect S1)", () => {
    const probe = diskArtifactProbe(consortDir, FEATURE);
    cycle("S2", "AC1", "cycle-001", { red_at: "2026-06-07T10:00:00Z" });
    expect(probe.testsWritten("S1")).toBe(false);
    expect(probe.testsWritten("S2")).toBe(true);
  });
});

describe("readDriveContext", () => {
  const featureDir = () => join(consortDir, "features", FEATURE);
  const writeFeatureFile = (name: string, content: string) => {
    mkdirSync(featureDir(), { recursive: true });
    writeFileSync(join(featureDir(), name), content);
  };

  it("an empty project reads as conservative defaults (phase feature, nothing done)", () => {
    const ctx = readDriveContext(consortDir, FEATURE);
    expect(ctx.phase).toBe("feature");
    expect(ctx.breakdownDone).toBe(false);
    // No product-overview.md/nfrs.md on disk → intake not ready (the drive would surface the PO
    // intake step first, interactively). An empty project has done nothing, intake included.
    expect(ctx.planning).toEqual({ intakeReady: false, intakeApproved: false, proposed: false, estimated: false, backlogCommitted: false, requestsAuthored: false });
    expect(ctx.deploy).toEqual({ deployed: false, gateApproved: false, verifyAssessEligible: false, verifyRefactorPending: false, verifyPassed: undefined, reverifyAttempted: false });
  });

  // Regression (class-k live halt): ctx.loop MUST come from the same single
  // source the effects layer reads (.lakebase/consort-config.json's
  // build.loopGranularity). It was previously never set, so deriveDriveState
  // fell to `ctx.loop ?? "story"` and always ran the story review/refactor
  // branch, while the effects/roleTaskBody layer read the file's real
  // "hybrid-a". The result: the review action was derived story-scoped (no
  // `ac`, verdict looked for at the story root) but RENDERED per-AC ("AC
  // undefined", verdict at .../undefined/review-verdict.json) -> the story-root
  // verdict never appeared, the identical review re-derived every tick, and the
  // drive's "repeated without advancing state" guard hard-halted a live capture
  // right after S1 was fully green. deriveDriveState + effects must agree on the
  // loop, so both read it from THIS one file.
  it("reads build.loopGranularity from .lakebase/consort-config.json into ctx.loop (derive/effects agree)", () => {
    const proj = mkdtempSync(join(tmpdir(), "drive-proj-"));
    const cdir = join(proj, ".consort");
    mkdirSync(join(proj, ".lakebase"), { recursive: true });
    mkdirSync(join(cdir, "features", FEATURE), { recursive: true });
    // hybrid-a in the file -> ctx.loop must be hybrid-a (NOT the "story" default).
    writeFileSync(
      join(proj, ".lakebase", "consort-config.json"),
      JSON.stringify({ version: 1, build: { loopGranularity: "hybrid-a", batchCap: 3, sessionScope: "story" } }),
    );
    expect(readDriveContext(cdir, FEATURE, proj).loop).toBe("hybrid-a");

    // "ac" round-trips too.
    writeFileSync(
      join(proj, ".lakebase", "consort-config.json"),
      JSON.stringify({ version: 1, build: { loopGranularity: "ac" } }),
    );
    expect(readDriveContext(cdir, FEATURE, proj).loop).toBe("ac");

    // No file -> the resolver's own default ("story"), never undefined.
    const bare = mkdtempSync(join(tmpdir(), "drive-bare-"));
    mkdirSync(join(bare, ".consort", "features", FEATURE), { recursive: true });
    expect(readDriveContext(join(bare, ".consort"), FEATURE, bare).loop).toBe("story");
    rmSync(proj, { recursive: true, force: true });
    rmSync(bare, { recursive: true, force: true });
  });

  // A full, schema-valid gates.json the strict readGates can parse, with the
  // deploy gate at the given status.
  function gatesJson(deployStatus: "open" | "approved"): string {
    return JSON.stringify({
      feature_id: FEATURE,
      schema_version: 1,
      gates: {
        spec: { status: "approved", history: [] },
        plan: { status: "open", history: [] },
        test_list: { status: "open", history: [] },
        promote: { status: "open", history: [] },
        deploy: { status: deployStatus, history: [] },
      },
    });
  }
  // Minimal deploy-evidence.json: its mere presence makes deployed=true.
  function writeEvidence(): void {
    writeFeatureFile(
      "deploy-evidence.json",
      JSON.stringify({ schema_version: 1, feature_id: FEATURE, target: "local", url: "http://localhost:8000/", reachable: true, verify: { passed: true }, deployed_at: "2026-06-07T00:00:00.000Z" }),
    );
  }

  it("maps workflow-state phase + planning/deploy sub-flags from on-disk artifacts", () => {
    writeFileSync(join(consortDir, "workflow-state.json"), JSON.stringify({ phase: "implementation" }));
    // Intake present (product-overview.md + nfrs.md) → intakeReady:true, the realistic state for a
    // project that has already proposed + authored requests.
    writeFileSync(join(consortDir, "product-overview.md"), "# Overview\n\nA product.\n");
    writeFileSync(join(consortDir, "nfrs.md"), "# NFRs\n\n## Required\n- R1 fast\n");
    mkdirSync(join(consortDir, "intake"), { recursive: true });
    writeFileSync(join(consortDir, "intake", "approved"), "approved\n"); // intake gate approved (mid-flow)
    writeFeatureFile("feature-request.md", "# request");
    writeFeatureFile("feature-spec.json", JSON.stringify({ id: FEATURE, stories: ["S1", "S2"] }));
    writeEvidence(); // deploy ran -> deployed:true
    writeFeatureFile("gates.json", gatesJson("open")); // gate not yet approved

    const ctx = readDriveContext(consortDir, FEATURE);
    expect(ctx.phase).toBe("feature"); // implementation -> feature
    expect(ctx.breakdownDone).toBe(true);
    expect(ctx.planning).toEqual({ intakeReady: true, intakeApproved: true, proposed: true, estimated: false, backlogCommitted: true, requestsAuthored: true });
    // deploy ran (evidence present) but the deploy gate is not approved
    expect(ctx.deploy).toEqual({ deployed: true, gateApproved: false, verifyAssessEligible: false, verifyRefactorPending: false, verifyPassed: true, reverifyAttempted: false });
  });

  it("reads deploy phase + approved deploy gate (evidence + strict gate read)", () => {
    // The coarse phase is honored because it is STAMPED for THIS feature (FEIP-8022).
    writeFileSync(join(consortDir, "workflow-state.json"), JSON.stringify({ phase: "deploy", phase_feature_id: FEATURE }));
    writeEvidence();
    writeFeatureFile("gates.json", gatesJson("approved"));
    const ctx = readDriveContext(consortDir, FEATURE);
    expect(ctx.phase).toBe("deploy");
    expect(ctx.deploy).toEqual({ deployed: true, gateApproved: true, verifyAssessEligible: false, verifyRefactorPending: false, verifyPassed: true, reverifyAttempted: false });
  });

  it("deployed=false when no deploy-evidence.json was written, even with an approved gate", () => {
    writeFileSync(join(consortDir, "workflow-state.json"), JSON.stringify({ phase: "deploy", phase_feature_id: FEATURE }));
    writeFeatureFile("gates.json", gatesJson("approved"));
    const ctx = readDriveContext(consortDir, FEATURE);
    expect(ctx.deploy).toEqual({ deployed: false, gateApproved: true, verifyAssessEligible: false, verifyRefactorPending: false, verifyPassed: undefined, reverifyAttempted: false });
  });

  // FEIP-8022: the coarse `phase` slot is per-PROJECT, so it must be honored only
  // for the feature it was written for; otherwise a prior feature's phase leaks
  // into the next (F2 inheriting F1's "deploy").
  it("does NOT inherit a phase stamped for a DIFFERENT feature (no cross-feature leak)", () => {
    writeFileSync(join(consortDir, "workflow-state.json"), JSON.stringify({ phase: "deploy", phase_feature_id: "F1-other" }));
    const ctx = readDriveContext(consortDir, FEATURE);
    expect(ctx.phase).toBe("feature"); // re-derives from THIS feature, not F1's deploy
  });

  it("does NOT honor an UNSTAMPED non-feature phase (legacy / never-owned)", () => {
    writeFileSync(join(consortDir, "workflow-state.json"), JSON.stringify({ phase: "deploy" }));
    const ctx = readDriveContext(consortDir, FEATURE);
    expect(ctx.phase).toBe("feature");
  });

  it("honors a phase stamped for THIS feature (resume an in-flight feature)", () => {
    writeFileSync(join(consortDir, "workflow-state.json"), JSON.stringify({ phase: "promote", phase_feature_id: FEATURE }));
    const ctx = readDriveContext(consortDir, FEATURE);
    expect(ctx.phase).toBe("promote");
  });
});
