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

// node_modules/tsup/assets/cjs_shims.js
var getImportMetaUrl = () => typeof document === "undefined" ? new URL(`file:${__filename}`).href : document.currentScript && document.currentScript.tagName.toUpperCase() === "SCRIPT" ? document.currentScript.src : new URL("main.js", document.baseURI).href;
var importMetaUrl = /* @__PURE__ */ getImportMetaUrl();

// bin/consort/upgrade.cli.ts
var fs6 = __toESM(require("fs"), 1);
var path5 = __toESM(require("path"), 1);
var import_node_child_process3 = require("child_process");

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

// consort/config/kit-bin.ts
var import_node_child_process = require("child_process");
var fs2 = __toESM(require("fs"), 1);
var path = __toESM(require("path"), 1);
var kitRootCache;
function resolveKitRoot() {
  if (kitRootCache !== void 0) return kitRootCache;
  const env = process.env.LAKEBASE_KIT_DIR?.trim();
  kitRootCache = env && fs2.existsSync(path.join(env, "package.json")) ? env : path.resolve(__dirname, "..", "..", "..");
  return kitRootCache;
}
function kitRoot() {
  return resolveKitRoot();
}
function kitVersion() {
  try {
    const pkg = JSON.parse(fs2.readFileSync(path.join(resolveKitRoot(), "package.json"), "utf8"));
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

// consort/lakebase/upgrade.ts
var fs5 = __toESM(require("fs"), 1);
var path4 = __toESM(require("path"), 1);
var import_node_child_process2 = require("child_process");

// consort/config/kit-ref.ts
var import_node_fs = require("fs");
var import_node_path2 = require("path");
var KIT_REF_FILE = "kit-ref";
var KIT_REF_LOCAL_FILE = "kit-ref.local";
function lakebaseFile(projectDir, name) {
  return (0, import_node_path2.join)(projectDir, ".lakebase", name);
}
function readTrimmed(file) {
  if (!(0, import_node_fs.existsSync)(file)) return void 0;
  try {
    const v = (0, import_node_fs.readFileSync)(file, "utf8").trim();
    return v.length > 0 ? v : void 0;
  } catch {
    return void 0;
  }
}
function committedKitRef(projectDir) {
  return readTrimmed(lakebaseFile(projectDir, KIT_REF_FILE));
}
function localKitRef(projectDir) {
  return readTrimmed(lakebaseFile(projectDir, KIT_REF_LOCAL_FILE));
}
function pinRunKitRef(projectDir, ref) {
  const file = lakebaseFile(projectDir, KIT_REF_LOCAL_FILE);
  const previous = readTrimmed(file);
  if (previous === ref) return { pinned: false, ref };
  (0, import_node_fs.mkdirSync)((0, import_node_path2.dirname)(file), { recursive: true });
  (0, import_node_fs.writeFileSync)(file, ref + "\n", "utf8");
  return { pinned: true, ref, ...previous ? { previous } : {} };
}

// consort/lakebase/update-agents.ts
var fs3 = __toESM(require("fs"), 1);
var path2 = __toESM(require("path"), 1);
function findKitAgentsDir(start) {
  let dir = start;
  for (let i = 0; i < 6; i++) {
    const candidate = path2.join(dir, "skills", "consort", "agents");
    if (fs3.existsSync(candidate)) return candidate;
    const parent = path2.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `Could not locate skills/consort/agents/ relative to ${start}. Pass explicit kitDir.`
  );
}
function updateAgents(args) {
  const projectAgentsDir = path2.join(args.projectDir, ".claude", "agents");
  const here = path2.dirname(new URL(importMetaUrl).pathname);
  const kitAgentsDir = args.kitDir ? path2.join(args.kitDir, "skills", "consort", "agents") : findKitAgentsDir(here);
  const dryRun = args.dryRun === true;
  const force = args.force !== false;
  const sourceFiles = fs3.existsSync(kitAgentsDir) ? fs3.readdirSync(kitAgentsDir).filter((f) => f.endsWith(".md")) : [];
  if (!dryRun && sourceFiles.length > 0 && !fs3.existsSync(projectAgentsDir)) {
    fs3.mkdirSync(projectAgentsDir, { recursive: true });
  }
  const files = [];
  let changed = false;
  for (const name of sourceFiles) {
    const projectPath = path2.join(projectAgentsDir, name);
    const desired = fs3.readFileSync(path2.join(kitAgentsDir, name), "utf-8");
    if (!fs3.existsSync(projectPath)) {
      files.push({ name, outcome: "added" });
      changed = true;
      if (!dryRun) fs3.writeFileSync(projectPath, desired);
      continue;
    }
    const current = fs3.readFileSync(projectPath, "utf-8");
    if (current === desired) {
      files.push({ name, outcome: "unchanged" });
      continue;
    }
    if (!force) {
      files.push({ name, outcome: "preserved" });
      continue;
    }
    files.push({ name, outcome: "updated" });
    changed = true;
    if (!dryRun) fs3.writeFileSync(projectPath, desired);
  }
  return { files, changed };
}

// consort/lakebase/update-commands.ts
var fs4 = __toESM(require("fs"), 1);
var path3 = __toESM(require("path"), 1);
var COMMAND_HOOK_FILE_PATTERN = /\.(pre|post)-hook\.md$/;
function findKitCommandsDir(start) {
  let dir = start;
  for (let i = 0; i < 6; i++) {
    const candidate = path3.join(
      dir,
      "templates",
      "project",
      "common",
      ".claude",
      "commands"
    );
    if (fs4.existsSync(candidate)) return candidate;
    const parent = path3.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `Could not locate templates/project/common/.claude/commands/ relative to ${start}. Pass explicit kitDir.`
  );
}
function readKitVersion(kitCommandsDir) {
  let dir = kitCommandsDir;
  for (let i = 0; i < 5; i++) {
    dir = path3.dirname(dir);
  }
  try {
    const raw = fs4.readFileSync(path3.join(dir, "package.json"), "utf-8");
    const pkg = JSON.parse(raw);
    return typeof pkg.version === "string" ? pkg.version : "unknown";
  } catch {
    return "unknown";
  }
}
function applyCommandPlaceholders(content, version) {
  return content.replace(/\$\{KIT_VERSION_AT_SCAFFOLD\}/g, version);
}
function updateCommands(args) {
  const projectCommandsDir = path3.join(args.projectDir, ".claude", "commands");
  const here = path3.dirname(new URL(importMetaUrl).pathname);
  const kitCommandsDir = args.kitDir ? path3.join(args.kitDir, "templates", "project", "common", ".claude", "commands") : findKitCommandsDir(here);
  const dryRun = args.dryRun === true;
  const force = args.force !== false;
  const templateFiles = fs4.existsSync(kitCommandsDir) ? fs4.readdirSync(kitCommandsDir).filter((f) => f.endsWith(".md") && !COMMAND_HOOK_FILE_PATTERN.test(f)) : [];
  if (!dryRun && templateFiles.length > 0 && !fs4.existsSync(projectCommandsDir)) {
    fs4.mkdirSync(projectCommandsDir, { recursive: true });
  }
  const version = readKitVersion(kitCommandsDir);
  const files = [];
  for (const name of templateFiles) {
    const projectPath = path3.join(projectCommandsDir, name);
    const templatePath = path3.join(kitCommandsDir, name);
    const templateRaw = fs4.readFileSync(templatePath, "utf-8");
    const desired = applyCommandPlaceholders(templateRaw, version);
    const existed = fs4.existsSync(projectPath);
    const current = existed ? fs4.readFileSync(projectPath, "utf-8") : "";
    let outcome;
    if (!existed) {
      outcome = "added";
    } else if (current === desired) {
      outcome = "unchanged";
    } else if (!force) {
      outcome = "preserved";
    } else {
      outcome = "updated";
    }
    if (!dryRun && (outcome === "added" || outcome === "updated")) {
      fs4.writeFileSync(projectPath, desired);
    }
    files.push({ name, outcome });
  }
  const order = {
    added: 0,
    updated: 1,
    preserved: 2,
    unchanged: 3
  };
  files.sort((a, b) => order[a.outcome] - order[b.outcome] || a.name.localeCompare(b.name));
  const changed = files.some((f) => f.outcome === "added" || f.outcome === "updated");
  return { files, changed };
}

// consort/lakebase/upgrade.ts
var import_lakebase = require("@databricks-solutions/lakebase-scm-utils/lakebase");

// consort/config/consort-config-file.ts
var import_fs = require("fs");
var import_path2 = require("path");

// consort/config/agent-models.ts
var import_path = require("path");
var RECOMMENDED_MODELS = {
  "spec-author": "opus",
  "architect-reviewer": "opus",
  dba: "opus",
  "test-strategist": "sonnet",
  "ux-designer": "sonnet",
  navigator: "sonnet",
  driver: "sonnet",
  "product-owner": "opus"
};
var ALL_AGENT_ROLES = Object.keys(RECOMMENDED_MODELS);
var AGENT_CONFIG_REL = (0, import_path.join)(".lakebase", "agent-config.json");

// consort/config/consort-config-file.ts
var CONSORT_CONFIG_REL = (0, import_path2.join)(".lakebase", "consort-config.json");
var LEGACY_CONFIG_RELS = [
  (0, import_path2.join)(".lakebase", "sftdd-config.json"),
  (0, import_path2.join)(".lakebase", "tdd-config.json")
];
var LEGACY_TDD_CONFIG_REL = LEGACY_CONFIG_RELS[0];
function loadConsortConfig(projectDir) {
  for (const rel of [CONSORT_CONFIG_REL, ...LEGACY_CONFIG_RELS]) {
    const f = (0, import_path2.join)(projectDir, rel);
    if (!(0, import_fs.existsSync)(f)) continue;
    try {
      return JSON.parse((0, import_fs.readFileSync)(f, "utf8"));
    } catch {
      return void 0;
    }
  }
  return void 0;
}

// consort/lakebase/upgrade.ts
var KIT_REF_PREV_FILE = "kit-ref.prev";
var AGENT_SYNC_MARKER = path4.join(".claude", "agents", ".kit-version");
function lakebaseFile2(projectDir, name) {
  return path4.join(projectDir, ".lakebase", name);
}
function quiesceGate(q) {
  if (q.pidAlive === true) {
    return { safe: false, reason: "a drive process is still RUNNING \u2013 wait for it to stop at a gate before upgrading (never swap the kit mid-turn)." };
  }
  if (q.pidAlive === false) {
    return { safe: true, reason: "at a clean stop (drive pid not alive \u2013 nothing is running)." };
  }
  if (!q.atStop) {
    return { safe: false, reason: "no --pid given and next.json shows no clean stop (awaiting_human/done) \u2013 pass --pid <drive-pid> so drive liveness can be verified, or resolve to a gate first." };
  }
  return { safe: true, reason: "at a stop (awaiting_human/done); drive liveness UNVERIFIED (no --pid) \u2013 confirm no drive is running." };
}
function pinBoth(projectDir, ref) {
  const previousLocal = localKitRef(projectDir);
  const previousCommitted = committedKitRef(projectDir);
  const prev = { local: previousLocal ?? null, committed: previousCommitted ?? null };
  fs5.mkdirSync(path4.dirname(lakebaseFile2(projectDir, KIT_REF_PREV_FILE)), { recursive: true });
  fs5.writeFileSync(lakebaseFile2(projectDir, KIT_REF_PREV_FILE), JSON.stringify(prev) + "\n", "utf8");
  const local = pinRunKitRef(projectDir, ref);
  fs5.writeFileSync(lakebaseFile2(projectDir, KIT_REF_FILE), ref + "\n", "utf8");
  const changed = local.pinned || previousCommitted !== ref;
  return {
    ref,
    ...previousLocal ? { previousLocal } : {},
    ...previousCommitted ? { previousCommitted } : {},
    changed
  };
}
function rollbackPins(projectDir) {
  const prevFile = lakebaseFile2(projectDir, KIT_REF_PREV_FILE);
  if (!fs5.existsSync(prevFile)) return { restored: false, reason: "no kit-ref.prev \u2013 nothing to roll back to." };
  let prev;
  try {
    prev = JSON.parse(fs5.readFileSync(prevFile, "utf8"));
  } catch {
    return { restored: false, reason: "kit-ref.prev is unreadable." };
  }
  const restore = (name, val) => {
    const f = lakebaseFile2(projectDir, name);
    if (val && val.trim()) fs5.writeFileSync(f, val.trim() + "\n", "utf8");
    else if (fs5.existsSync(f)) fs5.rmSync(f);
  };
  restore(KIT_REF_LOCAL_FILE, prev.local);
  restore(KIT_REF_FILE, prev.committed);
  return {
    restored: true,
    ...prev.local ? { local: prev.local } : {},
    ...prev.committed ? { committed: prev.committed } : {}
  };
}
function countFiles(dir) {
  if (!fs5.existsSync(dir)) return 0;
  let n = 0;
  for (const e of fs5.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) n += countFiles(path4.join(dir, e.name));
    else n += 1;
  }
  return n;
}
function copyKitTree(kitSubtree, projectSubtree) {
  if (!fs5.existsSync(kitSubtree)) return 0;
  fs5.mkdirSync(projectSubtree, { recursive: true });
  fs5.cpSync(kitSubtree, projectSubtree, { recursive: true, force: true });
  return countFiles(kitSubtree);
}
function resolveSubstrateVersion(kitDir) {
  try {
    const pkg = JSON.parse(fs5.readFileSync(path4.join(kitDir, "package.json"), "utf8"));
    const pin = pkg.dependencies?.["@databricks-solutions/lakebase-scm-utils"] ?? "";
    const hash = pin.indexOf("#");
    if (hash < 0) return null;
    return pin.slice(hash + 1).replace(/^v/, "") || null;
  } catch {
    return null;
  }
}
function substituteWorkflowVersion(workflowsDir, version) {
  if (!fs5.existsSync(workflowsDir)) return;
  for (const entry of fs5.readdirSync(workflowsDir)) {
    if (!entry.endsWith(".yml") && !entry.endsWith(".yaml")) continue;
    const f = path4.join(workflowsDir, entry);
    try {
      const before = fs5.readFileSync(f, "utf8");
      const after = before.replace(/\{\{LAKEBASE_SCM_UTILS_VERSION\}\}/g, version);
      if (after !== before) fs5.writeFileSync(f, after);
    } catch {
    }
  }
}
function substituteScmUtilsVersionInScripts(scriptsDir, version) {
  if (!fs5.existsSync(scriptsDir)) return;
  for (const entry of fs5.readdirSync(scriptsDir, { withFileTypes: true })) {
    const p = path4.join(scriptsDir, entry.name);
    if (entry.isDirectory()) {
      substituteScmUtilsVersionInScripts(p, version);
      continue;
    }
    try {
      const before = fs5.readFileSync(p, "utf8");
      const after = before.replace(/\{\{LAKEBASE_SCM_UTILS_VERSION\}\}/g, version);
      if (after !== before) fs5.writeFileSync(p, after);
    } catch {
    }
  }
}
function refreshSurface(projectDir, kitDir, targetVersion) {
  const a = updateAgents({ projectDir, kitDir, force: true });
  const c = updateCommands({ projectDir, kitDir, force: true });
  const commonDir = path4.join(kitDir, "templates", "project", "common");
  const scripts = copyKitTree(path4.join(commonDir, "scripts"), path4.join(projectDir, "scripts"));
  const workflowsDir = path4.join(projectDir, ".github", "workflows");
  const workflows = copyKitTree(path4.join(commonDir, ".github", "workflows"), workflowsDir);
  const substrate = resolveSubstrateVersion(kitDir);
  if (substrate) {
    substituteWorkflowVersion(workflowsDir, substrate);
    substituteScmUtilsVersionInScripts(path4.join(projectDir, "scripts"), substrate);
  }
  let e2e = false;
  try {
    const cfg = loadConsortConfig(projectDir);
    if (cfg?.project?.uiTrack === true || cfg?.project?.clientFramework === "react") {
      (0, import_lakebase.enableE2eForProject)({ projectDir });
      e2e = true;
    }
  } catch {
  }
  const marker = path4.join(projectDir, AGENT_SYNC_MARKER);
  try {
    fs5.mkdirSync(path4.dirname(marker), { recursive: true });
    fs5.writeFileSync(marker, targetVersion + "\n", "utf8");
  } catch {
  }
  const count = (files) => files.filter((f) => f.outcome === "added" || f.outcome === "updated").length;
  return { agents: count(a.files), commands: count(c.files), scripts, workflows, e2e };
}
var KIT_SURFACE_PATHS = [".claude/agents", ".claude/commands", "scripts", ".github/workflows", ".lakebase/kit-ref"];
function commitRefreshedSurface(projectDir, targetVersion, git = (a) => {
  const r = (0, import_node_child_process2.spawnSync)("git", ["-C", projectDir, ...a], { encoding: "utf8" });
  return { status: r.status, stdout: r.stdout ?? "" };
}) {
  if (git(["rev-parse", "--is-inside-work-tree"]).status !== 0) return { committed: false, reason: "not-a-git-repo" };
  const paths = KIT_SURFACE_PATHS.filter((p) => fs5.existsSync(path4.join(projectDir, p)));
  if (!paths.length) return { committed: false, reason: "nothing-to-commit" };
  git(["add", "--", ...paths]);
  if (git(["diff", "--cached", "--quiet", "--", ...paths]).status === 0) {
    return { committed: false, reason: "nothing-to-commit" };
  }
  if (git(["commit", "--no-verify", "-m", `chore(kit): refresh scaffolded surface to ${targetVersion}`]).status !== 0) {
    return { committed: false, reason: "commit-failed" };
  }
  return { committed: true, sha: git(["rev-parse", "--short", "HEAD"]).stdout.trim() };
}

// bin/consort/upgrade.cli.ts
var import_util = require("@databricks-solutions/lakebase-scm-utils/util");
function parse(argv) {
  const out = { rollback: false, projectDir: process.cwd(), skipRefresh: false };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--rollback":
        out.rollback = true;
        break;
      case "--pid":
        out.pid = Number(argv[++i]);
        break;
      case "--project-dir":
        out.projectDir = argv[++i];
        break;
      case "--tdd-dir":
      case "--consort-dir":
        out.consortDir = argv[++i];
        break;
      case "--skip-refresh":
        out.skipRefresh = true;
        break;
      default:
        break;
    }
  }
  return out;
}
function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
function readAtStop(consortDir) {
  try {
    const s = JSON.parse(fs6.readFileSync(path5.join(consortDir, "next.json"), "utf8"));
    return s.awaiting_human === true || s.primary_action?.kind === "done";
  } catch {
    return true;
  }
}
async function main() {
  const args = parse(process.argv.slice(2));
  const consortDir = args.consortDir ?? resolveConsortDir(args.projectDir);
  if (args.rollback) {
    const r = rollbackPins(args.projectDir);
    if (!r.restored) {
      process.stderr.write(`consort-upgrade: rollback \u2013 ${r.reason}
`);
      return 1;
    }
    process.stdout.write(
      `consort-upgrade: ROLLED BACK \u2013 kit-ref.local=${r.local ?? "(unset)"} / kit-ref=${r.committed ?? "(unset)"}.
  Refresh the cache to the restored ref, then resume: \`./scripts/lk --refresh\` then re-run your drive command.
`
    );
    return 0;
  }
  const target = kitVersion();
  if (!target || target === "unknown") {
    process.stderr.write("consort-upgrade: cannot resolve the invoking kit's version \u2013 run this from a real kit (npx github:consort#<ver> or LAKEBASE_KIT_REF=<ver> ./scripts/lk).\n");
    return 2;
  }
  const ref = target.startsWith("v") ? target : `v${target}`;
  const pidAlive = args.pid !== void 0 ? alive(args.pid) : null;
  const q = quiesceGate({ pidAlive, atStop: readAtStop(consortDir) });
  if (!q.safe) {
    process.stderr.write(`consort-upgrade: NOT SAFE to upgrade \u2013 ${q.reason}
`);
    return 2;
  }
  if (pidAlive === null) process.stderr.write(`consort-upgrade: ${q.reason}
`);
  if (!args.skipRefresh) {
    const lk = path5.join(args.projectDir, "scripts", "lk");
    if (fs6.existsSync(lk)) {
      process.stderr.write(`consort-upgrade: refreshing the kit cache to ${ref} ...
`);
      const r = (0, import_node_child_process3.spawnSync)(lk, ["--refresh"], {
        cwd: args.projectDir,
        stdio: "inherit",
        env: { ...process.env, LAKEBASE_KIT_REF: ref },
        timeout: 3e5
      });
      if (r.status !== 0) {
        process.stderr.write(`consort-upgrade: cache refresh exited ${r.status ?? "(signal)"} \u2013 continuing; re-run \`./scripts/lk --refresh\` if a resume cannot resolve ${ref}.
`);
      }
    }
  }
  const pin = pinBoth(args.projectDir, ref);
  const surf = refreshSurface(args.projectDir, kitRoot(), target);
  const committed = commitRefreshedSurface(args.projectDir, ref);
  process.stdout.write(
    `consort-upgrade: UPGRADED to ${ref}.
  pins: .local ${pin.previousLocal ?? "(unset)"} -> ${ref}; committed ${pin.previousCommitted ?? "(unset)"} -> ${ref} (in lockstep, no drift).
  surface: ${surf.agents} agent(s) + ${surf.commands} command(s) + ${surf.scripts} script(s) + ${surf.workflows} CI workflow(s) refreshed from ${ref}${surf.e2e ? " + Playwright E2E block re-wired into run-tests.sh (deploy-verify runs the client E2E)" : ""} (the scm-utils scripts/lk shim + project config left as-is).
  committed: ${committed.committed ? `${committed.sha} \u2013 kit surface committed, tree clean for the next fork` : `nothing committed (${committed.reason}) \u2013 if the tree is dirty with kit files, commit them before the next fork`}.
  RESUME: run \`consort-next\` for the exact command, then re-run your drive \u2013 it runs ${ref}, re-derives state from disk, and continues from the gate.
  ROLLBACK (instant undo): \`./scripts/lk consort-upgrade --rollback\` then \`./scripts/lk --refresh\` (re-commit the restored surface if the next fork reports a dirty tree).
`
  );
  return 0;
}
if ((0, import_util.isCliEntry)(importMetaUrl)) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(`${err instanceof Error ? err.message : String(err)}
`);
      process.exit(1);
    }
  );
}
