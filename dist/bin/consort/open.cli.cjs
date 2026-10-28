#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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

// bin/consort/open.cli.ts
var fs4 = __toESM(require("fs"), 1);
var path2 = __toESM(require("path"), 1);

// consort/config/consort-paths.ts
var fs = __toESM(require("fs"), 1);
var import_node_path = require("path");
var ARTIFACT_ROOT = ".consort";
var LEGACY_ARTIFACT_ROOTS = [".sftdd", ".tdd"];
var ALL_ARTIFACT_ROOTS = [ARTIFACT_ROOT, ...LEGACY_ARTIFACT_ROOTS];
function resolveConsortDir(projectDir = process.cwd()) {
  const next = (0, import_node_path.join)(projectDir, ARTIFACT_ROOT);
  if (fs.existsSync(next)) return next;
  for (const legacyName of LEGACY_ARTIFACT_ROOTS) {
    const legacy = (0, import_node_path.join)(projectDir, legacyName);
    if (fs.existsSync(legacy)) return legacy;
  }
  return next;
}
var featuresDir = (tdd) => (0, import_node_path.join)(tdd, "features");
var planningDir = (tdd) => (0, import_node_path.join)(tdd, "planning");
var productOverviewMd = (tdd) => (0, import_node_path.join)(tdd, "product-overview.md");
var nfrsMd = (tdd) => (0, import_node_path.join)(tdd, "nfrs.md");
var designDir = (tdd) => (0, import_node_path.join)(tdd, "design");
var designBriefMd = (tdd) => (0, import_node_path.join)(designDir(tdd), "design-brief.md");
var designGuideJson = (tdd) => (0, import_node_path.join)(designDir(tdd), "design-guide.json");
var featureProposalsMd = (tdd) => (0, import_node_path.join)(planningDir(tdd), "feature-proposals.md");
var featureDir = (tdd, featureId) => (0, import_node_path.join)(featuresDir(tdd), featureId);
var featureResolved = (tdd, f) => findFeatureDir(tdd, f) ?? featureDir(tdd, f);
var featureSpecJson = (tdd, f) => (0, import_node_path.join)(featureResolved(tdd, f), "feature-spec.json");
var featureSpecMd = (tdd, f) => (0, import_node_path.join)(featureResolved(tdd, f), "feature-spec.md");
var featureRequestMd = (tdd, f) => (0, import_node_path.join)(featureResolved(tdd, f), "feature-request.md");
var architectureJson = (tdd, f) => (0, import_node_path.join)(featureResolved(tdd, f), "architecture.json");
var architectureMd = (tdd, f) => (0, import_node_path.join)(featureResolved(tdd, f), "architecture.md");
var dbDesignJson = (tdd, f) => (0, import_node_path.join)(featureResolved(tdd, f), "db-design.json");
var dbDesignMd = (tdd, f) => (0, import_node_path.join)(featureResolved(tdd, f), "db-design.md");
var featureTestListJson = (tdd, f) => (0, import_node_path.join)(featureResolved(tdd, f), "test-list.json");
var featureTestListMd = (tdd, f) => (0, import_node_path.join)(featureResolved(tdd, f), "test-list.md");
var storiesDir = (tdd, f) => (0, import_node_path.join)(featureResolved(tdd, f), "stories");
var storyDir = (tdd, f, s) => (0, import_node_path.join)(storiesDir(tdd, f), s);
function findStoryDir(tdd, f, s) {
  const root = storiesDir(tdd, f);
  if (!fs.existsSync(root)) return void 0;
  const exact = (0, import_node_path.join)(root, s);
  if (fs.existsSync(exact)) return exact;
  const matches = fs.readdirSync(root).filter((d) => d === s || d.startsWith(`${s}-`));
  return matches.length === 1 ? (0, import_node_path.join)(root, matches[0]) : void 0;
}
var storyResolved = (tdd, f, s) => findStoryDir(tdd, f, s) ?? storyDir(tdd, f, s);
var storyJson = (tdd, f, s) => (0, import_node_path.join)(storyResolved(tdd, f, s), "story.json");
var acsDir = (tdd, f, s) => (0, import_node_path.join)(storyResolved(tdd, f, s), "acs");
var storyTestListJson = (tdd, f, s) => (0, import_node_path.join)(storyResolved(tdd, f, s), "test-list-per-story.json");
function findFeatureDir(tdd, featureId) {
  const root = featuresDir(tdd);
  if (!fs.existsSync(root)) return void 0;
  const exact = (0, import_node_path.join)(root, featureId);
  if (fs.existsSync(exact)) return exact;
  const matches = fs.readdirSync(root).filter((d) => d === featureId || d.startsWith(`${featureId}-`));
  return matches.length === 1 ? (0, import_node_path.join)(root, matches[0]) : void 0;
}

// consort/orchestrator/open/open-in-editor.ts
var fs3 = __toESM(require("fs"), 1);
var path = __toESM(require("path"), 1);
var import_node_child_process = require("child_process");

// consort/orchestrator/open/resolve-review-artifacts.ts
var fs2 = __toESM(require("fs"), 1);
var import_node_path2 = require("path");
function reviewArtifacts(consortDir, opts = {}) {
  const out = [];
  const add = (p) => {
    if (fs2.existsSync(p) && !out.includes(p)) out.push(p);
  };
  add(productOverviewMd(consortDir));
  add(nfrsMd(consortDir));
  add(featureProposalsMd(consortDir));
  add((0, import_node_path2.join)(consortDir, "planning", "estimates.json"));
  add(designBriefMd(consortDir));
  add((0, import_node_path2.join)(consortDir, "design", "design-guide.md"));
  add(designGuideJson(consortDir));
  add((0, import_node_path2.join)(consortDir, "design", "ia.md"));
  const { feature: f, story: s } = opts;
  if (f) {
    add(featureRequestMd(consortDir, f));
    add(featureSpecMd(consortDir, f));
    add(featureSpecJson(consortDir, f));
    add(architectureMd(consortDir, f));
    add(architectureJson(consortDir, f));
    add(dbDesignMd(consortDir, f));
    add(dbDesignJson(consortDir, f));
    add(featureTestListMd(consortDir, f));
    add(featureTestListJson(consortDir, f));
    if (s) {
      add((0, import_node_path2.join)(storyDir(consortDir, f, s), "story.md"));
      add(storyJson(consortDir, f, s));
      add(storyTestListJson(consortDir, f, s));
      try {
        for (const a of fs2.readdirSync(acsDir(consortDir, f, s)).filter((n) => n.endsWith(".json")).sort()) {
          add((0, import_node_path2.join)(acsDir(consortDir, f, s), a));
        }
      } catch {
      }
    }
  }
  return out;
}

// consort/orchestrator/open/open-in-editor.ts
var CURSOR_BUNDLES = [
  "/Applications/Cursor.app/Contents/Resources/app/bin/cursor",
  `${process.env.HOME}/Applications/Cursor.app/Contents/Resources/app/bin/cursor`
];
var CODE_BUNDLES = [
  "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code",
  `${process.env.HOME}/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code`
];
function hostEditor(env = process.env) {
  if (env.CURSOR_TRACE_ID) return "cursor";
  if (env.VSCODE_PID || env.VSCODE_GIT_IPC_HANDLE || env.TERM_PROGRAM === "vscode") return "code";
  return null;
}
function findEditorCmd(env = process.env) {
  const host = hostEditor(env);
  const names = host === "code" ? ["code", "cursor"] : ["cursor", "code"];
  const bundles = host === "code" ? [...CODE_BUNDLES, ...CURSOR_BUNDLES] : [...CURSOR_BUNDLES, ...CODE_BUNDLES];
  const pathDirs = (env.PATH ?? "").split(path.delimiter).filter(Boolean);
  for (const name of names) {
    for (const dir of pathDirs) {
      const p = path.join(dir, name);
      try {
        if (fs3.existsSync(p) && fs3.statSync(p).isFile()) return name;
      } catch {
      }
    }
  }
  for (const p of bundles) {
    try {
      if (fs3.existsSync(p)) return p;
    } catch {
    }
  }
  return null;
}
function hasEditorAncestor(startPpid = process.ppid) {
  try {
    let pid = startPpid;
    for (let i = 0; i < 24 && pid > 1; i++) {
      const r = (0, import_node_child_process.spawnSync)("ps", ["-o", "ppid=,comm=", "-p", String(pid)], { encoding: "utf8" });
      const line = (r.stdout ?? "").trim();
      const m = line.match(/^\s*(\d+)\s+(.*)$/);
      if (!m) break;
      if (/cursor|visual studio code|code helper|electron/i.test(m[2])) return true;
      pid = parseInt(m[1], 10);
    }
  } catch {
  }
  return false;
}
function isInsideEditor(env = process.env) {
  if (/vscode|cursor/i.test(env.TERM_PROGRAM ?? "") || Boolean(env.CURSOR_TRACE_ID) || Boolean(env.VSCODE_PID) || Boolean(env.VSCODE_GIT_IPC_HANDLE)) {
    return true;
  }
  if (Boolean(env.TMUX) || env.TERM_PROGRAM === "tmux") return hasEditorAncestor();
  return false;
}
function openArtifactsInEditor(consortDir, opts = {}) {
  const env = opts.env ?? process.env;
  const all = reviewArtifacts(consortDir, { feature: opts.feature, story: opts.story });
  const files = opts.changedSinceMs === void 0 ? all : all.filter((f) => {
    try {
      return fs3.statSync(f).mtimeMs >= opts.changedSinceMs;
    } catch {
      return false;
    }
  });
  if (!files.length) return { files, opened: false, reason: "no-artifacts" };
  const cmd = findEditorCmd(env);
  if (!cmd) return { files, opened: false, reason: "no-editor" };
  if (!isInsideEditor(env) && !opts.force) return { files, opened: false, editor: cmd, reason: "not-in-editor" };
  const spawn = opts.spawn ?? ((c, fs22) => {
    (0, import_node_child_process.spawnSync)(c, fs22, { stdio: "ignore" });
  });
  try {
    spawn(cmd, files);
  } catch {
    return { files, opened: false, editor: cmd, reason: "no-editor" };
  }
  return { files, opened: true, editor: cmd };
}

// bin/consort/open.cli.ts
function parseArgs(argv) {
  const out = { projectDir: process.cwd(), force: false };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--project-dir":
        out.projectDir = argv[++i];
        break;
      case "--tdd-dir":
      case "--consort-dir":
        out.consortDir = argv[++i];
        break;
      case "--feature":
        out.feature = argv[++i];
        break;
      case "--story":
        out.story = argv[++i];
        break;
      case "--force":
        out.force = true;
        break;
      case "-h":
      case "--help":
        process.stdout.write(
          "consort-open \u2013 open the reviewable Consort artifacts in Cursor/Code.\n\n  consort-open [--feature <id>] [--story <id>] [--force] [--project-dir <p>]\n\nOpens only when inside the editor's terminal (else prints paths). --force opens regardless.\n"
        );
        process.exit(0);
    }
  }
  return out;
}
function currentScope(consortDir) {
  try {
    const ws = JSON.parse(fs4.readFileSync(path2.join(consortDir, "workflow-state.json"), "utf8"));
    return {
      ...ws.feature_id ? { feature: ws.feature_id } : {},
      ...ws.story_id ? { story: ws.story_id } : {}
    };
  } catch {
    return {};
  }
}
function main() {
  const args = parseArgs(process.argv.slice(2));
  const consortDir = args.consortDir ?? resolveConsortDir(args.projectDir);
  const scope = args.feature ? { feature: args.feature, story: args.story } : currentScope(consortDir);
  const res = openArtifactsInEditor(consortDir, { ...scope, force: args.force });
  if (res.opened) {
    process.stdout.write(`consort-open: opened ${res.files.length} artifact(s) in ${res.editor}:
${res.files.map((f) => `  ${f}`).join("\n")}
`);
    return 0;
  }
  if (res.reason === "no-artifacts") {
    process.stdout.write("consort-open: no reviewable artifacts found for this scope yet.\n");
    return 0;
  }
  const why = res.reason === "no-editor" ? "no Cursor/VS Code CLI found" : "not inside an editor terminal (use --force to open anyway)";
  process.stdout.write(`consort-open: ${why}; review these artifacts:
${res.files.map((f) => `  ${f}`).join("\n")}
`);
  return 0;
}
process.exit(main());
