#!/usr/bin/env node

// node_modules/tsup/assets/esm_shims.js
import path from "path";
import { fileURLToPath } from "url";
var getFilename = () => fileURLToPath(import.meta.url);
var getDirname = () => path.dirname(getFilename());
var __dirname = /* @__PURE__ */ getDirname();

// consort/lakebase/create-project.ts
import {
  createProject as baseCreateProject
} from "@databricks-solutions/lakebase-scm-utils/lakebase";

// consort/setup/project-consort-setup.ts
import * as fs6 from "fs";
import * as path6 from "path";
import { fileURLToPath as fileURLToPath4 } from "url";

// consort/config/consort-paths.ts
import * as fs from "fs";
import { join } from "path";
var ARTIFACT_ROOT = ".consort";
var LEGACY_ARTIFACT_ROOTS = [".sftdd", ".tdd"];
var ALL_ARTIFACT_ROOTS = [ARTIFACT_ROOT, ...LEGACY_ARTIFACT_ROOTS];

// consort/config/consort-config-file.ts
import { existsSync as existsSync2, readFileSync as readFileSync2, mkdirSync as mkdirSync2, writeFileSync as writeFileSync2 } from "fs";
import { dirname as dirname2, join as join3 } from "path";

// consort/config/agent-models.ts
import { dirname, join as join2 } from "path";
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
var AGENT_CONFIG_REL = join2(".lakebase", "agent-config.json");

// consort/config/consort-config-file.ts
var CONSORT_CONFIG_REL = join3(".lakebase", "consort-config.json");
var LEGACY_CONFIG_RELS = [
  join3(".lakebase", "sftdd-config.json"),
  join3(".lakebase", "tdd-config.json")
];
var LEGACY_TDD_CONFIG_REL = LEGACY_CONFIG_RELS[0];
function defaultConsortConfig() {
  const roles = {};
  for (const role of ALL_AGENT_ROLES) roles[role] = {};
  return {
    version: 1,
    roles,
    build: { loopGranularity: "story", batchCap: 3, sessionScope: "story" },
    plan: { sizing: true },
    project: { uiTrack: true, gates: "interactive", deployTarget: "local", clientFramework: "none", language: "java" }
  };
}
function writeConsortConfig(projectDir, config, opts) {
  const f = join3(projectDir, CONSORT_CONFIG_REL);
  if (existsSync2(f) && !opts?.force) return false;
  mkdirSync2(dirname2(f), { recursive: true });
  writeFileSync2(f, JSON.stringify(config, null, 2) + "\n");
  return true;
}

// consort/lakebase/adopt-consort.ts
import * as fs2 from "fs";
import * as path2 from "path";
import { fileURLToPath as fileURLToPath2 } from "url";

// consort/lakebase/update-agents.ts
import * as fs3 from "fs";
import * as path3 from "path";

// consort/lakebase/upgrade.ts
import * as fs5 from "fs";
import * as path5 from "path";
import { spawnSync } from "child_process";

// consort/config/kit-ref.ts
import { existsSync as existsSync5, readFileSync as readFileSync5, writeFileSync as writeFileSync4, mkdirSync as mkdirSync5 } from "fs";
import { dirname as dirname5, join as join6 } from "path";

// consort/lakebase/update-commands.ts
import * as fs4 from "fs";
import * as path4 from "path";

// consort/lakebase/kit-ref-pin.ts
import { fileURLToPath as fileURLToPath3 } from "url";
import { dirname as dirname7, join as join8, resolve } from "path";
import { readFileSync as readFileSync7, existsSync as existsSync7, mkdirSync as mkdirSync7, writeFileSync as writeFileSync6 } from "fs";
var CONSORT_PKG = "@databricks-solutions/consort";
function kitRefPin(env, version) {
  if (env.LAKEBASE_KIT_REF && env.LAKEBASE_KIT_REF.trim()) return void 0;
  const v = (version ?? "").trim();
  return v ? `v${v}` : void 0;
}
function recordDevKitLocalDirs(projectDir, env) {
  const lakebaseDir = join8(projectDir, ".lakebase");
  const written = [];
  for (const [envVar, file] of [
    ["LAKEBASE_KIT_DIR", "kit-local-dir"],
    ["LAKEBASE_SCM_UTILS_DIR", "scm-utils-local-dir"]
  ]) {
    const dir = env[envVar]?.trim();
    if (!dir) continue;
    const abs = resolve(dir);
    if (!existsSync7(join8(abs, "dist"))) continue;
    try {
      mkdirSync7(lakebaseDir, { recursive: true });
      writeFileSync6(join8(lakebaseDir, file), abs + "\n");
      written.push(file);
    } catch {
    }
  }
  return written;
}
function findConsortPkg(fromDir) {
  let d = fromDir;
  for (let i = 0; i < 8; i++) {
    try {
      const pkg = JSON.parse(readFileSync7(join8(d, "package.json"), "utf-8"));
      if (pkg.name === CONSORT_PKG && typeof pkg.version === "string" && pkg.version) {
        return pkg;
      }
    } catch {
    }
    const up = dirname7(d);
    if (up === d) break;
    d = up;
  }
  return void 0;
}
function readConsortVersion(fromDir) {
  const v = findConsortPkg(fromDir)?.version;
  return typeof v === "string" ? v : void 0;
}
function substrateVersionFromPinSpec(spec) {
  const m = spec.match(/#v?(\d+\.\d+\.\d+)\b/) ?? spec.match(/^v?(\d+\.\d+\.\d+)$/);
  return m ? m[1] : void 0;
}
function declaredSubstrateVersion(fromDir) {
  const spec = findConsortPkg(fromDir)?.dependencies?.["@databricks-solutions/lakebase-scm-utils"];
  if (typeof spec !== "string") return void 0;
  return substrateVersionFromPinSpec(spec);
}
function consortVersionFromModule(metaUrl) {
  try {
    return readConsortVersion(dirname7(fileURLToPath3(metaUrl)));
  } catch {
    return void 0;
  }
}
function declaredSubstrateVersionFromModule(metaUrl) {
  try {
    return declaredSubstrateVersion(dirname7(fileURLToPath3(metaUrl)));
  } catch {
    return void 0;
  }
}

// consort/lakebase/upgrade.ts
import { enableE2eForProject } from "@databricks-solutions/lakebase-scm-utils/lakebase";
var AGENT_SYNC_MARKER = path5.join(".claude", "agents", ".kit-version");

// consort/setup/project-consort-setup.ts
var __dirname2 = path6.dirname(fileURLToPath4(import.meta.url));
function kitPackageName() {
  const candidates = [
    path6.resolve(__dirname2, "../../package.json"),
    path6.resolve(__dirname2, "../../../package.json")
  ];
  for (const c of candidates) {
    try {
      const name = JSON.parse(fs6.readFileSync(c, "utf8")).name;
      if (typeof name === "string" && name) return name;
    } catch {
    }
  }
  throw new Error(`could not resolve the kit package name; looked in: ${candidates.join(", ")}`);
}
function layDownTddScaffold(targetDir) {
  const kitPkgFile = path6.join(targetDir, ".lakebase", "kit-package");
  if (!fs6.existsSync(kitPkgFile)) {
    fs6.mkdirSync(path6.dirname(kitPkgFile), { recursive: true });
    fs6.writeFileSync(kitPkgFile, `${kitPackageName()}
`);
  }
  layDownKitClaudeAssets(targetDir);
  const candidates = [
    path6.resolve(__dirname2, `../../templates/consort-bootstrap/${ARTIFACT_ROOT}`),
    path6.resolve(__dirname2, `../../../templates/consort-bootstrap/${ARTIFACT_ROOT}`)
  ];
  const source = candidates.find((c) => fs6.existsSync(c));
  if (!source) {
    throw new Error(`consort-bootstrap template not found; looked in: ${candidates.join(", ")}`);
  }
  const dest = path6.join(targetDir, ARTIFACT_ROOT);
  if (fs6.existsSync(dest)) {
    return;
  }
  fs6.cpSync(source, dest, { recursive: true });
}
function resolveKitRoot() {
  const candidates = [
    path6.resolve(__dirname2, "../.."),
    path6.resolve(__dirname2, "../../..")
  ];
  for (const c of candidates) {
    if (fs6.existsSync(path6.join(c, "package.json")) && fs6.existsSync(path6.join(c, "skills", "consort", "agents"))) {
      return c;
    }
  }
  throw new Error(
    `could not resolve the kit root (package.json + skills/consort/agents); looked in: ${candidates.join(", ")}`
  );
}
function kitVersion(root) {
  try {
    return JSON.parse(fs6.readFileSync(path6.join(root, "package.json"), "utf8")).version ?? "";
  } catch {
    return "";
  }
}
function copyMissingMd(src, dest) {
  if (!fs6.existsSync(src)) return;
  fs6.mkdirSync(dest, { recursive: true });
  for (const entry of fs6.readdirSync(src)) {
    if (!entry.endsWith(".md")) continue;
    const d = path6.join(dest, entry);
    if (fs6.existsSync(d)) continue;
    fs6.copyFileSync(path6.join(src, entry), d);
  }
}
function layDownKitClaudeAssets(targetDir) {
  const root = resolveKitRoot();
  const claudeDir = path6.join(targetDir, ".claude");
  copyMissingMd(
    path6.join(root, "skills", "consort", "agents"),
    path6.join(claudeDir, "agents")
  );
  const skillsSrc = path6.join(root, "skills");
  if (fs6.existsSync(skillsSrc)) {
    for (const skill of fs6.readdirSync(skillsSrc).sort()) {
      if (!fs6.existsSync(path6.join(skillsSrc, skill, "SKILL.md"))) continue;
      const dest = path6.join(claudeDir, "skills", skill);
      if (fs6.existsSync(dest)) continue;
      fs6.mkdirSync(path6.dirname(dest), { recursive: true });
      fs6.cpSync(path6.join(skillsSrc, skill), dest, { recursive: true });
    }
  }
  const cmdSrc = path6.join(root, "templates", "project", "common", ".claude", "commands");
  if (fs6.existsSync(cmdSrc)) {
    const version = kitVersion(root);
    const cmdDest = path6.join(claudeDir, "commands");
    fs6.mkdirSync(cmdDest, { recursive: true });
    for (const entry of fs6.readdirSync(cmdSrc)) {
      if (!entry.endsWith(".md")) continue;
      const dest = path6.join(cmdDest, entry);
      if (fs6.existsSync(dest)) continue;
      const body = fs6.readFileSync(path6.join(cmdSrc, entry), "utf8").replace(/\$\{KIT_VERSION_AT_SCAFFOLD\}/g, version);
      fs6.writeFileSync(dest, body);
    }
  }
}
var AGENT_SYNC_MARKER2 = path6.join(".claude", "agents", ".kit-version");
function seedConsortConfig(projectDir, opts) {
  const consortConfig = defaultConsortConfig();
  for (const [role, model] of Object.entries(opts.agentModels ?? {})) {
    if (model && consortConfig.roles?.[role]) {
      consortConfig.roles[role].model = model;
    }
  }
  if (consortConfig.project) {
    consortConfig.project.uiTrack = opts.uiTrack ?? true;
    consortConfig.project.clientFramework = opts.clientFramework;
    consortConfig.project.language = opts.language ?? "java";
  }
  writeConsortConfig(projectDir, consortConfig);
}
var kitConsortHooks = {
  layDownScaffold: layDownTddScaffold,
  seedConfig: seedConsortConfig
};

// consort/lakebase/create-project.ts
function resolveEnableE2e(input) {
  return input.clientFramework === "react" ? true : input.enableE2e;
}
function createProject(input, progress) {
  return baseCreateProject(
    { ...input, enableE2e: resolveEnableE2e(input), consortHooks: input.consortHooks ?? kitConsortHooks },
    progress
  );
}

// consort/lakebase/create-doctor-gate.ts
import {
  runHealthDoctor
} from "@databricks-solutions/lakebase-scm-utils/lakebase";
var CREATE_GATE_BLOCKING_CHECKS = /* @__PURE__ */ new Set([
  "databricks-cli",
  "databricks-auth",
  "workspace-identity",
  "lakebase-enabled",
  "node",
  "npm",
  "python",
  "gh"
]);
function blockingChecksForLanguage(language) {
  const set = new Set(CREATE_GATE_BLOCKING_CHECKS);
  if (language === "java" || language === "kotlin") set.add("jdk");
  return set;
}
async function runCreateDoctorGate(args) {
  const doctor = args.doctor ?? ((a) => runHealthDoctor(a));
  const report = await doctor({
    projectDir: args.parentDir,
    host: args.databricksHost,
    profile: args.profile
  });
  const blocking = blockingChecksForLanguage(args.language);
  const blockers = report.checks.filter(
    (c) => c.status === "fail" && blocking.has(c.name)
  );
  return { ok: blockers.length === 0, report, blockers };
}
function formatGateBlockers(blockers) {
  const lines = [
    "Environment preflight failed. Fix these before creating a project:",
    ""
  ];
  for (const b of blockers) {
    lines.push(`  \u2717 ${b.name}: ${b.message}`);
    if (b.hint) lines.push(`      \u2192 ${b.hint}`);
  }
  lines.push("");
  lines.push("Re-run `lakebase-doctor` to recheck, or pass --skip-doctor to bypass (not recommended).");
  return lines.join("\n");
}

// consort/config/kit-bin.ts
import { spawnSync as spawnSync2 } from "child_process";
import * as fs7 from "fs";
import * as path7 from "path";
var kitRootCache;
function resolveKitRoot2() {
  if (kitRootCache !== void 0) return kitRootCache;
  const env = process.env.LAKEBASE_KIT_DIR?.trim();
  kitRootCache = env && fs7.existsSync(path7.join(env, "package.json")) ? env : path7.resolve(__dirname, "..", "..", "..");
  return kitRootCache;
}
function kitVersion2() {
  try {
    const pkg = JSON.parse(fs7.readFileSync(path7.join(resolveKitRoot2(), "package.json"), "utf8"));
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}
function exportConsortVersionEnv(version = kitVersion2()) {
  if (process.env.CONSORT_VERSION) return;
  if (version && version !== "unknown") process.env.CONSORT_VERSION = version;
}

// consort/lakebase/substrate-check.ts
function substrateMismatchMessage(input) {
  const env = input.env ?? {};
  if (env.LAKEBASE_SCM_UTILS_REF && env.LAKEBASE_SCM_UTILS_REF.trim() || env.LAKEBASE_SCM_UTILS_DIR && env.LAKEBASE_SCM_UTILS_DIR.trim()) {
    return null;
  }
  const { declared, installed } = input;
  if (!declared || !installed) return null;
  if (declared === installed) return null;
  return `Substrate mismatch: this kit declares @databricks-solutions/lakebase-scm-utils v${declared}, but the resolved install is v${installed}.
Your npx/npm cache served a STALE substrate \u2013 npx can update the top-level kit while reusing a cached nested dependency, which would scaffold a broken project (wrong launcher, mismatched .lakebase refs). Refusing to create from it.

Fix: clear the npx cache and retry the version-pinned create from /consort:start:
  rm -rf "$(npm config get cache)/_npx"   # or: npx clear-npx-cache
(Set LAKEBASE_SCM_UTILS_REF to override deliberately for dev.)`;
}

// bin/lakebase/create-project.cli.ts
import { createRequire } from "module";
import { readFileSync as readFileSync11, appendFileSync, writeFileSync as writeFileSync9, openSync, closeSync } from "fs";
import * as os from "os";
import * as path8 from "path";

// consort/session/relaunch-detached.ts
import { spawn } from "child_process";
function relaunchDetached(childArgs, opts = {}) {
  try {
    const child = spawn(process.execPath, [process.argv[1], ...childArgs], {
      detached: true,
      // setsid(2): new session + process group, escapes the caller's group-SIGTERM
      stdio: opts.stdio ?? "ignore",
      env: opts.env ?? process.env
    });
    child.unref();
    return child.pid ?? null;
  } catch {
    return null;
  }
}

// bin/lakebase/create-project.cli.ts
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--json-input":
        out.jsonInput = argv[++i];
        break;
      case "--progress-log":
        out.progressLog = argv[++i];
        break;
      case "--project-name":
        out.projectName = argv[++i];
        break;
      case "--parent-dir":
        out.parentDir = argv[++i];
        break;
      case "--databricks-host":
        out.databricksHost = argv[++i];
        break;
      case "--github-owner":
        out.githubOwner = argv[++i];
        break;
      case "--no-github":
        out.createGithubRepo = false;
        break;
      case "--public":
        out.privateRepo = false;
        break;
      case "--language":
        out.language = argv[++i];
        break;
      case "--runner":
        out.runnerType = argv[++i];
        break;
      case "--tiers": {
        const v = Number.parseInt(argv[++i], 10);
        if (v !== 1 && v !== 2 && v !== 3) {
          process.stderr.write(
            `--tiers: expected 1, 2, or 3. Got: ${argv[i]}
  1 = prod only (features fork from prod)
  2 = prod + staging (features fork from staging)
  3 = prod + staging + dev (features fork from dev)
  Features are short-lived branches, NOT counted as tiers.
`
          );
          out.help = true;
        } else {
          out.tiers = v;
        }
        break;
      }
      case "--enable-e2e":
        out.enableE2e = true;
        break;
      case "--no-e2e":
        out.enableE2e = false;
        break;
      case "--enable-infra":
        out.enableInfra = true;
        break;
      case "--no-infra":
        out.enableInfra = false;
        break;
      case "--ui-track":
        out.uiTrack = true;
        break;
      case "--no-ui-track":
        out.uiTrack = false;
        break;
      case "--client":
        out.clientFramework = argv[++i];
        break;
      case "--skip-commands":
        out.skipCommands = true;
        break;
      case "--skip-doctor":
        out.skipDoctor = true;
        break;
      case "--agent-model": {
        const pair = argv[++i] ?? "";
        const eq = pair.indexOf("=");
        const role = eq >= 0 ? pair.slice(0, eq) : "";
        const model = eq >= 0 ? pair.slice(eq + 1) : "";
        if (!ALL_AGENT_ROLES.includes(role) || !model) {
          process.stderr.write(
            `--agent-model: expected <role>=<model> with a known role. Got: ${JSON.stringify(pair)}
  roles: ${ALL_AGENT_ROLES.join(", ")}
`
          );
          out.help = true;
        } else {
          (out.agentModels ??= {})[role] = model;
        }
        break;
      }
      case "--help":
      case "-h":
        out.help = true;
        break;
      default:
        break;
    }
  }
  return out;
}
var HELP = `lakebase-create-project \u2013 bootstrap a fresh Lakebase-paired project

Usage:
  lakebase-create-project --project-name <name> --parent-dir <dir> --databricks-host <url> [--github-owner <owner>] [flags...]
  lakebase-create-project --json-input '{"projectName": "...", ...}'

Flags:
  --project-name      Project name (Lakebase id + local dir name)            [required]
  --parent-dir        Parent directory for the new project                   [required]
  --databricks-host   Databricks workspace URL                               [required]
  --github-owner      GitHub user/org for the repo                           [required unless --no-github]
  --no-github         Skip GitHub repo creation (local-only)
  --public            Make the GitHub repo public (default: private)
  --language          java | kotlin | python | nodejs    (default: java)
  --runner            self-hosted | github-hosted        (default: self-hosted)
  --tiers             1, 2, or 3. Tier count (features are NOT tiers).
                        1 = prod only           (features fork from prod)
                        2 = prod + staging      (features fork from staging)
                        3 = prod + staging + dev (features fork from dev)
                      When omitted, defaults to 1 (prod only, no extra tiers
                      cut). Architectural choice; surface this in your wizard
                      rather than picking silently.
  --enable-e2e        Force-enable Playwright E2E wire-up
  --no-e2e            Force-disable Playwright E2E wire-up
                      (default: on for --language nodejs, off otherwise)
  --enable-infra      Force-enable [Infra]-tag runner wire-up
  --no-infra          Force-disable [Infra]-tag runner wire-up
                      (default: on for --language nodejs, off otherwise)
  --ui-track          Mark the project as having a UI. The single source for the
  --no-ui-track       UX track: persists project.uiTrack (the drive reads it to
                      run the UX Designer + design-guide/IA + adherence gate) and,
                      when on, always wires the e2e harness. Default: off.
  --client            react | none. Frontend to scaffold under client/.
                      "react" lays down the first-class React + TS + Vite SPA
                      (Vitest + Testing Library + Playwright). Default: react
                      for a --ui-track project, none otherwise.
  --skip-commands     Skip scaffolding .claude/commands/{design,build}.md
                      (default: commands are written)
  --skip-doctor       Skip the environment preflight (lakebase-doctor) that
                      otherwise gates creation. Not recommended: a missing
                      prerequisite or a workspace without Lakebase then fails
                      partway through provisioning instead of up front.
  --agent-model       <role>=<model>, repeatable. Override a TDD role agent's
                      recommended model for this project (asked at setup; the
                      HIL's call). Roles: spec-author, architect-reviewer, dba,
                      test-strategist, ux-designer, navigator, driver,
                      product-owner. (release-engineer is deterministic, not a
                      tunable agent.) Omitted roles use their recommended model.
                      Persisted to .lakebase/agent-config.json.
  --detach            Re-launch scaffolding in a NEW session and return at once, so
                      the ~3-4 min provision never hits the harness ~2min bash timeout
                      and survives the turn ending. Captures the child's output (doctor
                      + every [stage] line + final JSON) to a log and prints the
                      consort-watch command to relay it poll-once. Use this to watch
                      each step live instead of a silent foreground call.
  --progress-log <p>  Tee the [stage] lines to this file too (structured relay sink).
  --json-input        Pass all args as a single JSON object (BDD harness)

Output: JSON on stdout (CreateProjectResult). Progress to stderr.
`;
async function main() {
  exportConsortVersionEnv();
  const rawArgv = process.argv.slice(2);
  const args = parseArgs(rawArgv);
  if (args.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (rawArgv.includes("--detach")) {
    const childArgs = rawArgv.filter((a) => a !== "--detach");
    const logPath = path8.join(os.tmpdir(), `consort-create-${Date.now()}.log`);
    let pid = null;
    try {
      const fd = openSync(logPath, "a");
      pid = relaunchDetached(childArgs, { stdio: ["ignore", fd, fd] });
      closeSync(fd);
    } catch {
      pid = null;
    }
    if (pid !== null) {
      process.stdout.write(
        `lakebase-create-project: scaffolding detached into its own session as pid ${pid} (survives this turn + the ~2min bash timeout).
  live log: ${logPath}
  relay it: consort-watch --since 0 --log ${logPath} --pid ${pid}   (re-poll with the printed cursor until status=done)
`
      );
      return 0;
    }
    process.stderr.write("lakebase-create-project: detach re-spawn failed \u2013 running in-process instead.\n");
  }
  let input;
  if (args.jsonInput) {
    try {
      input = JSON.parse(args.jsonInput);
    } catch (err) {
      process.stderr.write(`Failed to parse --json-input: ${err instanceof Error ? err.message : String(err)}
`);
      return 2;
    }
  } else {
    if (!args.projectName || !args.parentDir || !args.databricksHost) {
      process.stderr.write("Error: --project-name, --parent-dir, --databricks-host are required.\n\n" + HELP);
      return 2;
    }
    input = {
      projectName: args.projectName,
      parentDir: args.parentDir,
      databricksHost: args.databricksHost,
      githubOwner: args.githubOwner,
      createGithubRepo: args.createGithubRepo,
      privateRepo: args.privateRepo,
      language: args.language,
      runnerType: args.runnerType,
      tiers: args.tiers,
      enableE2e: args.enableE2e,
      enableInfra: args.enableInfra,
      uiTrack: args.uiTrack,
      clientFramework: args.clientFramework,
      skipCommands: args.skipCommands,
      agentModels: args.agentModels
    };
  }
  if (!args.skipDoctor) {
    process.stderr.write("[doctor] verifying environment before provisioning...\n");
    const gate = await runCreateDoctorGate({
      parentDir: input.parentDir,
      databricksHost: input.databricksHost,
      language: input.language
    });
    if (!gate.ok) {
      process.stderr.write("\n" + formatGateBlockers(gate.blockers) + "\n");
      return 2;
    }
    process.stderr.write("[doctor] environment ok\n");
  }
  {
    const declared = declaredSubstrateVersionFromModule(import.meta.url);
    let installed;
    try {
      const req = createRequire(import.meta.url);
      installed = JSON.parse(
        readFileSync11(req.resolve("@databricks-solutions/lakebase-scm-utils/package.json"), "utf8")
      ).version;
    } catch {
    }
    const mismatch = substrateMismatchMessage({ declared, installed, env: process.env });
    if (mismatch) {
      process.stderr.write("\n" + mismatch + "\n");
      return 2;
    }
  }
  const pin = kitRefPin(process.env, consortVersionFromModule(import.meta.url));
  if (pin) {
    process.env.LAKEBASE_KIT_REF = pin;
    process.stderr.write(
      `[kit-ref] pinning the scaffolded kit to ${pin} (immutable version \u2013 avoids mutable-main cache drift)
`
    );
  }
  if (args.progressLog) {
    try {
      writeFileSync9(args.progressLog, "");
    } catch {
    }
  }
  const result = await createProject(input, (step, detail) => {
    const line = `[${step}]${detail ? ` ${detail}` : ""}
`;
    process.stderr.write(line);
    if (args.progressLog) {
      try {
        appendFileSync(args.progressLog, line);
      } catch {
      }
    }
  });
  const recorded = recordDevKitLocalDirs(result.projectDir, process.env);
  if (recorded.length) {
    process.stderr.write(
      `[kit-ref] dev kit in use \u2014 recorded .lakebase/${recorded.join(", ")} so lk resolves your local kit for the pinned ref
`
    );
  }
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  return 0;
}
main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}
`);
    process.exit(1);
  }
);
