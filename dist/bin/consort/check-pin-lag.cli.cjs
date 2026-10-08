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

// bin/consort/check-pin-lag.cli.ts
var check_pin_lag_cli_exports = {};
__export(check_pin_lag_cli_exports, {
  readProjectPin: () => readProjectPin,
  runCheckPinLag: () => runCheckPinLag
});
module.exports = __toCommonJS(check_pin_lag_cli_exports);

// node_modules/tsup/assets/cjs_shims.js
var getImportMetaUrl = () => typeof document === "undefined" ? new URL(`file:${__filename}`).href : document.currentScript && document.currentScript.tagName.toUpperCase() === "SCRIPT" ? document.currentScript.src : new URL("main.js", document.baseURI).href;
var importMetaUrl = /* @__PURE__ */ getImportMetaUrl();

// bin/consort/check-pin-lag.cli.ts
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

// consort/update/check-update.ts
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
function formatPinLagNotice(pin, plugin) {
  return `[consort] This project's runtime kit is pinned to ${pin}, but your installed plugin is ${plugin}.
          The project will keep running the OLDER kit until you move it (at a stop):
            ./scripts/lk consort-upgrade --pid <drive-pid>
          (dual-pins .lakebase/kit-ref + kit-ref.local to ${plugin}; a plain --warm does NOT move the pin)
`;
}
function checkPinLag(pin, plugin) {
  const behind = !!pin && isNewer(plugin, pin);
  return { pin, plugin, behind, notice: behind ? formatPinLagNotice(pin, plugin) : void 0 };
}

// bin/consort/check-pin-lag.cli.ts
function selfVersion() {
  try {
    const root = path3.resolve(path3.dirname((0, import_node_url.fileURLToPath)(importMetaUrl)), "../../..");
    const pkg = JSON.parse(fs3.readFileSync(path3.join(root, "package.json"), "utf8"));
    return pkg.version ? `v${pkg.version}` : "v0.0.0";
  } catch {
    return "v0.0.0";
  }
}
function readProjectPin(cwd = process.cwd()) {
  for (const rel of [".lakebase/kit-ref.local", ".lakebase/kit-ref"]) {
    try {
      const v = fs3.readFileSync(path3.join(cwd, rel), "utf8").trim();
      if (v) return v;
    } catch {
    }
  }
  return void 0;
}
function runCheckPinLag(argv) {
  try {
    const force = argv.includes("--force");
    const r = checkPinLag(readProjectPin(), selfVersion());
    if (r.notice) process.stdout.write(r.notice);
    else if (force) {
      process.stdout.write(
        r.pin ? `[consort] Project pin ${r.pin} is current with the installed plugin ${r.plugin}.
` : `[consort] This project has no .lakebase/kit-ref pin (resolves the installed plugin ${r.plugin}).
`
      );
    }
  } catch {
  }
  return 0;
}
if ((0, import_util.isCliEntry)(importMetaUrl)) {
  process.exit(runCheckPinLag(process.argv.slice(2)));
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  readProjectPin,
  runCheckPinLag
});
