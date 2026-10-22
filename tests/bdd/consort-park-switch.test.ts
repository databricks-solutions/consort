// parkAndSwitch is the consort half of "shelve a built-but-undeployed feature and go drive another":
// it frees the SCM claim (keeping the branch, via an injected lk-shim park) AND re-points the consort
// bookkeeping (next.json) at the target feature so the dashboard follows the switch — closing the
// staleness the adopt-based workaround left (the dashboard kept showing the PRIOR claimed feature).
// Order matters: a bad target fails loud BEFORE the claim is parked; a park failure leaves the
// bookkeeping untouched (no half-switch).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parkAndSwitch,
  resolveCanonicalFeature,
  ParkSwitchError,
} from "../../consort/orchestrator/status/park-switch.js";

let consortDir: string;

function makeFeatureDir(id: string): void {
  mkdirSync(join(consortDir, "features", id, "stories"), { recursive: true });
}

beforeEach(() => {
  consortDir = join(mkdtempSync(join(tmpdir(), "park-switch-")), ".consort");
  mkdirSync(consortDir, { recursive: true });
});
afterEach(() => rmSync(join(consortDir, ".."), { recursive: true, force: true }));

describe("resolveCanonicalFeature", () => {
  it("resolves a user-typed id to the .consort/features/<F> directory basename", () => {
    makeFeatureDir("F6-split-tracking-code");
    expect(resolveCanonicalFeature(consortDir, "F6-split-tracking-code")).toBe("F6-split-tracking-code");
  });

  it("throws unknown-target-feature for a feature with no directory", () => {
    makeFeatureDir("F6-split-tracking-code");
    expect(() => resolveCanonicalFeature(consortDir, "F9-nope")).toThrow(ParkSwitchError);
    try {
      resolveCanonicalFeature(consortDir, "F9-nope");
    } catch (e) {
      expect((e as ParkSwitchError).code).toBe("unknown-target-feature");
    }
  });
});

describe("parkAndSwitch", () => {
  it("parks the current claim then re-points next.json at the canonical target", async () => {
    makeFeatureDir("F7-next-feature");
    const parkClaim = vi.fn().mockResolvedValue(undefined);
    const repointNext = vi.fn();
    const result = await parkAndSwitch(
      { consortDir, toFeature: "F7-next-feature" },
      { readClaimedFeature: () => "F6-split-tracking-code", parkClaim, repointNext },
    );
    expect(parkClaim).toHaveBeenCalledTimes(1);
    expect(repointNext).toHaveBeenCalledWith("F7-next-feature");
    expect(result).toEqual({ parkedFeatureId: "F6-split-tracking-code", switchedToFeatureId: "F7-next-feature" });
  });

  it("validates the target BEFORE parking (a typo never strands the claim)", async () => {
    const parkClaim = vi.fn().mockResolvedValue(undefined);
    const repointNext = vi.fn();
    await expect(
      parkAndSwitch(
        { consortDir, toFeature: "F9-nope" },
        { readClaimedFeature: () => "F6", parkClaim, repointNext },
      ),
    ).rejects.toMatchObject({ code: "unknown-target-feature" });
    expect(parkClaim).not.toHaveBeenCalled();
    expect(repointNext).not.toHaveBeenCalled();
  });

  it("does NOT repoint when the park fails (no half-switch)", async () => {
    makeFeatureDir("F7-next-feature");
    const parkClaim = vi.fn().mockRejectedValue(new Error("dirty-working-tree"));
    const repointNext = vi.fn();
    await expect(
      parkAndSwitch(
        { consortDir, toFeature: "F7-next-feature" },
        { readClaimedFeature: () => "F6", parkClaim, repointNext },
      ),
    ).rejects.toMatchObject({ code: "park-failed" });
    expect(repointNext).not.toHaveBeenCalled();
  });

  it("reports parkedFeatureId null when nothing was claimed", async () => {
    makeFeatureDir("F7-next-feature");
    const result = await parkAndSwitch(
      { consortDir, toFeature: "F7-next-feature" },
      { readClaimedFeature: () => null, parkClaim: vi.fn().mockResolvedValue(undefined), repointNext: vi.fn() },
    );
    expect(result.parkedFeatureId).toBeNull();
    expect(result.switchedToFeatureId).toBe("F7-next-feature");
  });
});
