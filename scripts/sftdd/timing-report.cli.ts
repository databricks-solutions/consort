#!/usr/bin/env node
// CLI: per-turn timing report from the centralized agent log
// (.tdd/agent-log.jsonl). The enabler (P0) for the agent-loop optimization plan
// , prints where wall-clock actually goes so each change is A/B-measurable.
//
//   lakebase-sftdd-timing [--tdd-dir <path>] [--feature <id>] [--top <n>] [--json]
//
// Exit codes: 0 ok; 2 bad args.

import { join } from "path";
import { resolveSftddDir } from "./sftdd-paths.js";
import { isCliEntry } from "@databricks-solutions/lakebase-scm-utils/util";
import { timingReportFromLog, formatTimingReport } from "./timing-report.js";
import { readRunConfig, formatRunConfig } from "./run-config.js";

interface ParsedArgs {
  sftddDir?: string;
  feature?: string;
  top?: number;
  json?: boolean;
  skipPlanning?: boolean;
  help?: boolean;
}

function parseArgs(argv: string[]): ParsedArgs | { error: string } {
  const out: ParsedArgs = {};
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--tdd-dir": out.sftddDir = argv[++i]; break;
      case "--feature": out.feature = argv[++i]; break;
      case "--top": {
        const n = Number(argv[++i]);
        if (!Number.isFinite(n) || n < 0) return { error: "--top expects a non-negative number" };
        out.top = Math.floor(n);
        break;
      }
      case "--json": out.json = true; break;
      case "--skip-planning": out.skipPlanning = true; break;
      case "--help": case "-h": out.help = true; break;
      default: return { error: `unknown arg: ${argv[i]}` };
    }
  }
  return out;
}

const HELP = `lakebase-sftdd-timing

Per-turn timing report from the agent log (.tdd/agent-log.jsonl). Leads with the
MEASURED per-turn compute (the driver's turn.usage duration_ms, rolled up by role
and role/model with cost), the durable, baseline-comparable signal. Also rolls up
inter-event gaps by phase / role / kind (for finding orchestration overhead).

  lakebase-sftdd-timing [flags]
    --tdd-dir <path>   artifact root (default ./.sftdd, honors a legacy ./.tdd)
    --feature <id>     only this feature's events
    --top <n>          how many slowest spans to surface (default 10)
    --skip-planning    drop the sprint-planning lane (propose/estimate/author-
                       requests) from the measured-turn rollups
    --json             emit the TimingReport as JSON (the machine API)
    -h, --help
`;

export function runTimingCli(argv: string[]): number {
  const parsed = parseArgs(argv);
  if ("error" in parsed) {
    process.stderr.write(`Error: ${parsed.error}\n\n${HELP}\n`);
    return 2;
  }
  if (parsed.help) {
    process.stdout.write(`${HELP}\n`);
    return 0;
  }
  const report = timingReportFromLog(
    { sftddDir: parsed.sftddDir, featureId: parsed.feature },
    { topN: parsed.top, skipPlanning: parsed.skipPlanning },
  );
  // P0.1: pair the timing with the run's model + option matrix so it is
  // self-describing and two reports are A/B-comparable. Read from the same .tdd.
  const sftddDir = parsed.sftddDir ?? resolveSftddDir();
  const config = readRunConfig(sftddDir) ?? null;
  if (parsed.json) {
    process.stdout.write(`${JSON.stringify({ config, timing: report }, null, 2)}\n`);
  } else {
    if (config) process.stdout.write(formatRunConfig(config) + "\n");
    process.stdout.write(formatTimingReport(report));
  }
  return 0;
}

if (isCliEntry(import.meta.url)) {
  process.exit(runTimingCli(process.argv.slice(2)));
}
