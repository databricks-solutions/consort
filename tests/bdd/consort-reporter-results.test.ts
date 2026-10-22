// The post-verify reconciler (reconcileTestResultsFromReporter) corrects the agent-log's per-test
// `test.result` trail from the TEST RUNNER'S OWN truth (`.consort/test-run.jsonl`), so a test that
// actually re-ran green during a whole-suite GREEN/REFACTOR verify clears a stale red bubble — even
// when it is NOT a test of the cycle that just transitioned. It is ADDITIVE to the cycle-scoped
// declaration (run-cycle.ts logTestResults), emits only DELTAS (no 68-repeats-per-verify churn),
// attributes each id to its owning story via the per-story test-lists, and SKIPS a cross-feature
// reused id it cannot disambiguate by scenario_file (fail-safe: no wrong green). This closes the
// "Driver said green, dashboard still red" gap for the suite's non-cycle tests.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reconcileTestResultsFromReporter } from "../../consort/pipeline/reporter-results.js";
import { emitAgentLogEvent, readAgentLog } from "../../consort/logging/agent-log.js";

let consortDir: string;

function writeStoryList(
  featureId: string,
  storyId: string,
  items: Array<{ id: string; ac_id: string; scenario_file?: string }>,
): void {
  const dir = join(consortDir, "features", featureId, "stories", storyId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "test-list-per-story.json"),
    JSON.stringify({ feature_id: featureId, story_id: storyId, items }, null, 2) + "\n",
  );
}

function writeReporter(lines: Array<{ test_id: string; status: string; file?: string; ts?: string }>): void {
  mkdirSync(consortDir, { recursive: true });
  writeFileSync(
    join(consortDir, "test-run.jsonl"),
    lines
      .map((l) => JSON.stringify({ ts: l.ts ?? "2026-10-22T12:00:00.000Z", test_id: l.test_id, status: l.status, file: l.file ?? "", kind: "client" }))
      .join("\n") + "\n",
  );
}

/** The LATEST test.result status per (feature|story|test_id) in the agent-log, in stream order. */
function foldTrail(): Map<string, string> {
  const out = new Map<string, string>();
  for (const e of readAgentLog({ consortDir })) {
    if (e.event !== "test.result") continue;
    const md = e.metadata ?? {};
    out.set(`${md.feature_id ?? ""}|${md.story_id}|${md.test_id}`, String(md.status));
  }
  return out;
}

function countTrail(): number {
  return readAgentLog({ consortDir }).filter((e) => e.event === "test.result").length;
}

beforeEach(() => {
  consortDir = join(mkdtempSync(join(tmpdir(), "reporter-results-")), ".consort");
  mkdirSync(consortDir, { recursive: true });
});
afterEach(() => rmSync(join(consortDir, ".."), { recursive: true, force: true }));

describe("reconcileTestResultsFromReporter corrects the per-test trail from the runner truth", () => {
  it("clears a stale red to green when the suite re-ran that test green", () => {
    writeStoryList("F6", "S2", [{ id: "T41", ac_id: "AC4", scenario_file: "client/tests/components/SkuDetail.test.tsx" }]);
    // stale: an earlier cycle declared T41 red
    emitAgentLogEvent(
      { role: "navigator", level: "info", event: "test.result", feature_id: "F6", slots: { test_id: "T41", status: "red", story_id: "S2", ac_id: "AC4" } },
      { consortDir },
    );
    // the runner then re-ran T41 green in a later whole-suite verify
    writeReporter([{ test_id: "T41", status: "green", file: "client/tests/components/SkuDetail.test.tsx" }]);

    reconcileTestResultsFromReporter(consortDir, "driver");

    expect(foldTrail().get("F6|S2|T41")).toBe("green");
  });

  it("emits only deltas — no event when the trail already matches the runner", () => {
    writeStoryList("F6", "S2", [{ id: "T41", ac_id: "AC4" }]);
    emitAgentLogEvent(
      { role: "driver", level: "info", event: "test.result", feature_id: "F6", slots: { test_id: "T41", status: "green", story_id: "S2", ac_id: "AC4" } },
      { consortDir },
    );
    writeReporter([{ test_id: "T41", status: "green" }]);
    const before = countTrail();

    reconcileTestResultsFromReporter(consortDir, "driver");

    expect(countTrail()).toBe(before); // already green -> no churn
  });

  it("attributes a reused id across features by scenario_file, never mis-attributing", () => {
    // T44 exists in BOTH F1 (a client e2e) and F6/S3 (a behavior test, no scenario_file).
    writeStoryList("F1", "S2", [{ id: "T44", ac_id: "AC1", scenario_file: "client/tests/e2e/stock-by-location-table.spec.ts" }]);
    writeStoryList("F6", "S3", [{ id: "T44", ac_id: "AC1-tracking-code-dropped" }]);
    // the reporter line for the client e2e names its scenario file -> must land on F1, not F6
    writeReporter([{ test_id: "T44", status: "green", file: "client/tests/e2e/stock-by-location-table.spec.ts" }]);

    reconcileTestResultsFromReporter(consortDir, "driver");

    const trail = foldTrail();
    expect(trail.get("F1|S2|T44")).toBe("green");
    expect(trail.has("F6|S3|T44")).toBe(false); // the ambiguous owner is NOT touched
  });

  it("skips a reused id that cannot be disambiguated (no matching scenario_file)", () => {
    writeStoryList("F1", "S2", [{ id: "T44", ac_id: "AC1", scenario_file: "client/tests/e2e/a.spec.ts" }]);
    writeStoryList("F6", "S3", [{ id: "T44", ac_id: "AC1", scenario_file: "client/tests/e2e/b.spec.ts" }]);
    // reporter file matches NEITHER owner -> cannot resolve -> emit nothing
    writeReporter([{ test_id: "T44", status: "green", file: "client/tests/e2e/unrelated.spec.ts" }]);

    reconcileTestResultsFromReporter(consortDir, "driver");

    expect(countTrail()).toBe(0);
  });

  it("records a regression (green -> red) the runner reports", () => {
    writeStoryList("F6", "S2", [{ id: "T30", ac_id: "AC1", scenario_file: "client/tests/e2e/home-batch-serial.spec.ts" }]);
    emitAgentLogEvent(
      { role: "driver", level: "info", event: "test.result", feature_id: "F6", slots: { test_id: "T30", status: "green", story_id: "S2", ac_id: "AC1" } },
      { consortDir },
    );
    writeReporter([{ test_id: "T30", status: "red", file: "client/tests/e2e/home-batch-serial.spec.ts" }]);

    reconcileTestResultsFromReporter(consortDir, "driver");

    expect(foldTrail().get("F6|S2|T30")).toBe("red");
  });

  it("ignores a `running` line (live-edge only, not settled history)", () => {
    writeStoryList("F6", "S2", [{ id: "T30", ac_id: "AC1" }]);
    writeReporter([{ test_id: "T30", status: "running" }]);

    reconcileTestResultsFromReporter(consortDir, "driver");

    expect(countTrail()).toBe(0);
  });

  it("is a no-op when there is no reporter tail (replay / no run yet)", () => {
    writeStoryList("F6", "S2", [{ id: "T30", ac_id: "AC1" }]);
    reconcileTestResultsFromReporter(consortDir, "driver");
    expect(countTrail()).toBe(0);
  });
});
