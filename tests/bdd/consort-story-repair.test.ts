// The DETERMINISTIC artifact side of a surgical story repair (consort/pipeline/story-repair.ts):
// coverInvariant closes an uncovered persistence invariant (the PI8-stock-records-survive-migration
// class) RETAG-FIRST — tag an existing untagged round-trip test when one covers the invariant's
// table (the real gap is a missing tag), else AUTHOR a new covering test — then RE-FREEZE the
// approved test_list gate in place. This proves: (a) the retag path tags the existing round-trip
// test, adds no new item, and leaves coverage satisfied; (b) the author path (no existing round-trip
// test) appends a well-formed fitness item attributed to the story's AC, landing in the PER-STORY
// list the build lane reads (the hollow-repair guard); (c) ambiguous retag raises to the human;
// (d) WITHOUT the re-freeze the change reads as drift (verifyGateIntegrity -> drift) and the
// re-freeze restores integrity (-> ok) with the gate still approved; (e) coverInvariant is idempotent.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { coverInvariant, refreezeTestListGate, AmbiguousCoverageError } from "../../consort/pipeline/story-repair";
import { approveGate } from "../../consort/gates/approve-gate";
import { verifyGateIntegrity } from "../../consort/gates/verify-gate-integrity";
import { readGates } from "../../consort/gates/gates";
import { resolveArtifactInputs } from "../../consort/gates/gate-conformance-guard";
import { readMasterTestList, writeMasterTestList, renderTestListMarkdown, readStoryTestList, type TestList, type TestListItem } from "../../consort/test-list/test-list";
import { featureResolved, featureTestListMd } from "../../consort/config/consort-paths";

let tdd: string;
const F = "F3-inbound-receipt";
const PI = "PI8-stock-records-survive-migration";
const APPROVER = "po@example.com";
const NOW = () => new Date("2026-06-07T12:00:00Z");

// A round-trip (migration-survival) test for stock_records, UNTAGGED — the real F3/T28 shape: the
// coverage exists, the design just never tagged it with the invariant_id.
const UNTAGGED_ROUNDTRIP: TestListItem = {
  id: "T28",
  description: "Pre-existing stock_records rows survive the stock_receipts migration upgrade and downgrade",
  ac_id: "AC1",
  status: "green",
  kind: "fitness",
};

function seedFeature(extraItems: TestListItem[] = []): void {
  const fdir = join(tdd, "features", F);
  mkdirSync(join(fdir, "stories", "S3", "acs"), { recursive: true });
  writeFileSync(
    join(fdir, "stories", "S3", "acs", "AC1.json"),
    JSON.stringify({ id: "AC1", given: "", when: "", then: "", status: "draft", story_id: "S3" }),
  );
  // The DBA realized a migration_reversible invariant about a PRE-EXISTING table — but no test is
  // TAGGED with it (the gap). service_backed so the persistence coverage check runs.
  writeFileSync(
    join(fdir, "architecture.json"),
    JSON.stringify({
      feature_id: F,
      nfrs: [],
      service_backed: true,
      layers: [{ role: "repository", module: "app/repositories" }],
      persistence_invariants: [
        { id: PI, type: "migration_reversible", table: "stock_records", brief: "existing stock_records survive the additive migration" },
      ],
    }),
  );
  // The master list as the (long-since-approved) test_list gate froze it: PI is UNTAGGED.
  const list: TestList = {
    feature_id: F,
    ordered_for: "design-momentum",
    items: [{ id: "T1", description: "POST /receipts returns 201", ac_id: "AC1", status: "green", kind: "behavior" }, ...extraItems],
  };
  writeMasterTestList(tdd, list);
  writeFileSync(featureTestListMd(tdd, F), renderTestListMarkdown(list));
  // Idempotent approve: a describe may re-seed with different items on top of the top-level seed;
  // approveGate refuses an already-approved gate, so only approve the first time.
  if (readGates(F, { consortDir: tdd }).gates.test_list.status === "approved") return;
  // Approve the test_list gate against that uncovered list (models the design-time approval that
  // predated the invariant — the real slip #1 now catches at the deploy gate). The gate's artifact
  // set is {test-list.json, test-list.md}; capture both, as resolveArtifactInputs later resolves both.
  approveGate({
    featureId: F,
    gate: "test_list",
    approver: APPROVER,
    hitlApproved: true,
    artifactInputs: {
      "test-list.json": readFileSync(join(featureResolved(tdd, F), "test-list.json"), "utf8"),
      "test-list.md": readFileSync(featureTestListMd(tdd, F), "utf8"),
    },
    consortDir: tdd,
    now: NOW,
    writeSelectionLog: false,
  });
}

beforeEach(() => {
  tdd = mkdtempSync(join(tmpdir(), "story-repair-"));
  seedFeature();
});
afterEach(() => rmSync(tdd, { recursive: true, force: true }));

describe("coverInvariant: TYPE-AWARE — a transactional invariant needs an atomicity test, not a migration round-trip (the F5/PI1 false-green)", () => {
  const TXN = "PI1-reconcile-atomic";
  const writeTxnArch = (): void =>
    writeFileSync(
      join(tdd, "features", F, "architecture.json"),
      JSON.stringify({
        feature_id: F,
        nfrs: [],
        service_backed: true,
        persistence_invariants: [{ id: TXN, type: "transactional", table: "stock_adjustments", brief: "row + audit land together or neither persists" }],
      }),
    );
  const writeList = (items: TestListItem[]): void =>
    writeMasterTestList(tdd, { feature_id: F, ordered_for: "design-momentum", items: [{ id: "T1", description: "POST returns 201", ac_id: "AC1", status: "green", kind: "behavior" }, ...items] });
  const MIGRATION_SHAPE = /down\s*[-/→>]+\s*up|round.?trip|downgrad|upgrad/i;
  const ATOMICITY_SHAPE = /roll\s*back|neither\b[^.]*\b(persist|writ)|\bfail/i;

  it("AUTHORS an atomicity/rollback item (not a migration round-trip) when the transactional invariant is uncovered", () => {
    writeTxnArch();
    writeList([]);
    const { mode, itemId } = coverInvariant(tdd, F, "S3", TXN);
    expect(mode).toBe("author");
    const authored = readMasterTestList(tdd, F).items.find((i) => i.id === itemId)!;
    expect(authored.invariant_id).toBe(TXN);
    expect(authored.description).toMatch(ATOMICITY_SHAPE);
    expect(authored.description).not.toMatch(MIGRATION_SHAPE);
  });

  it("does NOT accept a migration-round-trip item as coverage — re-authors the atomicity test and untags the wrong item (the T49 fix)", () => {
    writeTxnArch();
    // T49: the real false-green — a migration-survival round-trip tagged to the transactional invariant.
    writeList([{ id: "T49", description: "additive migration down->up preserves existing stock_adjustments rows (PI1-reconcile-atomic migration-survival round-trip)", ac_id: "AC1", status: "green", kind: "fitness", invariant_id: TXN }]);
    const { mode, itemId } = coverInvariant(tdd, F, "S3", TXN);
    expect(mode).toBe("author"); // NOT "present" — the tagged item is the wrong shape
    const after = readMasterTestList(tdd, F);
    // T49 was untagged (it covers no valid transactional invariant); the new item is atomicity-shaped.
    expect(after.items.find((i) => i.id === "T49")!.invariant_id).toBeUndefined();
    const authored = after.items.find((i) => i.id === itemId)!;
    expect(authored.invariant_id).toBe(TXN);
    expect(authored.description).toMatch(ATOMICITY_SHAPE);
    expect(after.items.filter((i) => i.invariant_id === TXN)).toHaveLength(1);
  });
});

describe("coverInvariant: RETAG an existing round-trip test when one covers the invariant's table (the F3/T28 close)", () => {
  beforeEach(() => seedFeature([UNTAGGED_ROUNDTRIP]));

  it("retags the existing untagged round-trip test — no new item, coverage satisfied", () => {
    // Before: PI is untagged, so the gate conformance is BLOCKED.
    const before = resolveArtifactInputs("test_list", featureResolved(tdd, F), undefined, tdd, F);
    expect("reason" in before).toBe(true);

    const { itemId, mode } = coverInvariant(tdd, F, "S3", PI);
    expect(mode).toBe("retag");
    expect(itemId).toBe("T28");

    const after = readMasterTestList(tdd, F);
    // The EXISTING test now carries the invariant_id; no duplicate was appended.
    expect(after.items.find((i) => i.id === "T28")!.invariant_id).toBe(PI);
    expect(after.items.filter((i) => i.invariant_id === PI)).toHaveLength(1);
    // Coverage satisfied, and it lands in the per-story list too.
    expect("inputs" in resolveArtifactInputs("test_list", featureResolved(tdd, F), undefined, tdd, F)).toBe(true);
    expect(readStoryTestList(tdd, F, "S3")?.items.some((i) => i.id === "T28" && i.invariant_id === PI)).toBe(true);
  });

  it("is idempotent: a second call sees the now-tagged test as present, no further change", () => {
    const first = coverInvariant(tdd, F, "S3", PI);
    const second = coverInvariant(tdd, F, "S3", PI);
    expect(first.mode).toBe("retag");
    expect(second).toEqual({ itemId: "T28", mode: "present" });
    expect(readMasterTestList(tdd, F).items.filter((i) => i.invariant_id === PI)).toHaveLength(1);
  });

  it("raises AmbiguousCoverageError when >1 untagged round-trip test could cover it; --retag resolves it", () => {
    seedFeature([
      UNTAGGED_ROUNDTRIP,
      { id: "T40", description: "stock_records rows survive another upgrade and downgrade round-trip", ac_id: "AC1", status: "green", kind: "fitness" },
    ]);
    expect(() => coverInvariant(tdd, F, "S3", PI)).toThrow(AmbiguousCoverageError);
    // The operator names the one to retag.
    const { itemId, mode } = coverInvariant(tdd, F, "S3", PI, { retagTestId: "T40" });
    expect(mode).toBe("retag");
    expect(itemId).toBe("T40");
    expect(readMasterTestList(tdd, F).items.find((i) => i.id === "T40")!.invariant_id).toBe(PI);
  });
});

describe("coverInvariant: AUTHOR a new covering test when NO round-trip test exists (the fallback)", () => {
  // seedFeature() (no extra items) has no round-trip test -> author path.
  it("appends a fitness item carrying the invariant_id, attributed to the story's AC, landing in the per-story list", () => {
    const before = resolveArtifactInputs("test_list", featureResolved(tdd, F), undefined, tdd, F);
    expect("reason" in before).toBe(true);

    const { itemId, mode } = coverInvariant(tdd, F, "S3", PI);
    expect(mode).toBe("author");

    const item = readMasterTestList(tdd, F).items.find((i) => i.id === itemId)!;
    expect(item).toMatchObject({ kind: "fitness", invariant_id: PI, ac_id: "AC1", status: "pending" });
    expect(item.description).toMatch(/stock_records/);
    expect("inputs" in resolveArtifactInputs("test_list", featureResolved(tdd, F), undefined, tdd, F)).toBe(true);
    // CRITICAL (the hollow-repair guard the live-proof surfaced): the authored item MUST land in the
    // PER-STORY list (storyTestListJson) the build lane reads, or the Navigator/Driver never build it.
    const perStory = readStoryTestList(tdd, F, "S3");
    expect(perStory?.items.some((i) => i.invariant_id === PI && i.id === itemId)).toBe(true);
  });

  it("is idempotent: a second call returns the same authored item as present, no duplicate", () => {
    const first = coverInvariant(tdd, F, "S3", PI);
    const second = coverInvariant(tdd, F, "S3", PI);
    expect(first.mode).toBe("author");
    expect(second).toEqual({ itemId: first.itemId, mode: "present" });
    expect(readMasterTestList(tdd, F).items.filter((i) => i.invariant_id === PI)).toHaveLength(1);
  });

  it("throws when the story has no AC to attribute a newly-authored covering test to", () => {
    expect(() => coverInvariant(tdd, F, "S9-no-such-story", PI)).toThrow(/no acceptance criterion/);
  });
});

describe("refreezeTestListGate: keeps the gate approved + integrity intact after the append", () => {
  it("WITHOUT the re-freeze the appended item reads as drift (why the re-freeze is required)", () => {
    coverInvariant(tdd, F, "S3", PI);
    const resolved = resolveArtifactInputs("test_list", featureResolved(tdd, F), undefined, tdd, F);
    expect("inputs" in resolved).toBe(true);
    if (!("inputs" in resolved)) return;
    const v = verifyGateIntegrity({ featureId: F, gate: "test_list", currentInputs: resolved.inputs, consortDir: tdd });
    expect(v.status).toBe("drift");
  });

  it("re-freezes in place: the gate stays approved and integrity is restored (no drift)", () => {
    coverInvariant(tdd, F, "S3", PI);
    const did = refreezeTestListGate(tdd, F, { approver: APPROVER, at: "2026-06-07T13:00:00.000Z", reason: `repair: covering test for ${PI}` });
    expect(did).toBe(true);

    const gates = readGates(F, { consortDir: tdd });
    expect(gates.gates.test_list.status).toBe("approved"); // still approved — no withdraw cascade
    expect(gates.gates.test_list.history.at(-1)).toMatchObject({ action: "approved", reason: expect.stringContaining(PI) });

    const resolved = resolveArtifactInputs("test_list", featureResolved(tdd, F), undefined, tdd, F);
    if (!("inputs" in resolved)) throw new Error(`expected conformant inputs: ${resolved.reason}`);
    const v = verifyGateIntegrity({ featureId: F, gate: "test_list", currentInputs: resolved.inputs, consortDir: tdd });
    expect(v.status).toBe("ok");
  });

  it("no-ops when the test_list gate is not approved (nothing frozen to re-freeze)", () => {
    // Fresh feature with no approved gate.
    const other = "F9-unapproved";
    mkdirSync(join(tdd, "features", other, "stories", "S1", "acs"), { recursive: true });
    writeFileSync(join(tdd, "features", other, "stories", "S1", "acs", "AC1.json"), JSON.stringify({ id: "AC1", story_id: "S1", given: "", when: "", then: "", status: "draft" }));
    writeMasterTestList(tdd, { feature_id: other, ordered_for: "design-momentum", items: [] });
    expect(refreezeTestListGate(tdd, other, { approver: APPROVER, at: NOW().toISOString(), reason: "x" })).toBe(false);
  });
});
