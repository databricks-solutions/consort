#!/usr/bin/env node
// consort-check-pin-lag: print a notice when THIS project's runtime-kit pin
// (.lakebase/kit-ref.local ?? .lakebase/kit-ref) is behind the version of the kit RUNNING
// this command. Run it from the PLUGIN copy (always current) — e.g. the plugin's
// commands/start.md invokes it on resume — so "self version" IS the installed plugin
// version and the comparison surfaces the exact gap that consort-check-update's
// network/throttle path cannot: a plugin that was upgraded while the project stayed pinned
// to the older kit. LOCAL + network-free + un-throttled; silent when the pin is current.
//
// Usage: consort-check-pin-lag [--force]   (--force also prints the aligned/no-pin case)
// Exit code is ALWAYS 0: this must never fail a caller.

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { isCliEntry } from "@databricks-solutions/lakebase-scm-utils/util";
import { checkPinLag } from "../../consort/update/check-update.js";

/** The version of the kit running THIS command, read from its own package.json. When invoked
 *  from the plugin copy this is the installed plugin version. */
function selfVersion(): string {
  try {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")) as { version?: string };
    return pkg.version ? `v${pkg.version}` : "v0.0.0";
  } catch {
    return "v0.0.0";
  }
}

/** The project's EFFECTIVE runtime-kit pin: the run pin (kit-ref.local) wins over the
 *  committed CI pin (kit-ref); undefined when the project is unpinned. Read from cwd. */
export function readProjectPin(cwd: string = process.cwd()): string | undefined {
  for (const rel of [".lakebase/kit-ref.local", ".lakebase/kit-ref"]) {
    try {
      const v = fs.readFileSync(path.join(cwd, rel), "utf8").trim();
      if (v) return v;
    } catch {
      /* missing file — try the next candidate */
    }
  }
  return undefined;
}

export function runCheckPinLag(argv: string[]): number {
  try {
    const force = argv.includes("--force");
    const r = checkPinLag(readProjectPin(), selfVersion());
    if (r.notice) process.stdout.write(r.notice);
    else if (force) {
      process.stdout.write(
        r.pin
          ? `[consort] Project pin ${r.pin} is current with the installed plugin ${r.plugin}.\n`
          : `[consort] This project has no .lakebase/kit-ref pin (resolves the installed plugin ${r.plugin}).\n`,
      );
    }
  } catch {
    /* never fail the caller */
  }
  return 0;
}

if (isCliEntry(import.meta.url)) {
  process.exit(runCheckPinLag(process.argv.slice(2)));
}
