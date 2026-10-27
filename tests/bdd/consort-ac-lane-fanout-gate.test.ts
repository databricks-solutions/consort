import { describe, it, expect } from "vitest";
import { shouldFanOutAcLanes, type AcLaneFanOutGate } from "../../consort/experiment/ac-lane-coordinator";

// The parallel per-AC fan-out TRIGGER (#5). Twice the fan-out silently did NOT fire and a
// contract story built SERIALLY — once because a stale/ambient CONSORT_SCOPE_AC tripped the
// re-entrancy guard, once because a committed `.ac-lanes-done` marker was restored by
// `git reset --hard`. Both were invisible until a live build was investigated turns in. The
// decision is now this pure predicate, exercised here so the regressions can never return.

const base = (): AcLaneFanOutGate => ({
  leverOn: true,
  isContractStory: true,
  role: "navigator",
  hasBuildMode: false,
  isSubLane: false,
  acCount: 3,
  markerExists: false,
});

describe("shouldFanOutAcLanes — the parallel-lane fan-out trigger", () => {
  it("fans out on a clean contract build turn (lever on, >=3 ACs, plain RED/GREEN)", () => {
    expect(shouldFanOutAcLanes(base())).toBe(true);
    expect(shouldFanOutAcLanes({ ...base(), role: "driver" })).toBe(true);
  });

  it("does NOT fan out when the lever is off", () => {
    expect(shouldFanOutAcLanes({ ...base(), leverOn: false })).toBe(false);
  });

  it("does NOT fan out for a non-contract story (no serial-first migration AC)", () => {
    expect(shouldFanOutAcLanes({ ...base(), isContractStory: false })).toBe(false);
  });

  it("does NOT fan out for a non-build role or a non-plain build turn", () => {
    expect(shouldFanOutAcLanes({ ...base(), role: "spec-author" })).toBe(false);
    expect(shouldFanOutAcLanes({ ...base(), hasBuildMode: true })).toBe(false);
  });

  it("needs at least minAcs ACs (serial-first + >=2 lanes), default 3", () => {
    expect(shouldFanOutAcLanes({ ...base(), acCount: 2 })).toBe(false);
    expect(shouldFanOutAcLanes({ ...base(), acCount: 3 })).toBe(true);
    expect(shouldFanOutAcLanes({ ...base(), acCount: 3, minAcs: 4 })).toBe(false);
  });

  // REGRESSION 1 — re-entrancy is keyed on the coordinator's CONSORT_AC_LANE sentinel.
  it("does NOT re-fan when it IS a coordinator sub-lane (isSubLane)", () => {
    expect(shouldFanOutAcLanes({ ...base(), isSubLane: true })).toBe(false);
  });

  // REGRESSION 1 (the fix) — a stale/ambient CONSORT_SCOPE_AC is NOT a gate input at all, so
  // a TOP-LEVEL drive that merely inherited a leaked scope var still fans out. The ONLY
  // re-entrancy signal is the sentinel above; the gate has no scope field by design.
  it("still fans out at top level regardless of any ambient scope (only the sentinel gates)", () => {
    expect("scope" in base()).toBe(false);
    expect(shouldFanOutAcLanes({ ...base(), isSubLane: false })).toBe(true);
  });

  // REGRESSION 2 — the once-per-story marker (read from gitignored runtime state) blocks a
  // re-trigger after the fan-out ran this run; a post-fan-out partial never re-fans.
  it("does NOT re-fan once the per-story marker exists", () => {
    expect(shouldFanOutAcLanes({ ...base(), markerExists: true })).toBe(false);
  });

  // REGRESSION 3 (resume/replay) — a FRESH run fans out at story-zero on a plain RED turn
  // (no buildMode). A run RESUMED from the fan-out-begin anchor re-enters with the serial-first
  // AC already built, so the pending turn is that AC's per-AC REVIEW (hasBuildMode true). The
  // serialFirstReview flag marks THAT review as a legitimate fan-out trigger, so the recorded
  // anchor is replayable without re-authoring the serial-first AC.
  it("fans out on the serial-first AC's review turn when resumed (serialFirstReview)", () => {
    // Plain hasBuildMode still blocks (regression guard above) ...
    expect(shouldFanOutAcLanes({ ...base(), hasBuildMode: true })).toBe(false);
    // ... but the serial-first AC's review (the resume entry) fans out.
    expect(shouldFanOutAcLanes({ ...base(), hasBuildMode: true, serialFirstReview: true })).toBe(true);
    // The marker still wins over the resume trigger (no post-fan-out re-trigger).
    expect(shouldFanOutAcLanes({ ...base(), hasBuildMode: true, serialFirstReview: true, markerExists: true })).toBe(false);
  });
});
