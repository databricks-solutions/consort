"use client";

import { useEffect, useRef } from "react";
import { colorForRole, font } from "@/lib/theme";

// The agent-log lines of the ONE turn that is ACTIVE at the scrubber — the turn the event playhead is
// currently on. There is NO separate line scrubber and NO all-agents roster: the single (event)
// scrubber picks the active turn, and this shows exactly that turn's agent and its log lines (tool
// actions + reasoning). Scrub to another turn → the panel shows that agent's lines instead.

export interface ActivityLine {
  idx: number;
  turn: number;
  role: string | null;
  kind: "tool" | "reasoning" | "test" | "event";
  verb?: string;
  target?: string;
  full?: string; // the UNCLIPPED target when `target` was truncated — shown on hover (title)
  text?: string;
  testId?: string; // `test` line: the test whose status changed here
  status?: string; // `test` line: the status it transitioned to (red/green/refactored)
  tsLine?: string; // the line's real timestamp
  eventIndex?: number; // the event-log index this line maps to (board follows it on scrub)
}
export interface TimelineTurn {
  ordinal: number;
  role: string | null;
  label: string | null;
  startLine: number;
  lineCount: number;
  eventIndex: number | null; // the turn's event-log index, so the scrubber can move the board to it
  tsStart: string | null; // the turn's start timestamp
  tsEnd: string | null; // the next turn's start — [tsStart, tsEnd) is this turn's span, for per-line ts interpolation
}
export interface ActivityTimeline {
  total: number;
  lines: ActivityLine[];
  turns: TimelineTurn[];
}

const ROLE_LABEL: Record<string, string> = {
  orchestrator: "Orchestrator",
  "spec-author": "Spec Author",
  "ux-designer": "UX Designer",
  "architect-reviewer": "Architect",
  dba: "DBA",
  "test-strategist": "Test Strategist",
  navigator: "Navigator",
  driver: "Driver",
  "product-owner": "Product Owner",
  "release-engineer": "Release Engineer",
};
const label = (r: string | null): string => (r ? ROLE_LABEL[r] ?? r : "—");

// Bash renders as "Command" (see below); the rest keep their verb. Read gets its OWN colour (not the
// generic muted) so reads stand out from greps/globs.
const VERB_TONE: Record<string, string> = {
  Edit: "var(--status-accent-text)",
  Write: "var(--status-good-text)",
  Read: "var(--status-gate)",
  Bash: "var(--status-play)",
  Grep: "var(--text-muted)",
  Glob: "var(--text-muted)",
};
const displayVerb = (v: string | undefined): string => (v === "Bash" ? "Command" : v ?? "");

export function AgentLogReplay({ timeline, lineAt }: { timeline: ActivityTimeline | null; lineAt: number }) {
  const currentRef = useRef<HTMLDivElement | null>(null);
  // Keep the current (newest-revealed) line in view as the playhead advances.
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: "nearest" });
  }, [lineAt]);

  if (!timeline) {
    return (
      <div style={{ padding: "10px 12px", fontSize: "0.72rem", color: "var(--text-faint)" }}>Loading agent steps…</div>
    );
  }

  const revealed = Math.max(0, Math.min(lineAt, timeline.total));
  const currentIdx = revealed - 1; // the current (last revealed) log line; -1 before any

  // The ONE turn the playhead is in — the turn whose line range contains the current line. The panel
  // shows ONLY this turn; crossing into the next turn's range (a checkpoint) switches it to that
  // agent. Before the first line, show the first turn that has lines.
  const withLines = timeline.turns.filter((t) => t.lineCount > 0);
  const turn =
    withLines.find((t) => currentIdx >= t.startLine && currentIdx < t.startLine + t.lineCount) ??
    (currentIdx < 0 ? withLines[0] : withLines[withLines.length - 1]) ??
    null;

  const turnPos = turn ? timeline.turns.findIndex((t) => t.ordinal === turn.ordinal) + 1 : 0;
  // This turn's lines revealed UP TO the playhead — so they appear one at a time as the scrubber steps.
  const end = turn ? Math.min(turn.startLine + turn.lineCount, revealed) : 0;
  const lines = turn ? timeline.lines.slice(turn.startLine, Math.max(turn.startLine, end)) : [];
  const lineInTurn = turn ? Math.max(0, Math.min(revealed - turn.startLine, turn.lineCount)) : 0;

  return (
    <div style={{ flex: "none", display: "flex", flexDirection: "column", gap: 4, maxHeight: "48%", overflow: "auto", borderBottom: "1px solid var(--border-default)", padding: "10px 12px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: "0.66rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-faint)" }}>Agent steps</span>
        {turn ? (
          <span style={{ fontSize: "0.6rem", color: "var(--text-faint)", fontVariantNumeric: "tabular-nums", fontFamily: font.mono }}>
            turn {turnPos}/{timeline.turns.length} · line {lineInTurn}/{turn.lineCount}
          </span>
        ) : null}
      </div>
      {turn ? (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span aria-hidden style={{ width: 9, height: 9, borderRadius: "50%", background: colorForRole(turn.role ?? ""), flex: "0 0 auto" }} />
            <span style={{ fontWeight: 700, fontSize: "0.74rem", color: "var(--text-strong)" }}>{label(turn.role)}</span>
            <span style={{ fontSize: "0.58rem", color: "var(--text-faint)", fontVariantNumeric: "tabular-nums" }}>
              turn #{turn.ordinal}
              {turn.label ? ` · ${turn.label}` : ""}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 1, paddingLeft: 16 }}>
            {lines.length === 0 ? (
              <span style={{ fontSize: "0.64rem", color: "var(--text-faint)", fontStyle: "italic" }}>— at the start of this turn —</span>
            ) : (
              lines.map((l) => {
                const isCurrent = l.idx === currentIdx;
                const isTest = l.kind === "test";
                const isEvent = l.kind === "event";
                // A `test` line is a per-test status TRANSITION (red → green) — its own step, so the
                // scrubber reveals tests one at a time. Colour by status; green/refactored = good, red = critical.
                const testColor =
                  l.status === "green" || l.status === "refactored"
                    ? "var(--status-good-text)"
                    : l.status === "red"
                      ? "var(--status-critical-text)"
                      : "var(--text-muted)";
                return (
                  <div
                    key={l.idx}
                    ref={isCurrent ? currentRef : undefined}
                    title={isTest ? `${l.testId} ${l.status}` : `${displayVerb(l.verb)} ${l.full ?? l.target ?? ""}`.trim()}
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "baseline",
                      fontSize: "0.66rem",
                      fontFamily: font.mono,
                      background: isCurrent ? "var(--surface-inset)" : "transparent",
                      borderRadius: 3,
                      padding: "0 3px",
                    }}
                  >
                    {isTest ? (
                      <>
                        <span style={{ color: testColor, fontWeight: 700, minWidth: 64, flex: "0 0 auto" }}>
                          {l.status === "red" ? "✗ test" : "✓ test"}
                        </span>
                        <span style={{ color: testColor, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.testId}</span>
                      </>
                    ) : isEvent ? (
                      // A non-tool event-log STAGE (verify / green / gate / deploy / …): the verb is the
                      // stage label (in the turn role's colour), the target is the event's message.
                      <>
                        <span style={{ color: colorForRole(l.role ?? ""), fontWeight: 700, minWidth: 64, flex: "0 0 auto" }}>{l.verb}</span>
                        <span style={{ color: "var(--text-body)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.target}</span>
                      </>
                    ) : (
                      <>
                        <span style={{ color: VERB_TONE[l.verb ?? ""] ?? "var(--text-muted)", fontWeight: 700, minWidth: 64, flex: "0 0 auto" }}>
                          {displayVerb(l.verb)}
                        </span>
                        <span style={{ color: "var(--text-body)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.target}</span>
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </>
      ) : (
        <span style={{ fontSize: "0.66rem", color: "var(--text-faint)" }}>No agent steps in this run.</span>
      )}
    </div>
  );
}
