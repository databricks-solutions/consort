"use client";

import React, { useCallback, useRef, useState } from "react";

// A resizable split of N panes along ONE axis. Panes lay out with flex-grow weights; a draggable
// handle between each adjacent pair redistributes weight between just those two (the others stay
// put). One primitive, reused by the drill-down pull-out viewer (horizontal: file list | content)
// and the correspondence/transcript pane (vertical: the stacked sections) — no splitter dependency,
// inline styles + theme CSS vars to match the rest of the dashboard.
//
// Weights are unitless flex-grow ratios; a drag converts its pixel delta to a weight delta against
// the container's measured size, so the two adjacent panes trade size and everything else holds.
export function ResizableSplit({
  direction,
  initialWeights,
  minSize = 56,
  children,
}: {
  direction: "horizontal" | "vertical";
  /** Starting flex-grow ratio per pane (defaults to equal). Length must match the children count. */
  initialWeights?: number[];
  /** Minimum pane size in px along the split axis. */
  minSize?: number;
  children: React.ReactNode;
}) {
  // toArray already drops null/undefined/boolean children (the conditional sections), so the
  // remaining entries are exactly the panes to lay out.
  const panes = React.Children.toArray(children);
  const n = panes.length;
  const row = direction === "horizontal";
  const containerRef = useRef<HTMLDivElement>(null);
  const [weights, setWeights] = useState<number[]>(() => normalizeInit(initialWeights, n));

  // If the children count changes (conditional sections appear/disappear), fall back to a fresh
  // distribution rather than mis-indexing a stale weights array.
  const w = weights.length === n ? weights : normalizeInit(initialWeights, n);

  const onHandleDown = useCallback(
    (i: number) => (e: React.PointerEvent) => {
      e.preventDefault();
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const totalPx = row ? rect.width : rect.height;
      if (totalPx <= 0) return;
      const startPos = row ? e.clientX : e.clientY;
      const start = w.slice();
      const total = start.reduce((a, b) => a + b, 0);
      const pair = start[i] + start[i + 1];
      const minW = (minSize / totalPx) * total; // minSize expressed in weight units
      const move = (ev: PointerEvent) => {
        const cur = row ? ev.clientX : ev.clientY;
        const deltaW = ((cur - startPos) / totalPx) * total;
        let a = start[i] + deltaW;
        a = Math.max(minW, Math.min(pair - minW, a));
        const next = start.slice();
        next[i] = a;
        next[i + 1] = pair - a;
        setWeights(next);
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [row, minSize, w],
  );

  return (
    <div
      ref={containerRef}
      style={{ display: "flex", flexDirection: row ? "row" : "column", flex: 1, minHeight: 0, minWidth: 0, overflow: "hidden" }}
    >
      {panes.map((pane, i) => (
        <React.Fragment key={i}>
          <div
            style={{
              flexGrow: w[i],
              flexShrink: 1,
              flexBasis: 0,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              ...(row ? { minWidth: minSize } : { minHeight: minSize }),
            }}
          >
            {pane}
          </div>
          {i < n - 1 ? (
            <div
              onPointerDown={onHandleDown(i)}
              role="separator"
              aria-orientation={row ? "vertical" : "horizontal"}
              style={{
                flex: "none",
                position: "relative",
                background: "transparent",
                touchAction: "none",
                cursor: row ? "col-resize" : "row-resize",
                ...(row ? { width: 7, alignSelf: "stretch" } : { height: 7 }),
              }}
            >
              <div
                style={{
                  position: "absolute",
                  background: "var(--border-default)",
                  ...(row ? { top: 0, bottom: 0, left: 3, width: 1 } : { left: 0, right: 0, top: 3, height: 1 }),
                }}
              />
            </div>
          ) : null}
        </React.Fragment>
      ))}
    </div>
  );
}

function normalizeInit(initial: number[] | undefined, n: number): number[] {
  if (initial && initial.length === n && n > 0) return initial.slice();
  return Array.from({ length: Math.max(n, 0) }, () => 1);
}
