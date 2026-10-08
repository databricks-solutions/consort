#!/usr/bin/env node

// bin/consort/check-pin-lag.cli.ts
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
    const root = path3.resolve(path3.dirname(fileURLToPath(import.meta.url)), "../../..");
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
if (isCliEntry(import.meta.url)) {
  process.exit(runCheckPinLag(process.argv.slice(2)));
}
export {
  readProjectPin,
  runCheckPinLag
};
