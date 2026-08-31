/**
 * Correspondence parser tests.
 *
 * The pure parse (`parseCorrespondence`, `completionByOrdinal`) is tested unconditionally on
 * inline fixtures. The corpus-backed assertions run against the REAL stockflow-full
 * correspondence.jsonl when it's on disk and skip otherwise — the corpus lives in the plugin
 * marketplace, not this repo. `CONSORT_TEST_CORPUS_DIR` (a corpus dir carrying the file) overrides.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCorrespondence, completionByOrdinal, type CorrespondenceEntry } from "./correspondence";

const MARKETPLACE = join(process.env.HOME ?? "", ".claude/plugins/marketplaces/databricks-solutions");
const CANDIDATES = [
  process.env.CONSORT_TEST_CORPUS_DIR,
  join(MARKETPLACE, "examples/replay/corpora/stockflow-full"),
].filter((p): p is string => !!p);
const CORPUS = CANDIDATES.find((p) => existsSync(join(p, "correspondence.jsonl")));

// ---------------------------------------------------------------------------
// Pure parse — no corpus.

describe("correspondence — parseCorrespondence", () => {
  it("flattens a kickoff exchange, preferring rendered markdown", () => {
    const line = JSON.stringify({
      seq: 0,
      at: "2026-08-09T15:52:59.268Z",
      direction: "hil-to-orch",
      phase: "planning",
      ordinal: null,
      request: { kind: "kickoff", prompt: "/sprint s1", presentation: { rendered: "`/sprint s1`" } },
      response: { by: "human-proxy", presentation: { rendered: "Starting sprint `s1`." } },
      outcome: { validated: true },
    });
    const [e] = parseCorrespondence(line);
    expect(e.kind).toBe("kickoff");
    expect(e.direction).toBe("hil-to-orch");
    expect(e.promptMd).toBe("`/sprint s1`");
    expect(e.responseMd).toBe("Starting sprint `s1`.");
    expect(e.by).toBe("human-proxy");
    expect(e.validated).toBe(true);
    expect(e.approved).toBe(false);
  });

  it("falls back to the plain prompt when a progress row has no rendered markdown", () => {
    const line = JSON.stringify({
      seq: 0,
      at: "2026-08-09T15:53:00.000Z",
      direction: "orch-to-hil",
      ordinal: 0,
      step: "0",
      request: { kind: "progress", prompt: "spec-author propose, 1 file(s) produced" },
      response: { by: "orchestrator" },
      outcome: { validated: true },
    });
    const [e] = parseCorrespondence(line);
    expect(e.promptMd).toBe("spec-author propose, 1 file(s) produced");
    expect(e.responseMd).toBeNull();
    expect(e.ordinal).toBe(0);
  });

  it("reads approved on a gate exchange", () => {
    const line = JSON.stringify({
      at: "2026-08-09T15:59:00.000Z",
      direction: "orch-to-hil",
      ordinal: 4,
      request: { kind: "gate", presentation: { rendered: "**HIL approval requested** , GATE plan APPROVED" } },
      response: { by: "orchestrator" },
      outcome: { approved: true, validated: true },
    });
    const [e] = parseCorrespondence(line);
    expect(e.kind).toBe("gate");
    expect(e.approved).toBe(true);
    expect(e.validated).toBe(true);
  });

  it("skips malformed lines and rows without a timestamp", () => {
    const raw = ['not json', JSON.stringify({ direction: "orch-to-hil" }), '', JSON.stringify({ at: "2026-01-01T00:00:00Z", direction: "orch-to-hil" })].join("\n");
    const out = parseCorrespondence(raw);
    expect(out.length).toBe(1);
    expect(out[0].at).toBe("2026-01-01T00:00:00Z");
  });
});

describe("correspondence — completionByOrdinal", () => {
  const mk = (o: Partial<CorrespondenceEntry>): CorrespondenceEntry => ({
    seq: 0, at: "2026-01-01T00:00:00Z", direction: "orch-to-hil", phase: null, ordinal: null,
    kind: "progress", by: "orchestrator", promptMd: null, responseMd: null, validated: false, approved: false, ...o,
  });

  it("maps validated progress rows by ordinal", () => {
    const m = completionByOrdinal([
      mk({ ordinal: 0, validated: true, promptMd: "spec-author propose, 1 file(s) produced" }),
      mk({ ordinal: 1, validated: true, promptMd: "architect estimate" }),
    ]);
    expect(m.size).toBe(2);
    expect(m.get(0)?.label).toContain("propose");
  });

  it("ignores non-progress rows and unvalidated rows", () => {
    const m = completionByOrdinal([
      mk({ ordinal: 2, kind: "gate", approved: true }), // not progress
      mk({ ordinal: 3, validated: false }), // not validated
    ]);
    expect(m.size).toBe(0);
  });

  it("keeps the latest completion when an ordinal repeats", () => {
    const m = completionByOrdinal([
      mk({ ordinal: 5, validated: true, at: "2026-01-01T00:00:00Z", promptMd: "first" }),
      mk({ ordinal: 5, validated: true, at: "2026-01-01T00:05:00Z", promptMd: "second" }),
    ]);
    expect(m.get(5)?.label).toBe("second");
  });
});

// ---------------------------------------------------------------------------
// Real corpus.

describe.skipIf(!CORPUS)("correspondence — the real stockflow-full log", () => {
  const entries = () => parseCorrespondence(readFileSync(join(CORPUS!, "correspondence.jsonl"), "utf8"));

  it("parses every line (209 exchanges)", () => {
    const all = entries();
    expect(all.length).toBe(209);
    // Every entry has a timestamp and a direction — the two fields the timeline needs.
    for (const e of all) {
      expect(typeof e.at).toBe("string");
      expect(e.direction.length).toBeGreaterThan(0);
    }
  });

  it("sees the expected exchange kinds", () => {
    const kinds = new Set(entries().map((e) => e.kind));
    for (const k of ["kickoff", "intake", "progress", "author-requests", "gate"]) {
      expect(kinds.has(k)).toBe(true);
    }
  });

  it("derives completion markers from progress rows", () => {
    const m = completionByOrdinal(entries());
    // The run has many completed actions; each maps to an ordinal with a "produced" label.
    expect(m.size).toBeGreaterThan(10);
    for (const c of m.values()) expect(c.label.length).toBeGreaterThan(0);
  });

  it("carries at least one approved gate", () => {
    expect(entries().some((e) => e.kind === "gate" && e.approved)).toBe(true);
  });
});
