#!/usr/bin/env node
// CLI: SCM workflow doctor (phase C). Read-only diagnostic.

import * as fs from "node:fs";
import * as path from "node:path";
import { isCliEntry } from "../util/cli-entry.js";
import {
  FIXABLE_FINDING_IDS,
  ScmDoctorFixError,
  fixFinding,
  runDoctor,
  type DoctorReport,
  type FixFindingResult,
  type FixableFindingId,
} from "./scm-doctor.js";
// SFTDD stale-branch finder, injected into runDoctor so scm-doctor.ts (SCM core)
// carries no sftdd import. This CLI is the composition point; at the
// lakebase-scm-utils split it relocates to the kit side (which owns SFTDD).
import { resolveSftddDir } from "../sftdd/sftdd-paths.js";
import { findStaleBranches } from "../sftdd/stale-branches.js";

interface ParsedArgs {
  projectDir?: string;
  instance?: string;
  fix?: string;
  json?: boolean;
  pretty?: boolean;
  help?: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--project-dir":
      case "--cwd":
        out.projectDir = argv[++i];
        break;
      case "--instance":
        out.instance = argv[++i];
        break;
      case "--fix":
        out.fix = argv[++i];
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

const HELP = `lakebase-scm-doctor (phase C)

Read-only diagnostic. Cross-checks .lakebase/workflow-state.json,
.env, the current git branch, and the Lakebase tier inventory.
Reports inconsistencies + suggests a remediation command per finding.

Usage:
  lakebase-scm-doctor [flags]

Flags:
  --project-dir <dir>   Project root (default: cwd)
  --instance <id>       Lakebase project id (default: from .env)
  --fix <finding-id>    Apply the targeted remediation for one finding.
                        Supported: env-branch-drift, head-branch-drift,
                        tier-topology-mismatch, orphan-current-branch.
  --json                Machine-readable JSON report
  --pretty              Pretty-print JSON
  -h, --help            Show this help

Exit codes (diagnostic mode):
  0 = no findings (or only "ok" findings)
  1 = warnings present (state usable but drifting)
  2 = failures present (state broken; remediation required)

Exit codes (--fix mode):
  0 = fix applied; post-fix report attached
  2 = finding not present in current report, or unsupported finding id
  3 = fix executed but the underlying command failed
`;

function readEnvProjectId(projectDir: string): string | undefined {
  const envPath = path.join(projectDir, ".env");
  if (!fs.existsSync(envPath)) return undefined;
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const m = line.match(/^\s*LAKEBASE_PROJECT_ID\s*=\s*(.+?)\s*$/);
    if (m) return m[1].replace(/^["']|["']$/g, "");
  }
  return undefined;
}

function renderHuman(report: DoctorReport): string {
  const lines: string[] = [];
  lines.push(`SCM workflow doctor: ${report.projectDir}`);
  lines.push("");
  lines.push(
    `  workflow_state_present : ${report.workflowStatePresent ? "yes" : "no"}`,
  );
  if (report.state) {
    lines.push(`  current_state          : ${report.state.state}`);
    lines.push(
      `  tier_topology          : ${report.state.tier_topology}${
        report.inferredTierTopology &&
        report.inferredTierTopology !== report.state.tier_topology
          ? ` (lakebase suggests ${report.inferredTierTopology})`
          : ""
      }`,
    );
  }
  lines.push(`  worst_severity         : ${report.worstSeverity}`);
  lines.push("");
  if (report.findings.length === 0) {
    lines.push("No findings.");
  } else {
    lines.push("Findings:");
    for (const f of report.findings) {
      lines.push(`  [${f.severity.toUpperCase()}] ${f.id}`);
      lines.push(`    ${f.message}`);
      if (f.suggestion) {
        lines.push(`    suggest: ${f.suggestion}`);
      }
    }
  }
  return lines.join("\n");
}

function exitCodeFor(report: DoctorReport): number {
  if (report.worstSeverity === "fail") return 2;
  if (report.worstSeverity === "warn") return 1;
  return 0;
}

function renderFixResult(result: FixFindingResult): string {
  const lines: string[] = [];
  lines.push(`Fix applied: ${result.findingId}`);
  lines.push(`  action       : ${result.action}`);
  lines.push("");
  lines.push("Post-fix doctor report:");
  lines.push("");
  for (const line of renderHuman(result.postReport).split("\n")) {
    lines.push(`  ${line}`);
  }
  return lines.join("\n");
}

export async function runScmDoctorCli(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(`${HELP}\n`);
    return 0;
  }
  const projectDir = path.resolve(args.projectDir ?? process.cwd());
  const instance = args.instance ?? readEnvProjectId(projectDir);

  if (args.fix) {
    if (!FIXABLE_FINDING_IDS.includes(args.fix as FixableFindingId)) {
      const msg = `Unsupported --fix value "${args.fix}". Supported: ${FIXABLE_FINDING_IDS.join(", ")}.`;
      if (args.json) {
        process.stdout.write(
          `${JSON.stringify({ ok: false, error: { code: "unsupported-finding", message: msg } }, null, args.pretty ? 2 : 0)}\n`,
        );
      } else {
        process.stderr.write(`lakebase-scm-doctor: ${msg}\n`);
      }
      return 2;
    }
    try {
      const result = await fixFinding({
        projectDir,
        instance,
        findingId: args.fix as FixableFindingId,
      });
      if (args.json) {
        process.stdout.write(
          `${JSON.stringify({ ok: true, ...result }, null, args.pretty ? 2 : 0)}\n`,
        );
      } else {
        process.stdout.write(`${renderFixResult(result)}\n`);
      }
      return 0;
    } catch (e) {
      const err = e as Error;
      const code = err instanceof ScmDoctorFixError ? err.code : "fix-failed";
      const message = err.message;
      if (args.json) {
        process.stdout.write(
          `${JSON.stringify({ ok: false, error: { code, message } }, null, args.pretty ? 2 : 0)}\n`,
        );
      } else {
        process.stderr.write(`lakebase-scm-doctor: ${code}\n\n  ${message}\n`);
      }
      if (err instanceof ScmDoctorFixError) {
        if (err.code === "fix-failed") return 3;
        return 2;
      }
      return 3;
    }
  }

  const report = await runDoctor(
    { projectDir, instance },
    { findStaleBranches: () => findStaleBranches(resolveSftddDir(projectDir)) },
  );
  if (args.json) {
    const indent = args.pretty ? 2 : 0;
    process.stdout.write(`${JSON.stringify(report, null, indent)}\n`);
  } else {
    process.stdout.write(`${renderHuman(report)}\n`);
  }
  return exitCodeFor(report);
}

if (isCliEntry(import.meta.url)) {
  void runScmDoctorCli(process.argv.slice(2)).then((c) => process.exit(c));
}
