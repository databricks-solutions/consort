import { describe, it, expect } from "vitest";
import { reduceTestRunLog } from "./test-run";

describe("reduceTestRunLog", () => {
  it("returns [] for empty input", () => {
    expect(reduceTestRunLog("")).toEqual([]);
    expect(reduceTestRunLog("\n\n")).toEqual([]);
  });

  it("parses one entry per line", () => {
    const text =
      JSON.stringify({ ts: "t1", test_id: "T1", status: "green", file: "tests/e2e/a.spec.ts" }) +
      "\n" +
      JSON.stringify({ ts: "t2", test_id: "T2", status: "red", file: "tests/e2e/b.spec.ts" });
    const out = reduceTestRunLog(text);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ test_id: "T1", status: "green", file: "tests/e2e/a.spec.ts", ts: "t1" });
    expect(out[1].status).toBe("red");
  });

  it("keeps the LAST status for a repeated (test_id, file) — a rerun supersedes", () => {
    const text =
      JSON.stringify({ ts: "t1", test_id: "T1", status: "red", file: "a.spec.ts" }) +
      "\n" +
      JSON.stringify({ ts: "t2", test_id: "T1", status: "green", file: "a.spec.ts" });
    const out = reduceTestRunLog(text);
    expect(out).toHaveLength(1);
    expect(out[0].status).toBe("green");
    expect(out[0].ts).toBe("t2");
  });

  it("treats the SAME id in a different file as a distinct test (cross-story T-id reuse)", () => {
    const text =
      JSON.stringify({ ts: "t1", test_id: "T13", status: "green", file: "stories/s1/a.spec.ts" }) +
      "\n" +
      JSON.stringify({ ts: "t2", test_id: "T13", status: "red", file: "stories/s2/b.spec.ts" });
    const out = reduceTestRunLog(text);
    expect(out).toHaveLength(2);
    expect(out.find((e) => e.file === "stories/s1/a.spec.ts")?.status).toBe("green");
    expect(out.find((e) => e.file === "stories/s2/b.spec.ts")?.status).toBe("red");
  });

  it("skips a half-written trailing line mid-append without throwing", () => {
    const text =
      JSON.stringify({ ts: "t1", test_id: "T1", status: "green", file: "a.spec.ts" }) +
      '\n{"ts":"t2","test_id":"T2","sta';
    const out = reduceTestRunLog(text);
    expect(out).toHaveLength(1);
    expect(out[0].test_id).toBe("T1");
  });

  it("skips a line missing required fields; defaults a missing file to ''", () => {
    const text =
      JSON.stringify({ ts: "t0", status: "green" }) + // no test_id → skipped
      "\n" +
      JSON.stringify({ test_id: "T9", status: "skipped" }); // no file/ts → defaults
    const out = reduceTestRunLog(text);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ test_id: "T9", status: "skipped", file: "", ts: "" });
  });
});
