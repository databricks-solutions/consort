// P2c optimize.cli pure core: argument parsing, sweep-spec parsing, and the
// action -> HandoffPlan mapping. The live glue (runTrial spawns a real turn via
// execRunner, recordWinner re-runs with recording on, snapshot forks a branch) is
// exercised by the P2d hermetic-design + P3 live-cloud validation, not here – here
// we pin the deterministic pieces the CLI is built on.

import { describe, expect, it } from "vitest";

import {
  parseOptimizeArgs,
  parseSweepSpec,
} from "../../bin/consort/optimize.cli";
import { actionToHandoffPlan } from "../../consort/optimize/handoff.js";

describe("parseOptimizeArgs", () => {
  it("parses the core flags", () => {
    const a = parseOptimizeArgs([
      "--scenario", "stockflow-optimize",
      "--feature", "F1-stock-visibility",
      "--trials", "3",
      "--only", "build",
    ]);
    expect(a.scenario).toBe("stockflow-optimize");
    expect(a.feature).toBe("F1-stock-visibility");
    expect(a.trials).toBe(3);
    expect(a.only).toBe("build");
  });

  it("defaults trials to 3 and only to undefined (both lanes)", () => {
    const a = parseOptimizeArgs(["--scenario", "s", "--feature", "F1"]);
    expect(a.trials).toBe(3);
    expect(a.only).toBeUndefined();
  });

  it("captures --dry-run + --handoff + --candidates", () => {
    const a = parseOptimizeArgs([
      "--scenario", "s", "--feature", "F1",
      "--handoff", "S1-green",
      "--candidates", "driver.green.model=haiku,sonnet",
      "--dry-run",
    ]);
    expect(a.dryRun).toBe(true);
    expect(a.handoff).toBe("S1-green");
    expect(a.candidates).toBe("driver.green.model=haiku,sonnet");
  });
});

describe("parseSweepSpec", () => {
  it("parses a per-turn model sweep", () => {
    const s = parseSweepSpec("driver.green.model=haiku,sonnet");
    expect(s.role).toBe("driver");
    expect(s.models?.green).toEqual(["haiku", "sonnet"]);
  });

  it("parses a per-turn effort sweep", () => {
    const s = parseSweepSpec("navigator.review.effort=low,medium");
    expect(s.role).toBe("navigator");
    expect(s.efforts?.review).toEqual(["low", "medium"]);
  });

  it("parses session-warmth + loop dimensions", () => {
    const s = parseSweepSpec("build.sessionScope=story,cycle;build.loopGranularity=ac");
    expect(s.sessionScopes).toEqual(["story", "cycle"]);
    expect(s.loopGranularities).toEqual(["ac"]);
  });

  it("parses contextFreeFraction", () => {
    const s = parseSweepSpec("env.CONTEXT_FREE_FRACTION=0.3,0.5");
    expect(s.contextFreeFractions).toEqual([0.3, 0.5]);
  });

  it("an empty spec yields an empty sweep (baseline only after generateCandidates)", () => {
    expect(parseSweepSpec("")).toEqual({});
  });

  it("combines multiple dimensions separated by ;", () => {
    const s = parseSweepSpec("driver.green.model=haiku;driver.green.effort=low,medium");
    expect(s.role).toBe("driver");
    expect(s.models?.green).toEqual(["haiku"]);
    expect(s.efforts?.green).toEqual(["low", "medium"]);
  });
});

describe("actionToHandoffPlan", () => {
  it("maps a build GREEN (driver) turn", () => {
    const p = actionToHandoffPlan({ kind: "invoke-role", role: "driver", story: "S1" });
    expect(p).toMatchObject({ id: "S1-driver-green", role: "driver", story: "S1", buildMode: "green" });
  });

  it("maps a navigator REVIEW turn", () => {
    const p = actionToHandoffPlan({ kind: "invoke-role", role: "navigator", story: "S1", buildMode: "review" });
    expect(p).toMatchObject({ id: "S1-navigator-review", role: "navigator", story: "S1", buildMode: "review" });
  });

  it("maps a design story turn (spec-author)", () => {
    const p = actionToHandoffPlan({ kind: "invoke-role", role: "spec-author", story: "S1" });
    expect(p).toMatchObject({ id: "S1-spec-author", role: "spec-author", story: "S1" });
  });

  it("maps a design feature turn (ux-designer, no story)", () => {
    const p = actionToHandoffPlan({ kind: "invoke-role", role: "ux-designer", mode: "establish" });
    expect(p).toMatchObject({ id: "ux-designer", role: "ux-designer" });
  });

  it("carries the resolved action so the walk runs the PINNED turn (never re-plans)", () => {
    const action = { kind: "invoke-role", role: "spec-author", story: "S1" } as const;
    const p = actionToHandoffPlan(action);
    // The plan pins the exact action, so makeLiveSpawnTurn runs THIS role turn – not
    // whatever planNextAction would return for the current (possibly-advanced) disk.
    expect(p?.action).toEqual(action);
  });

  it("returns null for a non-invoke-role action (a gate / project-notes step)", () => {
    expect(actionToHandoffPlan({ kind: "approve-gate", story: "S1" })).toBeNull();
    expect(actionToHandoffPlan({ kind: "surface-gate", story: "S1" })).toBeNull();
  });
});
