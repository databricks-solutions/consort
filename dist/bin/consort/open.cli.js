#!/usr/bin/env node

// bin/consort/open.cli.ts
import * as fs4 from "fs";
import * as path2 from "path";

// consort/config/consort-paths.ts
import * as fs from "fs";
import { join } from "path";
var ARTIFACT_ROOT = ".consort";
var LEGACY_ARTIFACT_ROOTS = [".sftdd", ".tdd"];
var ALL_ARTIFACT_ROOTS = [ARTIFACT_ROOT, ...LEGACY_ARTIFACT_ROOTS];
function resolveConsortDir(projectDir = process.cwd()) {
  const next = join(projectDir, ARTIFACT_ROOT);
  if (fs.existsSync(next)) return next;
  for (const legacyName of LEGACY_ARTIFACT_ROOTS) {
    const legacy = join(projectDir, legacyName);
    if (fs.existsSync(legacy)) return legacy;
  }
  return next;
}
var featuresDir = (tdd) => join(tdd, "features");
var planningDir = (tdd) => join(tdd, "planning");
var productOverviewMd = (tdd) => join(tdd, "product-overview.md");
var nfrsMd = (tdd) => join(tdd, "nfrs.md");
var designDir = (tdd) => join(tdd, "design");
var designBriefMd = (tdd) => join(designDir(tdd), "design-brief.md");
var designGuideJson = (tdd) => join(designDir(tdd), "design-guide.json");
var featureProposalsMd = (tdd) => join(planningDir(tdd), "feature-proposals.md");
var featureDir = (tdd, featureId) => join(featuresDir(tdd), featureId);
var featureResolved = (tdd, f) => findFeatureDir(tdd, f) ?? featureDir(tdd, f);
var featureSpecJson = (tdd, f) => join(featureResolved(tdd, f), "feature-spec.json");
var featureSpecMd = (tdd, f) => join(featureResolved(tdd, f), "feature-spec.md");
var featureRequestMd = (tdd, f) => join(featureResolved(tdd, f), "feature-request.md");
var architectureJson = (tdd, f) => join(featureResolved(tdd, f), "architecture.json");
var architectureMd = (tdd, f) => join(featureResolved(tdd, f), "architecture.md");
var dbDesignJson = (tdd, f) => join(featureResolved(tdd, f), "db-design.json");
var dbDesignMd = (tdd, f) => join(featureResolved(tdd, f), "db-design.md");
var featureTestListJson = (tdd, f) => join(featureResolved(tdd, f), "test-list.json");
var featureTestListMd = (tdd, f) => join(featureResolved(tdd, f), "test-list.md");
var storiesDir = (tdd, f) => join(featureResolved(tdd, f), "stories");
var storyDir = (tdd, f, s) => join(storiesDir(tdd, f), s);
function findStoryDir(tdd, f, s) {
  const root = storiesDir(tdd, f);
  if (!fs.existsSync(root)) return void 0;
  const exact = join(root, s);
  if (fs.existsSync(exact)) return exact;
  const matches = fs.readdirSync(root).filter((d) => d === s || d.startsWith(`${s}-`));
  return matches.length === 1 ? join(root, matches[0]) : void 0;
}
var storyResolved = (tdd, f, s) => findStoryDir(tdd, f, s) ?? storyDir(tdd, f, s);
var storyJson = (tdd, f, s) => join(storyResolved(tdd, f, s), "story.json");
var acsDir = (tdd, f, s) => join(storyResolved(tdd, f, s), "acs");
var storyTestListJson = (tdd, f, s) => join(storyResolved(tdd, f, s), "test-list-per-story.json");
function findFeatureDir(tdd, featureId) {
  const root = featuresDir(tdd);
  if (!fs.existsSync(root)) return void 0;
  const exact = join(root, featureId);
  if (fs.existsSync(exact)) return exact;
  const matches = fs.readdirSync(root).filter((d) => d === featureId || d.startsWith(`${featureId}-`));
  return matches.length === 1 ? join(root, matches[0]) : void 0;
}

// consort/orchestrator/open/open-in-editor.ts
import * as fs3 from "fs";
import * as path from "path";
import { spawnSync } from "child_process";

// consort/orchestrator/open/resolve-review-artifacts.ts
import * as fs2 from "fs";
import { join as join2, dirname } from "path";
function reviewArtifacts(consortDir, opts = {}) {
  const out = [];
  const add = (p) => {
    if (fs2.existsSync(p) && !out.includes(p)) out.push(p);
  };
  add(productOverviewMd(consortDir));
  add(nfrsMd(consortDir));
  add(featureProposalsMd(consortDir));
  add(join2(consortDir, "planning", "estimates.json"));
  add(designBriefMd(consortDir));
  add(join2(consortDir, "design", "design-guide.md"));
  add(designGuideJson(consortDir));
  add(join2(consortDir, "design", "ia.md"));
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
      add(join2(storyDir(consortDir, f, s), "story.md"));
      add(storyJson(consortDir, f, s));
      add(storyTestListJson(consortDir, f, s));
      try {
        for (const a of fs2.readdirSync(acsDir(consortDir, f, s)).filter((n) => n.endsWith(".json")).sort()) {
          add(join2(acsDir(consortDir, f, s), a));
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
function isInsideEditor(env = process.env) {
  return /vscode|cursor/i.test(env.TERM_PROGRAM ?? "") || Boolean(env.CURSOR_TRACE_ID) || Boolean(env.VSCODE_PID);
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
    spawnSync(c, fs22, { stdio: "ignore" });
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
