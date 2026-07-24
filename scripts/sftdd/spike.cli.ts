#!/usr/bin/env node
// lakebase-sftdd-spike: cut / list / delete throwaway spike branches.
//
//   lakebase-sftdd-spike cut --slug <s> --instance <i> [--for <feature>]
//                          [--parent <branch>] [--ttl <t>] [--project-dir <d>] [--json]
//   lakebase-sftdd-spike list [--project-dir <d>] [--json]
//   lakebase-sftdd-spike delete --slug <s> --instance <i> [--keep-branch] [--project-dir <d>]
//
// A spike is throwaway exploration OUTSIDE the TDD loop: it gets its own paired
// Lakebase branch (spike/<slug> by convention), and its notes.md carries the
// learning forward into a feature's design-spec gate (via `--for <feature>`,
// which tags the notes). Code is never promoted from a spike, only notes.
//
// Exit codes: 0 ok, 2 bad args, 7 substrate failure.

import * as path from "node:path";
import { resolveSftddDir } from "./sftdd-paths.js";

import { isCliEntry } from "@databricks-solutions/lakebase-scm-utils/util";
import { cutSpike, listSpikes, deleteSpike, spikeNotes } from "./spike.js";

interface ParsedArgs {
  slug?: string;
  forFeature?: string;
  parent?: string;
  ttl?: string;
  instance?: string;
  host?: string;
  projectDir?: string;
  sftddDir?: string;
  keepBranch?: boolean;
  json?: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {};
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--slug": out.slug = argv[++i]; break;
      case "--for": out.forFeature = argv[++i]; break;
      case "--parent": out.parent = argv[++i]; break;
      case "--ttl": out.ttl = argv[++i]; break;
      case "--instance": out.instance = argv[++i]; break;
      case "--host": out.host = argv[++i]; break;
      case "--project-dir": out.projectDir = argv[++i]; break;
      case "--tdd-dir": out.sftddDir = argv[++i]; break;
      case "--keep-branch": out.keepBranch = true; break;
      case "--json": out.json = true; break;
    }
  }
  return out;
}

const HELP = `lakebase-sftdd-spike (throwaway spike branches)

Usage:
  lakebase-sftdd-spike cut --slug <s> --instance <i> [--for <feature>] [--parent <b>] [--ttl <t>] [--project-dir <d>] [--json]
  lakebase-sftdd-spike list [--project-dir <d>] [--json]
  lakebase-sftdd-spike delete --slug <s> --instance <i> [--keep-branch] [--project-dir <d>]

A spike is throwaway exploration outside the TDD loop. --for <feature> tags the
notes so the learning carries forward into that feature's design-spec gate.
`;

function tddDirFor(args: ParsedArgs): string {
  return args.sftddDir ?? resolveSftddDir(args.projectDir ?? ".");
}

export async function runSpikeCli(argv: string[]): Promise<number> {
  const sub = argv[0];
  if (!sub || sub === "-h" || sub === "--help") {
    process.stdout.write(HELP);
    return sub ? 0 : 2;
  }
  const args = parseArgs(argv.slice(1));
  const sftddDir = tddDirFor(args);

  try {
    if (sub === "cut") {
      if (!args.slug || !args.instance) {
        process.stderr.write("Error: cut requires --slug and --instance.\n");
        return 2;
      }
      const rec = await cutSpike({
        sftddDir,
        projectDir: args.projectDir ?? process.cwd(),
        spikeSlug: args.slug,
        branch: `spike/${args.slug}`,
        parentBranch: args.parent,
        ttl: args.ttl,
        notes: spikeNotes(args.slug, args.forFeature),
        instance: args.instance,
        host: args.host,
      });
      process.stdout.write(
        args.json
          ? `${JSON.stringify(rec)}\n`
          : `lakebase-sftdd-spike: cut ${rec.spike_slug} (branch ${rec.branch_id})${args.forFeature ? ` for ${args.forFeature}` : ""}\n`,
      );
      return 0;
    }

    if (sub === "list") {
      const spikes = listSpikes(sftddDir);
      process.stdout.write(
        args.json
          ? `${JSON.stringify(spikes)}\n`
          : (spikes.length
              ? spikes.map((s) => `${s.spike_slug}\t${s.branch_id}`).join("\n") + "\n"
              : "(no spikes)\n"),
      );
      return 0;
    }

    if (sub === "delete") {
      if (!args.slug || (!args.keepBranch && !args.instance)) {
        process.stderr.write("Error: delete requires --slug (and --instance unless --keep-branch).\n");
        return 2;
      }
      await deleteSpike({
        sftddDir,
        projectDir: args.projectDir ?? process.cwd(),
        spikeSlug: args.slug,
        deleteBranchToo: !args.keepBranch,
        instance: args.instance ?? "",
        host: args.host,
      });
      process.stdout.write(`lakebase-sftdd-spike: deleted ${args.slug}${args.keepBranch ? " (branch kept)" : ""}\n`);
      return 0;
    }

    process.stderr.write(`Error: unknown subcommand "${sub}".\n\n${HELP}`);
    return 2;
  } catch (e) {
    process.stderr.write(`lakebase-sftdd-spike: ${e instanceof Error ? e.message : String(e)}\n`);
    return 7;
  }
}

if (isCliEntry(import.meta.url)) {
  runSpikeCli(process.argv.slice(2)).then((code) => process.exit(code));
}
