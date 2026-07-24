#!/usr/bin/env node

// scripts/lakebase/update-commands.cli.ts
import * as readline from "readline";
import * as fs2 from "fs";
import * as path2 from "path";
import { fileURLToPath } from "url";
import {
  detectCommandDrift
} from "@databricks-solutions/lakebase-scm-utils/lakebase";

// scripts/lakebase/update-commands.ts
import * as fs from "fs";
import * as path from "path";
var COMMAND_HOOK_FILE_PATTERN = /\.(pre|post)-hook\.md$/;
function findKitCommandsDir(start) {
  let dir = start;
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(
      dir,
      "templates",
      "project",
      "common",
      ".claude",
      "commands"
    );
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `Could not locate templates/project/common/.claude/commands/ relative to ${start}. Pass explicit kitDir.`
  );
}
function readKitVersion(kitCommandsDir) {
  let dir = kitCommandsDir;
  for (let i = 0; i < 5; i++) {
    dir = path.dirname(dir);
  }
  try {
    const raw = fs.readFileSync(path.join(dir, "package.json"), "utf-8");
    const pkg = JSON.parse(raw);
    return typeof pkg.version === "string" ? pkg.version : "unknown";
  } catch {
    return "unknown";
  }
}
function applyCommandPlaceholders(content, version) {
  return content.replace(/\$\{KIT_VERSION_AT_SCAFFOLD\}/g, version);
}
function updateCommands(args) {
  const projectCommandsDir = path.join(args.projectDir, ".claude", "commands");
  const here = path.dirname(new URL(import.meta.url).pathname);
  const kitCommandsDir = args.kitDir ? path.join(args.kitDir, "templates", "project", "common", ".claude", "commands") : findKitCommandsDir(here);
  const dryRun = args.dryRun === true;
  const force = args.force !== false;
  const templateFiles = fs.existsSync(kitCommandsDir) ? fs.readdirSync(kitCommandsDir).filter((f) => f.endsWith(".md") && !COMMAND_HOOK_FILE_PATTERN.test(f)) : [];
  if (!dryRun && templateFiles.length > 0 && !fs.existsSync(projectCommandsDir)) {
    fs.mkdirSync(projectCommandsDir, { recursive: true });
  }
  const version = readKitVersion(kitCommandsDir);
  const files = [];
  for (const name of templateFiles) {
    const projectPath = path.join(projectCommandsDir, name);
    const templatePath = path.join(kitCommandsDir, name);
    const templateRaw = fs.readFileSync(templatePath, "utf-8");
    const desired = applyCommandPlaceholders(templateRaw, version);
    const existed = fs.existsSync(projectPath);
    const current = existed ? fs.readFileSync(projectPath, "utf-8") : "";
    let outcome;
    if (!existed) {
      outcome = "added";
    } else if (current === desired) {
      outcome = "unchanged";
    } else if (!force) {
      outcome = "preserved";
    } else {
      outcome = "updated";
    }
    if (!dryRun && (outcome === "added" || outcome === "updated")) {
      fs.writeFileSync(projectPath, desired);
    }
    files.push({ name, outcome });
  }
  const order = {
    added: 0,
    updated: 1,
    preserved: 2,
    unchanged: 3
  };
  files.sort((a, b) => order[a.outcome] - order[b.outcome] || a.name.localeCompare(b.name));
  const changed = files.some((f) => f.outcome === "added" || f.outcome === "updated");
  return { files, changed };
}

// scripts/lakebase/update-commands.cli.ts
function resolveKitRoot() {
  let dir = path2.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    if (fs2.existsSync(path2.join(dir, "templates", "project", "common", ".claude", "commands"))) {
      return dir;
    }
    const parent = path2.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path2.resolve(path2.dirname(fileURLToPath(import.meta.url)), "../../..");
}
var KIT_ROOT = resolveKitRoot();
function parseArgs(argv) {
  const out = {};
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
var HELP = `lakebase-update-commands \u2013 refresh .claude/commands/ from the current kit

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
async function promptYn(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve2) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve2(/^y(es)?$/i.test(answer.trim()));
    });
  });
}
function renderDriftSummary(entries) {
  const lines = [];
  for (const e of entries) {
    if (e.status === "unchanged") continue;
    lines.push(`  ${e.status.padEnd(8)} ${e.name}${e.pinned_version ? `  (pinned: ${e.pinned_version})` : ""}`);
  }
  return lines.join("\n") || "  (no command-file drift)";
}
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(HELP);
    return 0;
  }
  const projectDir = args.projectDir ?? process.cwd();
  const force = args.force === true;
  const dryRun = args.dryRun === true;
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
      resolvedForce = true;
    }
  }
  const result = updateCommands({ projectDir, dryRun, force: resolvedForce });
  if (args.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return 0;
  }
  for (const f of result.files) {
    process.stdout.write(`  ${f.outcome.padEnd(10)} ${f.name}
`);
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
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}
`);
    process.exit(1);
  }
);
//# sourceMappingURL=update-commands.cli.js.map