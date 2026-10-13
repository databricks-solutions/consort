// The deterministic pre-reflect AC↔IA gate (#3, consort/smells/ia-conformance.ts): an E2E AC
// declares the ia.md seam tokens its UI drives (ui_seams); the gate flags reflect-ia-defect
// (ux-designer-owned) when a declared seam is NOT named in ia.md — no LLM reflect lap. Fail-open:
// no ia.md, or no AC declares ui_seams, is vacuously conformant.

import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  iaConformanceViolations,
  iaConforms,
  recordIaGate,
  iaNamesSeam,
} from "../../consort/smells/ia-conformance.js";
import { readSmellsLog } from "../../consort/smells/smells.js";

const F = "F1";
const S = "S1";
const tmpDirs: string[] = [];

const IA = [
  "# Information Architecture",
  "## Screens",
  "| Screen | Route | Key seams |",
  "|---|---|---|",
  "| Home | `/` | `stock-table`, `stock-row-<sku>-<loc>`, `stock-cell-sku`, `stock-cell-qty`, `stock-not-tracked`, `location-filter`, `stock-empty` |",
  "| SKU detail | `/sku/:sku` | `sku-locations`, `sku-tracking`, `sku-par-level`, `sku-empty` |",
  "",
].join("\n");

/** A .consort with design/ia.md + a story's acs/*.json (each optionally carrying ui_seams). */
function seed(acs: Array<{ id: string; layer: string; ui_seams?: string[] }>, ia: string | null = IA): string {
  const consortDir = fs.mkdtempSync(path.join(os.tmpdir(), "ia-conf-"));
  tmpDirs.push(consortDir);
  if (ia !== null) {
    fs.mkdirSync(path.join(consortDir, "design"), { recursive: true });
    fs.writeFileSync(path.join(consortDir, "design", "ia.md"), ia);
  }
  const acsDir = path.join(consortDir, "features", F, "stories", S, "acs");
  fs.mkdirSync(acsDir, { recursive: true });
  for (const ac of acs) {
    const obj: Record<string, unknown> = { id: ac.id, layer: ac.layer, given: "g", when: "w", then: "t", status: "draft" };
    if (ac.ui_seams) obj.ui_seams = ac.ui_seams;
    fs.writeFileSync(path.join(acsDir, `${ac.id}.json`), JSON.stringify(obj));
  }
  return consortDir;
}

afterEach(() => {
  while (tmpDirs.length) {
    const d = tmpDirs.pop();
    if (d) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } }
  }
});

describe("iaNamesSeam", () => {
  it("matches a plain seam named in ia.md, and reports a genuinely-absent one", () => {
    expect(iaNamesSeam(IA, "stock-table")).toBe(true);
    expect(iaNamesSeam(IA, "sku-par-level")).toBe(true);
    expect(iaNamesSeam(IA, "sku-not-tracked")).toBe(false); // genuinely absent
  });

  it("REGRESSION: matches a TEMPLATED seam token with <placeholder>s (stock-row-<sku>-<loc>)", () => {
    // The HIL-halt bug: a tokenizer split on < > so ia.md's `stock-row-<sku>-<loc>` fragmented and the
    // declared full token never matched, flagging a seam that IS named. A bounded substring match fixes it.
    expect(iaNamesSeam(IA, "stock-row-<sku>-<loc>")).toBe(true);
  });

  it("does NOT over-fire: a short seam is not matched inside a longer one", () => {
    // `stock-row` is NOT independently named (only `stock-row-<sku>-<loc>` is), so a boundary guard
    // must keep it from matching as a prefix.
    expect(iaNamesSeam("| Home | `/` | `stock-row-<sku>-<loc>` |", "stock-row")).toBe(false);
  });
});

describe("iaConformanceViolations", () => {
  it("is null when every declared seam is named in ia.md", () => {
    const dir = seed([{ id: "AC1-view", layer: "E2E", ui_seams: ["stock-table", "stock-cell-qty"] }]);
    expect(iaConformanceViolations(dir, F, S)).toBeNull();
    expect(iaConforms(dir, F, S)).toBe(true);
  });

  it("flags a declared seam the IA does not name, naming the AC (the live S2/S3 lap class)", () => {
    const dir = seed([{ id: "AC1-track", layer: "E2E", ui_seams: ["stock-cell-tracking", "stock-not-tracked"] }]);
    const found = iaConformanceViolations(dir, F, S);
    expect(found).not.toBeNull();
    expect(found!.acIds).toEqual(["AC1-track"]);
    expect(found!.reason).toMatch(/stock-cell-tracking.*stock-not-tracked|does not name/);
    expect(iaConforms(dir, F, S)).toBe(false);
  });

  it("FAIL-OPEN: vacuously conformant when no AC declares ui_seams (never a false positive)", () => {
    const dir = seed([{ id: "AC1-view", layer: "E2E" }, { id: "AC2-api", layer: "API" }]);
    expect(iaConformanceViolations(dir, F, S)).toBeNull();
  });

  it("FAIL-OPEN: vacuously conformant when there is no ia.md (non-UI feature)", () => {
    const dir = seed([{ id: "AC1-view", layer: "E2E", ui_seams: ["anything-at-all"] }], null);
    expect(iaConformanceViolations(dir, F, S)).toBeNull();
  });
});

describe("recordIaGate", () => {
  it("flags reflect-ia-defect with the flagged ac_id(s) on a seam gap, no LLM turn", () => {
    const dir = seed([{ id: "AC1-track", layer: "E2E", ui_seams: ["stock-cell-tracking"] }]);
    const hits = recordIaGate(dir, F, S);
    expect(hits).toHaveLength(1);
    expect(hits[0].smell).toBe("reflect-ia-defect");
    expect(hits[0].ac_ids).toEqual(["AC1-track"]);
    const open = readSmellsLog(dir).detected.filter((d) => d.smell === "reflect-ia-defect" && !d.resolution);
    expect(open).toHaveLength(1);
  });

  it("returns [] and self-clears on a conformant story", () => {
    const dir = seed([{ id: "AC1-view", layer: "E2E", ui_seams: ["stock-table"] }]);
    expect(recordIaGate(dir, F, S)).toEqual([]);
    const open = readSmellsLog(dir).detected.filter((d) => d.smell === "reflect-ia-defect" && !d.resolution);
    expect(open).toHaveLength(0);
  });

  it("is idempotent: a re-run against the same gap does not pile up duplicate open smells", () => {
    const dir = seed([{ id: "AC1-track", layer: "E2E", ui_seams: ["stock-cell-tracking"] }]);
    recordIaGate(dir, F, S);
    recordIaGate(dir, F, S);
    const open = readSmellsLog(dir).detected.filter((d) => d.smell === "reflect-ia-defect" && !d.resolution);
    expect(open).toHaveLength(1);
  });
});
