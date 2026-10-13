"use client";

import { useEffect, useRef } from "react";
import { font, radius } from "@/lib/theme";

// Transport bar: play/pause, step, speed, scrub over the event log — the most valuable
// interaction, in the dashboard's light theme.
//
// The scrub position is an event COUNT (how many events are folded), matching the fold's
// `upTo` semantics: 0 = nothing folded, totalEventCount = the live edge. `at === null`
// means "follow the live edge", which is distinct from being pinned at the last index —
// pinned stops following, and the board must say so, because snapshot-derived panels keep
// describing now (see lib/reducer.ts and the plan's §3a).

export interface TransportProps {
  at: number | null; // null = following live
  total: number;
  onChange: (at: number | null) => void;
  playing: boolean;
  onPlayingChange: (playing: boolean) => void;
  speed: number; // events per second
  onSpeedChange: (speed: number) => void;
  // Timestamp of the event at the playhead, for the clock readout.
  atTimestamp?: string | null;
  // The run is parked on a human at the newest event, so the board isn't advancing until you act.
  // Two distinct cases: `escalated` (a problem was raised to you — a GREEN verify failed, etc.)
  // shows RAISED in red and takes precedence; a plain `awaitingGate` decision shows WAITING in
  // gate-purple, which is a normal checkpoint, NOT an alarm.
  awaitingGate?: boolean;
  escalated?: boolean;
  // A recorded run is always being REVIEWED (never live/running/waiting on you), so the state
  // readout stays "REVIEWING" at every playhead — the RUNNING/RAISED/WAITING states are live-run only.
  replay?: boolean;
}

const SPEEDS = [0.25, 0.5, 1, 2, 5, 20] as const;

// Sub-1 speeds read cleaner as fractions than as "0.25×".
const fmtSpeed = (s: number): string => (s === 0.25 ? "¼" : s === 0.5 ? "½" : String(s));

export function Transport({
  at,
  total,
  onChange,
  playing,
  onPlayingChange,
  speed,
  onSpeedChange,
  atTimestamp,
  awaitingGate = false,
  escalated = false,
  replay = false,
}: TransportProps) {
  const live = at === null;
  const pos = live ? total : Math.max(0, Math.min(at, total));
  const atEnd = pos >= total;

  // Playback advances the playhead on a timer. Reaching the end returns to following live,
  // so pressing play on a live run leaves you watching it rather than pinned one event back.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onPlayingChangeRef = useRef(onPlayingChange);
  onPlayingChangeRef.current = onPlayingChange;

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      const next = pos + 1;
      if (next >= total) {
        onChangeRef.current(null); // caught up — resume following
        onPlayingChangeRef.current(false);
      } else {
        onChangeRef.current(next);
      }
    }, 1000 / speed);
    return () => clearInterval(id);
  }, [playing, pos, total, speed]);

  const step = (delta: number) => {
    onPlayingChange(false);
    const next = pos + delta;
    if (next >= total) onChange(null);
    else onChange(Math.max(0, next));
  };

  return (
    <div
      style={{
        // The inner panel takes the LANE BODY colour (surface-panel — where the nodes live), not the
        // header/card surface, so the transport reads as part of the board's body. The outer play
        // band (page.tsx) stays surface-card, giving the same body-in-card nesting as a lane panel.
        background: "var(--surface-panel)",
        border: `1px solid var(--border-default)`,
        borderRadius: radius.card,
        padding: "10px 14px",
        display: "flex",
        alignItems: "center",
        gap: 14,
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <TransportButton label="⏮" title="jump to start" onClick={() => { onPlayingChange(false); onChange(0); }} />
        {/* The two STEP buttons are a mirrored pair — bar-then-triangle |◀ and triangle-then-bar ▶| —
            the frame-step convention (step to the previous / next boundary), distinct from the bare
            play triangle ▶. Before, step-back was a bare ◀ and step-forward a barred ▶|, so they read
            as unrelated controls. */}
        <TransportButton label="|◀" title="step back one event" onClick={() => step(-1)} disabled={pos <= 0} />
        <TransportButton
          label={playing ? "❚❚" : "▶"}
          title={playing ? "pause" : "play"}
          primary
          onClick={() => {
            // Playing from the live edge would have nowhere to go; restart from the top.
            if (!playing && atEnd) onChange(0);
            onPlayingChange(!playing);
          }}
        />
        <TransportButton label="▶|" title="step forward one event" onClick={() => step(1)} disabled={atEnd} />
        {/* Jump to end == GO LIVE: `at=null` snaps to the newest event AND, on an active run, keeps
            following the live edge as new events arrive (the natural "watch it happen now" state); on
            a finished run it simply pins at the last event. Stops playback so you're following, not
            replaying. Disabled when already following live (nothing to jump to). Mirror of ⏮. */}
        <TransportButton label="⏭" title="jump to end (follow live)" onClick={() => { onPlayingChange(false); onChange(null); }} disabled={live} />
      </div>

      <input
        type="range"
        min={0}
        max={total}
        value={pos}
        onChange={(e) => {
          onPlayingChange(false);
          const v = Number(e.target.value);
          // Dragging to the far right means "follow live" rather than "pin at the end".
          onChange(v >= total ? null : v);
        }}
        aria-label="scrub through the event log"
        style={{ flex: 1, minWidth: 160, accentColor: "var(--status-play)", cursor: "pointer" }}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "0.7rem", color: "var(--text-muted)" }}>
        <span style={{ fontVariantNumeric: "tabular-nums", fontFamily: font.mono }}>
          {pos} / {total}
        </span>
        <span style={{ fontVariantNumeric: "tabular-nums", fontFamily: font.mono, color: "var(--text-faint)" }}>
          {atTimestamp ? atTimestamp.slice(11, 19) : "--:--:--"}
        </span>
        {replay || !live ? (
          // REVIEWING = you're reviewing history, not following a live edge. A recorded run is ALWAYS
          // this (nothing is running / waiting on you now); a live run shows it when scrubbed back.
          // NOT "PAUSED" — that read as the run being paused. Jump-to-end (⏭) returns to the edge.
          <span style={{ color: "var(--status-accent-text)", fontWeight: 700 }}>REVIEWING</span>
        ) : escalated ? (
          // A problem was raised to a human (red) — corresponds with the raised-to-HIL state
          // everywhere else on the board.
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--status-critical-text)", fontWeight: 700 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--status-critical)", animation: "softpulse 1.6s ease-in-out infinite" }} />
            RAISED
          </span>
        ) : awaitingGate ? (
          // Parked on a normal human decision at a gate (purple) — a checkpoint, not an alarm.
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--status-gate-text)", fontWeight: 700 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--status-gate)", animation: "softpulse 1.6s ease-in-out infinite" }} />
            WAITING
          </span>
        ) : (
          // At the newest event, following the run forward. No glyph — the active step already
          // flashes on the board, so this is just the label.
          <span style={{ color: "var(--status-good)", fontWeight: 700 }}>RUNNING</span>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.68rem" }}>
        <span style={{ color: "var(--text-faint)" }}>speed:</span>
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => onSpeedChange(s)}
            style={{
              border: `1px solid var(--border-default)`,
              // Selected = inverted chip; text-strong (not surface-terminal) as bg so it inverts
              // in dark too (light: #111827 unchanged; dark: #fff), keeping the label legible.
              background: speed === s ? "var(--text-strong)" : "var(--surface-card)",
              color: speed === s ? "var(--surface-card)" : "var(--text-muted)",
              borderRadius: radius.chip,
              padding: "2px 7px",
              fontSize: "0.66rem",
              cursor: "pointer",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {fmtSpeed(s)}×
          </button>
        ))}
      </div>
    </div>
  );
}

function TransportButton({
  label,
  title,
  onClick,
  disabled,
  primary,
  active,
}: {
  label: string;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      style={{
        border: `1px solid ${primary ? "var(--status-play-border)" : active ? "var(--status-good)" : "var(--border-default)"}`,
        // The play/pause button is the same blue as the scrub slider (the only `primary` button) —
        // --status-play, shared with the drill-down's selected tab — with a white glyph so the
        // ▶/❚❚ reads on the blue in both themes.
        background: primary ? "var(--status-play)" : active ? "var(--status-good-tint-soft)" : "var(--surface-card)",
        color: primary ? "#ffffff" : active ? "var(--status-good-text)" : "var(--text-muted)",
        borderRadius: radius.chip,
        padding: "3px 9px",
        fontSize: "0.72rem",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        fontWeight: primary || active ? 700 : 500,
        minWidth: 30,
      }}
    >
      {label}
    </button>
  );
}
