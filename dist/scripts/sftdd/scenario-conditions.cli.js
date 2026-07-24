#!/usr/bin/env node

// scripts/sftdd/scenario-conditions.cli.ts
import { isCliEntry } from "@databricks-solutions/lakebase-scm-utils/util";

// scripts/sftdd/scenario-conditions.ts
import { existsSync, readFileSync } from "fs";
var SCENARIO_CONDITION_DEFAULTS = {
  uiTrack: false,
  tiers: 2,
  pauseBefore: "release-engineer"
};
function readScenarioConditions(manifestPath) {
  if (!existsSync(manifestPath)) return { ...SCENARIO_CONDITION_DEFAULTS };
  let raw;
  try {
    raw = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    return { ...SCENARIO_CONDITION_DEFAULTS };
  }
  const m = raw && typeof raw === "object" ? raw : {};
  return {
    uiTrack: m.uiTrack === true,
    tiers: typeof m.tiers === "number" ? m.tiers : SCENARIO_CONDITION_DEFAULTS.tiers,
    pauseBefore: typeof m.pauseBefore === "string" ? m.pauseBefore : SCENARIO_CONDITION_DEFAULTS.pauseBefore,
    language: typeof m.language === "string" ? m.language : void 0,
    runner: typeof m.runner === "string" ? m.runner : void 0
  };
}
function formatScenarioConditionField(c, field) {
  const v = c[field];
  if (v === void 0) return "";
  return typeof v === "boolean" ? v ? "true" : "false" : String(v);
}

// scripts/sftdd/scenario-conditions.cli.ts
var FIELDS = ["uiTrack", "tiers", "pauseBefore", "language", "runner"];
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--manifest":
        out.manifest = argv[++i];
        break;
      case "--field": {
        const f = argv[++i];
        if (!FIELDS.includes(f)) return { error: `--field must be one of: ${FIELDS.join(", ")}` };
        out.field = f;
        break;
      }
      case "--help":
      case "-h":
        out.help = true;
        break;
      default:
        return { error: `unknown arg: ${argv[i]}` };
    }
  }
  if (!out.help && !out.manifest) return { error: "--manifest <scenario.json> is required" };
  return out;
}
var HELP = `lakebase-sftdd-scenario-conditions --manifest <scenario.json> [--field <name>]
  --field <name>   uiTrack | tiers | pauseBefore | language | runner
  (no --field)     print every field as name=value lines
`;
function runScenarioConditionsCli(argv) {
  const parsed = parseArgs(argv);
  if ("error" in parsed) {
    process.stderr.write(`Error: ${parsed.error}

${HELP}`);
    return 2;
  }
  if (parsed.help) {
    process.stdout.write(HELP);
    return 0;
  }
  const c = readScenarioConditions(parsed.manifest);
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
export {
  runScenarioConditionsCli
};
//# sourceMappingURL=scenario-conditions.cli.js.map