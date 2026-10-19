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
  // Replay GRANULARITY. "events" (default) scrubs the event log (`at`, null = follow live). "lines"
  // scrubs the flattened agent-log timeline — each tool action / reasoning line a step, turns the
  // checkpoints (`checkpoints`). The same controls drive whichever mode is active.
  granularity?: "events" | "lines";
  onGranularityChange?: (g: "events" | "lines") => void;
  lineTotal?: number;
  lineAt?: number;
  onLineChange?: (n: number) => void;
  /** Turn start positions (line indices) rendered as checkpoint ticks on the track in lines mode. */
  checkpoints?: number[];
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
  granularity = "events",
  onGranularityChange,
  lineTotal = 0,
  lineAt = 0,
  onLineChange,
  checkpoints,
}: TransportProps) {
  // Two scrub modes share ONE set of controls. "events": the event log (`at` null = follow live).
  // "lines": the flattened agent-log timeline (a plain index, no live edge to follow).
  const isLines = granularity === "lines";
  const live = !isLines && at === null;
  const activeTotal = isLines ? lineTotal : total;
  const activePos = isLines
    ? Math.max(0, Math.min(lineAt, activeTotal))
    : live
      ? total
      : Math.max(0, Math.min(at as number, total));
  const atEnd = activePos >= activeTotal;

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onLineChangeRef = useRef(onLineChange);
  onLineChangeRef.current = onLineChange;
  const onPlayingChangeRef = useRef(onPlayingChange);
  onPlayingChangeRef.current = onPlayingChange;

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      const next = activePos + 1;
      if (next >= activeTotal) {
        if (isLines) onLineChangeRef.current?.(activeTotal);
        else onChangeRef.current(null); // caught up — resume following live
        onPlayingChangeRef.current(false);
      } else if (isLines) {
        onLineChangeRef.current?.(next);
      } else {
        onChangeRef.current(next);
      }
    }, 1000 / speed);
    return () => clearInterval(id);
  }, [playing, activePos, activeTotal, speed, isLines]);

  const step = (delta: number) => {
    onPlayingChange(false);
    const next = activePos + delta;
    if (isLines) onLineChange?.(Math.max(0, Math.min(next, activeTotal)));
    else if (next >= total) onChange(null);
    else onChange(Math.max(0, next));
  };
  const toStart = () => {
    onPlayingChange(false);
    if (isLines) onLineChange?.(0);
    else onChange(0);
  };
  const toEnd = () => {
    onPlayingChange(false);
    if (isLines) onLineChange?.(activeTotal);
    else onChange(null);
  };
  const scrubTo = (v: number) => {
    onPlayingChange(false);
    if (isLines) onLineChange?.(Math.max(0, Math.min(v, activeTotal)));
    else onChange(v >= total ? null : v);
  };
  const playPause = () => {
    if (!playing && atEnd) {
      if (isLines) onLineChange?.(0);
      else onChange(0);
    }
    onPlayingChange(!playing);
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
        <TransportButton label="⏮" title="jump to start" onClick={toStart} />
        {/* Mirrored frame-step pair |◀ / ▶| — step to the previous / next boundary (event or line). */}
        <TransportButton label="|◀" title={isLines ? "step back one line" : "step back one event"} onClick={() => step(-1)} disabled={activePos <= 0} />
        <TransportButton label={playing ? "❚❚" : "▶"} title={playing ? "pause" : "play"} primary onClick={playPause} />
        <TransportButton label="▶|" title={isLines ? "step forward one line" : "step forward one event"} onClick={() => step(1)} disabled={atEnd} />
        {/* Jump to end: events → follow the live edge; lines → the last line. Disabled when already there. */}
        <TransportButton label="⏭" title={isLines ? "jump to last line" : "jump to end (follow live)"} onClick={toEnd} disabled={isLines ? atEnd : live} />
      </div>

      <div style={{ flex: 1, minWidth: 160, position: "relative", display: "flex", alignItems: "center" }}>
        <input
          type="range"
          min={0}
          max={activeTotal}
          value={activePos}
          onChange={(e) => scrubTo(Number(e.target.value))}
          aria-label={isLines ? "scrub through the agent log" : "scrub through the event log"}
          style={{ flex: 1, accentColor: "var(--status-play)", cursor: "pointer" }}
        />
        {/* Turn checkpoints as ticks on the track (lines mode only). */}
        {isLines && checkpoints && activeTotal > 0
          ? checkpoints.map((c, i) => (
              <span
                key={i}
                aria-hidden
                title="turn checkpoint"
                style={{ position: "absolute", top: "50%", transform: "translate(-50%, -50%)", left: `${(c / activeTotal) * 100}%`, width: 2, height: 11, background: "var(--status-gate)", opacity: 0.55, pointerEvents: "none", borderRadius: 1 }}
              />
            ))
          : null}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "0.7rem", color: "var(--text-muted)" }}>
        <span style={{ fontVariantNumeric: "tabular-nums", fontFamily: font.mono }}>
          {activePos} / {activeTotal}
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

      {onGranularityChange ? (
        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.66rem" }}>
          <span style={{ color: "var(--text-faint)" }}>scrub:</span>
          {(["events", "lines"] as const).map((g) => {
            const disabled = g === "lines" && lineTotal === 0;
            return (
              <button
                key={g}
                onClick={() => onGranularityChange(g)}
                disabled={disabled}
                title={g === "lines" ? "step the agent log line by line (turns are the checkpoints)" : "step the event log"}
                style={{
                  border: `1px solid ${granularity === g ? "var(--status-play-border)" : "var(--border-default)"}`,
                  background: granularity === g ? "var(--status-play)" : "var(--surface-card)",
                  color: granularity === g ? "#ffffff" : "var(--text-muted)",
                  borderRadius: radius.chip,
                  padding: "2px 7px",
                  fontSize: "0.64rem",
                  cursor: disabled ? "not-allowed" : "pointer",
                  opacity: disabled ? 0.4 : 1,
                }}
              >
                {g}
              </button>
            );
          })}
        </div>
      ) : null}

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
