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

// bin/consort/check-update.cli.ts
var check_update_cli_exports = {};
__export(check_update_cli_exports, {
  runCheckUpdate: () => runCheckUpdate
});
module.exports = __toCommonJS(check_update_cli_exports);

// node_modules/tsup/assets/cjs_shims.js
var getImportMetaUrl = () => typeof document === "undefined" ? new URL(`file:${__filename}`).href : document.currentScript && document.currentScript.tagName.toUpperCase() === "SCRIPT" ? document.currentScript.src : new URL("main.js", document.baseURI).href;
var importMetaUrl = /* @__PURE__ */ getImportMetaUrl();

// bin/consort/check-update.cli.ts
var fs3 = __toESM(require("fs"), 1);
var path3 = __toESM(require("path"), 1);
var import_node_url = require("url");
var import_util = require("@databricks-solutions/lakebase-scm-utils/util");

// consort/update/check-update.ts
var import_node_child_process = require("child_process");
var fs2 = __toESM(require("fs"), 1);
var path2 = __toESM(require("path"), 1);

// consort/telemetry/home-config.ts
var fs = __toESM(require("fs"), 1);
var os = __toESM(require("os"), 1);
var path = __toESM(require("path"), 1);
var import_node_crypto = require("crypto");
function telemetryConfigDir(deps = {}) {
  const env = deps.env ?? process.env;
  const xdg = env.XDG_CONFIG_HOME?.trim();
  const base = xdg && xdg.length > 0 ? xdg : path.join(deps.homedir ?? os.homedir(), ".config");
  return path.join(base, "consort");
}

// consort/update/check-update.ts
var CONSORT_REPO = "https://github.com/databricks-solutions/consort";
var DEFAULT_THROTTLE_MS = 24 * 60 * 60 * 1e3;
function parseSemver(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}
function isNewer(latest, installed) {
  const a = parseSemver(latest);
  const b = parseSemver(installed);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return false;
}
function fetchLatestTag(repo = CONSORT_REPO, timeoutMs = 4e3) {
  try {
    const out = (0, import_node_child_process.execFileSync)("git", ["ls-remote", "--tags", repo], {
      timeout: timeoutMs,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
    let best = null;
    let bestStr;
    for (const line of out.split("\n")) {
      const m = /refs\/tags\/(v\d+\.\d+\.\d+)(\^\{\})?$/.exec(line.trim());
      if (!m || m[2]) continue;
      const parsed = parseSemver(m[1]);
      if (!parsed) continue;
      if (!best || parsed[0] > best[0] || parsed[0] === best[0] && (parsed[1] > best[1] || parsed[1] === best[1] && parsed[2] > best[2])) {
        best = parsed;
        bestStr = m[1];
      }
    }
    return bestStr;
  } catch {
    return void 0;
  }
}
function stateFile(deps) {
  return path2.join(telemetryConfigDir(deps), "update-check.json");
}
function readState(deps) {
  try {
    return JSON.parse(fs2.readFileSync(stateFile(deps), "utf8"));
  } catch {
    return {};
  }
}
function writeState(deps, s) {
  try {
    fs2.mkdirSync(telemetryConfigDir(deps), { recursive: true });
    fs2.writeFileSync(stateFile(deps), JSON.stringify(s, null, 2) + "\n", "utf8");
  } catch {
  }
}
function formatUpdateNotice(installed, latest) {
  return `[consort] A newer Consort is available: ${latest} (you have ${installed}).
          Update the plugin:  claude plugin marketplace update databricks-solutions \\
                              && claude plugin update consort@databricks-solutions
          Move a project onto it (at a stop): ./scripts/lk consort-upgrade --pid <drive-pid>
          (advances .lakebase/kit-ref to ${latest}; a plain --warm does NOT move the pin)
`;
}
function checkForUpdate(deps) {
  const now = (deps.now ?? Date.now)();
  const throttleMs = deps.throttleMs ?? DEFAULT_THROTTLE_MS;
  const state = readState(deps);
  const versionChanged = state.last_installed !== void 0 && state.last_installed !== deps.installedVersion;
  const due = deps.force || versionChanged || state.last_check_ms === void 0 || now - state.last_check_ms >= throttleMs;
  let latest = state.last_latest;
  let checkedNetwork = false;
  if (due) {
    const fetched = (deps.fetchLatest ?? (() => fetchLatestTag()))();
    checkedNetwork = true;
    writeState(deps, { last_check_ms: now, last_latest: fetched ?? state.last_latest, last_installed: deps.installedVersion });
    if (fetched) latest = fetched;
  }
  const behind = !!latest && isNewer(latest, deps.installedVersion);
  return {
    installed: deps.installedVersion,
    latest,
    behind,
    notice: behind ? formatUpdateNotice(deps.installedVersion, latest) : void 0,
    checkedNetwork
  };
}

// bin/consort/check-update.cli.ts
function installedVersion() {
  try {
    const root = path3.resolve(path3.dirname((0, import_node_url.fileURLToPath)(importMetaUrl)), "../../..");
    const pkg = JSON.parse(fs3.readFileSync(path3.join(root, "package.json"), "utf8"));
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}
function runCheckUpdate(argv) {
  try {
    const force = argv.includes("--force");
    const r = checkForUpdate({ installedVersion: installedVersion(), force });
    if (r.notice) process.stdout.write(r.notice);
    else if (force) process.stdout.write(`[consort] Up to date (${r.installed}${r.latest ? `, latest ${r.latest}` : ""}).
`);
  } catch {
  }
  return 0;
}
if ((0, import_util.isCliEntry)(importMetaUrl)) {
  process.exit(runCheckUpdate(process.argv.slice(2)));
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  runCheckUpdate
});
