#!/usr/bin/env node
// lakebase-sftdd-next: the authoritative, strictly READ-ONLY "what next" surface
// (FEIP-8017). It reads the workflow state from disk and prints the decision menu
// (JSON or human) built by next.ts. It NEVER spawns a model, NEVER writes a
// workflow artifact, and NEVER performs an action; enacting a chosen option is
// the caller's job (each option carries its exact command).

import { resolveSftddDir } from "./sftdd-paths.js";
import { resolveSftddSettings } from "./sftdd-config.js";
import { readDriveStateFromDisk } from "./orchestrator-effects.js";
import { readWorkflowState } from "@databricks-solutions/lakebase-scm-utils/lakebase";
import { deriveSprintPlanningState } from "./orchestrator-sprint.js";
import { summarizeStories } from "./feature-status.js";
import { kitVersion } from "./kit-bin.js";
import { buildNextSnapshot, renderNextSnapshot, type NextContext } from "./next.js";

interface ParsedArgs {
  feature?: string;
  sprint?: string;
  sftddDir?: string;
  projectDir?: string;
  approver?: string;
  noSizing?: boolean;
  json?: boolean;
  help?: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--feature": out.feature = argv[++i]; break;
      case "--sprint": out.sprint = argv[++i]; break;
      case "--tdd":
      case "--sftdd-dir": out.sftddDir = argv[++i]; break;
      case "--project-dir": out.projectDir = argv[++i]; break;
      case "--approver": out.approver = argv[++i]; break;
      case "--no-sizing": out.noSizing = true; break;
      case "--json": out.json = true; break;
      case "--help":
      case "-h": out.help = true; break;
      default:
        // Bare token: treat as the feature id (parity with feature-status).
        if (!a.startsWith("--") && !out.feature && !out.sprint) out.feature = a;
        break;
    }
  }
  return out;
}

const HELP = `lakebase-sftdd-next – the authoritative, read-only "what do I do next?" surface

Answers, from the SAME engine the drive uses: where am I, what are my valid next
options, how do I enact each, and how do I frame the decision for the human. It is
strictly read-only (no model, no writes, no actions). The drive also auto-emits
this snapshot to .sftdd/next.json on every stop.

Usage:
  lakebase-sftdd-next --feature <F> [--json]
  lakebase-sftdd-next --sprint <S> [--json]

Flags:
  --feature <F>    Feature/story scope (or pass the id as a bare argument)
  --sprint <S>     Sprint scope (planning)
  --json           Print the snapshot as JSON (the machine contract) instead of text
  --approver <n>   Fill this approver into the enact commands (default: <you> placeholder)
  --project-dir <d>  Project root (default: cwd)
  --sftdd-dir <d>  Artifact root (default: ./.sftdd, honors a legacy ./.tdd)
  --no-sizing      Sprint scope: the plan skips the architect sizing step
  --help, -h       Show this help

Examples:
  lakebase-sftdd-next --feature F1-checkout
  lakebase-sftdd-next --feature F1-checkout --json | jq '.options[].enact'
  lakebase-sftdd-next --sprint stockflow-s1 --json
`;

function main(): number {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (!args.feature && !args.sprint) {
    process.stderr.write(`Error: one of --feature <F> or --sprint <S> is required.\n\n${HELP}`);
    return 2;
  }
  if (args.feature && args.sprint) {
    process.stderr.write(`Error: pass only one of --feature or --sprint.\n`);
    return 2;
  }
  const projectDir = args.projectDir ?? process.cwd();
  const sftddDir = args.sftddDir ?? resolveSftddDir(projectDir);
  const ctx: NextContext = {
    ...(args.feature ? { featureId: args.feature } : {}),
    ...(args.sprint ? { sprint: args.sprint } : {}),
    ...(args.approver ? { approver: args.approver } : {}),
    version: kitVersion(),
  };

  const snapshot = args.sprint
    ? buildNextSnapshot("sprint", deriveSprintPlanningState(sftddDir, args.sprint, { skipSizing: !!args.noSizing }), ctx)
    : buildNextSnapshot(
        "feature",
        readDriveStateFromDisk(sftddDir, args.feature!, projectDir, {
          uiTrack: resolveSftddSettings({ projectDir }).project.uiTrack,
        }),
        {
          ...ctx,
          stories: summarizeStories(sftddDir, args.feature!),
          // The promote gate's required --promote-ref is the feature's canonical
          // branch, recorded in the SCM workflow state at claim (FEIP-8019).
          ...(readWorkflowState(projectDir)?.branch ? { featureBranch: readWorkflowState(projectDir)!.branch } : {}),
        },
      );

  if (args.json) process.stdout.write(JSON.stringify(snapshot, null, 2) + "\n");
  else process.stdout.write(renderNextSnapshot(snapshot) + "\n");
  return 0;
}

try {
  process.exit(main());
} catch (err) {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}
