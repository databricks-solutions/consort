// BDD coverage for the sprint-stop snapshot scoping (the sprint-2 dashboard bug):
// a workflow-state feature claim shadows the sprint-planning snapshot ONLY while
// the claimed feature is still IN FLIGHT. Once the claimed feature is merged
// (complete), its leftover feature_id is stale, and a NEW sprint's planning stop
// (e.g. sprint-2's intake gate) must emit the planning snapshot, not the
// completed feature's "done" snapshot.

import { describe, it, expect } from "vitest";
import { claimActiveForSnapshot } from "../../bin/consort/drive.cli.js";

describe("claimActiveForSnapshot", () => {
  it("a MERGED claim is stale: returns undefined (emit the sprint-planning snapshot)", () => {
    expect(claimActiveForSnapshot({ feature_id: "F1-stock-visibility", state: "merged" })).toBeUndefined();
  });

  it("an IN-FLIGHT claim shadows the planning snapshot (feature-claimed / pr-ready / ci-green)", () => {
    expect(claimActiveForSnapshot({ feature_id: "F1-stock-visibility", state: "feature-claimed" })).toBe("F1-stock-visibility");
    expect(claimActiveForSnapshot({ feature_id: "F1-stock-visibility", state: "pr-ready" })).toBe("F1-stock-visibility");
    expect(claimActiveForSnapshot({ feature_id: "F1-stock-visibility", state: "ci-green" })).toBe("F1-stock-visibility");
  });

  it("no claim at all returns undefined (planning snapshot; absent or empty feature_id)", () => {
    expect(claimActiveForSnapshot(undefined)).toBeUndefined();
    expect(claimActiveForSnapshot(null)).toBeUndefined();
    expect(claimActiveForSnapshot({ state: "scaffold-complete" })).toBeUndefined();
    expect(claimActiveForSnapshot({ feature_id: "  ", state: "feature-claimed" })).toBeUndefined();
  });
});
