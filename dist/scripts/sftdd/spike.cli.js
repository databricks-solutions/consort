#!/usr/bin/env node

// scripts/sftdd/sftdd-paths.ts
import * as fs from "fs";
import { join } from "path";
var ARTIFACT_ROOT = ".sftdd";
var LEGACY_ARTIFACT_ROOT = ".tdd";
function resolveSftddDir(projectDir = process.cwd()) {
  const next = join(projectDir, ARTIFACT_ROOT);
  if (fs.existsSync(next)) return next;
  const legacy = join(projectDir, LEGACY_ARTIFACT_ROOT);
  if (fs.existsSync(legacy)) return legacy;
  return next;
}

// scripts/sftdd/spike.cli.ts
import { isCliEntry } from "@databricks-solutions/lakebase-scm-utils/util";

// scripts/sftdd/spike.ts
import { existsSync as existsSync2, mkdirSync as mkdirSync2, readdirSync as readdirSync2, readFileSync as readFileSync2, statSync as statSync2, writeFileSync as writeFileSync2 } from "fs";
import { join as join2 } from "path";
import { createPairedBranch, deletePairedBranch } from "@databricks-solutions/lakebase-scm-utils/lakebase";
function branchIdOf(info) {
  const leaf = info.name.split("/").pop();
  if (!leaf) throw new Error(`could not derive branch_id from ${info.name}`);
  return leaf;
}
function spikeNotes(spikeSlug, forFeature) {
  const frontmatter = forFeature ? `---
for_feature: ${forFeature}
---
` : "";
  const intro = forFeature ? `Throwaway spike for ${forFeature}.` : `Throwaway spike.`;
  return `${frontmatter}# ${spikeSlug}

${intro} Code is **not** promoted as-is. Capture the learning here before deleting the branch.
`;
}
async function cutSpike(args) {
  const { sftddDir, projectDir, spikeSlug, branch, parentBranch, ttl, notes, ...lookup } = args;
  const paired = await createPairedBranch({
    instance: lookup.instance,
    branch,
    parentBranch,
    cwd: projectDir,
    createGitBranch: true,
    syncEnv: true,
    ...ttl ? { ttl } : { noExpiry: true }
  });
  const branchId = branchIdOf(paired.branch);
  const dir = join2(sftddDir, "spikes", spikeSlug);
  mkdirSync2(dir, { recursive: true });
  writeFileSync2(join2(dir, "branch.txt"), branchId);
  writeFileSync2(
    join2(dir, "notes.md"),
    notes ?? `# ${spikeSlug}

Throwaway spike. Code is **not** promoted as-is. Capture learning before deleting the branch.
`
  );
  return {
    spike_slug: spikeSlug,
    branch_id: branchId,
    created_at: (/* @__PURE__ */ new Date()).toISOString(),
    dir
  };
}
function listSpikes(sftddDir) {
  const root = join2(sftddDir, "spikes");
  if (!existsSync2(root)) return [];
  const out = [];
  for (const slug of readdirSync2(root)) {
    const dir = join2(root, slug);
    if (!statSync2(dir).isDirectory()) continue;
    const branchFile = join2(dir, "branch.txt");
    if (!existsSync2(branchFile)) continue;
    out.push({
      spike_slug: slug,
      branch_id: readFileSync2(branchFile, "utf8").trim(),
      created_at: statSync2(branchFile).birthtime.toISOString(),
      dir
    });
  }
  return out;
}
async function deleteSpike(args) {
  const { sftddDir, projectDir, spikeSlug, deleteBranchToo = true, ...lookup } = args;
  const dir = join2(sftddDir, "spikes", spikeSlug);
  if (!existsSync2(dir)) throw new Error(`spike ${spikeSlug} not found at ${dir}`);
  if (deleteBranchToo) {
    const branchId = readFileSync2(join2(dir, "branch.txt"), "utf8").trim();
    await deletePairedBranch({ instance: lookup.instance, branch: branchId, cwd: projectDir });
  }
}

// scripts/sftdd/spike.cli.ts
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--slug":
        out.slug = argv[++i];
        break;
      case "--for":
        out.forFeature = argv[++i];
        break;
      case "--parent":
        out.parent = argv[++i];
        break;
      case "--ttl":
        out.ttl = argv[++i];
        break;
      case "--instance":
        out.instance = argv[++i];
        break;
      case "--host":
        out.host = argv[++i];
        break;
      case "--project-dir":
        out.projectDir = argv[++i];
        break;
      case "--tdd-dir":
        out.sftddDir = argv[++i];
        break;
      case "--keep-branch":
        out.keepBranch = true;
        break;
      case "--json":
        out.json = true;
        break;
    }
  }
  return out;
}
var HELP = `lakebase-sftdd-spike (throwaway spike branches)

Usage:
  lakebase-sftdd-spike cut --slug <s> --instance <i> [--for <feature>] [--parent <b>] [--ttl <t>] [--project-dir <d>] [--json]
  lakebase-sftdd-spike list [--project-dir <d>] [--json]
  lakebase-sftdd-spike delete --slug <s> --instance <i> [--keep-branch] [--project-dir <d>]

A spike is throwaway exploration outside the TDD loop. --for <feature> tags the
notes so the learning carries forward into that feature's design-spec gate.
`;
function tddDirFor(args) {
  return args.sftddDir ?? resolveSftddDir(args.projectDir ?? ".");
}
async function runSpikeCli(argv) {
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
        host: args.host
      });
      process.stdout.write(
        args.json ? `${JSON.stringify(rec)}
` : `lakebase-sftdd-spike: cut ${rec.spike_slug} (branch ${rec.branch_id})${args.forFeature ? ` for ${args.forFeature}` : ""}
`
      );
      return 0;
    }
    if (sub === "list") {
      const spikes = listSpikes(sftddDir);
      process.stdout.write(
        args.json ? `${JSON.stringify(spikes)}
` : spikes.length ? spikes.map((s) => `${s.spike_slug}	${s.branch_id}`).join("\n") + "\n" : "(no spikes)\n"
      );
      return 0;
    }
    if (sub === "delete") {
      if (!args.slug || !args.keepBranch && !args.instance) {
        process.stderr.write("Error: delete requires --slug (and --instance unless --keep-branch).\n");
        return 2;
      }
      await deleteSpike({
        sftddDir,
        projectDir: args.projectDir ?? process.cwd(),
        spikeSlug: args.slug,
        deleteBranchToo: !args.keepBranch,
        instance: args.instance ?? "",
        host: args.host
      });
      process.stdout.write(`lakebase-sftdd-spike: deleted ${args.slug}${args.keepBranch ? " (branch kept)" : ""}
`);
      return 0;
    }
    process.stderr.write(`Error: unknown subcommand "${sub}".

${HELP}`);
    return 2;
  } catch (e) {
    process.stderr.write(`lakebase-sftdd-spike: ${e instanceof Error ? e.message : String(e)}
`);
    return 7;
  }
}
if (isCliEntry(import.meta.url)) {
  runSpikeCli(process.argv.slice(2)).then((code) => process.exit(code));
}
export {
  runSpikeCli
};
//# sourceMappingURL=spike.cli.js.map