import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { resolveSource } from "@/lib/sources";
import { renderToolMarker } from "@/lib/activity";
import { correlate, type TurnIndexEntry } from "@/lib/correlate";
import { consortDir } from "@/lib/consort";
import { resolveContained } from "@/lib/safepath";
import type { SourceMode } from "@/lib/source";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/activity-timeline?mode=live|replay
//
// The FLATTENED agent-log timeline for the transport's LINE granularity (turns are the checkpoints,
// each turn's activity lines are the finer steps). Walks every recorded turn in ordinal order and
// concatenates its activity lines — each tool action (rendered legible) and each reasoning line —
// into one ordered list, tagging each with its turn + role. `turns[]` gives each turn's start index
// into `lines[]`, i.e. the checkpoint positions the transport snaps between.
//
// Gated on the `transcripts` capability (a recorded `turns/` corpus — replay always, or a live build
// recording), exactly like /api/turn; otherwise `{ available: false }`.

const MAX_TURNS = 2000; // safety bound on the ordinal walk

// The step log is the agent's TOOL ACTIONS only (each now carries a human `description`). Reasoning
// prose is deliberately excluded: truncated fragments read as noise, not steps.
interface ActivityLine {
  idx: number; // position in the flattened timeline
  turn: number; // turn ordinal this line belongs to
  role: string | null;
  kind: "tool" | "reasoning" | "test" | "event";
  verb?: string; // tool verb (Edit/Write/Bash/…) — or, for a `test` line, the status (red/green/refactored)
  target?: string; // tool target (file/description/pattern) — or, for a `test` line, the test id
  full?: string; // the UNCLIPPED target, present only when `target` truncated (for a hover title)
  text?: string; // reasoning line
  testId?: string; // `test` line: the test id (so the lightbox can light its bubble when this line is revealed)
  status?: string; // `test` line: the status this test TRANSITIONED to here (red → green → …)
  tsLine?: string; // the line's real timestamp (for the table panel's as-of-playhead read)
  eventIndex?: number; // the event-log index this line maps to — so the board folds EXACTLY here when scrubbed onto it
}

// Turn-internal noise excluded from the scrubber (per the "events minus turn-noise" choice): the
// per-turn accounting event + raw reasoning, and the turn-boundary handoff/phase.start the turn
// header already represents. Everything else in the event log earns its own step.
const NOISE_EVENTS: ReadonlySet<string> = new Set(["turn.usage", "reasoning", "phase.start", "handoff"]);

const EVENT_LABEL: Record<string, string> = {
  "cycle.red": "Red",
  "cycle.green": "Green",
  "cycle.verified": "Verify",
  "cycle.review": "Review",
  "gate.surfaced": "Gate",
  "gate.approved": "Gate ✓",
  "gate.rejected": "Gate ✗",
  "deploy.start": "Deploy",
  "deploy.reachable": "Deploy",
  "deploy.verified": "Deployed",
  "verify.passed": "Verified",
  "experiment.cut": "Experiment",
  "experiment.accepted": "Accepted",
  "artifact.written": "Wrote",
  "escalation.raised": "HIL",
};

// How ONE event-log entry renders as a scrub step: a test.result becomes a per-test line (so the
// lightbox lights its bubble + the step is colour-coded); everything else is a neutral `event` line
// labelled by its kind, with the event's message as the detail.
function eventDisplay(e: { event?: string; message?: string; metadata?: Record<string, unknown> }): {
  kind: "test" | "event";
  verb: string;
  target: string;
  testId?: string;
  status?: string;
} {
  const ev = e.event ?? "";
  const md = e.metadata ?? {};
  if (ev === "test.result") {
    const tid = typeof md.test_id === "string" ? md.test_id : "";
    const st = typeof md.status === "string" ? md.status : "";
    return { kind: "test", verb: st, target: tid, testId: tid, status: st };
  }
  // Drop a leading status word (it duplicates the verb label) and the LEAD test id that `cycle.*`
  // names — e.g. "GREEN T26 [AC1-…]: minimal honest code" → "[AC1-…]: minimal honest code". The lead
  // test is misleading as a per-test marker (the cycle greens them all; the per-test `test.result`
  // lines carry each one), so the line reads as the cycle-level milestone it is.
  const target = (e.message ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:GREEN|RED|VERIFY|REVIEW|REFACTOR)\s+(?:T\d+\s+)?/, "");
  return { kind: "event", verb: EVENT_LABEL[ev] ?? ev, target: target.length > 72 ? `${target.slice(0, 71)}…` : target };
}

export async function GET(req: NextRequest) {
  try {
    const modeParam = req.nextUrl.searchParams.get("mode");
    const requested: SourceMode | undefined = modeParam === "live" || modeParam === "replay" ? modeParam : undefined;
    const { source } = resolveSource(requested);

    if (!source.capabilities.has("transcripts") || !source.turn || !source.transcript) {
      return NextResponse.json({ available: false, reason: "no turns corpus (transcripts capability absent)", mode: source.mode });
    }

    let lines: ActivityLine[] = [];
    const turns: {
      ordinal: number;
      role: string | null;
      label: string | null;
      startLine: number;
      lineCount: number;
      eventIndex: number | null;
      tsStart: string | null; // the turn's start timestamp (for interpolating a per-line playhead ts)
      tsEnd: string | null; // the next turn's start (turns tile the run), so [tsStart, tsEnd) is this turn's span
    }[] = [];
    const turnDetails: TurnIndexEntry[] = []; // for correlate → each turn's event index

    // Turn ordinals are 0-based and contiguous; walk until the first gap (null) — source-agnostic,
    // no private index access.
    for (let ord = 0; ord < MAX_TURNS; ord++) {
      const turn = source.turn(ord);
      if (!turn) break;
      // correlate() reads ordinal/step/label/kind/role/mode; dir/producedCount/deletedCount are
      // required by the type but unused here, so fill them so the shape is a valid TurnIndexEntry.
      turnDetails.push({ ...turn, dir: "", producedCount: 0, deletedCount: 0 } as TurnIndexEntry);
      const role = (turn.role as string | undefined) ?? null;
      const startLine = lines.length;
      const t = source.transcript(ord);

      for (const raw of t?.tools ?? []) {
        const a = renderToolMarker(raw);
        if (!a.verb) continue;
        lines.push({ idx: lines.length, turn: ord, role, kind: "tool", verb: a.verb, target: a.target, ...(a.full ? { full: a.full } : {}) });
      }

      turns.push({ ordinal: ord, role, label: (turn.label as string | undefined) ?? null, startLine, lineCount: lines.length - startLine, eventIndex: null, tsStart: null, tsEnd: null });
    }

    // Each turn's event-log index (the FIRST event paired to it), so the one line scrubber can move
    // the board's event playhead to the active turn as it crosses into it. Also each turn's START
    // timestamp (that event's ts) + END (the next turn's start), so the client can interpolate a
    // per-line playhead TIMESTAMP within a turn — the only way to resolve finer than a turn, since
    // tool-call lines carry no timestamps of their own.
    try {
      const evs = source.events();
      const eventOf = new Map<number, number>();
      for (const p of correlate(evs, turnDetails).pairings) {
        if (!eventOf.has(p.turnOrdinal)) eventOf.set(p.turnOrdinal, p.eventIndex);
      }
      for (const t of turns) {
        t.eventIndex = eventOf.get(t.ordinal) ?? null;
        t.tsStart = t.eventIndex != null ? (evs[t.eventIndex]?.timestamp ?? null) : null;
      }
      for (let i = 0; i < turns.length; i++) turns[i].tsEnd = turns[i + 1]?.tsStart ?? turns[i].tsStart;
    } catch {
      /* correlation is best-effort; leave eventIndex/ts null so the board just doesn't follow */
    }

    // Give EVERY event-log entry (minus turn-noise, see NOISE_EVENTS) its OWN step, carrying its event
    // index, so the scrubber can land on cycle.verified / cycle.green / gate.* / deploy.* / test.result
    // etc. and the board folds EXACTLY onto that event — lighting that stage. Each turn's agent
    // tool-steps keep the turn's own event index (the role working); the events in the turn's range
    // [eventIndex, nextTurn.eventIndex) are woven in after them, each with its own index. This replaces
    // the turn-only scrubber, where non-turn events (the Verify step especially) had no position.
    try {
      const evs = source.events();
      const started = turns.filter((t) => t.eventIndex != null).sort((a, b) => a.eventIndex! - b.eventIndex!);
      const rangeEnd = new Map<number, number>(); // turn ordinal → exclusive end index of its event range
      for (let i = 0; i < started.length; i++) rangeEnd.set(started[i].ordinal, started[i + 1]?.eventIndex ?? evs.length);
      const toolByTurn = new Map<number, ActivityLine[]>();
      for (const l of lines) (toolByTurn.get(l.turn) ?? toolByTurn.set(l.turn, []).get(l.turn)!).push(l);
      const rebuilt: ActivityLine[] = [];
      for (const t of turns) {
        t.startLine = rebuilt.length;
        for (const tl of toolByTurn.get(t.ordinal) ?? [])
          rebuilt.push({ ...tl, idx: rebuilt.length, eventIndex: t.eventIndex ?? undefined });
        if (t.eventIndex != null) {
          const end = rangeEnd.get(t.ordinal) ?? evs.length;
          for (let i = t.eventIndex; i < end; i++) {
            const e = evs[i] as { event?: string; message?: string; timestamp?: string; metadata?: Record<string, unknown> } | undefined;
            if (!e || NOISE_EVENTS.has(e.event ?? "")) continue;
            rebuilt.push({ idx: rebuilt.length, turn: t.ordinal, role: t.role, eventIndex: i, tsLine: e.timestamp, ...eventDisplay(e) });
          }
        }
        t.lineCount = rebuilt.length - t.startLine;
      }
      lines = rebuilt;
    } catch {
      /* best-effort — on any failure the stream stays tool-only */
    }

    // Append the IN-PROGRESS turn from the live sidecar (agent-live.log): a running turn's transcript
    // isn't recorded until it completes, so the recorded turns above LAG the live edge by one turn.
    // The sidecar streams the current turn's tool actions + reasoning as they happen — appending it as
    // the newest turn makes the step panel track the agent working RIGHT NOW, not the last done turn.
    // Only when the current segment is still OPEN (no TURN CLOSE), so a just-recorded turn isn't dup'd.
    try {
      const abs = resolveContained(consortDir(), "agent-live.log");
      if (abs) {
        const text = readFileSync(abs, "utf8");
        const startIdx = text.lastIndexOf("\n=== ");
        const seg = startIdx === -1 ? text : text.slice(startIdx + 1);
        const segLines = seg.split("\n");
        const role = segLines[0]?.match(/TURN START role=(\S+)/)?.[1] ?? null;
        const liveTsStart = segLines[0]?.match(/===\s+(\S+)\s+TURN START/)?.[1] ?? null;
        const closed = seg.includes("TURN CLOSE");
        if (role && !closed) {
          const liveOrd = turns.length ? Math.max(...turns.map((t) => t.ordinal)) + 1 : 0;
          const startLine = lines.length;
          for (const ln of segLines.slice(1)) {
            if (ln.startsWith("  · ")) {
              const a = renderToolMarker(ln.slice(4));
              if (a.verb) lines.push({ idx: lines.length, turn: liveOrd, role, kind: "tool", verb: a.verb, target: a.target, ...(a.full ? { full: a.full } : {}) });
            }
            // reasoning-prose lines are intentionally skipped — the step log is tool actions only,
            // and each tool's own `description` carries the agent's intent (the "reasoning").
          }
          const lineCount = lines.length - startLine;
          if (lineCount > 0) turns.push({ ordinal: liveOrd, role, label: "in progress", startLine, lineCount, eventIndex: null, tsStart: liveTsStart, tsEnd: null });
        }
      }
    } catch {
      /* no live sidecar (replay / no run) — the recorded turns stand alone */
    }

    return NextResponse.json({ available: true, mode: source.mode, total: lines.length, lines, turns });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
