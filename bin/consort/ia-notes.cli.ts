#!/usr/bin/env node
// CLI for the per-story IA-coverage marker: record that a story's surfaces are
// reconciled into ia.md, with NO ux agent turn needed on the deterministic path.
// Written by BOTH paths so coverage is stamped identically:
//   - the design lane's `project-ia-notes` effect (a later story of a feature whose
//     surfaces a sibling story already reconciled — see iaProjectable), and
//   - the live ux `ia` turn's postTurn (after the agent refines ia.md for a
//     feature's first UI story).
// `iaRefined` (orchestrator-probe) keys on this marker's existence.
//
// Idempotent: re-stamping overwrites the same marker.
//
// Usage:
//   consort-ia-notes --feature <F> --story <S> [--tdd-dir <path>]

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { resolveConsortDir, storyIaCoverageJson } from "../../consort/config/consort-paths.js";

interface Parsed {
  feature: string;
  story: string;
  consortDir?: string;
}

function parse(argv: string[]): Parsed {
  const out: Parsed = { feature: "", story: "" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--feature" && i + 1 < argv.length) out.feature = argv[++i];
    else if (a === "--story" && i + 1 < argv.length) out.story = argv[++i];
    else if (a === "--tdd-dir" && i + 1 < argv.length) out.consortDir = argv[++i];
    else if (a === "-h" || a === "--help") help();
  }
  return out;
}

function help(): never {
  process.stdout.write(
    `consort-ia-notes – record a story's IA coverage marker (its surfaces are named in ia.md)\n\n` +
      `Usage:\n  consort-ia-notes --feature <F> --story <S> [--tdd-dir <path>]\n`,
  );
  process.exit(0);
}

const p = parse(process.argv.slice(2));
if (!p.feature || !p.story) {
  process.stderr.write("consort-ia-notes: --feature and --story are required\n");
  process.exit(2);
}

const consortDir = p.consortDir ?? resolveConsortDir();
const file = storyIaCoverageJson(consortDir, p.feature, p.story);
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, JSON.stringify({ story: p.story, reconciled_at: new Date().toISOString() }, null, 2) + "\n");
process.stdout.write(`ia-notes: recorded IA coverage for ${p.feature}/${p.story}\n`);
process.exit(0);
