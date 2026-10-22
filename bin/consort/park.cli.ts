#!/usr/bin/env node
// consort-park: shelve the currently-claimed feature (built but not yet deployed) and SWITCH the
// dashboard to another feature, so you can go drive the other one while keeping the first on its branch.
//
//   consort-park --to <feature> [--project-dir <p>] [--force]
//
// It (1) frees the SCM claim while KEEPING the paired Lakebase + git branch (lakebase-scm-park-feature,
// run through the project's scripts/lk shim so the project's pinned scm-utils version does the work),
// and (2) re-points `.consort/next.json` at <feature> so the dashboard immediately shows the feature
// you're switching to instead of the parked one (the staleness the adopt-based workaround left behind).
//
// Resume the parked feature later with `lakebase-scm-claim-feature-branch <parked>` + a normal drive:
// the claim re-attaches to the kept branch and the drive resumes where it stopped.

import * as path from "node:path";
import { resolveConsortDir } from "../../consort/config/consort-paths.js";
import { emitNextJson } from "../../consort/orchestrator/status/next.js";
import { spawnCmd } from "../../consort/orchestrator/drive/claude-runner.js";
import { parkAndSwitch, ParkSwitchError } from "../../consort/orchestrator/status/park-switch.js";
import { readWorkflowState } from "@databricks-solutions/lakebase-scm-utils/lakebase";
import { isCliEntry } from "@databricks-solutions/lakebase-scm-utils/util";

interface Args {
  toFeature?: string;
  projectDir: string;
  consortDir?: string;
  force?: boolean;
  json?: boolean;
  help?: boolean;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { projectDir: process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--to":
      case "--feature":
        out.toFeature = argv[++i];
        break;
      case "--project-dir":
        out.projectDir = argv[++i];
        break;
      case "--tdd-dir":
      case "--consort-dir":
        out.consortDir = argv[++i];
        break;
      case "--force":
        out.force = true;
        break;
      case "--json":
        out.json = true;
        break;
      case "-h":
      case "--help":
        out.help = true;
        break;
      default:
        // tolerate a bare positional target: `consort-park <feature>`
        if (!argv[i].startsWith("-") && !out.toFeature) out.toFeature = argv[i];
    }
  }
  return out;
}

const HELP = `consort-park — shelve the claimed feature (keep its branch) and switch the dashboard to another.

  consort-park --to <feature> [--project-dir <p>] [--force]

Frees the SCM claim but KEEPS the paired Lakebase + git branch, then re-points .consort/next.json at
<feature> so the dashboard follows the switch. Resume the parked feature later with
'lakebase-scm-claim-feature-branch <parked>' and a normal drive (it reuses the kept branch).

Flags:
  --to <feature>     Feature to switch the dashboard to (required; bare positional also accepted)
  --project-dir <p>  Project root (default: cwd)
  --consort-dir <d>  Override the resolved .consort dir
  --force            Park even with a dirty working tree (edits stay on the parked branch)
  --json             Machine-readable output
  -h, --help         Show this help
`;

export async function runConsortParkCli(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (!args.toFeature) {
    process.stderr.write("consort-park: --to <feature> is required (the feature to switch to).\n");
    return 2;
  }
  const projectDir = path.resolve(args.projectDir);
  const consortDir = args.consortDir ?? resolveConsortDir(projectDir);
  const lkShim = path.join(projectDir, "scripts", "lk");

  try {
    const result = await parkAndSwitch(
      { consortDir, toFeature: args.toFeature },
      {
        readClaimedFeature: () => readWorkflowState(projectDir)?.feature_id ?? null,
        parkClaim: () =>
          spawnCmd(
            lkShim,
            ["lakebase-scm-park-feature", "--project-dir", projectDir, "--json", ...(args.force ? ["--force"] : [])],
            projectDir,
          ),
        repointNext: (canonical) => emitNextJson(consortDir, canonical, projectDir),
      },
    );
    if (args.json) {
      process.stdout.write(`${JSON.stringify({ ok: true, ...result }, null, 2)}\n`);
    } else {
      process.stdout.write(
        `Parked ${result.parkedFeatureId ?? "(no claim)"} (branch kept) and switched the dashboard to ${result.switchedToFeatureId}.\n` +
          `Resume it later with: lakebase-scm-claim-feature-branch ${result.parkedFeatureId ?? "<feature>"}\n`,
      );
    }
    return 0;
  } catch (e) {
    const err = e as Error;
    const code = err instanceof ParkSwitchError ? err.code : "error";
    process.stderr.write(`consort-park: ${code}\n\n  ${err.message}\n`);
    return err instanceof ParkSwitchError && err.code === "unknown-target-feature" ? 2 : 3;
  }
}

if (isCliEntry(import.meta.url)) {
  void runConsortParkCli(process.argv.slice(2)).then((c) => process.exit(c));
}
