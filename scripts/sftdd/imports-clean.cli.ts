#!/usr/bin/env node
// CLI for the imports-clean gate: prove the app entry imports without an
// optional build artifact (client/dist) present.
//
// Exit 0 = clean (entry imported, or no conventional entry to check).
// Exit 1 = the entry could not be imported with the artifact hidden , the
//          "import-time coupling to an optional build artifact" smell (or a
//          genuine import bug). Prints the importer error + remediation.
//
// Usage:
//   lakebase-sftdd-imports-clean [--project-dir <path>] [--lang python|nodejs]
//                              [--artifact <rel> ...] [--json]

import { checkImportsClean, type ImportsCleanArgs } from "./imports-clean.js";
import type { SchemaMigrationLanguage } from "@databricks-solutions/lakebase-scm-utils/lakebase";

interface Parsed {
  projectDir: string;
  lang?: SchemaMigrationLanguage;
  artifacts: string[];
  json: boolean;
}

function parse(argv: string[]): Parsed {
  const out: Parsed = { projectDir: process.cwd(), artifacts: [], json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--project-dir" && i + 1 < argv.length) out.projectDir = argv[++i];
    else if (a === "--lang" && i + 1 < argv.length) out.lang = argv[++i] as SchemaMigrationLanguage;
    else if (a === "--artifact" && i + 1 < argv.length) out.artifacts.push(argv[++i]);
    else if (a === "--json") out.json = true;
    else if (a === "-h" || a === "--help") help();
  }
  return out;
}

function help(): never {
  process.stdout.write(
    `lakebase-sftdd-imports-clean , import the app entry without a build artifact present\n\n` +
      `Usage:\n` +
      `  lakebase-sftdd-imports-clean [--project-dir <path>] [--lang python|nodejs] \\\n` +
      `                             [--artifact <rel> ...] [--json]\n\n` +
      `Exit 0 = clean; exit 1 = entry could not import with the artifact hidden.\n`,
  );
  process.exit(0);
}

const p = parse(process.argv.slice(2));
const callArgs: ImportsCleanArgs = { projectDir: p.projectDir };
if (p.lang) callArgs.lang = p.lang;
if (p.artifacts.length > 0) callArgs.buildArtifacts = p.artifacts;

const result = checkImportsClean(callArgs);

if (p.json) {
  process.stdout.write(`${JSON.stringify(result)}\n`);
} else if (result.clean) {
  const what = result.entry ? `imported \`${result.entry}\`` : "no conventional entry to check";
  const hid = result.hiddenArtifacts.length
    ? ` (artifacts hidden: ${result.hiddenArtifacts.join(", ")})`
    : "";
  process.stdout.write(`imports-clean: OK , ${what}${hid}\n`);
} else {
  process.stderr.write(
    `imports-clean: FAILED , \`${result.entry}\` could not import with build ` +
      `artifact(s) hidden.\n\n${result.error}\n\nRemediation: ${result.remediation}\n`,
  );
}

process.exit(result.clean ? 0 : 1);
