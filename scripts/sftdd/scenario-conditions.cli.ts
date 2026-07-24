#!/usr/bin/env node
// CLI: read a recorded scenario's run conditions from its scenario.json manifest.
// The capture harness (capture-scenario.sh) uses this to funnel the manifest's
// DECLARED conditions (uiTrack, tiers, language, runner, pauseBefore) into
// create-project as flags , the ONE way in , instead of ignoring the manifest and
// relying on the misnamed `--ui` flag (which wired only e2e, not the UX lane).
//
//   lakebase-sftdd-scenario-conditions --manifest <scenario.json> [--field <name>]
//     --field <name>   print one field (uiTrack|tiers|pauseBefore|language|runner);
//                      booleans as true/false, an absent optional as empty string.
//     (no --field)     print every field as `name=value` lines.
//
// A missing/malformed manifest yields the schema defaults (never errors), so the
// caller can always run. Exit codes: 0 ok; 2 bad args.

import { isCliEntry } from "@databricks-solutions/lakebase-scm-utils/util";
import {
  readScenarioConditions,
  formatScenarioConditionField,
  type ScenarioConditionField,
} from "./scenario-conditions.js";

const FIELDS: ScenarioConditionField[] = ["uiTrack", "tiers", "pauseBefore", "language", "runner"];

interface ParsedArgs {
  manifest?: string;
  field?: ScenarioConditionField;
  help?: boolean;
}

function parseArgs(argv: string[]): ParsedArgs | { error: string } {
  const out: ParsedArgs = {};
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--manifest": out.manifest = argv[++i]; break;
      case "--field": {
        const f = argv[++i];
        if (!FIELDS.includes(f as ScenarioConditionField)) return { error: `--field must be one of: ${FIELDS.join(", ")}` };
        out.field = f as ScenarioConditionField;
        break;
      }
      case "--help": case "-h": out.help = true; break;
      default: return { error: `unknown arg: ${argv[i]}` };
    }
  }
  if (!out.help && !out.manifest) return { error: "--manifest <scenario.json> is required" };
  return out;
}

const HELP = `lakebase-sftdd-scenario-conditions --manifest <scenario.json> [--field <name>]
  --field <name>   uiTrack | tiers | pauseBefore | language | runner
  (no --field)     print every field as name=value lines
`;

export function runScenarioConditionsCli(argv: string[]): number {
  const parsed = parseArgs(argv);
  if ("error" in parsed) {
    process.stderr.write(`Error: ${parsed.error}\n\n${HELP}`);
    return 2;
  }
  if (parsed.help) {
    process.stdout.write(HELP);
    return 0;
  }
  const c = readScenarioConditions(parsed.manifest!);
  if (parsed.field) {
    process.stdout.write(formatScenarioConditionField(c, parsed.field) + "\n");
  } else {
    process.stdout.write(FIELDS.map((f) => `${f}=${formatScenarioConditionField(c, f)}`).join("\n") + "\n");
  }
  return 0;
}

if (isCliEntry(import.meta.url)) {
  process.exit(runScenarioConditionsCli(process.argv.slice(2)));
}
