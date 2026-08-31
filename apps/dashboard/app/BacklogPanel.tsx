"use client";

import { useEffect, useState } from "react";
import { font, radius } from "@/lib/theme";
import type { Planning } from "@/lib/types";

// The planning / backlog view: what was proposed, how it was sized, what got committed to each
// sprint, and whether the plan gate was approved. Ported from Kevin's `load_planning` output.
//
// Fetched once from /api/planning (mode-aware), not folded into the board: planning is a static
// snapshot of the run's start, not timeline state, so it does not rewind with the transport.
// Gated by the caller on the `planningBacklog` capability — a source without planning artifacts
// answers 409 and the panel renders nothing.

/** Build /api/planning?mode=… — mode omitted when null so the server keeps its default. */
export function planningUrl(mode: "live" | "replay" | null): string {
  return mode === null ? "/api/planning" : `/api/planning?mode=${mode}`;
}

const SIZE_HELP: Record<string, string> = {
  S: "small",
  M: "medium",
  L: "large",
  XL: "extra large",
};

function SizeChip({ size }: { size: string | null }) {
  if (!size) return null;
  return (
    <span
      title={`t-shirt estimate: ${SIZE_HELP[size] ?? size}`}
      style={{
        fontSize: "0.66rem",
        fontWeight: 700,
        letterSpacing: "0.04em",
        color: "var(--text-body)",
        background: "var(--surface-inset)",
        border: `1px solid var(--border-default)`,
        borderRadius: radius.chip,
        padding: "1px 7px",
        whiteSpace: "nowrap",
      }}
    >
      {size}
    </span>
  );
}

function CommittedChip() {
  return (
    <span
      title="carried into a sprint backlog"
      style={{
        fontSize: "0.6rem",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        color: "var(--status-good)",
        background: "var(--status-good-tint-soft)",
        border: `1px solid var(--status-good)`,
        borderRadius: radius.chip,
        padding: "1px 6px",
      }}
    >
      committed
    </span>
  );
}

export function BacklogPanel({ mode }: { mode: "live" | "replay" | null }) {
  const [planning, setPlanning] = useState<Planning | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setPlanning(null);
    setError(null);
    (async () => {
      try {
        const r = await fetch(planningUrl(mode), { cache: "no-store" });
        // Tolerate a non-JSON / empty / non-object body (a proxy 502, a bare `null`): parse
        // defensively and only read `.error` off an actual object, else fall back to the HTTP
        // status. The old `body.error` threw "Cannot read properties of null" and masked the
        // real status when the server returned a JSON literal `null` on a non-ok response.
        const body = await r.json().catch(() => null);
        if (!live) return;
        const bodyErr = body && typeof body === "object" && !Array.isArray(body) ? (body as { error?: unknown }).error : null;
        if (!r.ok) {
          setError(typeof bodyErr === "string" ? bodyErr : `HTTP ${r.status}`);
          return;
        }
        setPlanning(body as Planning);
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      live = false;
    };
  }, [mode]);

  if (error) {
    return <div style={{ fontSize: "0.78rem", color: "var(--text-faint)", padding: "4px 0" }}>Backlog unavailable — {error}</div>;
  }
  if (!planning) {
    return <div style={{ fontSize: "0.78rem", color: "var(--text-faint)", padding: "4px 0" }}>Loading backlog…</div>;
  }

  // A run with no planning artifacts at all (neither proposals nor sprints) has nothing to show.
  if (planning.candidates.length === 0 && planning.sprints.length === 0) {
    return <div style={{ fontSize: "0.78rem", color: "var(--text-faint)", padding: "4px 0" }}>No planning artifacts recorded for this run.</div>;
  }

  return (
    <div style={{ background: "var(--surface-card)", borderRadius: radius.card, padding: "16px 20px", border: `1px solid var(--border-default)`, display: "flex", flexDirection: "column", gap: 18, fontFamily: font.sans }}>
      {/* --- Sprints: what was committed, and the plan gate. --- */}
      {planning.sprints.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: "0.7rem", color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Sprints
          </div>
          {planning.sprints.map((sp) => (
            <div key={sp.sprint} style={{ border: `1px solid var(--border-default)`, borderRadius: radius.panel, padding: "10px 12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-strong)" }}>{sp.sprint}</span>
                {sp.isReplan ? (
                  <span
                    title="This sprint reused the single proposal round — a re-plan (author-requests + gate re-approve), not a fresh proposal."
                    style={{ fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--status-gate-text)", background: "var(--status-gate-tint-soft)", border: `1px solid var(--status-gate)`, borderRadius: radius.chip, padding: "1px 6px" }}
                  >
                    re-plan
                  </span>
                ) : null}
                <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: "0.62rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-faint)" }}>plan gate</span>
                  <PlanGate status={sp.planGate} approver={sp.approver} approvedAt={sp.approvedAt} />
                </span>
              </div>
              {sp.features.map((f) => (
                <div key={f.id} style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "3px 0" }}>
                  <SizeChip size={f.size} />
                  <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-body)", fontFamily: font.mono }}>{f.id}</span>
                  {f.title ? <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{f.title}</span> : null}
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : null}

      {/* --- Candidates: the proposal pool, in proposal order, with sizes and commit state. --- */}
      {planning.candidates.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: "0.7rem", color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {/* Count the committed CANDIDATES actually shown here, not planning.committed (which
                counts sprint ids). A committed feature that isn't in estimates.json has no
                candidate row and no chip, so using planning.committed.length would read
                "2 of 7 committed" while only one chip appears. This number always matches the
                chips below it. */}
            Proposed features <span style={{ color: "var(--text-faint)", textTransform: "none", letterSpacing: 0 }}>· {planning.candidates.filter((c) => c.committed).length} of {planning.candidates.length} committed</span>
          </div>
          {planning.candidates.map((c) => (
            <div key={c.id} style={{ display: "flex", flexDirection: "column", gap: 3, paddingBottom: 8, borderBottom: `1px solid var(--surface-inset)` }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <SizeChip size={c.size} />
                <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-strong)", fontFamily: font.mono }}>{c.id}</span>
                {c.title ? <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-body)" }}>{c.title}</span> : null}
                {c.committed ? <CommittedChip /> : null}
              </div>
              {c.ask ? <div style={{ fontSize: "0.74rem", color: "var(--text-muted)", lineHeight: 1.4 }}>{c.ask}</div> : null}
              {c.rationale ? <div style={{ fontSize: "0.72rem", color: "var(--text-faint)", lineHeight: 1.4 }}>{c.rationale}</div> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PlanGate({ status: s, approver, approvedAt }: { status: string | null; approver: string | null; approvedAt: string | null }) {
  if (!s) {
    return <span style={{ fontSize: "0.7rem", color: "var(--text-faint)" }}>—</span>;
  }
  const approved = s === "approved";
  const title = [s, approver ? `by ${approver}` : null, approvedAt ? `at ${approvedAt}` : null].filter(Boolean).join(" · ");
  return (
    <span
      title={title}
      style={{
        fontSize: "0.64rem",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        color: approved ? "var(--status-good)" : "var(--text-muted)",
        background: approved ? "var(--status-good-tint-soft)" : "var(--surface-card)",
        border: `1px solid ${approved ? "var(--status-good)" : "var(--border-default)"}`,
        borderRadius: radius.chip,
        padding: "1px 7px",
      }}
    >
      {s}
    </span>
  );
}
