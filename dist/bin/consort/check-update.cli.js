#!/usr/bin/env node

// bin/consort/check-update.cli.ts
import * as fs3 from "fs";
import * as path3 from "path";
import { fileURLToPath } from "url";
import { isCliEntry } from "@databricks-solutions/lakebase-scm-utils/util";

// consort/update/check-update.ts
import { execFileSync } from "child_process";
import * as fs2 from "fs";
import * as path2 from "path";

// consort/telemetry/home-config.ts
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { randomUUID } from "crypto";
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
    const out = execFileSync("git", ["ls-remote", "--tags", repo], {
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
    const root = path3.resolve(path3.dirname(fileURLToPath(import.meta.url)), "../../..");
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
if (isCliEntry(import.meta.url)) {
  process.exit(runCheckUpdate(process.argv.slice(2)));
}
export {
  runCheckUpdate
};
