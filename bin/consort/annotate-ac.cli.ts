#!/usr/bin/env node
// CLI: safely annotate an acceptance-criterion JSON with the Architect's fields.
//
//   consort-annotate-ac --feature <F> --story <S> --ac <AC> \
//     --layer <API|E2E|Infra> --notes "<architectural_notes>" [--consort-dir <dir>]
//
// Why this exists: the Architect Reviewer must ADD `layer` + `architectural_notes`
// to acs/<AC>.json WITHOUT dropping any existing field (id/given/when/then/
// independence/...). Hand-editing that JSON with Edit is corruption-prone – a
// dropped brace or comma yields malformed JSON that the orchestrator's conformance
// re-check only catches two steps later, aborting the drive on a PROTOCOL
// VIOLATION. This does the safe thing mechanically: read -> parse -> merge the two
// fields on top -> write valid, pretty JSON. The agent never touches braces.

import * as fs from "node:fs";
import { isCliEntry } from "@databricks-solutions/lakebase-scm-utils/util";
import { resolveConsortDir, acJson } from "../../consort/config/consort-paths.js";

interface ParsedArgs {
  feature?: string;
  story?: string;
  ac?: string;
  layer?: string;
  notes?: string;
  uiSeams?: string;
  apiContract?: string;
  consortDir?: string;
  help?: boolean;
}

const LAYERS = ["API", "E2E", "Infra"];

const HELP = `consort-annotate-ac – safely add the Architect's layer + architectural_notes to an AC

Usage:
  consort-annotate-ac --feature <F> --story <S> --ac <AC> --layer <API|E2E|Infra> --notes "<text>" \\
    [--ui-seams "seam-a,seam-b"] [--consort-dir <dir>]

Reads acs/<AC>.json, merges { layer, architectural_notes[, ui_seams] } ON TOP of the
existing object (every prior field preserved), and writes valid JSON. Use this instead
of hand-editing the AC file, so a dropped brace can never corrupt it.

--ui-seams (E2E / client ACs): a comma-separated list of the ia.md data-testid seam
tokens this AC's UI must drive (e.g. "stock-cell-tracking,stock-not-tracked"). The
deterministic pre-reflect IA gate checks each is named in ia.md.

--api-contract (API-asserting ACs): the id of the architecture.json api_contracts[]
entry whose response shape this AC exercises (e.g. "EP1-list-stock-by-sku"). The shape
is single-sourced there; checkApiContractConsistency checks it is a declared endpoint.
`;

export function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {};
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--feature": out.feature = argv[++i]; break;
      case "--story": out.story = argv[++i]; break;
      case "--ac": out.ac = argv[++i]; break;
      case "--layer": out.layer = argv[++i]; break;
      case "--notes": out.notes = argv[++i]; break;
      case "--ui-seams": out.uiSeams = argv[++i]; break;
      case "--api-contract": out.apiContract = argv[++i]; break;
      case "--consort-dir": case "--tdd-dir": out.consortDir = argv[++i]; break;
      case "--help": case "-h": out.help = true; break;
      default: break;
    }
  }
  return out;
}

/**
 * Merge the Architect's fields into an AC object, preserving every existing field.
 * Pure – the caller does the fs. Throws on malformed input JSON (a pre-existing
 * corruption we must not silently overwrite).
 */
export function mergeAcAnnotation(
  raw: string,
  fields: { layer?: string; notes: string; uiSeams?: string[]; apiContract?: string },
): string {
  const obj = JSON.parse(raw) as Record<string, unknown>;
  if (fields.layer) obj.layer = fields.layer;
  obj.architectural_notes = fields.notes;
  // Only set ui_seams when provided (a non-UI AC omits it); an explicit empty list clears it.
  if (fields.uiSeams !== undefined) obj.ui_seams = fields.uiSeams;
  // Only set api_contract_id when provided (a non-API AC omits it); an empty string clears it.
  if (fields.apiContract !== undefined) {
    if (fields.apiContract.length > 0) obj.api_contract_id = fields.apiContract;
    else delete obj.api_contract_id;
  }
  return JSON.stringify(obj, null, 2) + "\n";
}

/** Parse a comma-separated --ui-seams value into a trimmed, de-duped token list. */
export function parseUiSeams(raw: string | undefined): string[] | undefined {
  if (raw === undefined) return undefined;
  return [...new Set(raw.split(",").map((s) => s.trim()).filter((s) => s.length > 0))];
}

function main(argv: string[]): number {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (!args.feature || !args.story || !args.ac || !args.notes) {
    process.stderr.write(`Error: --feature, --story, --ac, and --notes are required.\n\n${HELP}`);
    return 2;
  }
  if (args.layer && !LAYERS.includes(args.layer)) {
    process.stderr.write(`Error: --layer must be one of ${LAYERS.join(" / ")}. Got: ${args.layer}\n`);
    return 2;
  }
  const consortDir = args.consortDir ?? resolveConsortDir(process.cwd());
  const file = acJson(consortDir, args.feature, args.story, args.ac);
  if (!fs.existsSync(file)) {
    process.stderr.write(
      `Error: AC file not found: ${file}\n(check --feature / --story / --ac; the Spec Author writes acs/<AC>.json first).\n`,
    );
    return 2;
  }
  let merged: string;
  try {
    merged = mergeAcAnnotation(fs.readFileSync(file, "utf8"), { layer: args.layer, notes: args.notes, uiSeams: parseUiSeams(args.uiSeams), apiContract: args.apiContract });
  } catch (e) {
    process.stderr.write(
      `Error: ${file} is not valid JSON (${e instanceof Error ? e.message : String(e)}). ` +
        `Fix the existing file's syntax first (this tool preserves fields; it won't overwrite a corrupt AC blindly).\n`,
    );
    return 2;
  }
  fs.writeFileSync(file, merged, "utf8");
  process.stderr.write(`annotated ${args.ac}${args.layer ? ` (layer ${args.layer})` : ""} – preserved all prior fields\n`);
  return 0;
}

if (isCliEntry(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
