#!/usr/bin/env node
// CLI: per-turn TOOL-CALL report from a drive stdout log. Complements
// lakebase-sftdd-timing (agent-log wall-clock) by answering WHY a turn is slow ,
// how many tool round-trips it made, and how many were pytest re-runs vs pure
// discovery. The measurement enabler for the build-turn speed levers.
//
//   lakebase-sftdd-drive-log-report <log-file> [--top <n>] [--json]
//   ... | lakebase-sftdd-drive-log-report [--top <n>] [--json]   (reads stdin)
//
// Exit codes: 0 ok; 2 bad args.

import { readFileSync } from "fs";
import { isCliEntry } from "@databricks-solutions/lakebase-scm-utils/util";
import { parseDriveLog, formatDriveLogReport } from "./drive-log-report.js";

interface ParsedArgs {
  file?: string;
  top?: number;
  json?: boolean;
  help?: boolean;
}

function parseArgs(argv: string[]): ParsedArgs | { error: string } {
  const out: ParsedArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--top": {
        const n = Number(argv[++i]);
        if (!Number.isFinite(n) || n < 0) return { error: "--top expects a non-negative number" };
        out.top = Math.floor(n);
        break;
      }
      case "--json": out.json = true; break;
      case "--help": case "-h": out.help = true; break;
      default:
        if (a.startsWith("-")) return { error: `unknown arg: ${a}` };
        if (out.file) return { error: "only one log file may be given" };
        out.file = a;
    }
  }
  return out;
}

const HELP = `lakebase-sftdd-drive-log-report

Per-turn tool-call report from a drive stdout log. Counts the '· <tool>' lines
between each '[drive] <role> turn <s>s (<model>)' close, rolled up by role and
model, with the heaviest turns (by tool calls) and their pytest/discovery split.

  lakebase-sftdd-drive-log-report <log-file> [flags]
  ... | lakebase-sftdd-drive-log-report [flags]     (reads stdin when no file)
    --top <n>   how many heaviest turns to surface (default 10)
    --json      emit the DriveLogReport as JSON (the machine API)
    -h, --help
`;

export function runDriveLogReportCli(argv: string[]): number {
  const parsed = parseArgs(argv);
  if ("error" in parsed) {
    process.stderr.write(`Error: ${parsed.error}\n\n${HELP}\n`);
    return 2;
  }
  if (parsed.help) {
    process.stdout.write(`${HELP}\n`);
    return 0;
  }
  const text = parsed.file ? readFileSync(parsed.file, "utf8") : readFileSync(0, "utf8");
  const report = parseDriveLog(text);
  if (parsed.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(formatDriveLogReport(report, parsed.top));
  }
  return 0;
}

if (isCliEntry(import.meta.url)) {
  process.exit(runDriveLogReportCli(process.argv.slice(2)));
}
