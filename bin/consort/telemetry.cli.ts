#!/usr/bin/env node
// consort-telemetry: inspect + toggle Consort's usage telemetry.
//
//   consort-telemetry status [--json]     show consent state, level + install id
//   consort-telemetry enable [--level N]   persist telemetry_enabled = true (N = 1|2)
//   consort-telemetry disable              persist telemetry_enabled = false
//
// The enable/disable decision, the opt-in level, and the persistent install id
// live in the home-dir config (~/.config/consort/telemetry.json, XDG-aware) , NOT
// the repo-committed `.consort/`. Telemetry is OPT-OUT and armed by default:
// `status` reports whether it WOULD emit right now (the full consent conjunction
// against the live TTY + env), the resolved level, and whether the endpoint is
// armed (it is, by default; CONSORT_TELEMETRY_SIGNOFF=0 un-arms it). Level 2 is a
// separate, explicit opt-in (`enable --level 2`). See TELEMETRY.md.

import { isCliEntry } from "@databricks-solutions/lakebase-scm-utils/util";
import {
  TELEMETRY_SCHEMA,
  type TelemetryLevel,
} from "../../consort/telemetry/allowlist.js";
import { shouldEmitTelemetry } from "../../consort/telemetry/consent.js";
import { endpointMode } from "../../consort/telemetry/emitter.js";
import { ciBool } from "../../consort/telemetry/resource.js";
import {
  ensureInstallId,
  isTelemetryEnabled,
  resolveTelemetryLevel,
  setTelemetryEnabled,
  setTelemetryLevel,
  telemetryConfigFile,
  type HomeConfigDeps,
} from "../../consort/telemetry/home-config.js";

export interface TelemetryCliDeps extends HomeConfigDeps {
  out?: (s: string) => void;
  err?: (s: string) => void;
  isTTY?: boolean;
}

const HELP = `consort-telemetry , inspect + toggle Consort usage telemetry

Usage:
  consort-telemetry status [--json]     Show consent state, level, install id, endpoint
  consort-telemetry enable [--level N]  Persist telemetry_enabled = true (N = 1 or 2)
  consort-telemetry disable             Persist telemetry_enabled = false

Telemetry is PSEUDONYMOUS (a random per-install UUID, no PII) and OPT-OUT: by
default a normal interactive run reports to the Consort maintainers' endpoint ,
only allowlisted enums / counts / durations (no paths, code, or names). Opt out
any time with 'disable', CONSORT_TELEMETRY=0, or running non-interactively / in
CI; un-arm the endpoint entirely with CONSORT_TELEMETRY_SIGNOFF=0.

Level 2 is a SEPARATE, EXPLICIT opt-in (off by default) that captures more , per-
role turn timings + coarse repair/loop counts (still allowlisted, no free text).
Turn it on with 'enable --level 2' (or CONSORT_TELEMETRY_LEVEL=2); go back with
'enable --level 1'. See TELEMETRY.md.
`;

/** Parse an optional `--level N` / `--level=N` flag into a TelemetryLevel (1 or 2),
 *  or undefined when absent / unrecognized. */
function parseLevelFlag(argv: string[]): TelemetryLevel | undefined {
  const eq = argv.find((a) => a.startsWith("--level="));
  let raw = eq ? eq.slice("--level=".length) : undefined;
  if (raw === undefined) {
    const i = argv.indexOf("--level");
    if (i >= 0) raw = argv[i + 1];
  }
  if (raw === "2") return 2;
  if (raw === "1") return 1;
  return undefined;
}

/** The status snapshot (also the --json shape). */
export interface TelemetryStatus {
  telemetry_enabled: boolean;
  install_id: string;
  will_emit_now: boolean;
  is_tty: boolean;
  in_ci: boolean;
  killed: boolean;
  endpoint_armed: boolean;
  config_file: string;
  schema: string;
  level: number;
}

function buildStatus(deps: TelemetryCliDeps): TelemetryStatus {
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
    killed: (env.CONSORT_TELEMETRY ?? "").trim() === "0",
    endpoint_armed: mode.willPost,
    config_file: telemetryConfigFile(deps),
    schema: TELEMETRY_SCHEMA,
    level: resolveTelemetryLevel(deps),
  };
}

function renderStatus(s: TelemetryStatus): string {
  return (
    `consort telemetry (schema ${s.schema}, level ${s.level})\n` +
    `  enabled (persisted): ${s.telemetry_enabled}\n` +
    `  will emit now:       ${s.will_emit_now}\n` +
    `    tty:               ${s.is_tty}\n` +
    `    in CI:             ${s.in_ci}\n` +
    `    CONSORT_TELEMETRY=0: ${s.killed}\n` +
    `  endpoint armed:      ${s.endpoint_armed} (opt-out, armed by default; CONSORT_TELEMETRY_SIGNOFF=0 to un-arm)\n` +
    `  install id:          ${s.install_id}\n` +
    `  config file:         ${s.config_file}\n`
  );
}

/** Run the CLI. Returns the process exit code. Never throws. */
export function runTelemetryCli(argv: string[], deps: TelemetryCliDeps = {}): number {
  const out = deps.out ?? ((s: string) => process.stdout.write(s));
  const err = deps.err ?? ((s: string) => process.stderr.write(s));
  const cmd = argv[0];
  const json = argv.includes("--json");

  switch (cmd) {
    case "status": {
      const status = buildStatus(deps);
      out(json ? JSON.stringify(status, null, 2) + "\n" : renderStatus(status));
      return 0;
    }
    case "enable": {
      setTelemetryEnabled(true, deps);
      const requested = parseLevelFlag(argv);
      if (requested !== undefined) setTelemetryLevel(requested, deps);
      const level = resolveTelemetryLevel(deps);
      out(
        json
          ? JSON.stringify({ telemetry_enabled: true, level }, null, 2) + "\n"
          : `telemetry enabled (level ${level})\n`,
      );
      return 0;
    }
    case "disable": {
      const cfg = setTelemetryEnabled(false, deps);
      out(json ? JSON.stringify({ telemetry_enabled: cfg.telemetry_enabled }, null, 2) + "\n" : "telemetry disabled\n");
      return 0;
    }
    case "--help":
    case "-h":
    case undefined:
      out(HELP);
      return 0;
    default:
      err(`consort-telemetry: unknown command "${cmd}"\n\n${HELP}`);
      return 2;
  }
}

if (isCliEntry(import.meta.url)) {
  process.exit(runTelemetryCli(process.argv.slice(2)));
}
