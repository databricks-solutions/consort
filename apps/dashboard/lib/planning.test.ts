import { describe, it, expect, afterEach } from "vitest";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadPlanning, parseProposals } from "./planning";
import type { AgentLogEvent } from "./types";

// ---------------------------------------------------------------------------
// Pure parser — no corpus needed. The two real feature-proposals.md files disagree on body-label
// spelling (see planning.ts), so both are exercised here directly.

describe("parseProposals — both real label spellings", () => {
  // The REPLAY corpus format: `## FP1: title`, bulleted `- **Ask:**`, `- **E2E (UI) story:**`.
  const replayFormat = `# Sprint candidates

## FP1: File and view stock for a SKU at a location

- **Ask:** As a warehouse worker, I can file a stock record.
- **Rationale:** The floor of everything.
- **E2E (UI) story:** YES. Empty state to a filed row.
- **Priority:** P0 (sprint-1 foundation).

## FP2: Adjust a stock level in place

- **Ask:** I can adjust the quantity.
- **Rationale:** Second most common action.

## Open questions for the Product Owner

- Should we support batch edits?
`;

  it("parses the replay format, skipping the prose section", () => {
    const out = parseProposals(replayFormat);
    expect(out.map((p) => p.id)).toEqual(["FP1", "FP2"]); // "Open questions" is not a feature
    expect(out[0]).toEqual({
      id: "FP1",
      title: "File and view stock for a SKU at a location",
      ask: "As a warehouse worker, I can file a stock record.",
      rationale: "The floor of everything.",
      e2e: "YES. Empty state to a filed row.",
    });
    expect(out[1].ask).toBe("I can adjust the quantity.");
    expect(out[1].e2e).toBe(""); // FP2 recorded none
  });

  // The LIVE stockflow format: `**One-line ask:**`, `**E2E story:**`, no leading bullet.
  const liveFormat = `## FP1: List current stock levels

**One-line ask:** Display the current inventory in a table.
**Rationale:** Simple table read.
**E2E story:** YES.
**Priority:** P0.
`;

  it("parses the live format's alternate label spellings", () => {
    const out = parseProposals(liveFormat);
    expect(out).toHaveLength(1);
    expect(out[0].ask).toBe("Display the current inventory in a table.");
    expect(out[0].e2e).toBe("YES.");
    expect(out[0].rationale).toBe("Simple table read.");
  });

  it("accepts the (candidate) tag and a committed F# header", () => {
    const out = parseProposals("## PF1 (candidate) do a thing\n## F1-stock-visibility ships it\n");
    expect(out.map((p) => p.id)).toEqual(["PF1", "F1-stock-visibility"]);
    expect(out[0].title).toBe("do a thing");
    expect(out[1].title).toBe("ships it");
  });

  it("returns nothing for a doc with no feature headers", () => {
    expect(parseProposals("# Title\n\nsome prose\n\n## Notes\n\nmore prose")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Integration against the real recorded corpus. Skipped on a checkout without it.

// v0.3.7 relocated the corpus from examples/sftdd-scenarios/ to examples/replay/corpora/; try new then legacy.
const CORPUS = [
  process.env.CONSORT_TEST_CORPUS_DIR,
  join(process.env.HOME ?? "", ".claude/plugins/marketplaces/databricks-solutions/examples/replay/corpora/stockflow-rerecord"),
  join(process.env.HOME ?? "", ".claude/plugins/marketplaces/databricks-solutions/examples/sftdd-scenarios/stockflow-rerecord"),
].filter((p): p is string => !!p).find((p) => existsSync(join(p, "recorded-artifacts", "planning", "estimates.json")));

function proposeEvent(): AgentLogEvent {
  return { timestamp: "2026-08-01T00:00:00.000Z", level: "info", role: "spec-author", event: "phase.start", message: "", metadata: { phase: "propose" } };
}

describe.skipIf(!CORPUS)("loadPlanning — the real stockflow-rerecord corpus", () => {
  const root = join(CORPUS!, "recorded-artifacts");

  it("joins proposals with estimates, in proposal order, with committed flags", () => {
    const p = loadPlanning([root], [proposeEvent()]);
    // FP1..FP5 from the proposals doc, then the committed F1/F6 (estimate-only, no FP entry).
    const fps = p.candidates.filter((c) => c.id.startsWith("FP"));
    expect(fps.map((c) => c.id)).toEqual(["FP1", "FP2", "FP3", "FP4", "FP5"]);
    // The both-format fix: asks/titles are non-empty on the replay corpus (a verbatim port left them blank).
    expect(fps[0].title).toBeTruthy();
    expect(fps[0].ask).toBeTruthy();
    expect(fps[0].size).toBe("M"); // FP1 is sized M in estimates.json
    // The committed features surface, flagged committed.
    const committedIds = p.candidates.filter((c) => c.committed).map((c) => c.id).sort();
    expect(committedIds).toEqual(["F1-stock-visibility", "F6-split-tracking-code"]);
    expect(p.committed).toEqual(["F1-stock-visibility", "F6-split-tracking-code"]);
  });

  it("reads both sprints, their plan gate, and resolves committed feature titles", () => {
    const p = loadPlanning([root], [proposeEvent()]);
    expect(p.sprints.map((s) => s.sprint)).toEqual(["stockflow-rerecord-s1", "stockflow-rerecord-s2"]);
    const s1 = p.sprints[0];
    expect(s1.featureIds).toEqual(["F1-stock-visibility"]);
    expect(s1.planGate).toBe("approved");
    expect(s1.approver).toBeTruthy();
    // feature_details resolves the F1 title from its feature-spec.json / feature-request.md.
    expect(s1.features[0].id).toBe("F1-stock-visibility");
    expect(s1.features[0].title).toBeTruthy();
    expect(s1.features[0].size).toBe("M");
  });

  it("flags the second sprint as a re-plan when only one propose round ran", () => {
    // The corpus has exactly one spec-author propose phase feeding both sprints, so sprint 2 is
    // a re-plan, not a fresh proposal.
    const p = loadPlanning([root], [proposeEvent()]);
    expect(p.proposeRounds).toBe(1);
    expect(p.sprints[0].isReplan).toBe(false);
    expect(p.sprints[1].isReplan).toBe(true);
  });

  it("does not flag a re-plan when multiple propose rounds ran", () => {
    // Two genuine proposal rounds → neither sprint is a re-plan.
    const p = loadPlanning([root], [proposeEvent(), proposeEvent()]);
    expect(p.proposeRounds).toBe(2);
    expect(p.sprints.every((s) => !s.isReplan)).toBe(true);
  });

  it("returns empty structures for a root with no planning artifacts", () => {
    const p = loadPlanning(["/nonexistent-root-xyz"]);
    expect(p.candidates).toEqual([]);
    expect(p.sprints).toEqual([]);
    expect(p.committed).toEqual([]);
    expect(p.proposeRounds).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Review-finding regressions, on a synthetic root so they need no corpus.

describe("loadPlanning — synthetic root (review-finding regressions)", () => {
  let root: string;
  const sprint = (name: string, features: { id: string; size?: string }[], gate?: string) => {
    const dir = join(root, "sprints", name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "backlog.json"), JSON.stringify({ sprint: name, features }));
    if (gate) writeFileSync(join(dir, "gates.json"), JSON.stringify({ gates: { plan: { status: gate } } }));
  };
  const feature = (id: string, requestBody: string) => {
    const dir = join(root, "features", id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "feature-request.md"), requestBody);
  };

  const build = () => {
    root = mkdtempSync(join(tmpdir(), "planning-syn-"));
  };
  afterEach(() => root && rmSync(root, { recursive: true, force: true }));

  it("finding 1: does NOT flag a re-plan when the log shows zero propose rounds", () => {
    build();
    sprint("run-s1", [{ id: "F1" }], "approved");
    sprint("run-s2", [{ id: "F2" }], "approved");
    // No propose events passed (truncated / omitted log). proposeRounds === 0 is UNKNOWN, not
    // one, so a re-plan must not be asserted — the old `<= 1` wrongly stamped s2.
    const p = loadPlanning([root]);
    expect(p.proposeRounds).toBe(0);
    expect(p.sprints.every((s) => !s.isReplan)).toBe(true);
    // ...and exactly one propose round DOES flag the later sprint.
    const withOne = loadPlanning([root], [proposeEvent()]);
    expect(withOne.sprints.map((s) => s.isReplan)).toEqual([false, true]);
  });

  it("finding 3: orders sprints numerically, so s10 comes after s2", () => {
    build();
    for (const n of [1, 2, 10, 11, 3]) sprint(`run-s${n}`, [{ id: `F${n}` }]);
    const p = loadPlanning([root]);
    expect(p.sprints.map((s) => s.sprint)).toEqual([
      "run-s1", "run-s2", "run-s3", "run-s10", "run-s11",
    ]);
  });

  it("finding 5: picks the first PROSE line as a summary, skipping markup", () => {
    build();
    // Title heading, then a bullet, a blockquote, a table row, and a rule — none are the summary.
    feature("F1", [
      "# Feature One",
      "",
      "- a bullet, not prose",
      "> a blockquote",
      "| col | col |",
      "---",
      "The real one-line summary of the feature.",
      "More detail after.",
    ].join("\n"));
    sprint("run-s1", [{ id: "F1" }], "approved");
    const p = loadPlanning([root]);
    expect(p.sprints[0].features[0].title).toBe("Feature One");
    expect(p.sprints[0].features[0].summary).toBe("The real one-line summary of the feature.");
  });
});
