"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { DashboardState } from "@/lib/types";
import { AgentLogReplay, type ActivityTimeline } from "./AgentLogReplay";
import { EventTicker } from "./board-parts";
import { StoryTables } from "./StoryTestsLightbox";
import { font } from "@/lib/theme";

// PROTOTYPE: the "live activity" bottom dock. Instead of a tall right-side pane that stacks the agent
// steps ON TOP of the event log (and fights the test-list slide-out for width), this is a full-width
// dock pinned at the bottom (IDE-style), SIDE-BY-SIDE: the event timeline (left) and the active
// event's agent steps (right). The board, the left backlog/planning/status pane, and the right-side
// test-list all stay visible above it — the "full picture while code is developed + tested".
//
// Why side-by-side here: the agent steps are the DETAIL of the one event the playhead is on. Putting
// the timeline immediately beside the steps (rather than the steps far above the last log row) keeps
// the detail next to its anchor. The steps panel is also self-anchoring (its own turn/role header),
// so you can read it without eye-tracing to the log.
export function ActivityDock({
  state,
  timeline,
  lineAt,
  onOpenTurn,
  onOpenArtifact,
  bottomOffset,
  tableView,
  height,
  onHeightChange,
}: {
  state: DashboardState;
  timeline?: ActivityTimeline | null;
  lineAt?: number;
  onOpenTurn?: (ord: number) => void;
  onOpenArtifact?: (path: string) => void;
  /** px above the fixed transport the dock should sit (so it never covers the play band). */
  bottomOffset: number;
  /** When a test is selected in the right rail, its table capture renders as a third dock region
   *  (keyed to the selected test, as-of the playhead). Null → the dock is the 2-region timeline+steps. */
  tableView?: { feature: string; story: string; testId: string; atLive: boolean; atTs: string; reached: boolean; pinned: boolean } | null;
  /** The dock's current height (px) and a setter — lifted to the page so the board's bottom padding
   *  tracks it. The dock is resizable by dragging its top edge. */
  height: number;
  onHeightChange: (h: number) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const DOCK_H = collapsed ? 34 : height;

  // Drag the top edge to resize vertically. Bottom-anchored, so moving the mouse UP makes it taller.
  // Clamped to [120, viewport-160] so it can't swallow the whole screen or vanish.
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = DOCK_H;
    const onMove = (ev: MouseEvent) => onHeightChange(Math.max(120, Math.min(window.innerHeight - 160, startH + (startY - ev.clientY))));
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Horizontal split between the dock's sections (event log · agent steps, plus the table capture
  // when a test is selected). Each section's share is a grow-weight that sums to 1; a draggable
  // gutter between two sections shifts weight from one to the other. The weights reset when the
  // section COUNT changes (the table opens/closes), since the layout itself changed.
  const rowRef = useRef<HTMLDivElement | null>(null);
  const regionCount = tableView ? 3 : 2;
  const defaults = (n: number): number[] => (n === 3 ? [0.4, 0.3, 0.3] : [0.56, 0.44]);
  const [weights, setWeights] = useState<number[]>(() => defaults(regionCount));
  useEffect(() => {
    setWeights(defaults(regionCount));
  }, [regionCount]);
  const eff = weights.length === regionCount ? weights : defaults(regionCount);

  // Drag gutter `i` (between section i and i+1): translate the horizontal delta into a fraction of
  // the row width and move it from the left section to the right, clamped so neither drops below 12%.
  const startDragGutter = (i: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    const row = rowRef.current;
    if (!row) return;
    const rowW = row.getBoundingClientRect().width;
    const startX = e.clientX;
    const base = [...eff];
    const MIN = 0.12;
    const onMove = (ev: MouseEvent) => {
      let d = (ev.clientX - startX) / rowW;
      d = Math.max(-(base[i] - MIN), Math.min(base[i + 1] - MIN, d));
      const next = [...base];
      next[i] = base[i] + d;
      next[i + 1] = base[i + 1] - d;
      setWeights(next);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // The dock's sections, in order. The table capture is present only when a test is selected.
  const regions: { key: string; node: ReactNode; bg?: string }[] = [
    { key: "events", node: <EventTicker state={state} onOpenTurn={onOpenTurn} onOpenArtifact={onOpenArtifact} variant="pane" /> },
    { key: "steps", node: <AgentLogReplay timeline={timeline ?? null} lineAt={lineAt ?? 0} fill />, bg: "var(--surface-panel)" },
  ];
  if (tableView) {
    regions.push({
      key: "table",
      bg: "var(--surface-page)",
      node: (
        <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "10px 14px" }}>
          <StoryTables feature={tableView.feature} story={tableView.story} atLive={tableView.atLive} atTs={tableView.atTs} testId={tableView.testId} reached={tableView.reached} pinned={tableView.pinned} />
        </div>
      ),
    });
  }

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: bottomOffset,
        height: DOCK_H,
        background: "var(--surface-panel)",
        borderTop: "1px solid var(--border-strong)",
        display: "flex",
        flexDirection: "column",
        zIndex: 40,
        boxShadow: "0 -10px 28px rgba(0,0,0,0.22)",
      }}
    >
      {/* Resize grip: a thin bar on the top edge; drag to change the dock height. Hidden when collapsed. */}
      {collapsed ? null : (
        <div
          onMouseDown={startResize}
          title="Drag to resize"
          style={{ position: "absolute", top: -3, left: 0, right: 0, height: 7, cursor: "ns-resize", zIndex: 1 }}
        />
      )}
      {/* Dock header: collapse toggle + title + event count. */}
      <div
        style={{
          flex: "none",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "6px 14px",
          background: "var(--surface-card)",
          borderBottom: collapsed ? "none" : "1px solid var(--border-default)",
        }}
      >
        <button
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? "expand live activity" : "collapse live activity"}
          style={{
            border: "1px solid var(--border-default)",
            background: "var(--surface-card)",
            color: "var(--text-muted)",
            borderRadius: 6,
            padding: "1px 8px",
            fontSize: "0.7rem",
            cursor: "pointer",
            lineHeight: 1.2,
          }}
        >
          {collapsed ? "▴" : "▾"}
        </button>
        <span style={{ fontSize: "0.66rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-faint)" }}>
          Live activity
        </span>
        <span style={{ fontSize: "0.6rem", color: "var(--text-faint)", fontFamily: font.mono }}>event log · {state.eventCount}</span>
        <span style={{ marginLeft: "auto", fontSize: "0.56rem", color: "var(--text-faint)" }}>timeline · active-event steps</span>
      </div>

      {collapsed ? null : (
        <div ref={rowRef} style={{ flex: 1, minHeight: 0, display: "flex" }}>
          {regions.map((r, i) => (
            <Fragment key={r.key}>
              {/* A draggable gutter sits before every section after the first; drag it to shift
                  horizontal space between the two sections it divides (window-resize style). */}
              {i > 0 ? (
                <div
                  onMouseDown={startDragGutter(i - 1)}
                  title="Drag to resize"
                  style={{ flex: "0 0 auto", width: 6, cursor: "col-resize", background: "var(--border-default)" }}
                />
              ) : null}
              <div style={{ flexGrow: eff[i], flexBasis: 0, minWidth: 80, display: "flex", flexDirection: "column", overflow: "hidden", ...(r.bg ? { background: r.bg } : {}) }}>
                {r.node}
              </div>
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
