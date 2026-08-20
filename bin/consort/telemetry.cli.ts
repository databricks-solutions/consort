#!/usr/bin/env node
// consort-telemetry: inspect + toggle Consort's Level-1 usage telemetry.
//
//   consort-telemetry status [--json]   show the consent state + install id
//   consort-telemetry enable            persist telemetry_enabled = true
//   consort-telemetry disable           persist telemetry_enabled = false
//
// The enable/disable decision + the persistent install id live in the home-dir
// config (~/.config/consort/telemetry.json, XDG-aware) , NOT the repo-committed
// `.consort/`. `status` also reports whether telemetry WOULD emit right now (the
// full consent conjunction against the live TTY + env) and whether a real
// endpoint is armed (it never is until a maintainer sets both the endpoint and
// the sign-off flag). See TELEMETRY.md.

import { isCliEntry } from "@databricks-solutions/lakebase-scm-utils/util";
import {
  TELEMETRY_LEVEL,
  TELEMETRY_SCHEMA,
} from "../../consort/telemetry/allowlist.js";
import { shouldEmitTelemetry } from "../../consort/telemetry/consent.js";
import { endpointMode } from "../../consort/telemetry/emitter.js";
import { ciBool } from "../../consort/telemetry/resource.js";
import {
  ensureInstallId,
  isTelemetryEnabled,
  setTelemetryEnabled,
  telemetryConfigFile,
  type HomeConfigDeps,
} from "../../consort/telemetry/home-config.js";

export interface TelemetryCliDeps extends HomeConfigDeps {
  out?: (s: string) => void;
  err?: (s: string) => void;
  isTTY?: boolean;
}

const HELP = `consort-telemetry , inspect + toggle Consort Level-1 usage telemetry

Usage:
  consort-telemetry status [--json]   Show consent state, install id, endpoint mode
  consort-telemetry enable            Persist telemetry_enabled = true
  consort-telemetry disable           Persist telemetry_enabled = false

Telemetry is PSEUDONYMOUS (a random per-install UUID, no PII) and, by default,
writes NOTHING off this machine (the sink is a local no-op until a maintainer
arms a real endpoint). Silence it any time with 'disable', DO_NOT_TRACK=1, or
CONSORT_TELEMETRY=0. See TELEMETRY.md.
`;

/** The status snapshot (also the --json shape). */
export interface TelemetryStatus {
  telemetry_enabled: boolean;
  install_id: string;
  will_emit_now: boolean;
  is_tty: boolean;
  in_ci: boolean;
  do_not_track: boolean;
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
    do_not_track: /^(1|true)$/i.test((env.DO_NOT_TRACK ?? "").trim()),
    killed: (env.CONSORT_TELEMETRY ?? "").trim() === "0",
    endpoint_armed: mode.willPost,
    config_file: telemetryConfigFile(deps),
    schema: TELEMETRY_SCHEMA,
    level: TELEMETRY_LEVEL,
  };
}

function renderStatus(s: TelemetryStatus): string {
  return (
    `consort telemetry (schema ${s.schema}, level ${s.level})\n` +
    `  enabled (persisted): ${s.telemetry_enabled}\n` +
    `  will emit now:       ${s.will_emit_now}\n` +
    `    tty:               ${s.is_tty}\n` +
    `    in CI:             ${s.in_ci}\n` +
    `    DO_NOT_TRACK:      ${s.do_not_track}\n` +
    `    CONSORT_TELEMETRY=0: ${s.killed}\n` +
    `  endpoint armed:      ${s.endpoint_armed} (default no-op sink until a maintainer signs off)\n` +
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
