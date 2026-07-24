#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// scripts/sftdd/spike.cli.ts
var spike_cli_exports = {};
__export(spike_cli_exports, {
  runSpikeCli: () => runSpikeCli
});
module.exports = __toCommonJS(spike_cli_exports);

// node_modules/tsup/assets/cjs_shims.js
var getImportMetaUrl = () => typeof document === "undefined" ? new URL(`file:${__filename}`).href : document.currentScript && document.currentScript.tagName.toUpperCase() === "SCRIPT" ? document.currentScript.src : new URL("main.js", document.baseURI).href;
var importMetaUrl = /* @__PURE__ */ getImportMetaUrl();

// scripts/sftdd/sftdd-paths.ts
var fs = __toESM(require("fs"), 1);
var import_node_path = require("path");
var ARTIFACT_ROOT = ".sftdd";
var LEGACY_ARTIFACT_ROOT = ".tdd";
function resolveSftddDir(projectDir = process.cwd()) {
  const next = (0, import_node_path.join)(projectDir, ARTIFACT_ROOT);
  if (fs.existsSync(next)) return next;
  const legacy = (0, import_node_path.join)(projectDir, LEGACY_ARTIFACT_ROOT);
  if (fs.existsSync(legacy)) return legacy;
  return next;
}

// scripts/sftdd/spike.cli.ts
var import_util = require("@databricks-solutions/lakebase-scm-utils/util");

// scripts/sftdd/spike.ts
var import_fs = require("fs");
var import_path = require("path");
var import_lakebase = require("@databricks-solutions/lakebase-scm-utils/lakebase");
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
  const paired = await (0, import_lakebase.createPairedBranch)({
    instance: lookup.instance,
    branch,
    parentBranch,
    cwd: projectDir,
    createGitBranch: true,
    syncEnv: true,
    ...ttl ? { ttl } : { noExpiry: true }
  });
  const branchId = branchIdOf(paired.branch);
  const dir = (0, import_path.join)(sftddDir, "spikes", spikeSlug);
  (0, import_fs.mkdirSync)(dir, { recursive: true });
  (0, import_fs.writeFileSync)((0, import_path.join)(dir, "branch.txt"), branchId);
  (0, import_fs.writeFileSync)(
    (0, import_path.join)(dir, "notes.md"),
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
  const root = (0, import_path.join)(sftddDir, "spikes");
  if (!(0, import_fs.existsSync)(root)) return [];
  const out = [];
  for (const slug of (0, import_fs.readdirSync)(root)) {
    const dir = (0, import_path.join)(root, slug);
    if (!(0, import_fs.statSync)(dir).isDirectory()) continue;
    const branchFile = (0, import_path.join)(dir, "branch.txt");
    if (!(0, import_fs.existsSync)(branchFile)) continue;
    out.push({
      spike_slug: slug,
      branch_id: (0, import_fs.readFileSync)(branchFile, "utf8").trim(),
      created_at: (0, import_fs.statSync)(branchFile).birthtime.toISOString(),
      dir
    });
  }
  return out;
}
async function deleteSpike(args) {
  const { sftddDir, projectDir, spikeSlug, deleteBranchToo = true, ...lookup } = args;
  const dir = (0, import_path.join)(sftddDir, "spikes", spikeSlug);
  if (!(0, import_fs.existsSync)(dir)) throw new Error(`spike ${spikeSlug} not found at ${dir}`);
  if (deleteBranchToo) {
    const branchId = (0, import_fs.readFileSync)((0, import_path.join)(dir, "branch.txt"), "utf8").trim();
    await (0, import_lakebase.deletePairedBranch)({ instance: lookup.instance, branch: branchId, cwd: projectDir });
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
if ((0, import_util.isCliEntry)(importMetaUrl)) {
  runSpikeCli(process.argv.slice(2)).then((code) => process.exit(code));
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  runSpikeCli
});
//# sourceMappingURL=spike.cli.cjs.map