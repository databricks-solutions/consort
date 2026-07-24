#!/usr/bin/env node
// CLI wrapper around updateCommands. Refresh a scaffolded project's
// `.claude/commands/{design,build}.md` against the current kit
// templates. Interactive-per-file confirm by default; --force skips
// the prompt for unattended use; --dry-run prints the diff without
// writing.
//
// Hook files (`<name>.{pre,post}-hook.md`) are NEVER touched.

import * as readline from "node:readline";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  detectCommandDrift,
  type CommandFileEntry,
} from "@databricks-solutions/lakebase-scm-utils/lakebase";
import { updateCommands } from "./update-commands.js";

// The `.claude/commands` templates live in THIS kit (SFTDD), while the
// drift detector now lives in @databricks-solutions/lakebase-scm-utils. Its
// default kit-dir resolution walks up from its own (dependency) location and
// cannot find our templates, so resolve our kit root explicitly by walking up
// from this CLI to the dir that contains templates/project/common/.claude/commands.
// Works from both source (scripts/lakebase) and built dist (dist/scripts/lakebase).
function resolveKitRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, "templates", "project", "common", ".claude", "commands"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
}
const KIT_ROOT = resolveKitRoot();

interface ParsedArgs {
  projectDir?: string;
  dryRun?: boolean;
  force?: boolean;
  json?: boolean;
  help?: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--project-dir":
      case "-C":
        out.projectDir = argv[++i];
        break;
      case "--dry-run":
        out.dryRun = true;
        break;
      case "--force":
        out.force = true;
        break;
      case "--json":
        out.json = true;
        break;
      case "--help":
      case "-h":
        out.help = true;
        break;
      default:
        if (!a.startsWith("-") && !out.projectDir) {
          out.projectDir = a;
        }
        break;
    }
  }
  return out;
}

const HELP = `lakebase-update-commands – refresh .claude/commands/ from the current kit

Usage:
  lakebase-update-commands [path]                 interactive per-file confirm
  lakebase-update-commands [path] --force         overwrite drifted files unattended
  lakebase-update-commands [path] --dry-run       preview without writing

Flags:
  --project-dir <path>, -C <path>   Project root (defaults to current directory)
  --dry-run                         Report what would change; write nothing
  --force                           Overwrite drifted files without prompting
  --json                            Emit a JSON report on stdout instead of human text
  --help, -h                        Show this help

Hook files (design.{pre,post}-hook.md, build.{pre,post}-hook.md) are
project-owned and NEVER touched by this command.

Output: a human-readable summary on stdout (or JSON with --json).
       Exit codes:
         0 - success (whether or not changes were applied)
         1 - operational failure (kit templates missing, etc.)
`;

async function promptYn(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
}

function renderDriftSummary(entries: CommandFileEntry[]): string {
  const lines: string[] = [];
  for (const e of entries) {
    if (e.status === "unchanged") continue;
    lines.push(`  ${e.status.padEnd(8)} ${e.name}${e.pinned_version ? `  (pinned: ${e.pinned_version})` : ""}`);
  }
  return lines.join("\n") || "  (no command-file drift)";
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(HELP);
    return 0;
  }
  const projectDir = args.projectDir ?? process.cwd();
  const force = args.force === true;
  const dryRun = args.dryRun === true;

  // Step 1: show the user what's drifted before doing anything.
  const drift = detectCommandDrift({ projectDir, kitDir: KIT_ROOT });
  if (drift.overall === "ok" && !drift.files.some((f) => f.status === "missing")) {
    if (args.json) {
      process.stdout.write(JSON.stringify({ changed: false, files: [] }, null, 2) + "\n");
    } else {
      process.stdout.write("Commands are in sync with the kit. Nothing to do.\n");
    }
    return 0;
  }
  if (!args.json) {
    process.stderr.write("Drift report:\n");
    process.stderr.write(renderDriftSummary(drift.files) + "\n\n");
  }

  // Step 2: interactive confirm flow unless --force or --dry-run.
  let resolvedForce = force;
  if (!dryRun && !force) {
    const drifted = drift.files.filter((f) => f.status === "drifted").map((f) => f.name);
    if (drifted.length > 0) {
      const ok = await promptYn(
        `Overwrite drifted file(s) ${drifted.join(", ")} with the kit's current template? [y/N] `
      );
      if (!ok) {
        process.stderr.write("Skipping drifted files (force=false). Missing files (if any) will still be added.\n");
      }
      resolvedForce = ok;
    } else {
      // Only missing files; no interactive prompt needed.
      resolvedForce = true;
    }
  }

  // Step 3: apply the update.
  const result = updateCommands({ projectDir, dryRun, force: resolvedForce });

  if (args.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return 0;
  }
  for (const f of result.files) {
    process.stdout.write(`  ${f.outcome.padEnd(10)} ${f.name}\n`);
  }
  if (dryRun) {
    process.stdout.write("\n(dry-run: no files were written)\n");
  } else if (!result.changed) {
    process.stdout.write("\nNo files changed.\n");
  } else {
    process.stdout.write("\nDone.\n");
  }
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
);
