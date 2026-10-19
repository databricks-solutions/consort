import { describe, it, expect } from "vitest";
import { renderToolMarker, renderToolMarkers } from "./activity";

describe("renderToolMarker (distill a raw tool marker to a legible verb + target)", () => {
  it("Bash: uses the human description, not the raw command", () => {
    expect(renderToolMarker('Bash {"command":"cd /x; ls -R .consort","description":"Survey project layout and tests"}')).toEqual({
      verb: "Bash",
      target: "Survey project layout and tests",
    });
  });

  it("Edit: strips the <PROJECT_ROOT> prefix to a project-relative file", () => {
    expect(
      renderToolMarker('Edit {"file_path":"<PROJECT_ROOT>/app/routes/stock.py","old_string":"a","new_string":"b"}'),
    ).toEqual({ verb: "Edit", target: "app/routes/stock.py" });
  });

  it("Write: project-relative file (ignores the big content blob)", () => {
    expect(
      renderToolMarker('Write {"file_path":"<PROJECT_ROOT>/client/src/components/StockTable.tsx","content":"…1000 chars…"}'),
    ).toEqual({ verb: "Write", target: "client/src/components/StockTable.tsx" });
  });

  it("Read file_path + Grep pattern", () => {
    expect(renderToolMarker('Read {"file_path":"<PROJECT_ROOT>/alembic/versions/x.py"}')).toEqual({ verb: "Read", target: "alembic/versions/x.py" });
    expect(renderToolMarker('Grep {"pattern":"stock-table","path":"client/src"}')).toEqual({ verb: "Grep", target: "stock-table" });
  });

  it("Bash with only a command (no description) falls back to a deterministic summary", () => {
    const r = renderToolMarker('Bash {"command":"uv run pytest tests/test_stock_table_fitness.py -q"}');
    expect(r.verb).toBe("Bash");
    expect(r.target).toContain("pytest");
  });

  it("summarizes a description-less read probe (cat/grep/echo) into a human phrase, not raw shell", () => {
    // cat probes → "read <files>"
    expect(
      renderToolMarker(
        'Bash {"command":"cd /x/S1; cat story.json acs/*.json test-list-per-story.json; cat ../../../design/ia.md; cat ../../../nfrs.md | head -80"}',
      ).target,
    ).toBe("read story.json, acs/*.json, test-list-per-story.json, ia.md +1 more");
    // grep → "search <file> for <pattern>"
    expect(
      renderToolMarker('Bash {"command":"grep -n -i -E \\"SC5|EP4|NFR[0-9]\\" architecture.md | head -60"}').target,
    ).toBe("search architecture.md for SC5|EP4|NFR[0-9]");
    // echo redirect → "write <file>"
    expect(
      renderToolMarker('Bash {"command":"echo \'{\\"version\\":1}\' > reflect-verdict.json"}').target,
    ).toBe("write reflect-verdict.json");
    // python inspection → "run python"
    expect(renderToolMarker('Bash {"command":"python3 -I -c \\"import json;print(1)\\""}').target).toBe("run python");
  });

  it("a bare verb (no input) yields verb only", () => {
    expect(renderToolMarker("TodoWrite")).toEqual({ verb: "TodoWrite", target: "" });
  });

  it("unparseable args degrade to verb + clipped rest, never throw", () => {
    const r = renderToolMarker("Bash not-json here");
    expect(r.verb).toBe("Bash");
    expect(r.target).toContain("not-json");
  });

  it("empty / whitespace yields an empty activity", () => {
    expect(renderToolMarker("")).toEqual({ verb: "", target: "" });
    expect(renderToolMarker("   ")).toEqual({ verb: "", target: "" });
  });

  it("clips an over-long target", () => {
    const long = "x".repeat(200);
    expect(renderToolMarker(`Bash {"description":"${long}"}`).target.length).toBeLessThanOrEqual(72);
  });
});

describe("renderToolMarkers (ordered list; drops empties)", () => {
  it("renders in order and filters out verb-less entries", () => {
    const out = renderToolMarkers([
      'Bash {"description":"Survey project layout and tests"}',
      "",
      'Edit {"file_path":"<PROJECT_ROOT>/app/services/stock_service.py"}',
    ]);
    expect(out).toEqual([
      { verb: "Bash", target: "Survey project layout and tests" },
      { verb: "Edit", target: "app/services/stock_service.py" },
    ]);
  });
});
