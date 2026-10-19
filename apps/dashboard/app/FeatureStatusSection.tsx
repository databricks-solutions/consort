"use client";

import type { DashboardState, StoryProgress } from "@/lib/types";
import { font, radius } from "@/lib/theme";

// LEFT-pane status rollup: the run's features grouped with their stories, limited to features that
// are COMPLETE or CURRENTLY ACTIVE — the two an operator tracks (a started-but-idle feature that is
// neither is omitted, per the request). Unlike the planning sections above (a static snapshot of the
// run's start), this reads the FOLDED board state, so it rewinds with the transport.
//
// Its own module (not a local in page.tsx): a Next route file may only export the page defaults, so
// a named export there fails the page-type check — and it keeps the section unit-testable directly.
//
// This is ALSO where the board's feature is selected (the old header "follow" switcher moved here, so
// it is reachable in every mode — live playing/recording + replay). Clicking a feature card PINS the
// board to that feature (a FILTER, not a seek — the transport stays put); the pinned card carries a
// "follow" control to clear it. Selection is offered only with >1 feature (with one, "follow" and
// "pin it" are identical); a single-feature run renders the same card, non-interactive.
export function FeatureStatusSection({
  state,
  pinned,
  onPin,
  openStory,
  onOpenStory,
}: {
  state: DashboardState;
  pinned: string | null;
  onPin: (f: string | null) => void;
  // The story whose test-list rail is open (LIFTED to the page), + the opener. Clicking a story row
  // opens its bubble rail on the right; the selected test's table capture renders in the bottom dock.
  openStory: { feature: string; story: string } | null;
  onOpenStory: (feature: string, story: string) => void;
}) {
  const byFeature = new Map<string, StoryProgress[]>();
  for (const s of state.stories) {
    if (!s.feature) continue;
    const list = byFeature.get(s.feature);
    if (list) list.push(s);
    else byFeature.set(s.feature, [s]);
  }
  // done || active, in the state's first-seen feature order. done wins over active for the chip.
  const shown = state.features.filter((f) => f.done || f.active);
  const doneCount = shown.filter((f) => f.done).length;
  const pinnedShown = pinned != null && shown.some((f) => f.id === pinned);
  return (
    <>
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.7rem", color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        <span>Status{shown.length > 0 ? <span style={{ textTransform: "none", letterSpacing: 0 }}> · {doneCount} of {shown.length} complete</span> : null}</span>
        {/* When a pin is active, a control to return to following the run's active feature. */}
        {pinnedShown ? (
          <button
            onClick={() => onPin(null)}
            title="Follow the run's active feature (clear the pin)"
            style={{ marginLeft: "auto", border: `1px solid var(--border-default)`, background: "var(--surface-card)", color: "var(--text-muted)", borderRadius: radius.chip, padding: "1px 7px", fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", cursor: "pointer" }}
          >
            ↩ follow
          </button>
        ) : null}
      </div>
      {shown.length === 0 ? (
        <div style={{ fontSize: "0.78rem", color: "var(--text-faint)" }}>No feature complete or underway yet.</div>
      ) : (
        shown.map((f) => {
          const stories = byFeature.get(f.id) ?? [];
          const storiesDone = stories.filter((s) => s.stage === "done").length;
          const isPinned = pinned === f.id;
          return (
            <div
              key={f.id}
              style={{
                border: `1px solid ${isPinned ? "var(--status-accent)" : "var(--border-default)"}`,
                background: isPinned ? "color-mix(in srgb, var(--status-accent) 8%, transparent)" : undefined,
                borderRadius: radius.panel,
                padding: "10px 12px",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-strong)", fontFamily: font.mono }}>{f.id}</span>
                <FeatureStateChip done={f.done} />
                <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                  {stories.length > 0 ? (
                    <span style={{ fontSize: "0.66rem", color: "var(--text-faint)", fontVariantNumeric: "tabular-nums" }}>
                      {storiesDone}/{stories.length} stories
                    </span>
                  ) : null}
                  {/* The visible pin control. Pins the board to this feature (a filter, not a seek);
                      the pinned one is filled + accent, click again (or the header "↩ follow") clears
                      it. Present on every feature so selection is discoverable in any scenario. */}
                  <PinButton
                    pinned={isPinned}
                    onClick={() => onPin(isPinned ? null : f.id)}
                    title={isPinned ? "Pinned — click to follow the run" : `Pin the board to ${f.id}`}
                  />
                </span>
              </div>
              {stories.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {stories.map((s) => (
                    <FeatureStatusStoryRow
                      key={`${f.id}:${s.id}`}
                      s={s}
                      onOpen={() => onOpenStory(f.id, s.id)}
                    />
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: "0.72rem", color: "var(--text-faint)" }}>No stories yet.</div>
              )}
            </div>
          );
        })
      )}
    </div>
    {/* The test-list rail itself is rendered by the page (right side, beside the board), not here —
        this section only OPENS it via onOpenStory. */}
    </>
  );
}

// The per-feature pin toggle: an outline "📌 pin" chip, filled accent "📌 pinned" when active.
function PinButton({ pinned, onClick, title }: { pinned: boolean; onClick: () => void; title: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-pressed={pinned}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        fontSize: "0.6rem",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        color: pinned ? "var(--status-accent-text)" : "var(--text-muted)",
        background: pinned ? "var(--status-accent-tint)" : "var(--surface-card)",
        border: `1px solid ${pinned ? "var(--status-accent)" : "var(--border-default)"}`,
        borderRadius: radius.chip,
        padding: "1px 7px",
        cursor: "pointer",
      }}
    >
      <span aria-hidden style={{ fontSize: "0.66rem", lineHeight: 1 }}>📌</span>
      {pinned ? "pinned" : "pin"}
    </button>
  );
}

function FeatureStateChip({ done }: { done: boolean }) {
  // A finished feature isn't "in progress", so done wins over active.
  const c = done
    ? { bg: "var(--status-good-tint-soft)", border: "var(--status-good)", fg: "var(--status-good)", label: "done" }
    : { bg: "var(--status-accent-tint)", border: "var(--status-accent)", fg: "var(--status-accent-text)", label: "active" };
  return (
    <span style={{ fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: c.fg, background: c.bg, border: `1px solid ${c.border}`, borderRadius: radius.chip, padding: "1px 6px" }}>
      {c.label}
    </span>
  );
}

// Compact per-story row for the left-pane rollup: id + one status chip (its raw Consort status),
// deliberately terser than the center column's full design→build→done mini-track (StoryRow).
// Clicking the row opens the story's test lightbox (the Navigator's authored tests + their status).
function FeatureStatusStoryRow({ s, onOpen }: { s: StoryProgress; onOpen: () => void }) {
  const c =
    s.status === "discarded"
      ? { bg: "var(--status-discarded-tint)", border: "var(--status-discarded)", fg: "var(--status-discarded-text)" }
      : s.stage === "done"
      ? { bg: "var(--status-good-tint)", border: "var(--status-good)", fg: "var(--status-good-text)" }
      : s.active
      ? { bg: "var(--status-accent-tint)", border: "var(--status-accent)", fg: "var(--status-accent-text)" }
      : { bg: "var(--surface-inset)", border: "var(--border-default)", fg: "var(--text-muted)" };
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      title="View this story's tests"
      style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", borderRadius: radius.chip, padding: "1px 2px" }}
    >
      <span style={{ fontSize: "0.74rem", fontWeight: s.active ? 700 : 500, color: s.active ? "var(--text-strong)" : "var(--text-muted)", fontFamily: font.mono, whiteSpace: "nowrap" }}>
        {s.active ? "▸ " : ""}
        {s.id}
      </span>
      {/* Coarse status only. The design PHASE lives in the tooltip (and the center column's full
          design track) — appending it here read redundantly as "designing · design" whenever the
          story sat in the phase literally named "design". */}
      <span
        title={`${s.status}${s.designPhase ? ` · ${s.designPhase}` : ""}`}
        style={{ marginLeft: "auto", fontSize: "0.62rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.03em", color: c.fg, background: c.bg, border: `1px solid ${c.border}`, borderRadius: radius.chip, padding: "1px 7px", whiteSpace: "nowrap" }}
      >
        {s.status}
      </span>
      {/* Discoverability: a faint flask marks the row as opening its test list. */}
      <span aria-hidden title="View tests" style={{ fontSize: "0.64rem", color: "var(--text-faint)", lineHeight: 1 }}>
        🧪
      </span>
    </div>
  );
}
