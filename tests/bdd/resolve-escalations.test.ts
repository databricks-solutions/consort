// resolveEscalations – the supported "clear a HIL halt after fixing its root cause"
// path (consort-resolve-escalation), replacing a hand `rm` of the record. It stamps
// resolved_at (+ optional note) and KEEPS the file; firstPendingEscalation ignores
// resolved records, so the drive stops pre-empting and retries.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync as readFileSyncNode } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { writeFileSync as fsWrite } from "fs";
import {
  writeEscalation,
  readEscalations,
  resolveEscalations,
  resolveBlockers,
  firstPendingEscalation,
  escalationsFromSmells,
} from "../../consort/gates/escalation";
import { resolveOpenSmells, hasOpenSmell } from "../../consort/smells/smells";
import { writeGreenFailure, readGreenFailure } from "../../consort/smells/supersession";
import { writeDeployVerifyAssessMarker, readDeployVerifyAssessMarker, markDeployVerifyAssessed } from "../../consort/smells/deploy-verify-assess";
import { writeReauthorMarker, readReauthorMarker, markReauthored } from "../../consort/smells/reauthor-resilience";

let tdd: string;
beforeEach(() => {
  tdd = mkdtempSync(join(tmpdir(), "resolve-esc-"));
});
afterEach(() => {
  rmSync(tdd, { recursive: true, force: true });
});

describe("resolveEscalations", () => {
  it("stamps resolved_at (keeping the record) so the escalation is no longer pending", () => {
    const e = writeEscalation(tdd, { source: "deploy-verify", reason: "port 8000 busy", feature_id: "F1" });
    expect(firstPendingEscalation(tdd)).not.toBeNull();

    const ids = resolveEscalations(tdd, { resolution: "freed port 8000" });
    expect(ids).toEqual([e.id]);
    // Record is KEPT (not deleted) – audit trail.
    expect(existsSync(join(tdd, "escalations", `${e.id}.json`))).toBe(true);
    const after = readEscalations(tdd).find((x) => x.id === e.id)!;
    expect(after.resolved_at).toBeTruthy();
    expect(after.resolution).toBe("freed port 8000");
    // No longer blocking.
    expect(firstPendingEscalation(tdd)).toBeNull();
  });

  it("scopes by id / feature / story; leaves non-matching escalations pending", () => {
    const a = writeEscalation(tdd, { source: "deploy-verify", reason: "a", feature_id: "F1", story_id: "S1" });
    const b = writeEscalation(tdd, { source: "driver-green", reason: "b", feature_id: "F2", story_id: "S9" });
    const ids = resolveEscalations(tdd, { id: a.id });
    expect(ids).toEqual([a.id]);
    // b is untouched / still pending.
    const remaining = readEscalations(tdd).filter((x) => !x.resolved_at).map((x) => x.id);
    expect(remaining).toEqual([b.id]);
  });

  it("no scope resolves ALL pending explicit escalations", () => {
    writeEscalation(tdd, { source: "deploy-verify", reason: "a", feature_id: "F1" });
    writeEscalation(tdd, { source: "driver-green", reason: "b", feature_id: "F2" });
    const ids = resolveEscalations(tdd, {});
    expect(ids).toHaveLength(2);
    expect(readEscalations(tdd).every((x) => x.resolved_at)).toBe(true);
  });

  it("is a no-op on an already-resolved escalation", () => {
    const e = writeEscalation(tdd, { source: "deploy-verify", reason: "a", feature_id: "F1" });
    resolveEscalations(tdd, { id: e.id });
    expect(resolveEscalations(tdd, { id: e.id })).toEqual([]); // nothing left pending
  });
});

describe("blocking-smell blockers (the dual-source rule – T27's kind)", () => {
  it("a blocking smell surfaces as a pending escalation and clears via resolveOpenSmells", () => {
    // A blocking reflect-gate smell (no escalation FILE) – the T27 case.
    fsWrite(
      join(tdd, "smells.json"),
      JSON.stringify({
        detected: [{ smell: "reflect-testlist-defect", story_id: "S2", ac_id: "AC1", detail: "T27 mis-anchored", detected_at: "2026-01-01T00:00:00Z" }],
      }),
    );
    // It is a pending blocker (what `consort-resolve-escalation --list` shows).
    const pending = escalationsFromSmells(tdd, "F1");
    expect(pending).toHaveLength(1);
    expect(pending[0].source).toBe("smell:reflect-testlist-defect");

    // Clearing it (kind:"cleared", the CLI's smell path) resolves the open entry and
    // it is no longer a pending blocker.
    expect(resolveOpenSmells(tdd, "reflect-testlist-defect", { story_id: "S2", kind: "cleared" })).toBe(1);
    expect(escalationsFromSmells(tdd, "F1")).toHaveLength(0);
  });
});

describe("writeEscalation: the record self-documents its resolve path (so a session never hand-edits it)", () => {
  it("stamps how_to_resolve pointing at consort-resolve-escalation --id <id>, and warns off hand-editing", () => {
    const e = writeEscalation(tdd, { source: "deploy-verify", reason: "port 8000 busy", feature_id: "F1" });
    expect(e.how_to_resolve).toContain("consort-resolve-escalation");
    expect(e.how_to_resolve).toContain(`--id ${e.id}`);
    expect(e.how_to_resolve ?? "").toMatch(/do NOT hand-edit/i);
    expect(e.how_to_resolve ?? "").toMatch(/smells\.json/i);
    // Persisted to disk (what a session opening the file directly actually reads), not just returned.
    const onDisk = readEscalations(tdd).find((x) => x.id === e.id);
    expect(onDisk?.how_to_resolve).toBe(e.how_to_resolve);
  });
});

describe("resolveBlockers: resolving by --id ALONE clears the backing smell (the thrash fix)", () => {
  it("a filed smell escalation resolved by id (no --feature) clears smells.json so the drive stops re-raising", () => {
    // The exact shape that thrashed: a blocking ux-adherence smell audited to BOTH a smells.json
    // entry AND an escalation FILE (feature F1 / story S1). Resolving by the file's --id alone used
    // to stamp the file's resolved_at but leave the smell open, so the drive re-raised it every tick.
    fsWrite(
      join(tdd, "smells.json"),
      JSON.stringify({
        detected: [{ smell: "ux-adherence", story_id: "S1", detail: "app shell is off-brand", detected_at: "2026-01-01T00:00:00Z" }],
      }),
    );
    const e = writeEscalation(tdd, { source: "smell:ux-adherence", reason: "blocking smell ux-adherence", feature_id: "F1", story_id: "S1" });
    expect(firstPendingEscalation(tdd)).not.toBeNull();
    expect(hasOpenSmell(tdd, "ux-adherence", "S1")).toBe(true);

    // Resolve with ONLY --id — no --feature / --story (the repro).
    const ids = resolveBlockers(tdd, { id: e.id });
    expect(ids).toContain(e.id);

    // The smell is now cleared, so escalationsFromSmells no longer re-raises it (no thrash).
    expect(hasOpenSmell(tdd, "ux-adherence", "S1")).toBe(false);
    expect(escalationsFromSmells(tdd, "F1")).toHaveLength(0);
    expect(firstPendingEscalation(tdd)).toBeNull();
  });

  it("the smell entry itself gains resolution_kind: 'cleared' (single source of truth, not just the file)", () => {
    fsWrite(
      join(tdd, "smells.json"),
      JSON.stringify({
        detected: [{ smell: "ux-adherence", story_id: "S1", detail: "off-brand", detected_at: "2026-01-01T00:00:00Z" }],
      }),
    );
    const e = writeEscalation(tdd, { source: "smell:ux-adherence", reason: "blocking", feature_id: "F1", story_id: "S1" });
    resolveBlockers(tdd, { id: e.id });
    const log = JSON.parse(readFileSyncNode(join(tdd, "smells.json"), "utf8")) as { detected: Array<{ resolution_kind?: string }> };
    expect(log.detected[0].resolution_kind).toBe("cleared");
  });
});

// A verify escalation (driver-green / driver-refactor / deploy-verify) is routed from a LATCHED failure
// marker (green-failure.json etc., assessed + fix-rounds exhausted), NOT from the escalation file: the
// drive's state-derivation re-reads that marker and re-raises WITHOUT re-running the verify. So stamping
// the file resolved alone left the marker, the next run re-derived raise-to-hil, and the verb's "retry the
// failed action fresh" promise was false (the live F6/S2 orphan-stamp case: the fix shipped in the dist
// never got to run because the verify never re-ran). resolveBlockers must clear the matching marker.
describe("resolveBlockers clears the LATCHED verify-failure marker (so the drive RE-RUNS the verify)", () => {
  it("driver-green: resolving the escalation clears the matching green-failure.json so the GREEN verify re-runs", () => {
    writeGreenFailure(tdd, "F1", "S1", "AC1", { assessed: true, summary: "GREEN verify FAILED against the running app", diagnosis: "orphan alembic stamp" });
    expect(readGreenFailure(tdd, "F1", "S1", "AC1")?.assessed).toBe(true);
    const e = writeEscalation(tdd, { source: "driver-green", reason: "GREEN verify failed", feature_id: "F1", story_id: "S1", ac_id: "AC1" });

    const ids = resolveBlockers(tdd, { id: e.id });
    expect(ids).toContain(e.id);
    // The latched marker is GONE — the next derivation routes to run-the-GREEN-verify, not raise-to-hil.
    expect(readGreenFailure(tdd, "F1", "S1", "AC1")).toBeUndefined();
    expect(firstPendingEscalation(tdd)).toBeNull();
  });

  it("driver-green WITHOUT ac_id (the raise-to-hil shape): clears ALL the story's green-failure markers", () => {
    // raise-to-hil writes a driver-green escalation with feature + story only (no ac_id), but the latch is
    // AC-keyed. The story-level clear must still lift it — the exact F6/S2 shape that re-raised each resume.
    writeGreenFailure(tdd, "F1", "S1", "AC1", { assessed: true, summary: "GREEN verify FAILED" });
    const e = writeEscalation(tdd, { source: "driver-green", reason: "GREEN verify failed for AC1 ...", feature_id: "F1", story_id: "S1" });
    expect(e.ac_id).toBeUndefined();

    resolveBlockers(tdd, { id: e.id });
    expect(readGreenFailure(tdd, "F1", "S1", "AC1")).toBeUndefined(); // story-level clear lifted the AC latch
    expect(firstPendingEscalation(tdd)).toBeNull();
  });

  it("scope safety: resolving S1's driver-green does NOT clear a sibling story's latched marker", () => {
    writeGreenFailure(tdd, "F1", "S1", "AC1", { assessed: true, summary: "x" });
    writeGreenFailure(tdd, "F1", "S2", "AC1", { assessed: true, summary: "y" });
    const e = writeEscalation(tdd, { source: "driver-green", reason: "r", feature_id: "F1", story_id: "S1", ac_id: "AC1" });

    resolveBlockers(tdd, { id: e.id });
    expect(readGreenFailure(tdd, "F1", "S1", "AC1")).toBeUndefined(); // cleared
    expect(readGreenFailure(tdd, "F1", "S2", "AC1")?.assessed).toBe(true); // untouched
  });

  it("deploy-verify: resolving the escalation clears the matching deploy-verify-assess marker", () => {
    // deploy-verify-assess markers live under features/<F>/stories/<S>/ — seed that dir.
    mkdirSync(join(tdd, "features", "F1", "stories", "S1"), { recursive: true });
    writeDeployVerifyAssessMarker(tdd, "F1", "S1", ["t1::test_a"]);
    markDeployVerifyAssessed(tdd, "F1", "S1"); // latched (assessed)
    expect(readDeployVerifyAssessMarker(tdd, "F1", "S1")?.assessed).toBe(true);
    const e = writeEscalation(tdd, { source: "deploy-verify", reason: "deploy verify failed", feature_id: "F1", story_id: "S1" });

    resolveBlockers(tdd, { id: e.id });
    expect(readDeployVerifyAssessMarker(tdd, "F1", "S1")).toBeUndefined(); // cleared -> re-deploy/re-verify
  });

  it("test-authoring-smell: resolving clears the spent reauthor-resilience marker so the smell re-checks fresh", () => {
    mkdirSync(join(tdd, "features", "F1", "stories", "S1"), { recursive: true });
    writeReauthorMarker(tdd, "F1", "S1", "AC4", ["x.spec.ts:1"], "await the success seam before the re-read");
    markReauthored(tdd, "F1", "S1", "AC4"); // attempts -> 1 (spent one-shot)
    expect(readReauthorMarker(tdd, "F1", "S1", "AC4")?.attempts).toBe(1);
    const e = writeEscalation(tdd, { source: "test-authoring-smell", reason: "resilience smell persists", feature_id: "F1", story_id: "S1", ac_id: "AC4" });

    resolveBlockers(tdd, { id: e.id });
    expect(readReauthorMarker(tdd, "F1", "S1", "AC4")).toBeUndefined(); // cleared -> re-checks fresh next run
  });

  it("a NON-verify escalation (no marker) resolves cleanly with nothing to clear", () => {
    const e = writeEscalation(tdd, { source: "release-engineer", reason: "merge conflict", feature_id: "F1", story_id: "S1" });
    const ids = resolveBlockers(tdd, { id: e.id });
    expect(ids).toContain(e.id); // no throw, no marker to touch
  });
});
