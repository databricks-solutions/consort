"use client";

import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { font, radius } from "@/lib/theme";
import type { DashboardState } from "@/lib/types";
import type { ActivityTimeline } from "./AgentLogReplay";

// The per-story test lightbox: the tests the Navigator authored for a story, each a bubble coloured
// by its current status, in the authored order — so an operator can see at a glance which tests are
// passing (the Driver's work made them green), which are failing (RED, written but not yet passed),
// and which are still upcoming (pending). The data is the on-disk `test-list-per-story.json` the
// Navigator writes; the status field is updated as the build turns tests green, so this reflects the
// live state at HEAD. Dashboard-only: no new agent telemetry — see /api/story-tests.
//
// `TestBubbles` is a PURE render (no fetch/state) so it renders server-side in tests; the fetching +
// overlay live in `StoryTestsLightbox`.

export type TestStatus = "pending" | "running" | "red" | "green" | "refactored" | "skipped";

export interface StoryTest {
  id: string;
  description: string;
  ac_id: string;
  status: TestStatus;
  kind?: string; // behavior | fitness | client
  scenario_file?: string;
  invariant_id?: string;
  nfr_id?: string;
}

// status → the visual language. green & refactored both read as "passing" (green); red is written-
// but-failing; pending is upcoming (neutral, dashed); skipped is set aside (faint).
const STATUS_STYLE: Record<TestStatus, { bg: string; border: string; fg: string; dot: string; label: string; dashed?: boolean; strike?: boolean }> = {
  green: { bg: "var(--status-good-tint)", border: "var(--status-good)", fg: "var(--status-good-text)", dot: "var(--status-good)", label: "passing" },
  refactored: { bg: "var(--status-good-tint)", border: "var(--status-good)", fg: "var(--status-good-text)", dot: "var(--status-good)", label: "passing ♺" },
  running: { bg: "var(--status-warning-tint)", border: "var(--status-warning)", fg: "var(--status-warning-text)", dot: "var(--status-warning)", label: "running" },
  red: { bg: "var(--status-critical-tint)", border: "var(--status-critical)", fg: "var(--status-critical-text)", dot: "var(--status-critical)", label: "failing" },
  pending: { bg: "var(--surface-inset)", border: "var(--border-default)", fg: "var(--text-muted)", dot: "var(--text-faint)", label: "upcoming", dashed: true },
  skipped: { bg: "transparent", border: "var(--border-default)", fg: "var(--text-faint)", dot: "var(--text-faint)", label: "skipped", strike: true },
};

const STATUS_ORDER: TestStatus[] = ["green", "refactored", "running", "red", "pending", "skipped"];

export function summarizeTests(items: StoryTest[]): {
  by: Record<string, number>;
  passing: number;
  total: number;
  pct: number;
} {
  const by: Record<string, number> = {};
  for (const t of items) by[t.status] = (by[t.status] ?? 0) + 1;
  const passing = (by.green ?? 0) + (by.refactored ?? 0);
  const total = items.length;
  return { by, passing, total, pct: total ? Math.round((passing / total) * 100) : 0 };
}

function Legend({ by }: { by: Record<string, number> }) {
  const shown = STATUS_ORDER.filter((s) => (by[s] ?? 0) > 0);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: "0.64rem", color: "var(--text-faint)" }}>
      {shown.map((s) => (
        <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", background: STATUS_STYLE[s].dot, display: "inline-block" }} />
          {STATUS_STYLE[s].label} · {by[s]}
        </span>
      ))}
    </div>
  );
}

// The true test type for display: `kind` gives behavior/fitness/client, but `client` conflates a
// Playwright E2E (`.spec.ts`, hits the DB through the app) with a Vitest component test (`.test.tsx`).
// Distinguish them so the table view can show contents (behavior/fitness/e2e) vs mark "no DB" (component).
export function testType(t: StoryTest): "behavior" | "fitness" | "e2e" | "component" | "client" {
  if (t.kind === "behavior") return "behavior";
  if (t.kind === "fitness") return "fitness";
  if (t.kind === "component") return "component"; // the dedicated component-analyst kind
  if (t.kind === "client") {
    const f = t.scenario_file ?? "";
    if (/\.spec\.tsx?$/.test(f) || f.includes("/e2e/")) return "e2e";
    if (/\.test\.tsx?$/.test(f)) return "component"; // back-compat: a pre-split client component test
  }
  return "client";
}

export function testHitsDb(t: StoryTest): boolean {
  const ty = testType(t);
  return ty === "behavior" || ty === "fitness" || ty === "e2e";
}

// A pill decorating the test type (behavior / fitness / e2e / component) next to the T#. Each type
// gets its OWN category hue (a faint tint + saturated text) — distinct from the status green/amber/
// red/blue so it reads as "what KIND of test," never confused with pass/fail. Category literals
// (not status tokens) because these are a classification palette; the four read on both grounds.
const TYPE_PILL: Record<string, { fg: string; bg: string }> = {
  behavior: { fg: "#6366f1", bg: "rgba(99,102,241,0.13)" }, // indigo
  fitness: { fg: "#9333ea", bg: "rgba(147,51,234,0.13)" }, // violet
  e2e: { fg: "#0d9488", bg: "rgba(13,148,136,0.15)" }, // teal
  component: { fg: "#db2777", bg: "rgba(219,39,119,0.14)" }, // pink
  client: { fg: "var(--text-muted)", bg: "var(--surface-inset)" }, // fallback
};

function TypePill({ type }: { type: string }) {
  const c = TYPE_PILL[type] ?? TYPE_PILL.client;
  return (
    <span
      title={`test type: ${type}`}
      style={{
        fontFamily: font.mono,
        fontSize: "0.5rem",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        color: c.fg,
        background: c.bg,
        border: `1px solid ${c.bg}`,
        borderRadius: 999,
        padding: "1px 6px",
        lineHeight: 1.4,
        flex: "0 0 auto",
      }}
    >
      {type}
    </span>
  );
}

function Bubble({ t, onSelect, selected }: { t: StoryTest; onSelect?: (id: string) => void; selected?: boolean }) {
  const st = STATUS_STYLE[t.status] ?? STATUS_STYLE.pending;
  const ty = testType(t);
  return (
    <div
      title={t.description}
      data-status={t.status}
      onClick={onSelect ? () => onSelect(t.id) : undefined}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onKeyDown={
        onSelect
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(t.id);
              }
            }
          : undefined
      }
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        minWidth: 0,
        background: st.bg,
        border: `1px ${st.dashed ? "dashed" : "solid"} ${st.border}`,
        borderRadius: radius.panel,
        padding: "8px 10px",
        cursor: onSelect ? "pointer" : undefined,
        outline: selected ? "2px solid var(--status-play)" : undefined,
        outlineOffset: selected ? 1 : undefined,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span aria-hidden style={{ width: 9, height: 9, borderRadius: "50%", background: st.dot, flex: "0 0 auto" }} />
        <span style={{ fontFamily: font.mono, fontSize: "0.74rem", fontWeight: 700, color: "var(--text-strong)" }}>{t.id}</span>
        <TypePill type={ty} />
        <span style={{ marginLeft: "auto", fontSize: "0.56rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: st.fg }}>
          {st.label}
        </span>
      </div>
      <div
        style={{
          fontSize: "0.68rem",
          color: "var(--text-body)",
          textDecoration: st.strike ? "line-through" : undefined,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {t.description}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, fontSize: "0.58rem", color: "var(--text-faint)", fontFamily: font.mono }}>
        <span>{t.ac_id}</span>
        {t.invariant_id ? <span>· {t.invariant_id}</span> : null}
        {t.nfr_id ? <span>· {t.nfr_id}</span> : null}
      </div>
    </div>
  );
}

export function TestBubbles({
  items,
  onSelect,
  selectedId,
}: {
  items: StoryTest[];
  onSelect?: (id: string) => void;
  selectedId?: string | null;
}) {
  if (items.length === 0) {
    return <div style={{ fontSize: "0.78rem", color: "var(--text-faint)" }}>No tests authored for this story yet.</div>;
  }
  const s = summarizeTests(items);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-strong)", fontVariantNumeric: "tabular-nums" }}>
          {s.passing}/{s.total} passing <span style={{ color: "var(--text-faint)", fontWeight: 500 }}>({s.pct}%)</span>
        </span>
        <Legend by={s.by} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
        {items.map((t) => (
          <Bubble key={t.id} t={t} onSelect={onSelect} selected={selectedId === t.id} />
        ))}
      </div>
    </div>
  );
}

// The fetching overlay. Opens over the board (above the drill-down drawer), loads the story's
// test-list from /api/story-tests, and closes on ✕ / backdrop click / Escape.
export function StoryTestsLightbox({
  feature,
  story,
  mode,
  atLive,
  atEventIndex,
  timeline,
  lineAt,
  foldStatus,
  state,
  onClose,
}: {
  feature: string;
  story: string;
  mode: string | null;
  // Timeline position: at the live edge the on-disk (HEAD) status is authoritative; scrubbed back
  // it would describe the future, so the status comes from the recorded `test.result` trail
  // folded as-of the playhead (`foldStatus`), defaulting un-reached tests to "pending".
  atLive: boolean;
  atEventIndex: number;
  // The agent-step timeline + the line playhead. Each test's status-TRANSITION is a `test` line in the
  // stream (placed in the turn it ran), so a bubble lights by LINE position — reveal a test's line and
  // it flips. Scrubbing forward lights tests one at a time in pass order, finer than any cycle event
  // and immune to the burst-collapse that wall-clock interpolation suffered.
  timeline: ActivityTimeline | null;
  lineAt: number;
  foldStatus: Record<string, string>;
  state: DashboardState;
  onClose: () => void;
}) {
  const [items, setItems] = useState<StoryTest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The Lakebase branch the tests run on + a console deep-link (header chip). Polled at the live
  // edge so it tracks the per-cycle experiment branch as the drive cuts/merges.
  const [branch, setBranch] = useState<{ branch: string; consoleUrl: string } | null>(null);
  // The test whose TABLE state the view shows. Default: follow the running test at the live edge;
  // a click on any bubble pins that test (so you can inspect what any test left in the tables).
  const [selectedTestId, setSelectedTestId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setItems(null);
    setError(null);
    const q = new URLSearchParams({ feature, story });
    if (mode) q.set("mode", mode);
    fetch(`/api/story-tests?${q.toString()}`)
      .then((r) => r.json())
      .then((d: { items?: StoryTest[]; error?: string }) => {
        if (!alive) return;
        if (d.error) setError(d.error);
        else setItems(d.items ?? []);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, [feature, story, mode]);

  useEffect(() => {
    let alive = true;
    const poll = () => {
      fetch("/api/project-branch")
        .then((r) => r.json())
        .then((d: { available?: boolean; branch?: string; consoleUrl?: string }) => {
          if (alive) setBranch(d.available && d.branch ? { branch: d.branch, consoleUrl: d.consoleUrl ?? "" } : null);
        })
        .catch(() => {
          /* chip is best-effort */
        });
    };
    poll();
    // Only keep polling at the live edge (the branch can change as experiments cut/merge).
    const h = atLive ? setInterval(poll, 2000) : null;
    return () => {
      alive = false;
      if (h) clearInterval(h);
    };
  }, [atLive]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The freshest per-test status at the live edge: match a run entry by (id + scenario_file) first —
  // which disambiguates a T-id reused in another story/feature — then fall back to an id-only match.
  // Per-test status AS-OF the LINE playhead. Each test's status TRANSITION is a `test` line in the
  // stream (placed in the turn that ran it, in pass order); fold the lines REVEALED so far (idx <
  // lineAt), last-revealed status per test winning. So scrubbing forward flips bubbles one at a time
  // in the order they passed — line position, not wall-clock (which collapsed a burst into one step).
  // Also track the latest revealed test line's timestamp as the table panel's "as-of" cutoff; before
  // any test is revealed, fall back to the current turn's start so the table reads empty, not HEAD.
  const testStatusByLine = new Map<string, string>();
  let tableAtTs = "";
  for (const l of timeline?.lines ?? []) {
    if (l.kind !== "test" || !l.testId || l.idx >= lineAt) continue;
    testStatusByLine.set(l.testId, l.status ?? "");
    if (l.tsLine) tableAtTs = l.tsLine;
  }
  const haveTestLines = (timeline?.lines ?? []).some((l) => l.kind === "test");
  if (!atLive && !tableAtTs && timeline) {
    const idx = lineAt - 1;
    const cur =
      timeline.turns.find((t) => idx >= t.startLine && idx < t.startLine + t.lineCount) ?? timeline.turns[timeline.turns.length - 1];
    tableAtTs = cur?.tsStart ?? "";
  }
  const liveStatusFor = (t: StoryTest): string | undefined => testStatusByLine.get(t.id);

  // The table panel is CLICK-DRIVEN: it extends out for the test the user clicks (pins) and closes
  // when nothing is selected — it does NOT auto-follow the running test.
  const currentTestId = selectedTestId;

  // One source of truth for the two panel widths. The test-list column is a FIXED width so it never
  // reflows when the table panel opens: the drawer simply grows by exactly TABLE_W to the right, and
  // the list stays put. (48vw + 46vw = 94vw keeps the open drawer inside the viewport.)
  const LIST_W = "min(560px, 48vw)";
  const TABLE_W = "min(720px, 46vw)";

  return (
    <div
      role="dialog"
      aria-label={`${feature} ${story} tests`}
      style={{
        // A LEFT-edge drawer (same side as the Status rollup that opens it) that ENDS ABOVE the
        // transport (bottom: 72), with NO full-screen backdrop — so the scrubber stays reachable AND
        // the event log on the right stays visible while you watch the bubbles relight. Scrubbing
        // deliberately keeps it open: the point is to scrub and see the per-test status move. Close
        // via ✕ or Escape only.
        position: "fixed",
        top: 0,
        left: 0,
        bottom: 72,
        zIndex: 65,
        // Narrow (just the test list) by default; EXTENDS wide when a test is clicked so the table
        // panel has room for more columns. Collapses back when the selection is cleared. The open
        // width is LIST_W + TABLE_W so the list column keeps its exact closed width (no reflow).
        width: selectedTestId ? `calc(${LIST_W} + ${TABLE_W})` : LIST_W,
        transition: "width 0.15s ease",
        background: "var(--surface-panel)",
        borderRight: "1px solid var(--border-default)",
        boxShadow: "12px 0 40px rgba(0,0,0,0.35)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "row",
      }}
    >
      {/* LEFT column: the test list (bubbles) + branch chip + driver activity. FIXED width so opening
          the table panel never resizes it. */}
      <div style={{ flex: `0 0 ${LIST_W}`, minWidth: 0, overflow: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontFamily: font.mono, fontSize: "0.9rem", fontWeight: 700, color: "var(--text-strong)" }}>
            {feature} · {story}
          </span>
          <span style={{ fontSize: "0.72rem", color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.05em" }}>tests</span>
          <button
            onClick={onClose}
            aria-label="Close"
            title="Close (Esc)"
            style={{
              marginLeft: "auto",
              border: "1px solid var(--border-default)",
              background: "var(--surface-card)",
              color: "var(--text-muted)",
              borderRadius: radius.chip,
              padding: "2px 9px",
              fontSize: "0.8rem",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>
        {branch ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.72rem", color: "var(--text-muted)" }}>
            <span aria-hidden>⎇</span>
            <span style={{ textTransform: "uppercase", letterSpacing: "0.05em", fontSize: "0.58rem", color: "var(--text-faint)" }}>
              lakebase branch
            </span>
            {branch.consoleUrl ? (
              <a
                href={branch.consoleUrl}
                target="_blank"
                rel="noreferrer"
                title="Open this branch in the Lakebase console"
                style={{ fontFamily: font.mono, fontWeight: 700, color: "var(--status-play)", textDecoration: "none" }}
              >
                {branch.branch} ↗
              </a>
            ) : (
              <span style={{ fontFamily: font.mono, fontWeight: 700, color: "var(--text-strong)" }}>{branch.branch}</span>
            )}
          </div>
        ) : null}
        {!atLive ? (
          <div style={{ fontSize: "0.68rem", color: "var(--status-play)", display: "flex", alignItems: "center", gap: 6 }}>
            <span aria-hidden>⏮</span> status as of event #{atEventIndex} — scrubbed back from the recorded trail
          </div>
        ) : null}
        {error ? (
          <div style={{ fontSize: "0.78rem", color: "var(--status-critical-text)" }}>Couldn&apos;t load tests: {error}</div>
        ) : items === null ? (
          <div style={{ fontSize: "0.78rem", color: "var(--text-faint)" }}>Loading tests…</div>
        ) : (
          // Colour priority, freshest first: (1) the LIVE per-test tail (`liveStatusFor`), folded by
          // the playhead ts — it flips each bubble at the REAL moment that test passed, so scrubbing
          // forward lights them in pass order (finer than the batched cycle event). (2) When the tail
          // exists, a test it has NOT reached by the playhead is honestly "pending" (NOT the coarse
          // `test.result` fold, which would wrongly green the whole cycle at once). (3) No tail (a
          // replay corpus): the recorded `test.result` fold governs, else HEAD at the live edge /
          // "pending" scrubbed. So an open drawer relights pending→red→green in pass order.
          <TestBubbles
            items={items.map((t) => ({
              ...t,
              status:
                (liveStatusFor(t) as TestStatus) ??
                (haveTestLines
                  ? ((atLive ? (foldStatus[t.id] as TestStatus) ?? t.status : "pending") as TestStatus)
                  : (foldStatus[t.id] as TestStatus) ?? (atLive ? t.status : "pending")),
            }))}
            onSelect={(id) => setSelectedTestId((cur) => (cur === id ? null : id))}
            selectedId={currentTestId}
          />
        )}
      </div>
      {/* RIGHT panel: the tables AS OF the clicked test — the point of the view. Renders ONLY when a
          test is clicked (so the drawer is just the list otherwise); wide, for more columns. */}
      {selectedTestId ? (
        <div
          style={{
            flex: `0 0 ${TABLE_W}`,
            minWidth: 0,
            borderLeft: "1px solid var(--border-default)",
            background: "var(--surface-page)",
            overflow: "auto",
            padding: 20,
          }}
        >
          <StoryTables
            feature={feature}
            story={story}
            atLive={atLive}
            atTs={atLive ? "" : tableAtTs}
            testId={selectedTestId}
            idToType={Object.fromEntries((items ?? []).map((t) => [t.id, testType(t)]))}
            pinned
          />
        </div>
      ) : null}
    </div>
  );
}

interface TableData {
  name: string;
  columns: { name: string; type?: string; nullable?: boolean; description?: string }[];
  changes: { kind?: string; detail?: string }[];
  rows: Record<string, unknown>[];
  /** Parallel to `rows`: the T# that drove each row into this state (route attributeRows). */
  rowDrivers?: (string | null)[];
  /** Precise per-test interactions (app/consort_capture.py): exactly the rows THIS test read/wrote. */
  retrieved?: Record<string, unknown>[];
  stored?: Record<string, unknown>[];
  rowCount: number | null;
  capturedAt: string | null;
  isolated: boolean;
}

function fmtCell(v: unknown): string {
  if (v === null || v === undefined) return "·";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

// The tables the story touches + their contents AS OF A TEST — a PURE READER of /api/story-tables
// (the corpus; the backend records each test's rows keyed by test_id). It follows `testId` (the
// running test at the live edge, or a pinned click); at the live edge it polls so the rows appear
// as the backend captures them. A `component` (Vitest) test never hits the DB, so it shows "no DB
// interaction" instead of tables.
function StoryTables({
  feature,
  story,
  atLive,
  atTs,
  testId,
  idToType,
  pinned,
}: {
  feature: string;
  story: string;
  atLive: boolean;
  // The playhead's ISO timestamp when scrubbed back (empty at the live edge). Passed to the route so
  // the tables/records are SCRUBBER-FAITHFUL: a test's rows appear only once the playhead reaches when
  // it ran — not at an earlier position (the stale-at-HEAD bug: a test showed records before it ran).
  atTs: string;
  testId: string | null;
  idToType: Record<string, string>;
  pinned: boolean;
}) {
  const [tables, setTables] = useState<TableData[] | null>(null);
  useEffect(() => {
    if (!testId) {
      setTables(null);
      return;
    }
    let alive = true;
    const poll = () => {
      const q = new URLSearchParams({ feature, story, testId });
      if (atTs) q.set("at", atTs);
      fetch(`/api/story-tables?${q.toString()}`)
        .then((r) => r.json())
        .then((d: { available?: boolean; tables?: TableData[] }) => {
          if (alive) setTables(d.available && d.tables ? d.tables : []);
        })
        .catch(() => {
          /* best-effort */
        });
    };
    poll();
    const h = atLive ? setInterval(poll, 2000) : null;
    return () => {
      alive = false;
      if (h) clearInterval(h);
    };
  }, [feature, story, testId, atLive, atTs]);

  // The right panel always shows SOMETHING: a prompt when no test is current (nothing running, none
  // pinned), so the panel reads as "pick a test" rather than an empty void.
  if (!testId) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={{ fontSize: "0.66rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-faint)" }}>
          table state
        </span>
        <span style={{ fontSize: "0.72rem", color: "var(--text-faint)", lineHeight: 1.5 }}>
          Click a test on the left (or wait for one to run) to see the tables as that test left them.
        </span>
      </div>
    );
  }

  const header = (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
      <span style={{ fontSize: "0.66rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-faint)" }}>
        tables as of
      </span>
      <span style={{ fontFamily: font.mono, fontSize: "0.72rem", fontWeight: 700, color: "var(--status-play)" }}>{testId}</span>
      {pinned ? <span style={{ fontSize: "0.56rem", color: "var(--text-faint)" }}>📌 pinned — click again to unpin</span> : null}
    </div>
  );

  // Component (Vitest) tests are NOT special-cased away: the real-backend harness (no mocks) means a
  // component test's `/api` calls hit the live service against the paired-branch DB, and the Vitest
  // reporter captures that table state (captureTablesFromRoute) keyed by the test_id — exactly like
  // pytest/Playwright. So they flow through the same path and show their captured tables.
  // Empty = this test has no captured table state AS OF the playhead: it hasn't run yet at this
  // position (scrub forward), it makes no DB calls (a pure component test), or nothing is authored
  // yet. Render an explicit note — NEVER return null, which leaves the pulled-out panel an empty
  // `--surface-page` slab (reads as a black overlay in the dark theme).
  if (!tables || tables.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10, borderTop: "1px solid var(--border-default)", paddingTop: 12 }}>
        {header}
        <span style={{ fontSize: "0.72rem", color: "var(--text-faint)", fontStyle: "italic", lineHeight: 1.5 }}>
          Nothing captured as of this point — this test hasn&apos;t run yet at the playhead (scrub forward), or it makes no database calls.
        </span>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, borderTop: "1px solid var(--border-default)", paddingTop: 12 }}>
      {header}
      {tables.map((t) => (
        <TableCard key={`${t.name}-${testId}`} t={t} idToType={idToType} testId={testId} />
      ))}
    </div>
  );
}

const TH: CSSProperties = { textAlign: "left", padding: "2px 10px 4px 0", color: "var(--text-faint)", borderBottom: "1px solid var(--border-default)", whiteSpace: "nowrap" };
const TD: CSSProperties = { padding: "2px 10px 2px 0", color: "var(--text-body)", whiteSpace: "nowrap", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" };

// A compact rows-over-columns table with an optional leading cell (e.g. the "drove" pill).
function MiniTable({
  cols,
  rows,
  leadHeader,
  leadCell,
}: {
  cols: string[];
  rows: Record<string, unknown>[];
  leadHeader?: string;
  leadCell?: (r: Record<string, unknown>, i: number) => ReactNode;
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", fontSize: "0.62rem", fontFamily: font.mono, width: "100%" }}>
        <thead>
          <tr>
            {leadCell ? <th style={TH}>{leadHeader ?? ""}</th> : null}
            {cols.map((c) => (
              <th key={c} style={TH}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 50).map((r, ri) => (
            <tr key={ri}>
              {leadCell ? <td style={{ padding: "2px 10px 2px 0", whiteSpace: "nowrap" }}>{leadCell(r, ri)}</td> : null}
              {cols.map((c) => (
                <td key={c} style={TD}>
                  {fmtCell(r[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function drovePill(driver: string | null, idToType: Record<string, string>): ReactNode {
  if (!driver) return null;
  const pc = TYPE_PILL[idToType[driver] ?? "client"] ?? TYPE_PILL.client;
  return (
    <span
      title={`row driven by ${driver}`}
      style={{ display: "inline-block", fontFamily: font.mono, fontSize: "0.5rem", fontWeight: 700, letterSpacing: "0.04em", padding: "1px 5px", borderRadius: radius.chip, color: pc.fg, background: pc.bg }}
    >
      {driver}
    </span>
  );
}

function TableCard({ t, idToType, testId }: { t: TableData; idToType: Record<string, string>; testId: string }) {
  const cols = t.columns.map((c) => c.name);
  const retrieved = t.retrieved ?? [];
  const stored = t.stored ?? [];
  const hasIO = retrieved.length + stored.length > 0; // precise per-test read/stored capture present
  const pairs = t.rows.map((r, i) => ({ r, driver: t.rowDrivers?.[i] ?? null }));
  const mine = pairs.filter((p) => p.driver === testId);
  // "filter by T#" count: the precise interactions (read + stored) when captured, else the snapshot-
  // driven approximation (rows this test first produced — stored only).
  const filteredCount = hasIO ? retrieved.length + stored.length : mine.length;
  // Default ALWAYS opens FILTERED to this test (the "filter by T#" selection); the user flips to "all
  // rows" for the full snapshot. A test that read or stored nothing shows the honest empty note in filtered
  // mode rather than silently defaulting to the whole table.
  const [showAll, setShowAll] = useState(false);

  const toggleBtn = (lbl: string, active: boolean, on: () => void) => (
    <button
      onClick={on}
      aria-pressed={active}
      style={{ border: `1px solid ${active ? "var(--status-play)" : "var(--border-default)"}`, background: active ? "var(--surface-inset)" : "transparent", color: active ? "var(--text-strong)" : "var(--text-faint)", borderRadius: radius.chip, padding: "1px 8px", fontSize: "0.56rem", fontWeight: 700, cursor: "pointer" }}
    >
      {lbl}
    </button>
  );
  const groupHdr = (txt: string, tone: string) => (
    <div style={{ fontSize: "0.56rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: tone }}>{txt}</div>
  );

  const nothingToShow = t.rows.length === 0 && !hasIO;

  return (
    <div style={{ border: "1px solid var(--border-default)", borderRadius: radius.panel, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontFamily: font.mono, fontWeight: 700, fontSize: "0.8rem", color: "var(--text-strong)" }}>{t.name}</span>
        {t.rowCount != null ? (
          <span style={{ fontSize: "0.62rem", color: "var(--text-faint)", fontVariantNumeric: "tabular-nums" }}>
            {t.rowCount} row{t.rowCount === 1 ? "" : "s"}
          </span>
        ) : null}
        {t.changes.map((c, i) => (
          <span key={i} title={c.detail} style={{ fontSize: "0.58rem", color: "var(--text-faint)" }}>
            · {c.kind}
          </span>
        ))}
        {t.isolated ? (
          <span
            title="This test runs on its OWN isolated ephemeral branch and drops/recreates the table (migration round-trip), so these rows are from that branch, not the feature branch."
            style={{ fontSize: "0.56rem", color: "var(--status-warning-text)", fontWeight: 700 }}
          >
            · isolated branch (migration round-trip)
          </span>
        ) : null}
      </div>
      {nothingToShow ? (
        <span style={{ fontSize: "0.66rem", color: "var(--text-faint)" }}>No rows for this table as of this test.</span>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {toggleBtn(`filter by ${testId} (${filteredCount})`, !showAll, () => setShowAll(false))}
            {toggleBtn(`all rows (${pairs.length})`, showAll, () => setShowAll(true))}
          </div>
          {showAll ? (
            <MiniTable cols={cols} rows={t.rows} leadHeader="drove" leadCell={(_, i) => drovePill(t.rowDrivers?.[i] ?? null, idToType)} />
          ) : hasIO ? (
            // Both sections ALWAYS render (consistent layout), each with its count; an empty one shows
            // "none" rather than vanishing, so stored/retrieved sit in the same place across tests.
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {([
                { title: "stored", tone: "var(--status-good-text)", rows: stored },
                { title: "retrieved", tone: "var(--status-play)", rows: retrieved },
              ] as const).map(({ title, tone, rows }) => (
                <div key={title} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {groupHdr(`${title} · ${rows.length}`, tone)}
                  {rows.length > 0 ? (
                    <MiniTable cols={cols} rows={rows} />
                  ) : (
                    <span style={{ fontSize: "0.62rem", color: "var(--text-faint)", fontStyle: "italic" }}>none</span>
                  )}
                </div>
              ))}
            </div>
          ) : mine.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontSize: "0.56rem", color: "var(--text-faint)" }}>stored (approx — from snapshots; this test type doesn&apos;t capture reads)</span>
              <MiniTable cols={cols} rows={mine.map((p) => p.r)} leadHeader="drove" leadCell={(_, i) => drovePill(mine[i]?.driver ?? null, idToType)} />
            </div>
          ) : (
            <span style={{ fontSize: "0.66rem", color: "var(--text-faint)", lineHeight: 1.5 }}>
              {testId} read or stored no rows in this table. Switch to “all rows” to see the table state.
            </span>
          )}
        </>
      )}
    </div>
  );
}
