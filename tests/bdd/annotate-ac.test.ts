// consort-annotate-ac: the Architect's AC annotation must merge layer +
// architectural_notes WITHOUT dropping any existing field, and must always emit
// valid JSON (the corruption that aborted a drive came from hand-editing braces).

import { describe, it, expect } from "vitest";
import { mergeAcAnnotation, parseUiSeams } from "../../bin/consort/annotate-ac.cli.js";

const AC = JSON.stringify({
  id: "AC1",
  status: "draft",
  given: "a user",
  when: "they do X",
  then: "Y happens",
  independence: { distinct_from_prior: true, rationale: "first AC" },
});

describe("mergeAcAnnotation", () => {
  it("adds layer + architectural_notes while preserving EVERY existing field", () => {
    const out = mergeAcAnnotation(AC, { layer: "API", notes: "Boundary layer; owns the X endpoint." });
    const obj = JSON.parse(out);
    // preserved
    expect(obj.id).toBe("AC1");
    expect(obj.given).toBe("a user");
    expect(obj.when).toBe("they do X");
    expect(obj.then).toBe("Y happens");
    expect(obj.independence).toEqual({ distinct_from_prior: true, rationale: "first AC" });
    // added
    expect(obj.layer).toBe("API");
    expect(obj.architectural_notes).toBe("Boundary layer; owns the X endpoint.");
  });

  it("always emits valid, parseable JSON (the anti-corruption guarantee)", () => {
    const out = mergeAcAnnotation(AC, { notes: "notes only" });
    expect(() => JSON.parse(out)).not.toThrow();
    expect(out.endsWith("\n")).toBe(true);
  });

  it("re-annotating is idempotent-ish: overwrites layer/notes, still preserves the rest", () => {
    const once = mergeAcAnnotation(AC, { layer: "API", notes: "v1" });
    const twice = mergeAcAnnotation(once, { layer: "E2E", notes: "v2" });
    const obj = JSON.parse(twice);
    expect(obj.layer).toBe("E2E");
    expect(obj.architectural_notes).toBe("v2");
    expect(obj.independence.distinct_from_prior).toBe(true); // still preserved
  });

  it("throws on malformed input JSON rather than blindly overwriting a corrupt AC", () => {
    expect(() => mergeAcAnnotation('{ "id": "AC1"', { notes: "x" })).toThrow();
  });

  it("sets ui_seams for an E2E AC (the pre-reflect IA gate's input) only when provided", () => {
    // provided → written
    const withSeams = JSON.parse(mergeAcAnnotation(AC, { layer: "E2E", notes: "renders the table", uiSeams: ["stock-table", "stock-cell-tracking"] }));
    expect(withSeams.ui_seams).toEqual(["stock-table", "stock-cell-tracking"]);
    // omitted (a non-UI AC) → the field is absent, not an empty array
    const noSeams = JSON.parse(mergeAcAnnotation(AC, { layer: "API", notes: "endpoint" }));
    expect("ui_seams" in noSeams).toBe(false);
  });

  it("parseUiSeams splits, trims, de-dupes a comma list; undefined passes through", () => {
    expect(parseUiSeams("stock-table, stock-cell-qty ,stock-table")).toEqual(["stock-table", "stock-cell-qty"]);
    expect(parseUiSeams(undefined)).toBeUndefined();
    expect(parseUiSeams("")).toEqual([]);
  });
});
