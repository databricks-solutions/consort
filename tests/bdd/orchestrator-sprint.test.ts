// Sprint mode: the Tier-1 /sprint orchestrator. runSprint is pure
// over SprintEffects (order assertions); the backlog manifest + sprint planning
// readState are the I/O helpers the CLI uses to build the real effects.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  runSprint,
  readSprintBacklog,
  writeSprintBacklog,
  syncBacklog,
  deriveSprintPlanningState,
  shippedBecauseLaterFeatureClaimed,
  shippedByClearedClaim,
  type SprintEffects,
} from "../../consort/intake/orchestrator-sprint";
import { writeEstimates } from "../../consort/config/consort-paths";
import { writeSprintGates } from "../../consort/gates/sprint-gates";
import { nextTransition } from "../../consort/orchestrator/drive/orchestrator-drive";

const SPRINT = "sprint-1";

let tdd: string;
beforeEach(() => {
  tdd = mkdtempSync(join(tmpdir(), "sprint-"));
});
afterEach(() => rmSync(tdd, { recursive: true, force: true }));

describe("shippedBecauseLaterFeatureClaimed – the sprint-resume skip fix", () => {
  const backlog = ["F1-stock-visibility", "F2-stock-adjustment", "F3-audit"];

  it("SKIPS an earlier feature when a LATER backlog feature holds the SCM claim", () => {
    // The trap: F1 shipped + merged, F2 then claimed. Deriving F1's own next action
    // reads F2's shared SCM ladder and never returns `done`, so the loop re-claimed F1
    // and tripped `already at feature-claimed for F2`. A later claim proves F1 shipped.
    expect(shippedBecauseLaterFeatureClaimed("F1-stock-visibility", "F2-stock-adjustment", backlog)).toBe(true);
    expect(shippedBecauseLaterFeatureClaimed("F1-stock-visibility", "F3-audit", backlog)).toBe(true);
  });

  it("does NOT skip the feature that itself holds the claim (it is in-flight)", () => {
    expect(shippedBecauseLaterFeatureClaimed("F2-stock-adjustment", "F2-stock-adjustment", backlog)).toBe(false);
  });

  it("does NOT skip when an EARLIER feature holds the claim (cannot prove this one shipped)", () => {
    expect(shippedBecauseLaterFeatureClaimed("F2-stock-adjustment", "F1-stock-visibility", backlog)).toBe(false);
  });

  it("is a no-op for an absent/empty claim or an id not in the backlog (caller falls back to the own-workflow derive)", () => {
    expect(shippedBecauseLaterFeatureClaimed("F1-stock-visibility", undefined, backlog)).toBe(false);
    expect(shippedBecauseLaterFeatureClaimed("F1-stock-visibility", "", backlog)).toBe(false);
    expect(shippedBecauseLaterFeatureClaimed("F9-not-in-backlog", "F2-stock-adjustment", backlog)).toBe(false);
    expect(shippedBecauseLaterFeatureClaimed("F1-stock-visibility", "F9-not-in-backlog", backlog)).toBe(false);
  });

  it("matches feature ids case-insensitively (normalized)", () => {
    expect(shippedBecauseLaterFeatureClaimed("f1-stock-visibility", "F2-STOCK-ADJUSTMENT", backlog)).toBe(true);
  });
});

describe("shippedByClearedClaim – the last-feature / complete-sprint skip fix", () => {
  it("is TRUE when the claim is cleared AND the feature is fully complete (shipped)", () => {
    // The final feature shipped: claim freed at merge, stories all done+accepted.
    expect(shippedByClearedClaim(undefined, "complete")).toBe(true);
    expect(shippedByClearedClaim("", "complete")).toBe(true);
    expect(shippedByClearedClaim("   ", "complete")).toBe(true);
  });
  it("is FALSE while a feature still holds the claim (in-flight, not yet merged)", () => {
    // A feature accepted-but-not-yet-merged still HOLDS the claim; it must not be skipped.
    expect(shippedByClearedClaim("F2-stock-adjustment", "complete")).toBe(false);
  });
  it("is FALSE for a not-complete feature even with the claim cleared (still has design/build work)", () => {
    expect(shippedByClearedClaim(undefined, "build")).toBe(false);
    expect(shippedByClearedClaim(undefined, "design")).toBe(false);
    expect(shippedByClearedClaim(undefined, null)).toBe(false);
  });
});

describe("sprint backlog manifest", () => {
  it("round-trips features; empty when absent", () => {
    expect(readSprintBacklog(tdd, SPRINT)).toEqual({ sprint: SPRINT, features: [] });
    writeSprintBacklog(tdd, { sprint: SPRINT, features: [{ id: "F1-a", size: "M" }, { id: "F2-b" }] });
    expect(readSprintBacklog(tdd, SPRINT).features).toEqual([{ id: "F1-a", size: "M" }, { id: "F2-b" }]);
  });

  it("tolerates the legacy bare-string-id backlog form", () => {
    // Old artifacts wrote features: ["F1", ...]; readBacklog normalizes to {id}.
    mkdirSync(join(tdd, "sprints", SPRINT), { recursive: true });
    writeFileSync(
      join(tdd, "sprints", SPRINT, "backlog.json"),
      JSON.stringify({ sprint: SPRINT, features: ["F1-a", "F2-b"] }),
    );
    expect(readSprintBacklog(tdd, SPRINT).features).toEqual([{ id: "F1-a" }, { id: "F2-b" }]);
  });
});

describe("deriveSprintPlanningState", () => {
  function sprintDir(): string {
    return join(tdd, "sprints", SPRINT);
  }
  function writeProposal(): void {
    // Canonical proposal location (project-level planning/), per sftdd-paths.
    const dir = join(tdd, "planning");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "feature-proposals.md"), "# Backlog\n\n## Features\n- F1\n");
  }
  function writeRequest(feature: string): void {
    const fdir = join(tdd, "features", feature);
    mkdirSync(fdir, { recursive: true });
    writeFileSync(join(fdir, "feature-request.md"), "# request\n");
  }

  it("nothing on disk => all planning flags false (incl. intakeReady – no product-overview/nfrs)", () => {
    const s = deriveSprintPlanningState(tdd, SPRINT);
    expect(s.phase).toBe("planning");
    // intakeReady false with nothing on disk: the sprint drive dispatches the PO intake turn FIRST.
    // This is the assertion that would have caught the bug where the sprint path skipped intake.
    expect(s.planning).toEqual({ intakeReady: false, intakeApproved: false, proposed: false, estimated: false, backlogCommitted: false, requestsAuthored: false, committedEstimated: false, gateApproved: false, skipSizing: false });
  });

  // REGRESSION (the sprint-path intake bug): deriveSprintPlanningState fed into nextTransition MUST
  // dispatch the PO intake turn FIRST when intake is incomplete. The sprint path previously omitted
  // intakeReady, so the drive skipped intake and went straight to propose (from nothing).
  it("intake INCOMPLETE (no nfrs.md) => the sprint drive dispatches the PO intake turn, not propose", () => {
    writeFileSync(join(tdd, "product-overview.md"), "# Overview\n\nA product.\n"); // present
    // nfrs.md absent => intakeReady false
    const s = deriveSprintPlanningState(tdd, SPRINT);
    expect(s.planning?.intakeReady).toBe(false);
    expect(nextTransition(s)).toEqual({ kind: "invoke-role", role: "product-owner", mode: "intake" });
  });

  // These two use a NON-UI project (controlled proj/.consort + uiTrack:false config) so the gate and
  // propose transitions are tested without the UI-track ux-designer establish preempting them (on a UI
  // project the establish fires between intake and the gate — covered in the uiTrack describe below).
  function nonUiProject(withApproval: boolean): string {
    const proj = mkdtempSync(join(tmpdir(), "nonui-"));
    const cd = join(proj, ".consort");
    mkdirSync(cd, { recursive: true });
    mkdirSync(join(proj, ".lakebase"), { recursive: true });
    writeFileSync(join(proj, ".lakebase", "consort-config.json"), JSON.stringify({ project: { uiTrack: false } }));
    writeFileSync(join(cd, "product-overview.md"), "# Overview\n\nA product.\n");
    writeFileSync(join(cd, "nfrs.md"), "# NFRs\n\n## Required\n- R1 fast\n");
    if (withApproval) {
      mkdirSync(join(cd, "intake"), { recursive: true });
      writeFileSync(join(cd, "intake", "approved"), "approved\n"); // the intake gate's approval marker
    }
    return cd;
  }

  it("intake DRAFTED but NOT approved (non-UI) => the drive PARKS at the intake gate (review before propose)", () => {
    const s = deriveSprintPlanningState(nonUiProject(false), SPRINT);
    expect(s.planning?.intakeReady).toBe(true);
    expect(s.planning?.intakeApproved).toBe(false); // no approval marker yet
    expect(nextTransition(s)).toEqual({ kind: "approve-intake-gate" });
  });

  it("intake drafted AND approved (non-UI) => past the intake gate to propose", () => {
    const s = deriveSprintPlanningState(nonUiProject(true), SPRINT);
    expect(s.planning?.intakeReady).toBe(true);
    expect(s.planning?.intakeApproved).toBe(true);
    expect(nextTransition(s)).toEqual({ kind: "invoke-role", role: "spec-author", mode: "propose" });
  });

  it("estimated when the Architect wrote planning/estimates.json", () => {
    expect(deriveSprintPlanningState(tdd, SPRINT).planning?.estimated).toBe(false);
    writeEstimates(tdd, [{ feature_id: "F1-a", size: "M" }]);
    expect(deriveSprintPlanningState(tdd, SPRINT).planning?.estimated).toBe(true);
  });

  it("proposed when feature-proposals.md exists", () => {
    writeProposal();
    expect(deriveSprintPlanningState(tdd, SPRINT).planning?.proposed).toBe(true);
  });

  it("proposed when the proposal is at .tdd/planning/ (the Spec Author's path)", () => {
    // Disk-truth: the role writes .tdd/planning/feature-proposals.md, not the
    // sprint-scoped copy. Reading only the sprint dir left proposed=false, so
    // the driver re-issued `propose` forever and stalled.
    const planning = join(tdd, "planning");
    mkdirSync(planning, { recursive: true });
    writeFileSync(join(planning, "feature-proposals.md"), "# Backlog\n\n## Features\n- F1\n");
    expect(deriveSprintPlanningState(tdd, SPRINT).planning?.proposed).toBe(true);
  });

  it("requestsAuthored only when the backlog is non-empty AND every feature has a request", () => {
    writeProposal();
    writeSprintBacklog(tdd, { sprint: SPRINT, features: [{ id: "F1-a" }, { id: "F2-b" }] });
    writeRequest("F1-a"); // only one of two
    expect(deriveSprintPlanningState(tdd, SPRINT).planning?.requestsAuthored).toBe(false);
    writeRequest("F2-b");
    expect(deriveSprintPlanningState(tdd, SPRINT).planning?.requestsAuthored).toBe(true);
  });

  it("committedEstimated is true only when every committed backlog feature is sized under its OWN id", () => {
    // The re-plan fix: candidate (FP) estimates do NOT satisfy this – the committed
    // feature must be sized by its real id. Drives the estimate-committed turn.
    writeProposal();
    writeSprintBacklog(tdd, { sprint: SPRINT, features: [{ id: "F6-split-tracking-code" }] });
    writeRequest("F6-split-tracking-code");
    // Only candidate FP estimates exist (as after sprint 1): committed feature unsized.
    writeEstimates(tdd, [{ feature_id: "FP1", size: "M" }, { feature_id: "FP2", size: "S" }]);
    expect(deriveSprintPlanningState(tdd, SPRINT).planning?.committedEstimated).toBe(false);
    // Now the Architect sizes the COMMITTED feature by its real id -> satisfied.
    writeEstimates(tdd, [
      { feature_id: "FP1", size: "M" },
      { feature_id: "F6-split-tracking-code", size: "L" },
    ]);
    expect(deriveSprintPlanningState(tdd, SPRINT).planning?.committedEstimated).toBe(true);
  });

  it("syncBacklog projects the backlog from committed requests + Architect sizes", () => {
    // The deterministic sync-backlog step: backlog = features that have a
    // feature-request.md (the PO's commitment), enriched with t-shirt sizes.
    writeRequest("F1-a");
    writeRequest("F2-b");
    writeEstimates(tdd, [
      { feature_id: "F1-a", size: "M" },
      { feature_id: "F2-b", size: "S" },
      { feature_id: "F3-uncommitted", size: "L" }, // estimated but no request -> not in backlog
    ]);
    const backlog = syncBacklog(tdd, SPRINT);
    expect(backlog.features).toEqual([{ id: "F1-a", size: "M" }, { id: "F2-b", size: "S" }]);
    // Persisted + read back identically; requestsAuthored now true.
    expect(readSprintBacklog(tdd, SPRINT).features).toEqual([{ id: "F1-a", size: "M" }, { id: "F2-b", size: "S" }]);
    expect(deriveSprintPlanningState(tdd, SPRINT).planning?.requestsAuthored).toBe(true);
  });

  it("syncBacklog SCOPES to the sprint's requested.json (a later sprint excludes an earlier sprint's built feature)", () => {
    // Multi-sprint regression: F1 was built in sprint 1 and its feature-request.md
    // stays on disk. Sprint 2 supplied only F6, recorded in sprints/<S>/requested.json.
    // syncBacklog must project ONLY F6 for sprint 2 (not re-drive F1).
    writeRequest("F1-stock");
    writeRequest("F6-split");
    mkdirSync(join(tdd, "sprints", SPRINT), { recursive: true });
    writeFileSync(join(tdd, "sprints", SPRINT, "requested.json"), JSON.stringify(["F6-split"]));
    expect(syncBacklog(tdd, SPRINT).features).toEqual([{ id: "F6-split" }]);
  });

  it("gateApproved when the sprint plan gate is approved", () => {
    writeSprintGates({ sprint: SPRINT, schema_version: 1, gates: { plan: { status: "approved", history: [] } } }, { consortDir: tdd });
    expect(deriveSprintPlanningState(tdd, SPRINT).planning?.gateApproved).toBe(true);
  });

  it("threads skipSizing onto the planning state, DEFAULT FALSE (sizing is ON, --no-sizing opts out)", () => {
    // The policy is carried on PlanningState (not derived from disk) so
    // nextTransition can route proposed -> author-requests with no estimate.
    // Sizing is ON by default; a caller opts OUT with skipSizing: true (--no-sizing).
    expect(deriveSprintPlanningState(tdd, SPRINT).planning?.skipSizing).toBe(false);
    expect(deriveSprintPlanningState(tdd, SPRINT, { skipSizing: true }).planning?.skipSizing).toBe(true);
  });
});

describe("runSprint (pure over SprintEffects)", () => {
  it("plans first, then claims + drives each backlog feature in order (proxy: no gate halts)", async () => {
    const calls: string[] = [];
    const effects: SprintEffects = {
      async drivePlanning() {
        calls.push("plan");
        return {};
      },
      async readBacklog() {
        return ["F1-a", "F2-b"];
      },
      async claimFeature(f) {
        calls.push(`claim:${f}`);
      },
      async driveFeature(f) {
        calls.push(`drive:${f}`);
        return {};
      },
    };
    const result = await runSprint(effects);
    expect(result.features).toEqual(["F1-a", "F2-b"]);
    expect(result.pendingGate).toBeUndefined();
    expect(calls).toEqual(["plan", "claim:F1-a", "drive:F1-a", "claim:F2-b", "drive:F2-b"]);
  });

  it("SKIPS an already-shipped feature (no re-claim, no re-drive) and drives the rest (FEIP-8022)", async () => {
    const calls: string[] = [];
    const result = await runSprint({
      async drivePlanning() { calls.push("plan"); return {}; },
      async readBacklog() { return ["F1-a", "F2-b"]; },
      async isFeatureShipped(f) { return f === "F1-a"; }, // F1 already shipped
      async claimFeature(f) { calls.push(`claim:${f}`); },
      async driveFeature(f) { calls.push(`drive:${f}`); return {}; },
      onSkip: (f) => calls.push(`skip:${f}`),
    });
    expect(result.features).toEqual(["F1-a", "F2-b"]);
    expect(result.skipped).toEqual(["F1-a"]);
    // F1 is NOT claimed or driven; F2 runs normally.
    expect(calls).toEqual(["plan", "skip:F1-a", "claim:F2-b", "drive:F2-b"]);
  });

  it("a fully-shipped sprint (EVERY feature shipped) skips all and reports complete – no re-drive, no error", async () => {
    // Re-pointing --sprint at a finished sprint: with the claim cleared, isFeatureShipped
    // returns true for every backlog feature (see shippedByClearedClaim). runSprint must
    // skip them ALL and return cleanly (no pendingGate/pendingInput/escalation), so the CLI
    // reports "complete" (exit 0) instead of re-driving a shipped feature and erroring.
    const calls: string[] = [];
    const result = await runSprint({
      async drivePlanning() { calls.push("plan"); return {}; },
      async readBacklog() { return ["F1-a", "F2-b"]; },
      async isFeatureShipped() { return true; }, // whole sprint already shipped
      async claimFeature(f) { calls.push(`claim:${f}`); },
      async driveFeature(f) { calls.push(`drive:${f}`); return {}; },
      onSkip: (f) => calls.push(`skip:${f}`),
    });
    expect(result.features).toEqual(["F1-a", "F2-b"]);
    expect(result.skipped).toEqual(["F1-a", "F2-b"]);
    expect(result.pendingGate).toBeUndefined();
    expect(result.pendingInput).toBeUndefined();
    expect(result.escalated).toBeUndefined();
    // NOTHING claimed or driven – all skipped.
    expect(calls).toEqual(["plan", "skip:F1-a", "skip:F2-b"]);
  });

  it("commits+pushes the authored requests AFTER planning and BEFORE any feature is claimed", async () => {
    // A feature forks from origin/<parent>, so the PO/proxy-authored requests must
    // be pushed to origin before the first claim or the fork inherits nothing.
    const calls: string[] = [];
    const result = await runSprint({
      async drivePlanning() { calls.push("plan"); return {}; },
      async commitAndPushRequests() { calls.push("push-requests"); },
      async readBacklog() { return ["F1-a", "F2-b"]; },
      async claimFeature(f) { calls.push(`claim:${f}`); },
      async driveFeature(f) { calls.push(`drive:${f}`); return {}; },
    });
    expect(result.features).toEqual(["F1-a", "F2-b"]);
    expect(calls).toEqual(["plan", "push-requests", "claim:F1-a", "drive:F1-a", "claim:F2-b", "drive:F2-b"]);
  });

  it("an empty backlog plans then does nothing", async () => {
    const calls: string[] = [];
    const result = await runSprint({
      async drivePlanning() { calls.push("plan"); return {}; },
      async readBacklog() { return []; },
      async claimFeature() { calls.push("claim"); },
      async driveFeature() { calls.push("drive"); return {}; },
    });
    expect(result.features).toEqual([]);
    expect(calls).toEqual(["plan"]);
  });

  it("interactive: halts at the plan gate before any feature work", async () => {
    const calls: string[] = [];
    const planGate = { kind: "approve-plan-gate" as const };
    const result = await runSprint({
      async drivePlanning() { calls.push("plan"); return { pendingGate: planGate }; },
      async commitAndPushRequests() { calls.push("push-requests"); },
      async readBacklog() { calls.push("backlog"); return ["F1-a"]; },
      async claimFeature() { calls.push("claim"); },
      async driveFeature() { calls.push("drive"); return {}; },
    });
    expect(result.pendingGate).toEqual(planGate);
    // Halted at the plan gate: no push (requests not yet approved), no backlog/feature work.
    expect(calls).toEqual(["plan"]);
  });

  it("interactive: halts (pendingInput) when planning pauses for the PO's author-requests", async () => {
    // Regression (Finding 5): the interactive stop after `estimate` is the PO's
    // author-requests (a human-INPUT action, not an approval gate). Before the fix
    // runSprint saw pendingGate undefined, fell through to readBacklog + the (empty)
    // feature loop, and reported a COMPLETE sprint despite producing nothing. It
    // must halt with pendingInput and touch neither push, backlog, nor features.
    const calls: string[] = [];
    const authorRequests = { kind: "invoke-role" as const, role: "product-owner" as const, mode: "author-requests" as const };
    const result = await runSprint({
      async drivePlanning() { calls.push("plan"); return { pendingInput: authorRequests }; },
      async commitAndPushRequests() { calls.push("push-requests"); },
      async readBacklog() { calls.push("backlog"); return ["F1-a"]; },
      async claimFeature() { calls.push("claim"); },
      async driveFeature() { calls.push("drive"); return {}; },
    });
    expect(result.pendingInput).toEqual(authorRequests);
    expect(result.pendingGate).toBeUndefined();
    expect(result.features).toEqual([]);
    expect(calls).toEqual(["plan"]);
  });

  it("halts (escalated) on the feature that RAISED TO HIL; never advances to the next", async () => {
    // Regression: a deploy-verify failure raises to HIL. driveFeature must report
    // escalated so the sprint STOPS on that feature. Before the fix it returned
    // "complete" (pendingGate undefined) and advanced, and the next feature's
    // claim tripped `already-claimed-other` on the still-open feature.
    const calls: string[] = [];
    const escalation = { kind: "raise-to-hil" as const, source: "deploy-verify", reason: "feature-verify FAILED" };
    const result = await runSprint({
      async drivePlanning() { return {}; },
      async readBacklog() { return ["F1-a", "F2-b"]; },
      async claimFeature(f) { calls.push(`claim:${f}`); },
      async driveFeature(f) {
        calls.push(`drive:${f}`);
        return f === "F1-a" ? { escalated: true, escalation } : {};
      },
    });
    expect(result.escalated).toBe(true);
    expect(result.escalation).toEqual(escalation);
    expect(result.pendingFeature).toBe("F1-a");
    // Stops on F1-a's escalation; F2-b is never claimed or driven.
    expect(calls).toEqual(["claim:F1-a", "drive:F1-a"]);
  });

  it("halts (escalated) when PLANNING raises to HIL, before any feature", async () => {
    const calls: string[] = [];
    const escalation = { kind: "raise-to-hil" as const, source: "planning", reason: "blocking smell" };
    const result = await runSprint({
      async drivePlanning() { calls.push("plan"); return { escalated: true, escalation }; },
      async commitAndPushRequests() { calls.push("push-requests"); },
      async readBacklog() { calls.push("backlog"); return ["F1-a"]; },
      async claimFeature() { calls.push("claim"); },
      async driveFeature() { calls.push("drive"); return {}; },
    });
    expect(result.escalated).toBe(true);
    expect(result.features).toEqual([]);
    // No push, no backlog, no feature work.
    expect(calls).toEqual(["plan"]);
  });

  it("interactive: halts on the feature whose gate is pending (resumable)", async () => {
    const calls: string[] = [];
    const gate = { kind: "accept" as const, story: "S1" };
    const result = await runSprint({
      async drivePlanning() { return {}; },
      async readBacklog() { return ["F1-a", "F2-b"]; },
      async claimFeature(f) { calls.push(`claim:${f}`); },
      async driveFeature(f) {
        calls.push(`drive:${f}`);
        return f === "F1-a" ? { pendingGate: gate } : {};
      },
    });
    expect(result.pendingGate).toEqual(gate);
    expect(result.pendingFeature).toBe("F1-a");
    // Stops on F1-a's gate; never advances to F2-b.
    expect(calls).toEqual(["claim:F1-a", "drive:F1-a"]);
  });
});

describe("deriveSprintPlanningState threads uiTrack + designGuideReady (planning-lane UX establish routing)", () => {
  // REGRESSION (the dead planning-lane establish): the sprint/planning state never set state.uiTrack,
  // so orchestrator-drive `:332` (intakeReady && uiTrack && !designGuideReady) was ALWAYS false and the
  // ux-designer establish never fired on UI projects — the drive went PO intake -> intake gate ->
  // spec-author, skipping the establish (verified live on stockflow-demo, uiTrack:true in config).
  // deriveSprintPlanningState now resolves BOTH from its own consortDir so no caller can omit them.
  function uiProject(uiTrack: boolean): string {
    const proj = mkdtempSync(join(tmpdir(), "planproj-"));
    const consortDir = join(proj, ".consort");
    mkdirSync(consortDir, { recursive: true });
    mkdirSync(join(proj, ".lakebase"), { recursive: true });
    writeFileSync(join(proj, ".lakebase", "consort-config.json"), JSON.stringify({ project: { uiTrack } }));
    // intake authored (intakeReady) but NOT approved, no design-guide yet.
    writeFileSync(join(consortDir, "product-overview.md"), "# Overview\n");
    writeFileSync(join(consortDir, "nfrs.md"), "# NFRs\n");
    return consortDir;
  }

  it("UI track (uiTrack:true) + intake ready + no design-guide => state carries uiTrack & routes the ux-designer ESTABLISH (before the gate)", () => {
    const consortDir = uiProject(true);
    const s = deriveSprintPlanningState(consortDir, SPRINT);
    expect(s.uiTrack).toBe(true);
    expect(s.designGuideReady).toBe(false);
    expect(nextTransition(s)).toEqual({ kind: "invoke-role", role: "ux-designer", mode: "establish" });
  });

  it("non-UI (uiTrack:false) => establish is NOT routed; parks at the intake gate", () => {
    const consortDir = uiProject(false);
    const s = deriveSprintPlanningState(consortDir, SPRINT);
    expect(s.uiTrack).toBe(false);
    expect(nextTransition(s)).toEqual({ kind: "approve-intake-gate" });
  });
});
