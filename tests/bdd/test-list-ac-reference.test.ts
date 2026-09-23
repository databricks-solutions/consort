// BDD coverage for the ac_id-reference test_list gate (issue #199): every test-list
// item's ac_id must resolve to a real AC file under the feature's per-story acs dirs.
// A dangling ref (typo / re-slug / renamed-away AC) anchors nothing: the item's
// coverage silently lands nowhere and the story it was meant to cover ships bare.

import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { acReferenceReason } from "../../consort/gates/gate-conformance-guard";

const tmpDirs: string[] = [];
function mkConsort(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ac-ref-gate-"));
  tmpDirs.push(dir);
  return dir;
}
function writeAc(consortDir: string, feature: string, story: string, acId: string): void {
  const acsDir = path.join(consortDir, "features", feature, "stories", story, "acs");
  fs.mkdirSync(acsDir, { recursive: true });
  fs.writeFileSync(path.join(acsDir, `${acId}.json`), JSON.stringify({ id: acId, text: "x" }) + "\n");
}
afterEach(() => {
  while (tmpDirs.length) {
    const dir = tmpDirs.pop();
    if (dir) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
    }
  }
});

const F = "F1";

describe("acReferenceReason (test_list gate, issue #199)", () => {
  it("passes when every item's ac_id resolves to an existing AC file", () => {
    const consortDir = mkConsort();
    writeAc(consortDir, F, "S1", "AC1-create-form");
    writeAc(consortDir, F, "S2", "AC2-list-view");
    const tl = JSON.stringify({ items: [
      { id: "T1", ac_id: "AC1-create-form" },
      { id: "T2", ac_id: "AC2-list-view" },
    ] });
    expect(acReferenceReason(consortDir, F, tl)).toBeNull();
  });

  it("fails with every dangling ac_id named (typo/re-slugged AC)", () => {
    const consortDir = mkConsort();
    writeAc(consortDir, F, "S1", "AC1-create-form");
    const tl = JSON.stringify({ items: [
      { id: "T1", ac_id: "AC1-create-form" },
      { id: "T9", ac_id: "AC3-retrieval" },
    ] });
    const reason = acReferenceReason(consortDir, F, tl);
    expect(reason).not.toBeNull();
    expect(reason).toMatch(/T9 -> 'AC3-retrieval'/);
    expect(reason).toMatch(/ac_id references failed/);
  });

  it("a ref into ANOTHER story's AC still resolves (feature-scoped test-list)", () => {
    const consortDir = mkConsort();
    writeAc(consortDir, F, "S1", "AC1-create-form");
    writeAc(consortDir, F, "S2", "AC2-list-view");
    const tl = JSON.stringify({ items: [{ id: "T3", ac_id: "AC2-list-view" }] });
    expect(acReferenceReason(consortDir, F, tl)).toBeNull();
  });

  it("defers (null) when there are no ACs to validate against, and ignores malformed JSON", () => {
    const consortDir = mkConsort();
    expect(acReferenceReason(consortDir, F, JSON.stringify({ items: [{ id: "T1", ac_id: "ACX" }] }))).toBeNull();
    expect(acReferenceReason(consortDir, F, "not json")).toBeNull();
  });
});
