import { describe, it, expect } from "vitest";
import { inScope, deriveColumns } from "./story-scope";

describe("inScope: scope captures per feature (test ids repeat across features)", () => {
  it("keeps a fully-unstamped line (older corpus) by test id — back-compat", () => {
    expect(inScope({}, "F2-stock-adjustment", "S1-adjust")).toBe(true);
  });

  it("keeps a feature-stamped line with NO story (a whole-feature/deploy capture) for ANY story of that feature", () => {
    expect(inScope({ featureId: "F2-stock-adjustment" }, "F2-stock-adjustment", "S1-adjust")).toBe(true);
    expect(inScope({ featureId: "F2-stock-adjustment" }, "F2-stock-adjustment", "S2-other")).toBe(true);
  });

  it("DROPS a line stamped for a different feature — F1's reused T40 read never leaks into F2's view", () => {
    expect(inScope({ featureId: "F1-stock-visibility", storyId: "S2" }, "F2-stock-adjustment", "S1-adjust")).toBe(false);
    expect(inScope({ featureId: "F1-stock-visibility" }, "F2-stock-adjustment", "S1-adjust")).toBe(false);
  });

  it("matches feature + story exactly when the line carries both", () => {
    expect(inScope({ featureId: "F2-stock-adjustment", storyId: "S1-adjust" }, "F2-stock-adjustment", "S1-adjust")).toBe(true);
    expect(inScope({ featureId: "F2-stock-adjustment", storyId: "S2-other" }, "F2-stock-adjustment", "S1-adjust")).toBe(false);
  });
});

describe("deriveColumns: columns for a table the feature's db-design does not declare", () => {
  it("unions keys across the captured row sets in first-seen order", () => {
    const cols = deriveColumns([{ sku: "A", location: "L1" }], [{ sku: "B", quantity: 2 }], []);
    expect(cols.map((c) => c.name)).toEqual(["sku", "location", "quantity"]);
  });

  it("is empty when nothing was captured", () => {
    expect(deriveColumns([], [], [])).toEqual([]);
  });
});
