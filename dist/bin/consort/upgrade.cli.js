#!/usr/bin/env node

// node_modules/tsup/assets/esm_shims.js
import path from "path";
import { fileURLToPath } from "url";
var getFilename = () => fileURLToPath(import.meta.url);
var getDirname = () => path.dirname(getFilename());
var __dirname = /* @__PURE__ */ getDirname();

// bin/consort/upgrade.cli.ts
import * as fs6 from "fs";
import * as path6 from "path";
import { spawnSync as spawnSync3 } from "child_process";

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

// consort/config/kit-bin.ts
import { spawnSync } from "child_process";
import * as fs2 from "fs";
import * as path2 from "path";
var kitRootCache;
function resolveKitRoot() {
  if (kitRootCache !== void 0) return kitRootCache;
  const env = process.env.LAKEBASE_KIT_DIR?.trim();
  kitRootCache = env && fs2.existsSync(path2.join(env, "package.json")) ? env : path2.resolve(__dirname, "..", "..", "..");
  return kitRootCache;
}
function kitRoot() {
  return resolveKitRoot();
}
function kitVersion() {
  try {
    const pkg = JSON.parse(fs2.readFileSync(path2.join(resolveKitRoot(), "package.json"), "utf8"));
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

// consort/lakebase/upgrade.ts
import * as fs5 from "fs";
import * as path5 from "path";
import { spawnSync as spawnSync2 } from "child_process";

// consort/config/kit-ref.ts
import { existsSync as existsSync3, readFileSync as readFileSync3, writeFileSync as writeFileSync2, mkdirSync as mkdirSync2 } from "fs";
import { dirname as dirname2, join as join3 } from "path";
var KIT_REF_FILE = "kit-ref";
var KIT_REF_LOCAL_FILE = "kit-ref.local";
function lakebaseFile(projectDir, name) {
  return join3(projectDir, ".lakebase", name);
}
function readTrimmed(file) {
  if (!existsSync3(file)) return void 0;
  try {
    const v = readFileSync3(file, "utf8").trim();
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
  mkdirSync2(dirname2(file), { recursive: true });
  writeFileSync2(file, ref + "\n", "utf8");
  return { pinned: true, ref, ...previous ? { previous } : {} };
}

// consort/lakebase/update-agents.ts
import * as fs3 from "fs";
import * as path3 from "path";
function findKitAgentsDir(start) {
  let dir = start;
  for (let i = 0; i < 6; i++) {
    const candidate = path3.join(dir, "skills", "consort", "agents");
    if (fs3.existsSync(candidate)) return candidate;
    const parent = path3.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `Could not locate skills/consort/agents/ relative to ${start}. Pass explicit kitDir.`
  );
}
function updateAgents(args) {
  const projectAgentsDir = path3.join(args.projectDir, ".claude", "agents");
  const here = path3.dirname(new URL(import.meta.url).pathname);
  const kitAgentsDir = args.kitDir ? path3.join(args.kitDir, "skills", "consort", "agents") : findKitAgentsDir(here);
  const dryRun = args.dryRun === true;
  const force = args.force !== false;
  const sourceFiles = fs3.existsSync(kitAgentsDir) ? fs3.readdirSync(kitAgentsDir).filter((f) => f.endsWith(".md")) : [];
  if (!dryRun && sourceFiles.length > 0 && !fs3.existsSync(projectAgentsDir)) {
    fs3.mkdirSync(projectAgentsDir, { recursive: true });
  }
  const files = [];
  let changed = false;
  for (const name of sourceFiles) {
    const projectPath = path3.join(projectAgentsDir, name);
    const desired = fs3.readFileSync(path3.join(kitAgentsDir, name), "utf-8");
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
import * as fs4 from "fs";
import * as path4 from "path";
var COMMAND_HOOK_FILE_PATTERN = /\.(pre|post)-hook\.md$/;
function findKitCommandsDir(start) {
  let dir = start;
  for (let i = 0; i < 6; i++) {
    const candidate = path4.join(
      dir,
      "templates",
      "project",
      "common",
      ".claude",
      "commands"
    );
    if (fs4.existsSync(candidate)) return candidate;
    const parent = path4.dirname(dir);
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
    dir = path4.dirname(dir);
  }
  try {
    const raw = fs4.readFileSync(path4.join(dir, "package.json"), "utf-8");
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
  const projectCommandsDir = path4.join(args.projectDir, ".claude", "commands");
  const here = path4.dirname(new URL(import.meta.url).pathname);
  const kitCommandsDir = args.kitDir ? path4.join(args.kitDir, "templates", "project", "common", ".claude", "commands") : findKitCommandsDir(here);
  const dryRun = args.dryRun === true;
  const force = args.force !== false;
  const templateFiles = fs4.existsSync(kitCommandsDir) ? fs4.readdirSync(kitCommandsDir).filter((f) => f.endsWith(".md") && !COMMAND_HOOK_FILE_PATTERN.test(f)) : [];
  if (!dryRun && templateFiles.length > 0 && !fs4.existsSync(projectCommandsDir)) {
    fs4.mkdirSync(projectCommandsDir, { recursive: true });
  }
  const version = readKitVersion(kitCommandsDir);
  const files = [];
  for (const name of templateFiles) {
    const projectPath = path4.join(projectCommandsDir, name);
    const templatePath = path4.join(kitCommandsDir, name);
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
import { enableE2eForProject } from "@databricks-solutions/lakebase-scm-utils/lakebase";

// consort/config/consort-config-file.ts
import { existsSync as existsSync6, readFileSync as readFileSync6, mkdirSync as mkdirSync5, writeFileSync as writeFileSync5 } from "fs";
import { dirname as dirname6, join as join7 } from "path";

// consort/config/agent-models.ts
import { dirname as dirname5, join as join6 } from "path";
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
var AGENT_CONFIG_REL = join6(".lakebase", "agent-config.json");

// consort/config/consort-config-file.ts
var CONSORT_CONFIG_REL = join7(".lakebase", "consort-config.json");
var LEGACY_CONFIG_RELS = [
  join7(".lakebase", "sftdd-config.json"),
  join7(".lakebase", "tdd-config.json")
];
var LEGACY_TDD_CONFIG_REL = LEGACY_CONFIG_RELS[0];
function loadConsortConfig(projectDir) {
  for (const rel of [CONSORT_CONFIG_REL, ...LEGACY_CONFIG_RELS]) {
    const f = join7(projectDir, rel);
    if (!existsSync6(f)) continue;
    try {
      return JSON.parse(readFileSync6(f, "utf8"));
    } catch {
      return void 0;
    }
  }
  return void 0;
}

// consort/lakebase/upgrade.ts
var KIT_REF_PREV_FILE = "kit-ref.prev";
var AGENT_SYNC_MARKER = path5.join(".claude", "agents", ".kit-version");
function lakebaseFile2(projectDir, name) {
  return path5.join(projectDir, ".lakebase", name);
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
  fs5.mkdirSync(path5.dirname(lakebaseFile2(projectDir, KIT_REF_PREV_FILE)), { recursive: true });
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
    if (e.isDirectory()) n += countFiles(path5.join(dir, e.name));
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
    const pkg = JSON.parse(fs5.readFileSync(path5.join(kitDir, "package.json"), "utf8"));
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
    const f = path5.join(workflowsDir, entry);
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
    const p = path5.join(scriptsDir, entry.name);
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
  const commonDir = path5.join(kitDir, "templates", "project", "common");
  const scripts = copyKitTree(path5.join(commonDir, "scripts"), path5.join(projectDir, "scripts"));
  const workflowsDir = path5.join(projectDir, ".github", "workflows");
  const workflows = copyKitTree(path5.join(commonDir, ".github", "workflows"), workflowsDir);
  const substrate = resolveSubstrateVersion(kitDir);
  if (substrate) {
    substituteWorkflowVersion(workflowsDir, substrate);
    substituteScmUtilsVersionInScripts(path5.join(projectDir, "scripts"), substrate);
  }
  let e2e = false;
  try {
    const cfg = loadConsortConfig(projectDir);
    if (cfg?.project?.uiTrack === true || cfg?.project?.clientFramework === "react") {
      enableE2eForProject({ projectDir });
      e2e = true;
    }
  } catch {
  }
  const marker = path5.join(projectDir, AGENT_SYNC_MARKER);
  try {
    fs5.mkdirSync(path5.dirname(marker), { recursive: true });
    fs5.writeFileSync(marker, targetVersion + "\n", "utf8");
  } catch {
  }
  const count = (files) => files.filter((f) => f.outcome === "added" || f.outcome === "updated").length;
  return { agents: count(a.files), commands: count(c.files), scripts, workflows, e2e };
}
var KIT_SURFACE_PATHS = [".claude/agents", ".claude/commands", "scripts", ".github/workflows", ".lakebase/kit-ref"];
function commitRefreshedSurface(projectDir, targetVersion, git = (a) => {
  const r = spawnSync2("git", ["-C", projectDir, ...a], { encoding: "utf8" });
  return { status: r.status, stdout: r.stdout ?? "" };
}) {
  if (git(["rev-parse", "--is-inside-work-tree"]).status !== 0) return { committed: false, reason: "not-a-git-repo" };
  const paths = KIT_SURFACE_PATHS.filter((p) => fs5.existsSync(path5.join(projectDir, p)));
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
import { isCliEntry } from "@databricks-solutions/lakebase-scm-utils/util";
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
    const s = JSON.parse(fs6.readFileSync(path6.join(consortDir, "next.json"), "utf8"));
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
    const lk = path6.join(args.projectDir, "scripts", "lk");
    if (fs6.existsSync(lk)) {
      process.stderr.write(`consort-upgrade: refreshing the kit cache to ${ref} ...
`);
      const r = spawnSync3(lk, ["--refresh"], {
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
if (isCliEntry(import.meta.url)) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(`${err instanceof Error ? err.message : String(err)}
`);
      process.exit(1);
    }
  );
}
