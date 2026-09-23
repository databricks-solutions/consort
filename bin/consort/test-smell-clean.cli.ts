#!/usr/bin/env node
// CLI for the test-smell-clean gate: prove the project's test files carry none of
// the issue #199 authoring-smell catalog (loose locators, vi.mock TDZ,
// framenavigated reload detectors, DELETE teardowns, umbrella IntegrityError,
// schema-unsatisfiable table refs). Deterministic + model-independent, mirroring
// consort-migration-history-clean.
//
// Exit 0 = clean. Exit 1 = smells found – prints the [smell] file:line list + the
// per-smell fix, routed to the test's AUTHOR (never a Driver code repair).
//
// Usage:
//   consort-test-smell-clean [--project-dir <path>] [--tests <rel> ...]
//                            [--migrations <rel> ...] [--json]

import { checkTestSmells, type TestSmellArgs } from "../../consort/architecture/test-smell-clean.js";

interface Parsed {
  projectDir: string;
  tests: string[];
  migrations: string[];
  json: boolean;
}

function parse(argv: string[]): Parsed {
  const out: Parsed = { projectDir: process.cwd(), tests: [], migrations: [], json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--project-dir" && i + 1 < argv.length) out.projectDir = argv[++i];
    else if (a === "--tests" && i + 1 < argv.length) out.tests.push(argv[++i]);
    else if (a === "--migrations" && i + 1 < argv.length) out.migrations.push(argv[++i]);
    else if (a === "--json") out.json = true;
    else if (a === "-h" || a === "--help") help();
  }
  return out;
}

function help(): never {
  process.stdout.write(
    `consort-test-smell-clean: prove the test files carry no issue #199 authoring smells\n\n` +
      `Usage:\n` +
      `  consort-test-smell-clean [--project-dir <path>] [--tests <rel> ...] [--migrations <rel> ...] [--json]\n\n` +
      `Exit 0 = clean; exit 1 = smells found (the test is the defect, not the app).\n`,
  );
  process.exit(0);
}

const p = parse(process.argv.slice(2));
const callArgs: TestSmellArgs = { projectDir: p.projectDir };
if (p.tests.length > 0) callArgs.testDirs = p.tests;
if (p.migrations.length > 0) callArgs.migrationDirs = p.migrations;

const r = checkTestSmells(callArgs);

if (p.json) {
  process.stdout.write(`${JSON.stringify(r)}\n`);
} else if (r.clean) {
  process.stdout.write(`test-smell-clean: OK (no issue #199 authoring smells)\n`);
} else {
  process.stderr.write(`test-smell-clean: FAILED (${r.violations.length} authoring smell(s)).\n\n${r.remediation}\n`);
}

process.exit(r.clean ? 0 : 1);
