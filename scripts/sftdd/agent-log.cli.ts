#!/usr/bin/env node
// CLI: emit (or read) a structured agent-log event. observability.
//
// Emit (the entry point a headless role agent shells out to):
//   lakebase-sftdd-log --role spec-author --level info \
//     --event artifact.written --message "wrote feature-spec.json" \
//     --feature F1-initial-domain --data '{"path":"feature-spec.json"}'
//
// Read (tail / filter the centralized log):
//   lakebase-sftdd-log --read [--role driver] [--min-level info] [--feature F1] [--json]
//
// Exit codes: 0 ok; 2 bad args; 3 emit/validation failure.

import { isCliEntry } from "@databricks-solutions/lakebase-scm-utils/util";
import { resolveSftddDir } from "./sftdd-paths.js";
import {
  emitAgentLogEvent,
  emitAgentLogEvents,
  readAgentLog,
  type AgentRole,
  type AgentLogLevel,
  type AgentLogEventInput,
  type AgentLogEventName,
} from "./agent-log.js";
import { reconcileArtifactLog } from "./log-reconcile.js";
import { reconstituteAgentLog } from "./log-reconstitute.js";
import { recordBlockingSmellFlag } from "./escalation.js";

interface ParsedArgs {
  read?: boolean;
  reconcile?: boolean;
  /** Rewrite the log into one coherent timeline from a recorded design-lane log. */
  reconstitute?: boolean;
  /** Path to the recorded design-lane log (agent-log.design.jsonl) for --reconstitute. */
  designLog?: string;
  role?: string;
  level?: string;
  minLevel?: string;
  event?: string;
  feature?: string;
  phase?: string;
  cycle?: string;
  data?: string;
  /** Template slot values from repeatable --slot key=value. */
  slots?: Record<string, unknown>;
  /** JSON array of event inputs, emitted in ONE process + ONE append (batch mode)
   *  so a turn's several judgment events cost one subprocess spawn, not N. */
  events?: string;
  sftddDir?: string;
  json?: boolean;
  help?: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {};
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--read": out.read = true; break;
      case "--reconcile": out.reconcile = true; break;
      case "--reconstitute": out.reconstitute = true; break;
      case "--design-log": out.designLog = argv[++i]; break;
      case "--role": out.role = argv[++i]; break;
      case "--level": out.level = argv[++i]; break;
      case "--min-level": out.minLevel = argv[++i]; break;
      case "--event": out.event = argv[++i]; break;
      case "--slot": {
        const kv = argv[++i] ?? "";
        const eq = kv.indexOf("=");
        if (eq > 0) (out.slots ??= {})[kv.slice(0, eq)] = kv.slice(eq + 1);
        break;
      }
      case "--feature": out.feature = argv[++i]; break;
      case "--phase": out.phase = argv[++i]; break;
      case "--cycle": out.cycle = argv[++i]; break;
      case "--data": out.data = argv[++i]; break;
      case "--events": out.events = argv[++i]; break;
      case "--tdd-dir": out.sftddDir = argv[++i]; break;
      case "--json": out.json = true; break;
      case "--help": case "-h": out.help = true; break;
    }
  }
  return out;
}

const HELP = `lakebase-sftdd-log

Emit or read a structured TDD-workflow agent log event (.tdd/agent-log.jsonl).

Emit:
  lakebase-sftdd-log --role <r> --level <l> --event <e> --slot k=v [--slot k=v ...] [flags]
    --role     spec-author|ux-designer|architect-reviewer|test-strategist|
               orchestrator|navigator|driver|product-owner|release-engineer
    --level    debug|info|warn|error
    --event    event name from the CLOSED vocabulary (agent-log-events.ts). An
               off-vocabulary event is rejected (exit 3). The message is RENDERED
               from the event's template; you fill its slots.
    --slot k=v fill one template slot (repeatable). A missing required slot is
               rejected (exit 3). The event NAME carries the phase; slots carry
               the specifics. NOTE: cycle.* events are CODE-emitted by the
               orchestration, agents do not emit them.
    --feature <id>   --phase <p>   --cycle <id>   --data '<json of extra slots>'

Batch emit (ONE process + ONE append for a turn's several events, not N spawns):
  lakebase-sftdd-log --events '[{"role":"navigator","level":"info","event":"reasoning",
    "feature":"F1","cycle":"cycle-003","slots":{...}}, {"role":"navigator","level":"warn",
    "event":"smell.flagged","slots":{"smell":"...","severity":"...","detail":"..."}}]'
    Each item takes role/level/event (+ optional feature/phase/cycle/slots/data). Every
    event is validated FIRST; if any is invalid the whole batch fails and nothing is written.

Read:
  lakebase-sftdd-log --read [--role <r>] [--min-level <l>] [--feature <id>] [--json]

Reconcile (structural observability backstop):
  lakebase-sftdd-log --reconcile --feature <id> [--json]
    Emit an artifact.written for every on-disk design artifact the log does not
    already cover, so observability does not depend on a role model emitting its
    own events. Idempotent. The orchestrator / smoke calls this after each phase.

Common:
  --tdd-dir <path>   artifact root (default ./.sftdd, honors a legacy ./.tdd)
  -h, --help
`;

export function runAgentLogCli(argv: string[]): number {
  const a = parseArgs(argv);
  if (a.help) { process.stdout.write(`${HELP}\n`); return 0; }

  if (a.reconstitute) {
    // Post-capture: rewrite the agent-log into ONE coherent recording , the design
    // lane verbatim from the recorded design log (original token counts + cost, on
    // the original capture date), the live build/breakdown turns kept (real cost)
    // but re-dated onto that same timeline, and the synthetic "reconciled"
    // placeholders dropped. Requires --design-log.
    if (!a.designLog) {
      process.stderr.write("Error: --reconstitute requires --design-log <path>.\n");
      return 2;
    }
    try {
      const sftddDir = a.sftddDir ?? resolveSftddDir();
      const final = reconstituteAgentLog({ sftddDir, designLogPath: a.designLog });
      if (a.json) process.stdout.write(`${JSON.stringify(final)}\n`);
      else process.stdout.write(`reconstituted agent-log: ${final.length} entries\n`);
      return 0;
    } catch (e) {
      process.stderr.write(`lakebase-sftdd-log --reconstitute: ${(e as Error).message}\n`);
      return 3;
    }
  }

  if (a.reconcile) {
    // Structural observability backstop: emit an artifact.written for every
    // on-disk design artifact the log does not already cover, so the log
    // reflects what was produced even when a role model skipped its own
    // emits. Idempotent. Requires --feature.
    if (!a.feature) {
      process.stderr.write("Error: --reconcile requires --feature.\n");
      return 2;
    }
    try {
      const emitted = reconcileArtifactLog({ sftddDir: a.sftddDir, featureId: a.feature });
      if (a.json) {
        process.stdout.write(`${JSON.stringify(emitted)}\n`);
      } else {
        process.stdout.write(`reconciled ${emitted.length} event(s) into the log for ${a.feature}\n`);
        // Most reconciled events are artifact.written (a `path`); some are code-
        // emitted reasoning (e.g. the architect's established-conventions note),
        // which carries a `note`, not a `path`. Print whichever identifies it,
        // never a bare `undefined`.
        for (const e of emitted) {
          const meta = e.metadata as { path?: string; note?: string } | undefined;
          process.stdout.write(`  + [${e.role}] ${meta?.path ?? meta?.note ?? e.message}\n`);
        }
      }
      return 0;
    } catch (e) {
      process.stderr.write(`lakebase-sftdd-log --reconcile: ${(e as Error).message}\n`);
      return 3;
    }
  }

  if (a.read) {
    const events = readAgentLog({
      sftddDir: a.sftddDir,
      role: a.role as AgentRole | undefined,
      featureId: a.feature,
      minLevel: a.minLevel as AgentLogLevel | undefined,
    });
    if (a.json) {
      process.stdout.write(`${JSON.stringify(events)}\n`);
    } else {
      for (const e of events) {
        process.stdout.write(`${e.timestamp} ${e.level.toUpperCase().padEnd(5)} [${e.role}] ${e.event}: ${e.message}\n`);
      }
    }
    return 0;
  }

  // Batch mode: emit MANY events in one process + one append (a turn's several
  // judgment events cost ONE subprocess spawn, not N). --events is a JSON array of
  // { role, level, event, feature?, phase?, cycle?, slots?, data? }.
  if (a.events !== undefined) {
    let raw: unknown;
    try {
      raw = JSON.parse(a.events);
    } catch (e) {
      process.stderr.write(`Error: --events is not valid JSON: ${(e as Error).message}\n`);
      return 2;
    }
    if (!Array.isArray(raw)) {
      process.stderr.write(`Error: --events must be a JSON array of event objects.\n`);
      return 2;
    }
    const inputs: AgentLogEventInput[] = [];
    for (const el of raw as Array<Record<string, unknown>>) {
      if (!el || typeof el.role !== "string" || typeof el.level !== "string" || typeof el.event !== "string") {
        process.stderr.write(`Error: each --events item needs string role, level, event.\n`);
        return 2;
      }
      const slots: Record<string, unknown> = { ...((el.slots as Record<string, unknown>) ?? {}) };
      if (typeof el.data === "string") {
        try {
          Object.assign(slots, JSON.parse(el.data) as Record<string, unknown>);
        } catch (e) {
          process.stderr.write(`Error: an --events item's data is not valid JSON: ${(e as Error).message}\n`);
          return 2;
        }
      }
      inputs.push({
        role: el.role as AgentRole,
        level: el.level as AgentLogLevel,
        event: el.event as AgentLogEventName,
        feature_id: typeof el.feature === "string" ? el.feature : undefined,
        phase: typeof el.phase === "string" ? el.phase : undefined,
        cycle_id: typeof el.cycle === "string" ? el.cycle : undefined,
        slots,
      });
    }
    try {
      emitAgentLogEvents(inputs, { sftddDir: a.sftddDir });
      // Mirror any BLOCKING smell in the batch to smells.json, same as single emit.
      for (const inp of inputs) mirrorBlockingSmell(a.sftddDir ?? resolveSftddDir(), inp.event, inp.slots ?? {});
      return 0;
    } catch (e) {
      process.stderr.write(`lakebase-sftdd-log --events: ${(e as Error).message}\n`);
      return 3;
    }
  }

  if (!a.role || !a.level || !a.event) {
    process.stderr.write(`Error: emit requires --role --level --event (+ the event's --slot values), or --events for a batch.\n\n${HELP}\n`);
    return 2;
  }
  const slots: Record<string, unknown> = { ...(a.slots ?? {}) };
  if (a.data !== undefined) {
    try {
      Object.assign(slots, JSON.parse(a.data) as Record<string, unknown>);
    } catch (e) {
      process.stderr.write(`Error: --data is not valid JSON: ${(e as Error).message}\n`);
      return 2;
    }
  }
  const input: AgentLogEventInput = {
    role: a.role as AgentRole,
    level: a.level as AgentLogLevel,
    event: a.event as AgentLogEventName,
    feature_id: a.feature,
    phase: a.phase,
    cycle_id: a.cycle,
    slots,
  };
  try {
    emitAgentLogEvent(input, { sftddDir: a.sftddDir });
    mirrorBlockingSmell(a.sftddDir ?? resolveSftddDir(), input.event, slots);
    return 0;
  } catch (e) {
    process.stderr.write(`lakebase-sftdd-log: ${(e as Error).message}\n`);
    return 3;
  }
}

/** A role-flagged BLOCKING smell must HALT the loop, not just log: mirror it into
 *  smells.json so the driver's firstPendingEscalation -> raise-to-hil fires before
 *  the next dispatch. No-op for a non-smell event or an advisory/unknown smell.
 *  Carries story/ac scope when the role named it (slots) so revise-routing knows
 *  which story to send back (the probe falls back to the active build story). */
function mirrorBlockingSmell(sftddDir: string, event: string, slots: Record<string, unknown>): void {
  if (event !== "smell.flagged" || typeof slots.smell !== "string") return;
  recordBlockingSmellFlag(sftddDir, slots.smell, typeof slots.detail === "string" ? slots.detail : undefined, {
    story_id: typeof slots.story === "string" ? slots.story : undefined,
    ac_id: typeof slots.ac === "string" ? slots.ac : undefined,
  });
}

if (isCliEntry(import.meta.url)) {
  process.exit(runAgentLogCli(process.argv.slice(2)));
}
