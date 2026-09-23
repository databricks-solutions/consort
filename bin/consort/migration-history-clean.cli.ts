#!/usr/bin/env node
// CLI for the migration-history-clean gate: prove that no SHIPPED migration (one
// present at the feature's fork point with the parent tier) was edited, deleted, or
// renamed on this branch (the schema-history-corruption smell, issue #196).
// Deterministic + model-independent, mirroring consort-migration-clean /
// consort-layering-clean.
//
// Exit 0 = clean (only ADDED migrations on this branch, or the boundary could not
//          be established – advisory skip, never a false failure).
// Exit 1 = a shipped migration was mutated. Prints the status/file list + the exact
//          revert commands + the flag-the-mis-premised-test directive.
//
// Usage:
//   consort-migration-history-clean [--project-dir <path>] [--migrations <rel> ...]
//                                   [--parent <ref>] [--json]

import { checkShippedMigrationImmutable, type MigrationHistoryCleanArgs } from "../../consort/architecture/migration-history-clean.js";

interface Parsed {
  projectDir: string;
  migrations: string[];
  parent?: string;
  json: boolean;
}

function parse(argv: string[]): Parsed {
  const out: Parsed = { projectDir: process.cwd(), migrations: [], json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--project-dir" && i + 1 < argv.length) out.projectDir = argv[++i];
    else if (a === "--migrations" && i + 1 < argv.length) out.migrations.push(argv[++i]);
    else if (a === "--parent" && i + 1 < argv.length) out.parent = argv[++i];
    else if (a === "--json") out.json = true;
    else if (a === "-h" || a === "--help") help();
  }
  return out;
}

function help(): never {
  process.stdout.write(
    `consort-migration-history-clean: prove no shipped migration was mutated on this branch\n\n` +
      `Usage:\n` +
      `  consort-migration-history-clean [--project-dir <path>] [--migrations <rel> ...] [--parent <ref>] [--json]\n\n` +
      `Exit 0 = clean (or advisory skip); exit 1 = a shipped migration was edited/deleted/renamed.\n`,
  );
  process.exit(0);
}

const p = parse(process.argv.slice(2));
const callArgs: MigrationHistoryCleanArgs = { projectDir: p.projectDir };
if (p.migrations.length > 0) callArgs.migrationDirs = p.migrations;
if (p.parent) callArgs.parentRef = p.parent;

const r = checkShippedMigrationImmutable(callArgs);

if (p.json) {
  process.stdout.write(`${JSON.stringify(r)}\n`);
} else if (r.clean) {
  process.stdout.write(`migration-history-clean: OK (no shipped migration mutated${r.skippedReason ? `; advisory skip: ${r.skippedReason}` : ""})\n`);
} else {
  process.stderr.write(`migration-history-clean: FAILED (${r.violations.length} shipped migration(s) mutated).\n\n${r.remediation}\n`);
}

process.exit(r.clean ? 0 : 1);
