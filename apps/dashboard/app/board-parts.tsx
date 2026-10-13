"use client";

// Pieces shared between the board and its tests.
//
// They live here rather than in page.tsx because a Next.js page module may only export a
// default — exporting a named component alongside it fails the build's route type check
// (`Property 'x' is incompatible with index signature`). `npm run build` catches that; `tsc`
// and vitest do not, which is how it slipped through once.

import { useEffect, useRef } from "react";
import { ROLES, type DashboardState } from "@/lib/types";
import { colorForRole, font, radius } from "@/lib/theme";

// Only a genuine agent role may own a turn's `#ordinal` colour. A progress beat's `request.role`
// is overloaded (correspondence.ts:44, "role OR kind"): a real role for an agent turn, but an
// ORCHESTRATION ACTION KIND (approve-gate, surface-gate, …) for an orchestrator bookkeeping beat.
// Admitting a kind would paint a gate approval's ordinal with a non-role (`colorForRole` ⇒
// --text-faint) instead of its answerer, the product-owner — so turn ownership is gated on this set.
const ROLE_SET: ReadonlySet<string> = new Set(ROLES);

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

// Colour the STATE-TRANSITION event kinds so the stream is scannable by category — a
// colour-coded timeline is how a demo viewer spots "a gate surfaced" or "a deploy verified" at a
// glance instead of reading every grey line. Kept to the board's existing
// semantic palette (each token is already used as text ON the dark terminal, so it's readable in
// both themes) and to the kinds that carry meaning; the structural rows (handoff/artifact/phase/
// intake/usage) stay neutral so the colour actually means something. `reasoning` is handled
// separately (its own role colour + 💭). The `label` doubles as the legend caption.
//
// Two deliberate exclusions: (1) these colours are used ONLY at info/debug level — a warn/error
// row (e.g. `deploy.failed`, `verify.failed`, a rejected gate) keeps its level colour so a FAILURE
// never renders in the green/purple a viewer would read as success (see eventAccent's caller). (2)
// no TDD-cycle colour: `--status-accent` is reserved for the "openable" signal (the » gutter + open
// links + the clickable rail), so tinting cycle rows with it would make inert rows read as clickable.
const EVENT_LEGEND: { match: (event: string) => boolean; color: string; label: string }[] = [
  { match: (e) => e.startsWith("gate"), color: "var(--status-gate)", label: "gate" },
  { match: (e) => e.startsWith("escalation"), color: "var(--status-critical-text)", label: "escalation" },
  // deploy.* / verify.* are ALL the Release Engineer's deterministic substrate events (logDeployEvent
  // stamps role="release-engineer"), so they read in the RE's own role colour — the same mint the
  // deploy lane's steps carry — instead of a generic "good" green. (A FAILURE stays red via the
  // level branch above.)
  { match: (e) => e.startsWith("deploy") || e.startsWith("verify"), color: colorForRole("release-engineer"), label: "deploy / verify" },
];

/** The categorical colour for a state-transition event kind, or null to fall back to the level colour. */
function eventAccent(event: string): string | null {
  return EVENT_LEGEND.find((k) => k.match(event))?.color ?? null;
}

export function EventTicker({
  state,
  onOpenTurn,
  onOpenArtifact,
  variant = "block",
}: {
  state: DashboardState;
  // Replay: open a recorded turn (transcript + per-turn snapshot) by ordinal.
  onOpenTurn?: (ord: number) => void;
  // Live: open an artifact.written path, read at HEAD. The two are mutually exclusive by mode —
  // replay rows carry a turn ordinal, live rows carry an artifact path — so a row offers at most
  // one affordance and there is no ambiguity about what a click does.
  onOpenArtifact?: (path: string) => void;
  // "block" (default): the self-contained card the page used to stack inline — a legend above a
  // capped-height (240px) rounded terminal box. "pane": the log fills a collapsible right-side
  // pane — no legend, no cap, no radius; the scroll list flexes to the pane's full height (the
  // reference's `#logpane` model).
  variant?: "block" | "pane";
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
  // The role for a correspondence beat, derived from data ALREADY on the timeline (so it renders
  // with no re-run) — the SAME role the event rows read off the log, never re-parsed from prose:
  //   • a gate beat's role follows its direction — the orchestrator ASKS (orch→hil = await.gate),
  //     the PO ANSWERS (hil→orch = response.gate), the exact pair the agent-log stamps on
  //     gate.surfaced / gate.approved;
  //   • any other beat (a progress/turn.complete report) takes the role of the turn it names, looked
  //     up by ordinal from the events.
  // A structured `c.role` (newer corpora emit it at the source) wins when present.
  const ordinalRole = new Map<number, string>();
  state.recentEvents.forEach((e, i) => {
    const ord = turns[i];
    if (ord != null && e.role) ordinalRole.set(ord, e.role);
  });
  const corrRole = (c: CorrItem): string | null =>
    c.role ??
    (c.kind === "gate"
      ? c.direction === "hil-to-orch"
        ? "product-owner"
        : "orchestrator"
      : c.ordinal != null
        ? ordinalRole.get(c.ordinal) ?? null
        : null);
  // #<ordinal> is a TURN identity, so it takes ONE colour per turn — the turn OWNER's role (the role
  // of that turn's completion/progress beat), shared by the turn's ask/answer/completion beats so one
  // turn never renders #N in three colours. The [role] bracket still names the per-beat actor.
  //
  // Only a real agent role may own that colour. A progress beat's `request.role` is overloaded
  // (correspondence.ts:44, "role OR kind"): a real role for an agent turn, but an ORCHESTRATION
  // ACTION KIND (approve-gate/surface-gate) for a gate-approval bookkeeping beat — admitting a kind
  // would paint the #ordinal with a non-role (colorForRole ⇒ --text-faint), so it is gated on ROLE_SET.
  const turnOwnerRole = new Map<number, string>();
  for (const c of corr) {
    if (c.kind === "progress" && c.ordinal != null) {
      const r = corrRole(c);
      if (r && ROLE_SET.has(r)) turnOwnerRole.set(c.ordinal, r);
    }
  }
  // A GATE turn (its ask/answer/completion beats) is not owned by any single agent — the orchestrator
  // asks, the product-owner answers — so its #ordinal takes the GATE BAND colour, matching the
  // kind label and the row's left rail (--status-gate-text) rather than one actor's role.
  const gateTurnOrdinals = new Set<number>();
  for (const c of corr) if (c.kind === "gate" && c.ordinal != null) gateTurnOrdinals.add(c.ordinal);
  // The resolved #ordinal colour for a correspondence row: the gate band for a gate turn, else the
  // turn-owner's role colour (falling back to the beat's own role when the turn has no owner beat).
  const turnColorFor = (c: CorrItem): string =>
    c.ordinal != null && gateTurnOrdinals.has(c.ordinal)
      ? "var(--status-gate-text)"
      : colorForRole(((c.ordinal != null ? turnOwnerRole.get(c.ordinal) : null) ?? corrRole(c)) ?? "");
  // Within a SINGLE timestamp, order the gate lifecycle the way it happens, not by which stream
  // (agent-log vs correspondence) wrote first: the orchestrator's turn.usage, then it SURFACES the
  // gate, then ASKS (await.gate), the HIL ANSWERS (response.gate), then the approval is LOGGED
  // (gate.approved). `gate.surfaced`/`gate.approved` land at the same sub-second as their correspondence
  // twins, so a bare timestamp sort puts both gate.approved events before response.gate (events-first);
  // this rank interleaves them correctly. Non-gate rows share a neutral rank (stable order preserved).
  const lifecycleRank = (row: MergedRow): number => {
    if (row.kind === "event") {
      const ev = row.e.event;
      if (ev === "turn.usage") return 0;
      if (ev === "gate.surfaced") return 1;
      if (ev === "gate.approved" || ev === "gate.rejected") return 4;
      return 2;
    }
    // a gate correspondence beat: the ask (orch→hil) sits just after surfaced; the answer (hil→orch)
    // just before the logged approval.
    if (row.c.kind === "gate") return row.c.direction === "hil-to-orch" ? 3 : 2;
    return 2;
  };
  const merged: MergedRow[] = [
    ...state.recentEvents.map((e, i) => ({ kind: "event" as const, ts: e.timestamp, e, turn: turns[i] ?? null })),
    ...corr.map((c) => ({
      kind: "corr" as const,
      ts: c.at,
      c,
      role: corrRole(c),
      turnColor: turnColorFor(c),
    })),
  ]
    .sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : lifecycleRank(a) - lifecycleRank(b)))
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
  // The scroll list: a capped rounded card in "block" mode, or a flex-filling, square, un-capped
  // list that takes the whole pane height in "pane" mode.
  const listStyle: React.CSSProperties =
    variant === "pane"
      ? { flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 10px", background: "transparent", fontFamily: font.mono, fontSize: "0.72rem" }
      : { background: "var(--surface-card)", border: `1px solid var(--border-default)`, borderRadius: radius.panel, padding: "12px 14px", maxHeight: 240, overflowY: "auto", fontFamily: font.mono, fontSize: "0.72rem" };
  return (
    <div style={variant === "pane" ? { display: "flex", flexDirection: "column", flex: 1, minHeight: 0 } : undefined}>
      {/* A drill-down (turn-starting / artifact) row must LOOK clickable at rest, not only reward a
          hover. The `.consort-open` class adds a left accent rail + a subtle inset tint so an
          openable row reads as a button in a log of inert lines — the reference's `.turnstart`
          affordance — on the clear (card) surface the log now shares with the other panes. */}
      <style>{`
        .consort-open { border-left: 2px solid var(--status-accent); background: var(--surface-inset); }
        .consort-open:hover { background: var(--surface-muted); }
      `}</style>
      {/* A colour key for the stream: names what the state-transition colours mean plus the 💭
          reasoning marker, so a viewer reads the timeline at a glance. Sits above
          the log on the page ground, so its labels use the theme-safe muted token. */}
      {variant === "block" ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 6, fontSize: "0.64rem", color: "var(--text-muted)" }}>
          {EVENT_LEGEND.map((k) => (
            <span key={k.label} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: k.color, flexShrink: 0 }} />
              {k.label}
            </span>
          ))}
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: "0.7rem" }}>💭</span>
            reasoning
          </span>
        </div>
      ) : null}
      <div ref={scrollRef} onScroll={onScroll} style={listStyle}>
        {merged.map((row, i) => {
          if (row.kind === "corr") return <CorrRow key={i} c={row.c} role={row.role} turnColor={row.turnColor} onOpenTurn={onOpenTurn} />;
          const { e, turn } = row;
          const openTurn = turn !== null && !!onOpenTurn;
          // Only offer the artifact affordance when NOT already offering a turn (a recorded turn
          // is the richer drill-down), and only for a row that actually names a path.
          const artifactPath = openTurn ? null : onOpenArtifact ? artifactPathOf(e) : null;
          const clickable = openTurn || artifactPath !== null;
          const onClick = openTurn ? () => onOpenTurn!(turn!) : artifactPath !== null ? () => onOpenArtifact!(artifactPath) : undefined;
          // The event token is bold and coloured by KIND (handoff/gate/deploy/intake/…), matching
          // the reference's `.ev` + `.k-*`. A warn/error row keeps its LEVEL colour instead, so a
          // failed deploy/verify or rejected gate stays red/amber (never the green/purple that would
          // read as success), and a `reasoning` row takes its agent's role colour.
          const isReasoning = e.event === "reasoning";
          const eventColor = isReasoning
            ? e.role
              ? colorForRole(e.role)
              : "var(--text-body)"
            : e.level === "warn" || e.level === "error"
              ? levelColor[e.level] ?? "var(--text-body)"
              : eventAccent(e.event) ?? "var(--text-body)";
          // The AGENT colour for this row's role , shared by BOTH the #<ordinal> turn marker and the
          // left accent rail, so a row's turn number and its rail read as the same agent (the #N is
          // NOT part of the lime selection accent). Fallback to the neutral accent when roleless.
          const agentColor = e.role ? colorForRole(e.role) : "var(--status-accent)";
          return (
            // Reference `.row`: a [time | message] grid. The message column carries the whole line —
            // #ordinal (blue, on a turn-starting row) · event (bold, kind-coloured) · [role] (muted) ·
            // message — and wraps (pre-wrap) so nothing is clipped. Openable rows get the accent rail
            // + pointer via `.consort-open`.
            <div
              key={i}
              onClick={onClick}
              className={clickable ? "consort-open" : undefined}
              title={openTurn ? `Open turn ${turn} — transcript and produced files` : artifactPath !== null ? `Open ${artifactPath} — content at HEAD` : undefined}
              style={{
                display: "grid",
                gridTemplateColumns: "54px 1fr",
                gap: 8,
                // Clickable rows carry the 2px accent rail (via the class); pull their left padding
                // in by 2px so every row's text stays on the same left edge.
                padding: clickable ? "3px 4px" : "3px 4px 3px 6px",
                cursor: clickable ? "pointer" : undefined,
                // Override the .consort-open class's static accent rail with THIS row's agent colour.
                ...(clickable ? { borderLeft: `2px solid ${agentColor}` } : {}),
              }}
            >
              {/* Time column (reference `.t`): muted, tabular figures. */}
              <span style={{ color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>{e.timestamp.slice(11, 19)}</span>
              {/* Message column (reference `.m`): #ord · event · [role] · message, wrapping. */}
              <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {openTurn ? <span style={{ color: agentColor, fontWeight: 700 }}>#{turn} </span> : null}
                <span style={{ fontWeight: 700, color: eventColor }}>{e.event}</span>{" "}
                <span style={{ color: "var(--text-muted)" }}>[{e.role ?? "?"}]</span>{" "}
                <span style={{ color: "var(--text-body)" }}>{e.message}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// The event log as a COLLAPSIBLE RIGHT-SIDE PANE (the reference's `#logpane`), not an overlay: it's
// a flex sibling of the main column, so expanding it makes the board share horizontal space rather
// than covering it. It matches the board column's height exactly — the flex row's
// `align-items:stretch` stretches it to the main column, so it ends level with the last section on
// the left (no viewport floor overshooting past it) — and its list scrolls internally (a scrollbar)
// when the log is longer than that. Collapsed, it shrinks to a thin rail with a vertical label +
// expand button, handing the width back to the board.
const SIDE_PANE_WIDTH = 380;

// The shared chrome for a collapsible SIDE pane — the event log (right) and the planning backlog
// (left) are the same component mirrored. It stretches to the board column's height (the flex row's
// `align-items:stretch`) and stops there; `position:relative` + an absolutely-filled inner column
// keeps its (possibly long) content out of flow so it can NEVER drive the row taller than the board
// — the content then scrolls inside the fixed box. Collapsed, it shrinks to a thin rail with a
// vertical label + an expand button, handing the width back to the board. Not an overlay: it's a
// real flex sibling, so opening it makes the board share horizontal space.
export function SidePane({
  side,
  title,
  open,
  onToggle,
  width = SIDE_PANE_WIDTH,
  children,
}: {
  side: "left" | "right";
  title: string;
  open: boolean;
  onToggle: () => void;
  width?: number;
  children: React.ReactNode;
}) {
  const frame: React.CSSProperties = {
    flex: "none",
    alignSelf: "stretch",
    position: "relative",
    // Body carries a SUBTLE tint (surface-panel) — off the board background, but far less lifted
    // than the card-surface header band, so it doesn't read as a raised card.
    background: "var(--surface-panel)",
    border: `1px solid var(--border-default)`,
    borderRadius: radius.panel,
    overflow: "hidden",
    // Gap goes on the side that faces the board.
    ...(side === "left" ? { marginRight: 16 } : { marginLeft: 16 }),
  };
  const fill: React.CSSProperties = { position: "absolute", inset: 0, display: "flex", flexDirection: "column" };
  const toggleBtn: React.CSSProperties = {
    background: "none",
    border: `1px solid var(--border-default)`,
    borderRadius: radius.chip,
    color: "var(--text-muted)",
    cursor: "pointer",
    width: 24,
    height: 24,
    lineHeight: 1,
    fontSize: "0.8rem",
  };
  // Distinct card-surface header band over the subtly-tinted body.
  const headBand: React.CSSProperties = { background: "var(--surface-card)", borderBottom: `1px solid var(--border-default)`, flex: "none" };
  // The chevron points toward the edge the pane tucks into: a right pane collapses with ›, a left ‹.
  const collapseGlyph = side === "left" ? "‹" : "›";
  const expandGlyph = side === "left" ? "›" : "‹";
  if (!open) {
    return (
      <div style={{ ...frame, width: 34 }}>
        <div style={{ ...fill, alignItems: "center", padding: "8px 0" }}>
          <button onClick={onToggle} title={`Show ${title}`} aria-label={`Show ${title}`} style={toggleBtn}>
            {expandGlyph}
          </button>
          <div style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", marginTop: 12, fontSize: "0.62rem", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 700, whiteSpace: "nowrap" }}>
            {title}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ ...frame, width }}>
      <div style={fill}>
        <div style={{ ...headBand, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "10px 14px" }}>
          <span style={{ fontSize: "0.66rem", textTransform: "uppercase", letterSpacing: "0.09em", color: "var(--text-muted)", fontWeight: 700 }}>{title}</span>
          <button onClick={onToggle} title={`Collapse ${title}`} aria-label={`Collapse ${title}`} style={toggleBtn}>
            {collapseGlyph}
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// The event log as the RIGHT-side collapsible pane.
export function LogPane({
  state,
  open,
  onToggle,
  onOpenTurn,
  onOpenArtifact,
}: {
  state: DashboardState;
  open: boolean;
  onToggle: () => void;
  onOpenTurn?: (ord: number) => void;
  onOpenArtifact?: (path: string) => void;
}) {
  return (
    <SidePane side="right" title={`Event log · ${state.eventCount}`} open={open} onToggle={onToggle}>
      <EventTicker state={state} onOpenTurn={onOpenTurn} onOpenArtifact={onOpenArtifact} variant="pane" />
    </SidePane>
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

/** How many merged rows the ticker keeps in view. `Infinity` = no extra cap here: the fold already
 *  ships a rolling window of the last RECENT_EVENT_TAIL (20) events up to the playhead, so the pane
 *  renders those (plus any interleaved correspondence rows) — the 20-event cap lives in the fold. */
const MERGED_TAIL = Number.POSITIVE_INFINITY;

type CorrItem = NonNullable<NonNullable<DashboardState["source"]>["correspondence"]>["recent"][number];
type MergedRow =
  | { kind: "event"; ts: string; e: DashboardState["recentEvents"][number]; turn: number | null }
  | { kind: "corr"; ts: string; c: CorrItem; role: string | null; turnColor: string };

// A correspondence row: the conversation, rendered distinctly from the machine event bus.
//
// Reads left→right like an event row (timestamp · lane · who · message) so the columns line up,
// but a purple accent + direction glyph mark it as a HIL↔orchestrator exchange, and the outcome
// badge (✓ approved / ✓ done) surfaces the per-action completion signal — the thing the agent
// log's turn-boundary logging lags on. Clicking a row that names a turn opens that turn (ordinals
// are 1:1 with the log's turns), the same drill-down an event row offers.
function CorrRow({ c, role, turnColor, onOpenTurn }: { c: CorrItem; role: string | null; turnColor: string; onOpenTurn?: (ord: number) => void }) {
  const openTurn = c.ordinal !== null && !!onOpenTurn;
  const badge = c.outcome === "approved" ? "✓ approved" : c.outcome === "validated" ? "✓ done" : null;
  const badgeColor = c.outcome === "approved" ? "var(--status-good)" : "var(--text-muted)";
  // Convention (matches the event rows at line ~240): the turn marker #<ordinal> LEADS the row in the
  // TURN's identity colour (`turnColor`, one per ordinal — so a turn's ask/answer/completion share one
  // colour: a gate turn takes the gate band, an agent turn its role), and the beat's own actor renders
  // as a darker [role] tag. Both are DERIVED upstream at the merge from the same log the event rows read.
  const agentColor = turnColor;
  // The KIND label carries the direction (no arrow glyph): a `progress` row is a one-way completion
  // report → `turn.complete`; a `gate` row is the two-way HIL exchange → `await.gate` when the
  // orchestrator presents it to you (orch→hil) and `response.gate` when you answer (hil→orch). It
  // renders bold + gate-purple, the same weight the event rows give `gate.surfaced`.
  const kindLabel =
    c.kind === "progress"
      ? "turn.complete"
      : c.kind === "gate"
        ? c.direction === "hil-to-orch"
          ? "response.gate"
          : "await.gate"
        : c.kind ?? "message";
  return (
    <div
      onClick={openTurn ? () => onOpenTurn!(c.ordinal!) : undefined}
      title={openTurn ? `Open turn ${c.ordinal} — transcript and produced files` : kindLabel}
      style={{
        display: "flex",
        gap: 10,
        padding: "2px 0",
        paddingLeft: 6,
        marginLeft: -6,
        borderLeft: `2px solid var(--status-gate-text)`,
        background: "var(--status-gate-tint-faint)",
        cursor: openTurn ? "pointer" : undefined,
      }}
    >
      <span style={{ color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>{c.at.slice(11, 19)}</span>
      {/* One WRAPPING message column (like the event rows): #ord (agent colour) · kind (bold) · [role]
          · text. Wrapping instead of fixed-width clipping keeps the text readable in a narrow pane. */}
      <span style={{ flex: 1, minWidth: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
        {openTurn ? <span style={{ color: agentColor, fontWeight: 700 }}>#{c.ordinal} </span> : null}
        <span style={{ color: "var(--status-gate-text)", fontWeight: 700 }}>{kindLabel}</span>{" "}
        {role ? <span style={{ color: "var(--text-muted)" }}>[{role}] </span> : null}
        <span style={{ color: "var(--text-body)" }}>{c.text}</span>
      </span>
      {badge ? <span style={{ marginLeft: "auto", color: badgeColor, paddingLeft: 8, whiteSpace: "nowrap" }}>{badge}</span> : null}
    </div>
  );
}
