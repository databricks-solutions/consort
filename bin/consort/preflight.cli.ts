#!/usr/bin/env node
// consort-preflight: compose the pre-session state blob ONCE, so `/start` opens the
// session already knowing the kit version, project phase + next action, telemetry
// state, SCM branch, and first-project marker instead of discovering them through a
// dozen ad-hoc probes. Reads only fast local sources (files + one `git` call), is
// best-effort (never throws, never blocks), and always exits 0 — a preflight must
// never gate startup. See consort/session/preflight.ts for the composed sources and
// the freshness/best-effort contract.
//
// Usage:
//   consort-preflight [--project-dir <path>] [--output <path>]
//
// Emits the blob as JSON to stdout (and to --output when given). The session reads it
// once; it is a CACHE, not the source of truth — re-derive (git + consort-next) if it
// is stale or before any mutating action.

import { writeFileSync } from "node:fs";

import { buildPreflight } from "../../consort/session/preflight.js";

interface Parsed {
  projectDir: string;
  output?: string;
  help: boolean;
}

function parse(argv: string[]): Parsed {
  const out: Parsed = { projectDir: process.cwd(), help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--project-dir" && i + 1 < argv.length) out.projectDir = argv[++i];
    else if (a === "--output" && i + 1 < argv.length) out.output = argv[++i];
    else if (a === "-h" || a === "--help") out.help = true;
  }
  return out;
}

const HELP = `consort-preflight – compose the pre-session state blob (kit, project, telemetry, scm, env)

Usage:
  consort-preflight [--project-dir <path>] [--output <path>]

Emits JSON to stdout (and to --output when given). Best-effort + always exits 0;
a missing/unreadable source reads as null/false, never an error. The blob is a
cache the session reads once — re-derive on staleness or before mutating actions.
`;

function main(): number {
  const p = parse(process.argv.slice(2));
  if (p.help) {
    process.stdout.write(HELP);
    return 0;
  }
  // buildPreflight is itself best-effort; guard the emit too so preflight NEVER
  // fails the session — worst case it prints an empty-ish blob.
  let json: string;
  try {
    json = JSON.stringify(buildPreflight(p.projectDir), null, 2);
  } catch (err) {
    json = JSON.stringify({ preflight_at: new Date().toISOString(), warnings: [`preflight failed: ${err instanceof Error ? err.message : String(err)}`] }, null, 2);
  }
  if (p.output) {
    try {
      writeFileSync(p.output, json + "\n");
    } catch {
      /* best-effort: still print to stdout below */
    }
  }
  process.stdout.write(json + "\n");
  return 0;
}

process.exit(main());
