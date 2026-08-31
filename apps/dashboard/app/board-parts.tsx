"use client";

// Pieces shared between the board and its tests.
//
// They live here rather than in page.tsx because a Next.js page module may only export a
// default — exporting a named component alongside it fails the build's route type check
// (`Property 'x' is incompatible with index signature`). `npm run build` catches that; `tsc`
// and vitest do not, which is how it slipped through once.

import { useEffect, useRef } from "react";
import type { DashboardState } from "@/lib/types";
import { font, radius } from "@/lib/theme";

/**
 * `?mode=live|replay` from the page URL, so a mode is linkable.
 *
 * Validated against the two known modes: a typo falls back to the server's choice rather than
 * requesting a mode that cannot exist.
 */
export function modeFromUrl(search: string): "live" | "replay" | null {
  const m = new URLSearchParams(search).get("mode");
  return m === "live" || m === "replay" ? m : null;
}

export function DriftBanner({ correlation }: { correlation: NonNullable<DashboardState["source"]>["correlation"] }) {
  if (!correlation || correlation.severity === "ok") return null;
  // This banner is ALWAYS about the dashboard's corpus pairing, never the run's health — it never
  // means the orchestrator/build/deploy is failing. Two weights:
  //   warning — a role the corpus never recorded, i.e. the RECORD_DIR likely points at a DIFFERENT
  //             run. Amber (not critical-red): worth a look, still not a failure.
  //   info    — a benign caveat (kit-version drift, or the live edge running ahead of the corpus).
  //             A quiet note; drill-downs may just be approximate.
  const warn = correlation.severity === "warning";
  return (
    <div
      role={warn ? "alert" : "note"}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        background: warn ? "var(--status-warning-tint)" : "var(--surface-inset)",
        border: `1px solid ${warn ? "var(--status-warning)" : "var(--border-default)"}`,
        borderRadius: radius.panel,
        padding: "10px 13px",
        marginBottom: 12,
      }}
    >
      <span style={{ fontSize: "0.8rem", lineHeight: 1.3 }}>{warn ? "⚠" : "ℹ"}</span>
      <div>
        <div style={{ fontSize: "0.72rem", fontWeight: 700, color: warn ? "var(--status-warning-text)" : "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {warn ? "Corpus pairing unreliable" : "Live view pairing note"}
        </div>
        <div style={{ fontSize: "0.78rem", color: "var(--text-body)", marginTop: 3 }}>
          {correlation.message} Turn drill-downs may be approximate; the run itself is unaffected.
        </div>
        {/* The counts say how far to trust it: `paired` turns did match, and `structural`
            non-pairings are expected rather than evidence of a problem. */}
        <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: 4 }}>
          {correlation.paired} paired · {correlation.unpairedEvents} unpaired
          {correlation.structural > 0 ? ` · ${correlation.structural} structural (expected)` : ""}
          {correlation.kitVersionMatch === false ? " · kit version mismatch" : ""}
        </div>
      </div>
    </div>
  );
}

/** The `.sftdd/`-relative path an `artifact.written` event names, or null for any other event. */
function artifactPathOf(e: DashboardState["recentEvents"][number]): string | null {
  if (e.event !== "artifact.written") return null;
  const p = (e.metadata as Record<string, unknown> | undefined)?.path;
  return typeof p === "string" && p ? p : null;
}

export function EventTicker({
  state,
  onOpenTurn,
  onOpenArtifact,
}: {
  state: DashboardState;
  // Replay: open a recorded turn (transcript + per-turn snapshot) by ordinal.
  onOpenTurn?: (ord: number) => void;
  // Live: open an artifact.written path, read at HEAD. The two are mutually exclusive by mode —
  // replay rows carry a turn ordinal, live rows carry an artifact path — so a row offers at most
  // one affordance and there is no ambiguity about what a click does.
  onOpenArtifact?: (path: string) => void;
}) {
  const levelColor: Record<string, string> = { debug: "var(--text-faint)", info: "var(--text-muted)", warn: "var(--status-warning-ticker)", error: "var(--status-critical-text)" };
  // Turn ordinals arrive positionally aligned to `recentEvents` (server-side, so the client
  // never computes absolute event indices — a wrong ordinal means the wrong transcript).
  const turns = state.source?.correlation?.recentTurns ?? [];

  // Fold the two streams into ONE chronological list: the machine event bus (recentEvents) and
  // the HIL↔orchestrator conversation (source.correspondence). Both are tails taken up to the
  // same playhead, so their newest ends align; merging by timestamp and keeping the tail of the
  // merge gives a single time-consistent window. Rows render oldest→newest, NEWEST AT THE BOTTOM
  // — a terminal log that grows downward, so the live edge is the last line.
  const corr = state.source?.correspondence?.recent ?? [];
  const merged: MergedRow[] = [
    ...state.recentEvents.map((e, i) => ({ kind: "event" as const, ts: e.timestamp, e, turn: turns[i] ?? null })),
    ...corr.map((c) => ({ kind: "corr" as const, ts: c.at, c })),
  ]
    .sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0))
    .slice(-MERGED_TAIL);

  // Follow the live edge: keep the newest (bottom) row in view as rows arrive. Polite — only
  // auto-scrolls when the viewer is already parked at the bottom, so scrolling up to read history
  // isn't yanked back down. `stick` starts true (a fresh ticker follows) and flips on manual
  // scroll away from the bottom. The effect re-runs when the newest row changes.
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const newestTs = merged[merged.length - 1]?.ts;
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [newestTs, state.eventCount]);
  const onScroll = () => {
    const el = scrollRef.current;
    if (el) stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  };
  return (
    <div>
      {/* A drill-down row must LOOK clickable at rest, not only reward a hover — Kevin lost the
          `»` affordance in the merge because it was a faint tail span the auto-scroll buried. The
          `.consort-open` class carries a left accent rail + a hover lift so an openable row reads
          as a button in a log of inert lines. Interpolating theme tokens keeps it themed. */}
      <style>{`
        .consort-open { border-left: 2px solid var(--status-accent); background: var(--surface-inset); }
        .consort-open:hover { background: var(--surface-card); }
      `}</style>
      <div ref={scrollRef} onScroll={onScroll} style={{ background: "var(--surface-terminal)", borderRadius: radius.panel, padding: "12px 14px", maxHeight: 240, overflowY: "auto", fontFamily: font.mono, fontSize: "0.72rem" }}>
        {merged.map((row, i) => {
          if (row.kind === "corr") return <CorrRow key={i} c={row.c} onOpenTurn={onOpenTurn} />;
          const { e, turn } = row;
          const openTurn = turn !== null && !!onOpenTurn;
          // Only offer the artifact affordance when NOT already offering a turn (a recorded turn
          // is the richer drill-down), and only for a row that actually names a path.
          const artifactPath = openTurn ? null : onOpenArtifact ? artifactPathOf(e) : null;
          const clickable = openTurn || artifactPath !== null;
          const onClick = openTurn ? () => onOpenTurn!(turn!) : artifactPath !== null ? () => onOpenArtifact!(artifactPath) : undefined;
          return (
            <div
              key={i}
              onClick={onClick}
              className={clickable ? "consort-open" : undefined}
              title={openTurn ? `Open turn ${turn} — transcript and produced files` : artifactPath !== null ? `Open ${artifactPath} — content at HEAD` : undefined}
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                // Clickable rows carry the accent rail (via the class), so pull their padding in by
                // the 2px border to keep every row's text on the same left edge.
                padding: clickable ? "2px 0 2px 4px" : "2px 0 2px 6px",
                color: "var(--border-default)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                cursor: clickable ? "pointer" : undefined,
              }}
            >
              {/* A fixed-width left gutter carrying a bold `»` on openable rows (blank otherwise, so
                  columns stay aligned). This is the marker Kevin remembers — leading the row, not a
                  faint trailing span, so it survives the auto-scroll and reads at a glance. */}
              {/* A clickable row carries the `surface.inset` highlight (via .consort-open), so its
                  text must switch to the SEMANTIC tokens — the always-light onDark* colors used on
                  the dark-terminal rows are unreadable on that highlight in light mode (light-on-
                  white). Using strong/body/muted (not hardcoded black) makes it correct in both
                  palettes: light row + dark text in light mode, dark row + light text in dark. */}
              <span style={{ width: 10, color: clickable ? "var(--status-accent)" : "transparent", fontWeight: 800 }}>{clickable ? "»" : ""}</span>
              <span style={{ color: "var(--text-muted)" }}>{e.timestamp.slice(11, 19)}</span>
              <span style={{ color: clickable ? "var(--text-muted)" : levelColor[e.level] ?? "var(--text-muted)", width: 42 }}>{e.event.split(".")[0]}</span>
              <span style={{ color: clickable ? "var(--text-body)" : "var(--text-on-dark-accent)", width: 130, overflow: "hidden", textOverflow: "ellipsis" }}>{e.role}</span>
              <span style={{ color: clickable ? "var(--text-strong)" : "var(--text-on-dark-muted)", overflow: "hidden", textOverflow: "ellipsis" }}>{e.message}</span>
              {/* The trailing label names the action (open …), accent-coloured so it reads as the
                  button it is rather than metadata. Only rows that begin a recorded turn / name an
                  artifact are openable, so the affordance marks exactly where the drill-down is. */}
              {openTurn ? <span style={{ marginLeft: "auto", color: "var(--status-accent)", fontWeight: 700, paddingLeft: 8 }}>open turn {turn} ›</span> : null}
              {artifactPath !== null ? <span style={{ marginLeft: "auto", color: "var(--status-accent)", fontWeight: 700, paddingLeft: 8 }}>open file ›</span> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// A LIVE build can open produced files at HEAD and rewind its timeline, but the prompts, inputs,
// the HIL↔orchestrator conversation, and point-in-time per-step snapshots live only in the
// record-lane corpus. Rather than let those panels silently not exist (the "where did the
// drill-down go?" report), this states plainly what IS and ISN'T available, and how to get the rest.
//
// VISIBILITY IS DRIVEN BY THE MISSING CAPABILITIES, NOT by the `recording` flag. Conflating "the
// recorder is writing" with "the dashboard can show the richer data" is how a banner meant to
// explain a gap ends up hiding DURING the gap: a build can be recording to disk while this source
// still lacks the transcripts/correspondence/stepOutputs capabilities that surface it (that wiring
// is Phase B). So the banner shows whenever a live board is missing any of those, and hides itself
// only once they are ALL present — at which point there is genuinely nothing to warn about. The
// `recording` flag is used solely to tailor the remediation line (turn capture on vs. it's already
// on, use replay). Renders nothing for replay (fidelity null — a corpus is full-fidelity by
// definition, and a corpus that simply lacks correspondence is not something a re-run would fix).
export function FidelityBanner({ source }: { source: DashboardState["source"] }) {
  const fidelity = source?.fidelity;
  // `fidelity` is present only on sources that reason about capture — live today. Null → replay.
  if (!source || !fidelity) return null;
  const caps = new Set(source.capabilities);
  // The record-lane corpus would add these; each line is keyed off the capability still MISSING,
  // so as a future recording-aware live source gains one (Phase B) it drops out — and when none
  // remain, `missing` is empty and the banner hides itself. Point-in-time snapshots are keyed on
  // `stepOutputs` (replay's per-turn recorded-artifacts); live's artifactContent is HEAD-only.
  const missing: string[] = [];
  if (!caps.has("transcripts")) missing.push("prompts & inputs");
  if (!caps.has("correspondence")) missing.push("the HIL↔orchestrator conversation");
  if (!caps.has("stepOutputs")) missing.push("point-in-time per-step snapshots");
  if (missing.length === 0) return null; // full-fidelity live — nothing to warn about
  const available: string[] = [];
  if (caps.has("artifactContent")) available.push("current outputs (at HEAD)");
  if (caps.has("timeline")) available.push("the full event timeline");
  if (caps.has("featureStatus")) available.push("live status & progress");
  return (
    <div
      role="status"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        background: "var(--surface-inset)",
        border: `1px solid var(--border-default)`,
        borderLeft: `3px solid var(--status-accent)`,
        borderRadius: radius.panel,
        padding: "10px 13px",
        marginBottom: 12,
      }}
    >
      <span style={{ fontSize: "0.8rem", lineHeight: 1.3, color: "var(--status-accent)" }}>ℹ</span>
      <div>
        <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-strong)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {fidelity.recording ? "Live build · limited live view" : "Live build · not recording"}
        </div>
        <div style={{ fontSize: "0.78rem", color: "var(--text-body)", marginTop: 3 }}>
          {/* Guard the empty case: a source declaring none of the "available" caps must not render
              "Available: ." — say what it can do, or nothing rather than a broken sentence. */}
          {available.length > 0 ? `Available: ${available.join(" · ")}. ` : ""}Not captured: {missing.join(", ")}.
        </div>
        <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: 4 }}>
          {fidelity.recording ? (
            // The recorder is writing, but this dashboard doesn't yet surface those streams in a
            // live board (Phase B) — so point at replay rather than telling them to turn on what
            // is already on.
            <>Open the recorded corpus in replay mode to see these.</>
          ) : (
            <>
              For complete replay fidelity, re-run the build with{" "}
              <code style={{ fontFamily: font.mono, background: "var(--surface-card)", borderRadius: radius.chip, padding: "0 4px" }}>LAKEBASE_CONSORT_RECORD_DIR</code>{" "}
              set.
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** How many merged rows the ticker keeps in view. Larger than the 40-event tail because two
 *  interleaved streams share the window. */
const MERGED_TAIL = 60;

type CorrItem = NonNullable<NonNullable<DashboardState["source"]>["correspondence"]>["recent"][number];
type MergedRow =
  | { kind: "event"; ts: string; e: DashboardState["recentEvents"][number]; turn: number | null }
  | { kind: "corr"; ts: string; c: CorrItem };

// A correspondence row: the conversation, rendered distinctly from the machine event bus.
//
// Reads left→right like an event row (timestamp · lane · who · message) so the columns line up,
// but a purple accent + direction glyph mark it as a HIL↔orchestrator exchange, and the outcome
// badge (✓ approved / ✓ done) surfaces the per-action completion signal — the thing the agent
// log's turn-boundary logging lags on. Clicking a row that names a turn opens that turn (ordinals
// are 1:1 with the log's turns), the same drill-down an event row offers.
function CorrRow({ c, onOpenTurn }: { c: CorrItem; onOpenTurn?: (ord: number) => void }) {
  const openTurn = c.ordinal !== null && !!onOpenTurn;
  // "you" = the human-in-the-loop. "→you" is the orchestrator surfacing something to you; "you→"
  // is you answering (a kickoff or a gate approval). Kept short to fit the lane column and stay
  // aligned with the event rows; the full direction is in the row title.
  const arrow = c.direction === "hil-to-orch" ? "you→" : c.direction === "orch-to-hil" ? "→you" : c.direction;
  const badge = c.outcome === "approved" ? "✓ approved" : c.outcome === "validated" ? "✓ done" : null;
  const badgeColor = c.outcome === "approved" ? "var(--status-good)" : "var(--text-on-dark-muted)";
  return (
    <div
      onClick={openTurn ? () => onOpenTurn!(c.ordinal!) : undefined}
      title={openTurn ? `Open turn ${c.ordinal} — transcript and produced files` : `${arrow}${c.kind ? ` · ${c.kind}` : ""}`}
      style={{
        display: "flex",
        gap: 10,
        padding: "2px 0",
        paddingLeft: 6,
        marginLeft: -6,
        borderLeft: `2px solid var(--status-gate)`,
        background: "var(--status-gate-tint)",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        cursor: openTurn ? "pointer" : undefined,
      }}
    >
      <span style={{ color: "var(--text-muted)" }}>{c.at.slice(11, 19)}</span>
      {/* the "lane" column slot, reused to carry the direction glyph so columns align with events */}
      <span style={{ color: "var(--status-gate)", width: 42, overflow: "hidden", textOverflow: "ellipsis" }} title={arrow}>{arrow}</span>
      <span style={{ color: "var(--text-on-dark-accent)", width: 130, overflow: "hidden", textOverflow: "ellipsis" }}>{c.kind ?? "message"}</span>
      <span style={{ color: "var(--text-on-dark-muted)", overflow: "hidden", textOverflow: "ellipsis" }}>{c.text}</span>
      {badge ? <span style={{ marginLeft: "auto", color: badgeColor, paddingLeft: 8 }}>{badge}</span> : null}
      {openTurn && !badge ? <span style={{ marginLeft: "auto", color: "var(--text-on-dark-accent)", paddingLeft: 8 }}>turn {c.ordinal} ›</span> : null}
    </div>
  );
}
