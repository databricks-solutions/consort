#!/usr/bin/env node
// CLI: /design intake precondition check.
//
//   lakebase-sftdd-intake                         # require product-overview.md + nfrs.md
//   lakebase-sftdd-intake --feature F1-x          # + that feature's feature-request.md
//   lakebase-sftdd-intake --json --pretty
//
// design-brief.md is additionally required for UI projects. Whether the project
// is UI is read from the SINGLE source (project.uiTrack in sftdd-config.json, set
// at create via --ui-track), NOT a flag or env, so a UI project can never skip the
// UX intake.
//
// /design calls this BEFORE phase 1 and refuses to proceed when it fails, so
// the HIL intake (product-overview.md / nfrs.md / ...) can never be skipped.
// Exit codes: 0 satisfied, 2 bad args, 5 precondition unmet (missing or
// non-conformant intake artifact).

import { isCliEntry } from "@databricks-solutions/lakebase-scm-utils/util";
import { checkIntakePreconditions } from "./intake.js";

export function runIntakeCli(argv: string[]): number {
  let featureId: string | undefined;
  let sftddDir: string | undefined;
  let projectDir: string | undefined;
  let json = false;
  let pretty = false;
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--feature": featureId = argv[++i]; break;
      case "--tdd-dir": sftddDir = argv[++i]; break;
      case "--project-dir": projectDir = argv[++i]; break;
      case "--json": json = true; break;
      case "--pretty": pretty = true; break;
      case "-h":
      case "--help":
        process.stdout.write(
          "lakebase-sftdd-intake [--feature <id>] [--tdd-dir <path>] [--project-dir <path>] [--json] [--pretty]\n" +
            "Verifies the HIL intake artifacts /design requires before phase 1.\n" +
            "design-brief.md is required for UI projects (read from project.uiTrack in sftdd-config.json).\n",
        );
        return 0;
    }
  }

  const result = checkIntakePreconditions({ sftddDir, featureId, projectDir });
  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, pretty ? 2 : 0)}\n`);
  } else if (result.ok) {
    process.stdout.write(`lakebase-sftdd-intake: intake satisfied (${result.statuses.length} artifact(s) present + conformant)\n`);
  } else {
    if (result.missing.length > 0) {
      process.stderr.write(`lakebase-sftdd-intake: MISSING intake artifact(s): ${result.missing.join(", ")}\n`);
    }
    for (const s of result.statuses.filter((s) => s.present && !s.conformant)) {
      process.stderr.write(`lakebase-sftdd-intake: non-conformant ${s.artifact}: ${s.violations.join("; ")}\n`);
    }
    process.stderr.write("lakebase-sftdd-intake: /design cannot proceed; the orchestrator must facilitate intake (interview the human, or Human Proxy supply in headless) first.\n");
  }
  return result.ok ? 0 : 5;
}

if (isCliEntry(import.meta.url)) {
  process.exit(runIntakeCli(process.argv.slice(2)));
}
