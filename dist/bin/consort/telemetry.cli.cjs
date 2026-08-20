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

// bin/consort/telemetry.cli.ts
var telemetry_cli_exports = {};
__export(telemetry_cli_exports, {
  runTelemetryCli: () => runTelemetryCli
});
module.exports = __toCommonJS(telemetry_cli_exports);

// node_modules/tsup/assets/cjs_shims.js
var getImportMetaUrl = () => typeof document === "undefined" ? new URL(`file:${__filename}`).href : document.currentScript && document.currentScript.tagName.toUpperCase() === "SCRIPT" ? document.currentScript.src : new URL("main.js", document.baseURI).href;
var importMetaUrl = /* @__PURE__ */ getImportMetaUrl();

// bin/consort/telemetry.cli.ts
var import_util = require("@databricks-solutions/lakebase-scm-utils/util");

// consort/telemetry/allowlist.ts
var TELEMETRY_SCHEMA = "consort/v1";
var TELEMETRY_LEVEL = 1;
var RESOURCE_ATTR_KEYS = [
  "schema",
  "install_id",
  "consort_version",
  "node_version",
  "os",
  "arch",
  "shell",
  "ci",
  "tty",
  "level"
];
var GATE_KINDS = [
  "invoke-role",
  "project-architect-notes",
  "surface-gate",
  "approve-gate",
  "design-complete",
  "approve-plan-gate",
  "planning-complete",
  "dispatch",
  "cut-experiment",
  "deploy-verify-heal",
  "await-acceptance",
  "accept",
  "complete",
  "feature-complete",
  "deploy",
  "approve-deploy-gate",
  "deploy-complete",
  "prepare-pr",
  "wait-ci",
  "approve-promote-gate",
  "merge",
  "raise-to-hil",
  "revise-route",
  "done"
];
var RESOURCE_KEY_SET = new Set(RESOURCE_ATTR_KEYS);
var GATE_KIND_SET = new Set(GATE_KINDS);

// consort/telemetry/consent.ts
var doNotTrack = (env) => {
  const v = (env.DO_NOT_TRACK ?? "").trim().toLowerCase();
  return v === "1" || v === "true";
};
var inCi = (env) => {
  const v = (env.CI ?? "").trim();
  if (v === "") return false;
  return !/^(0|false)$/i.test(v);
};
var killed = (env) => (env.CONSORT_TELEMETRY ?? "").trim() === "0";
function shouldEmitTelemetry(inp) {
  if (killed(inp.env)) return false;
  if (doNotTrack(inp.env)) return false;
  if (inCi(inp.env)) return false;
  if (!inp.isTTY) return false;
  if (!inp.telemetryEnabled) return false;
  return true;
}

// consort/telemetry/spans.ts
var import_node_crypto = require("crypto");

// consort/telemetry/emitter.ts
function endpointMode(env) {
  const endpoint = env.CONSORT_TELEMETRY_ENDPOINT?.trim() || void 0;
  const signedOff = /^(1|true)$/i.test((env.CONSORT_TELEMETRY_SIGNOFF ?? "").trim());
  return { endpoint, signedOff, willPost: !!endpoint && signedOff };
}

// consort/config/kit-bin.ts
var import_node_child_process = require("child_process");
var fs = __toESM(require("fs"), 1);
var path = __toESM(require("path"), 1);

// consort/telemetry/home-config.ts
var fs2 = __toESM(require("fs"), 1);
var os = __toESM(require("os"), 1);
var path2 = __toESM(require("path"), 1);
var import_node_crypto2 = require("crypto");
var DEFAULT_TELEMETRY_ENABLED = true;
var UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
var isUuidV4 = (s) => typeof s === "string" && UUID_V4.test(s);
function telemetryConfigDir(deps = {}) {
  const env = deps.env ?? process.env;
  const xdg = env.XDG_CONFIG_HOME?.trim();
  const base = xdg && xdg.length > 0 ? xdg : path2.join(deps.homedir ?? os.homedir(), ".config");
  return path2.join(base, "consort");
}
function telemetryConfigFile(deps = {}) {
  return path2.join(telemetryConfigDir(deps), "telemetry.json");
}
function readStoredConfig(deps = {}) {
  let raw;
  try {
    raw = fs2.readFileSync(telemetryConfigFile(deps), "utf8");
  } catch {
    return null;
  }
  try {
    const data = JSON.parse(raw);
    if (!isUuidV4(data.install_id)) return null;
    const telemetry_enabled = typeof data.telemetry_enabled === "boolean" ? data.telemetry_enabled : DEFAULT_TELEMETRY_ENABLED;
    return { install_id: data.install_id, telemetry_enabled };
  } catch {
    return null;
  }
}
function writeStoredConfig(cfg, deps = {}) {
  const dir = telemetryConfigDir(deps);
  fs2.mkdirSync(dir, { recursive: true });
  fs2.writeFileSync(telemetryConfigFile(deps), JSON.stringify(cfg, null, 2) + "\n", "utf8");
  return cfg;
}
function ensureInstallId(deps = {}) {
  const existing = readStoredConfig(deps);
  if (existing) return existing.install_id;
  return writeStoredConfig({ install_id: (0, import_node_crypto2.randomUUID)(), telemetry_enabled: DEFAULT_TELEMETRY_ENABLED }, deps).install_id;
}
function isTelemetryEnabled(deps = {}) {
  return (readStoredConfig(deps) ?? { telemetry_enabled: DEFAULT_TELEMETRY_ENABLED }).telemetry_enabled;
}
function setTelemetryEnabled(enabled, deps = {}) {
  const existing = readStoredConfig(deps);
  const install_id = existing?.install_id ?? (0, import_node_crypto2.randomUUID)();
  return writeStoredConfig({ install_id, telemetry_enabled: enabled }, deps);
}

// consort/telemetry/resource.ts
function ciBool(env) {
  const v = (env.CI ?? "").trim();
  return v !== "" && !/^(0|false)$/i.test(v);
}

// bin/consort/telemetry.cli.ts
var HELP = `consort-telemetry , inspect + toggle Consort Level-1 usage telemetry

Usage:
  consort-telemetry status [--json]   Show consent state, install id, endpoint mode
  consort-telemetry enable            Persist telemetry_enabled = true
  consort-telemetry disable           Persist telemetry_enabled = false

Telemetry is PSEUDONYMOUS (a random per-install UUID, no PII) and, by default,
writes NOTHING off this machine (the sink is a local no-op until a maintainer
arms a real endpoint). Silence it any time with 'disable', DO_NOT_TRACK=1, or
CONSORT_TELEMETRY=0. See TELEMETRY.md.
`;
function buildStatus(deps) {
  const env = deps.env ?? process.env;
  const isTTY = deps.isTTY ?? !!process.stdout.isTTY;
  const telemetry_enabled = isTelemetryEnabled(deps);
  const install_id = ensureInstallId(deps);
  const mode = endpointMode(env);
  return {
    telemetry_enabled,
    install_id,
    will_emit_now: shouldEmitTelemetry({ telemetryEnabled: telemetry_enabled, isTTY, env }),
    is_tty: isTTY,
    in_ci: ciBool(env),
    do_not_track: /^(1|true)$/i.test((env.DO_NOT_TRACK ?? "").trim()),
    killed: (env.CONSORT_TELEMETRY ?? "").trim() === "0",
    endpoint_armed: mode.willPost,
    config_file: telemetryConfigFile(deps),
    schema: TELEMETRY_SCHEMA,
    level: TELEMETRY_LEVEL
  };
}
function renderStatus(s) {
  return `consort telemetry (schema ${s.schema}, level ${s.level})
  enabled (persisted): ${s.telemetry_enabled}
  will emit now:       ${s.will_emit_now}
    tty:               ${s.is_tty}
    in CI:             ${s.in_ci}
    DO_NOT_TRACK:      ${s.do_not_track}
    CONSORT_TELEMETRY=0: ${s.killed}
  endpoint armed:      ${s.endpoint_armed} (default no-op sink until a maintainer signs off)
  install id:          ${s.install_id}
  config file:         ${s.config_file}
`;
}
function runTelemetryCli(argv, deps = {}) {
  const out = deps.out ?? ((s) => process.stdout.write(s));
  const err = deps.err ?? ((s) => process.stderr.write(s));
  const cmd = argv[0];
  const json = argv.includes("--json");
  switch (cmd) {
    case "status": {
      const status = buildStatus(deps);
      out(json ? JSON.stringify(status, null, 2) + "\n" : renderStatus(status));
      return 0;
    }
    case "enable": {
      const cfg = setTelemetryEnabled(true, deps);
      out(json ? JSON.stringify({ telemetry_enabled: cfg.telemetry_enabled }, null, 2) + "\n" : "telemetry enabled\n");
      return 0;
    }
    case "disable": {
      const cfg = setTelemetryEnabled(false, deps);
      out(json ? JSON.stringify({ telemetry_enabled: cfg.telemetry_enabled }, null, 2) + "\n" : "telemetry disabled\n");
      return 0;
    }
    case "--help":
    case "-h":
    case void 0:
      out(HELP);
      return 0;
    default:
      err(`consort-telemetry: unknown command "${cmd}"

${HELP}`);
      return 2;
  }
}
if ((0, import_util.isCliEntry)(importMetaUrl)) {
  process.exit(runTelemetryCli(process.argv.slice(2)));
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  runTelemetryCli
});
//# sourceMappingURL=telemetry.cli.cjs.map