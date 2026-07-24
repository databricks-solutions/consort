#!/usr/bin/env node
// CLI: "did this feature's artifacts adhere to the format expected?"
//
//   lakebase-sftdd-gate-conformance --feature <id>
//   lakebase-sftdd-gate-conformance --feature <id> --json --pretty
//
// Layer 2. Scans a feature's on-disk artifacts and checks each that
// exists against its declared format (JSON against its schema; narrative MD
// against its role-documented required sections). Existence is NOT enforced
// here (a feature mid-design legitimately lacks plan.json); this only reports
// non-conformance of what exists. Exit codes:
//   0 = every checked artifact conforms
//   1 = at least one artifact is non-conformant
//   2 = bad args
//   3 = scan failure (e.g. feature not found)

import { isCliEntry } from "@databricks-solutions/lakebase-scm-utils/util";
import { resolveSftddDir } from "./sftdd-paths.js";
import { scanFeatureConformance } from "./artifact-conformance.js";

interface ParsedArgs {
  feature?: string;
  sftddDir?: string;
  json?: boolean;
  pretty?: boolean;
  help?: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {};
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--feature":
        out.feature = argv[++i];
        break;
      case "--tdd-dir":
        out.sftddDir = argv[++i];
        break;
      case "--json":
        out.json = true;
        break;
      case "--pretty":
        out.pretty = true;
        break;
      case "--help":
      case "-h":
        out.help = true;
        break;
    }
  }
  return out;
}

const HELP = `lakebase-sftdd-gate-conformance

Check that a feature's artifacts adhere to the format their producing role is
documented to emit. JSON artifacts validate against their schema; narrative MD
artifacts must carry an H1 title plus their required sections.

Usage:
  lakebase-sftdd-gate-conformance --feature <id> [flags]

Flags:
  --feature <id>          Feature id (required, e.g. F1-initial-domain)
  --tdd-dir <path>        artifact root (default: ./.sftdd, honors a legacy ./.tdd)
  --json                  Machine-readable JSON output
  --pretty                Pretty-print JSON
  -h, --help              Show this help
`;

export function runGateConformanceCli(argv: string[]): number {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(`${HELP}\n`);
    return 0;
  }
  if (!args.feature) {
    process.stderr.write(`Error: --feature is required.\n\n${HELP}\n`);
    return 2;
  }
  let report;
  try {
    report = scanFeatureConformance(args.sftddDir ?? resolveSftddDir(), args.feature);
  } catch (e) {
    process.stderr.write(`gate-conformance: ${(e as Error).message}\n`);
    return 3;
  }

  if (args.json) {
    process.stdout.write(`${JSON.stringify(report, null, args.pretty ? 2 : 0)}\n`);
  } else {
    for (const entry of report.entries) {
      if (entry.ok) {
        process.stdout.write(`  ok    ${entry.artifact}\n`);
      } else {
        process.stdout.write(`  FAIL  ${entry.artifact}\n`);
        for (const v of entry.violations) process.stdout.write(`          ${v}\n`);
      }
    }
    process.stdout.write(
      report.ok
        ? `gate-conformance: all ${report.entries.length} artifact(s) conform\n`
        : `gate-conformance: ${report.entries.filter((e) => !e.ok).length} of ${report.entries.length} artifact(s) non-conformant\n`,
    );
  }
  return report.ok ? 0 : 1;
}

if (isCliEntry(import.meta.url)) {
  process.exit(runGateConformanceCli(process.argv.slice(2)));
}
