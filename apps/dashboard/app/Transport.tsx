"use client";

import { useEffect, useRef } from "react";
import { font, radius } from "@/lib/theme";

// Transport bar: play/pause, step, speed, scrub over the event log — Kevin's most valuable
// interaction, re-skinned to Cathy's light theme.
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
}

const SPEEDS = [1, 2, 5, 20] as const;

export function Transport({
  at,
  total,
  onChange,
  playing,
  onPlayingChange,
  speed,
  onSpeedChange,
  atTimestamp,
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
        background: "var(--surface-card)",
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
        <TransportButton label="◀" title="step back one event" onClick={() => step(-1)} disabled={pos <= 0} />
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
        <TransportButton
          label="live"
          title="follow the live edge"
          active={live}
          onClick={() => { onPlayingChange(false); onChange(null); }}
        />
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
        style={{ flex: 1, minWidth: 160, accentColor: "var(--status-accent)", cursor: "pointer" }}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "0.7rem", color: "var(--text-muted)" }}>
        <span style={{ fontVariantNumeric: "tabular-nums", fontFamily: font.mono }}>
          {pos} / {total}
        </span>
        <span style={{ fontVariantNumeric: "tabular-nums", fontFamily: font.mono, color: "var(--text-faint)" }}>
          {atTimestamp ? atTimestamp.slice(11, 19) : "--:--:--"}
        </span>
        {live ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--status-good)", fontWeight: 700 }}>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "var(--status-good)",
                animation: "softpulse 1.6s ease-in-out infinite",
              }}
            />
            LIVE
          </span>
        ) : (
          <span style={{ color: "var(--status-accent-text)", fontWeight: 700 }}>PINNED</span>
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
            {s}×
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
        border: `1px solid ${active ? "var(--status-good)" : "var(--border-default)"}`,
        background: primary ? "var(--status-accent)" : active ? "var(--status-good-tint-soft)" : "var(--surface-card)",
        color: primary ? "var(--surface-card)" : active ? "var(--status-good-text)" : "var(--text-muted)",
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
