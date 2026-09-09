#!/usr/bin/env node

// node_modules/tsup/assets/esm_shims.js
import path from "path";
import { fileURLToPath } from "url";
var getFilename = () => fileURLToPath(import.meta.url);
var getDirname = () => path.dirname(getFilename());
var __dirname = /* @__PURE__ */ getDirname();

// bin/consort/preflight.cli.ts
import { writeFileSync as writeFileSync3 } from "fs";

// consort/session/preflight.ts
import { execFileSync } from "child_process";
import { existsSync as existsSync3, readFileSync as readFileSync4 } from "fs";
import { homedir as homedir2 } from "os";
import { join as join4 } from "path";

// consort/config/kit-bin.ts
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path2 from "path";
var kitRootCache;
function resolveKitRoot() {
  if (kitRootCache !== void 0) return kitRootCache;
  const env = process.env.LAKEBASE_KIT_DIR?.trim();
  kitRootCache = env && fs.existsSync(path2.join(env, "package.json")) ? env : path2.resolve(__dirname, "..", "..", "..");
  return kitRootCache;
}
function kitVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path2.join(resolveKitRoot(), "package.json"), "utf8"));
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

// consort/config/consort-paths.ts
import * as fs2 from "fs";
import { join as join2 } from "path";
var ARTIFACT_ROOT = ".consort";
var LEGACY_ARTIFACT_ROOTS = [".sftdd", ".tdd"];
var ALL_ARTIFACT_ROOTS = [ARTIFACT_ROOT, ...LEGACY_ARTIFACT_ROOTS];
function resolveConsortDir(projectDir = process.cwd()) {
  const next = join2(projectDir, ARTIFACT_ROOT);
  if (fs2.existsSync(next)) return next;
  for (const legacyName of LEGACY_ARTIFACT_ROOTS) {
    const legacy = join2(projectDir, legacyName);
    if (fs2.existsSync(legacy)) return legacy;
  }
  return next;
}

// consort/telemetry/home-config.ts
import * as fs3 from "fs";
import * as os from "os";
import * as path3 from "path";
import { randomUUID } from "crypto";
var DEFAULT_TELEMETRY_ENABLED = true;
var DEFAULT_TELEMETRY_LEVEL = 1;
var UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
var isUuidV4 = (s) => typeof s === "string" && UUID_V4.test(s);
function telemetryConfigDir(deps = {}) {
  const env = deps.env ?? process.env;
  const xdg = env.XDG_CONFIG_HOME?.trim();
  const base = xdg && xdg.length > 0 ? xdg : path3.join(deps.homedir ?? os.homedir(), ".config");
  return path3.join(base, "consort");
}
function telemetryConfigFile(deps = {}) {
  return path3.join(telemetryConfigDir(deps), "telemetry.json");
}
function readStoredConfig(deps = {}) {
  let raw;
  try {
    raw = fs3.readFileSync(telemetryConfigFile(deps), "utf8");
  } catch {
    return null;
  }
  try {
    const data = JSON.parse(raw);
    if (!isUuidV4(data.install_id)) return null;
    const telemetry_enabled = typeof data.telemetry_enabled === "boolean" ? data.telemetry_enabled : DEFAULT_TELEMETRY_ENABLED;
    const telemetry_level = data.telemetry_level === 2 ? 2 : DEFAULT_TELEMETRY_LEVEL;
    const l2_opt_in_notified = data.l2_opt_in_notified === true;
    const acknowledged = data.acknowledged === true;
    const beacon_sent = data.beacon_sent === true;
    return { install_id: data.install_id, telemetry_enabled, telemetry_level, l2_opt_in_notified, acknowledged, beacon_sent };
  } catch {
    return null;
  }
}

// consort/session/preflight.ts
function tryExec(cmd, args, cwd, timeoutMs = 4e3) {
  try {
    return execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: timeoutMs }).trim();
  } catch {
    return null;
  }
}
function firstProjectMarker(env, home) {
  const base = env.XDG_CONFIG_HOME?.trim() || join4(home, ".config");
  return join4(base, "consort", "first-project-offered");
}
function insideEditor(env) {
  return env.TERM_PROGRAM === "vscode" || typeof env.VSCODE_GIT_IPC_HANDLE === "string" || typeof env.CURSOR_TRACE_ID === "string" || typeof env.VSCODE_PID === "string";
}
function buildPreflight(projectDir = process.cwd(), deps = {}) {
  const env = deps.env ?? process.env;
  const home = deps.home ?? homedir2();
  const warnings = [];
  const project = { is_consort: false, phase: null, next_action: null, awaiting_human: null, feature: null };
  try {
    const consortDir = resolveConsortDir(projectDir);
    project.is_consort = existsSync3(consortDir);
    const nextPath = join4(consortDir, "next.json");
    if (existsSync3(nextPath)) {
      const n = JSON.parse(readFileSync4(nextPath, "utf8"));
      project.awaiting_human = typeof n.awaiting_human === "boolean" ? n.awaiting_human : null;
      project.feature = typeof n.feature === "string" ? n.feature : null;
      project.next_action = typeof n.primary_action?.kind === "string" ? n.primary_action.kind : null;
      const phase = n.state?.derived_phase ?? n.state?.coarse_phase;
      project.phase = typeof phase === "string" ? phase : null;
    }
  } catch {
    warnings.push("project: could not read .consort/next.json");
  }
  const kit = { version: kitVersion(), ref: null, ref_local: null };
  const readRef = (rel) => {
    try {
      const p = join4(projectDir, ".lakebase", rel);
      return existsSync3(p) ? readFileSync4(p, "utf8").trim() || null : null;
    } catch {
      return null;
    }
  };
  kit.ref = readRef("kit-ref");
  kit.ref_local = readRef("kit-ref.local");
  const telemetry = { acknowledged: false, level: null };
  try {
    const cfg = readStoredConfig({ env, homedir: home });
    if (cfg) {
      telemetry.acknowledged = cfg.acknowledged === true;
      telemetry.level = typeof cfg.telemetry_level === "number" ? cfg.telemetry_level : null;
    }
  } catch {
    warnings.push("telemetry: could not read stored config");
  }
  const scm = { branch: null, dirty: null };
  const branch = tryExec("git", ["rev-parse", "--abbrev-ref", "HEAD"], projectDir);
  if (branch !== null) {
    scm.branch = branch || null;
    const porcelain = tryExec("git", ["status", "--porcelain"], projectDir);
    scm.dirty = porcelain === null ? null : porcelain.length > 0;
  } else {
    warnings.push("scm: not a git repo or git unavailable");
  }
  let offeredBefore = false;
  try {
    offeredBefore = existsSync3(firstProjectMarker(env, home));
  } catch {
    warnings.push("first_project: could not stat the marker");
  }
  return {
    preflight_at: (/* @__PURE__ */ new Date()).toISOString(),
    project,
    kit,
    telemetry,
    scm,
    first_project: { offered_before: offeredBefore },
    env: { inside_editor: insideEditor(env) },
    warnings
  };
}

// bin/consort/preflight.cli.ts
function parse(argv) {
  const out = { projectDir: process.cwd(), help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--project-dir" && i + 1 < argv.length) out.projectDir = argv[++i];
    else if (a === "--output" && i + 1 < argv.length) out.output = argv[++i];
    else if (a === "-h" || a === "--help") out.help = true;
  }
  return out;
}
var HELP = `consort-preflight \u2013 compose the pre-session state blob (kit, project, telemetry, scm, env)

Usage:
  consort-preflight [--project-dir <path>] [--output <path>]

Emits JSON to stdout (and to --output when given). Best-effort + always exits 0;
a missing/unreadable source reads as null/false, never an error. The blob is a
cache the session reads once \u2014 re-derive on staleness or before mutating actions.
`;
function main() {
  const p = parse(process.argv.slice(2));
  if (p.help) {
    process.stdout.write(HELP);
    return 0;
  }
  let json;
  try {
    json = JSON.stringify(buildPreflight(p.projectDir), null, 2);
  } catch (err) {
    json = JSON.stringify({ preflight_at: (/* @__PURE__ */ new Date()).toISOString(), warnings: [`preflight failed: ${err instanceof Error ? err.message : String(err)}`] }, null, 2);
  }
  if (p.output) {
    try {
      writeFileSync3(p.output, json + "\n");
    } catch {
    }
  }
  process.stdout.write(json + "\n");
  return 0;
}
process.exit(main());
