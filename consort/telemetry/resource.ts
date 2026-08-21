// Build the Resource attributes (shipped once per trace) from the environment,
// with every constrained field NORMALIZED into its closed enum. Non-enum strings
// are limited to structured identifiers (schema, the persistent install_id, and
// the consort / node version strings) , never free text. An unrecognized
// platform / arch / shell collapses to the enum's "other" / "unknown" bucket, so
// a novel value can never leak as a raw string.

import { kitVersion } from "../config/kit-bin.js";
import {
  ARCH_VALUES,
  OS_VALUES,
  SHELL_VALUES,
  TELEMETRY_SCHEMA,
  type ArchValue,
  type OsValue,
  type ShellValue,
  type TelemetryLevel,
} from "./allowlist.js";
import { ensureInstallId, resolveTelemetryLevel, type HomeConfigDeps } from "./home-config.js";
import type { ResourceAttrs } from "./spans.js";

/** Normalize a Node platform string into the os enum. */
export function normalizeOs(platform: string): OsValue {
  return (OS_VALUES as readonly string[]).includes(platform) ? (platform as OsValue) : "other";
}

/** Normalize a Node arch string into the arch enum. */
export function normalizeArch(arch: string): ArchValue {
  return (ARCH_VALUES as readonly string[]).includes(arch) ? (arch as ArchValue) : "other";
}

/** Classify the invoking shell into the shell enum. Reads $SHELL (POSIX) or
 *  detects PowerShell on Windows; anything unrecognized is "unknown". */
export function normalizeShell(env: NodeJS.ProcessEnv): ShellValue {
  const shellPath = (env.SHELL ?? "").trim();
  const base = shellPath.split(/[\\/]/).pop()?.toLowerCase() ?? "";
  if (base === "zsh" || base === "bash" || base === "fish") return base;
  if (base === "pwsh" || base === "powershell") return "powershell";
  // Windows / no $SHELL: PowerShell leaves PSModulePath; a bare ComSpec is cmd.exe (unknown).
  if (env.PSModulePath && !env.SHELL) return "powershell";
  return "unknown";
}

/** Whether this run is in CI (mirrors the consent CI check , any set,
 *  non-empty, non-0/false value counts). */
export function ciBool(env: NodeJS.ProcessEnv): boolean {
  const v = (env.CI ?? "").trim();
  return v !== "" && !/^(0|false)$/i.test(v);
}

/** Overridable inputs so tests fix the platform / arch / tty / version and point
 *  install_id at a temp config dir. */
export interface ResourceDeps extends HomeConfigDeps {
  platform?: string;
  arch?: string;
  isTTY?: boolean;
  /** Override the consort version (defaults to kitVersion()). */
  version?: string;
  /** Override the active telemetry level (defaults to resolveTelemetryLevel(deps)). */
  level?: TelemetryLevel;
}

/**
 * Assemble the Resource attributes. Calling this MINTS the install_id on first
 * use (via ensureInstallId), so it is only invoked once consent has passed.
 */
export function buildResourceAttrs(deps: ResourceDeps = {}): ResourceAttrs {
  const env = deps.env ?? process.env;
  return {
    schema: TELEMETRY_SCHEMA,
    install_id: ensureInstallId(deps),
    consort_version: deps.version ?? kitVersion(),
    node_version: process.versions.node,
    os: normalizeOs(deps.platform ?? process.platform),
    arch: normalizeArch(deps.arch ?? process.arch),
    shell: normalizeShell(env),
    ci: ciBool(env),
    tty: deps.isTTY ?? !!process.stdout.isTTY,
    level: deps.level ?? resolveTelemetryLevel(deps),
  };
}
