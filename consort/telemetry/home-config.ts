// Home-directory telemetry config (XDG-aware): the per-install identity + the
// enable/disable decision.
//
// DELIBERATELY SEPARATE from the repo-committed `.consort/` (which is per-PROJECT
// workflow state, checked into the consumer's repo). The install id + consent are
// per-USER, per-MACHINE, and must never land in a project's git history, so they
// live under `~/.config/consort/telemetry.json` (honoring $XDG_CONFIG_HOME).
//
// `install_id` is a persistent UUIDv4 , the PSEUDONYMOUS handle Level 1 ships. It
// is created once, stable across reads, and regenerated only if the file is
// deleted (a user who wants a fresh identity deletes the file). No PII: a random
// v4 UUID carries nothing about the user or machine.
//
// All I/O takes an optional deps bag (env + homedir overrides) so tests point at
// a temp dir and never touch the real user config.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { randomUUID } from "node:crypto";

/** Overridable inputs, so tests isolate the config to a temp dir. */
export interface HomeConfigDeps {
  env?: NodeJS.ProcessEnv;
  /** Home dir override (defaults to os.homedir()); used only when $XDG_CONFIG_HOME is unset. */
  homedir?: string;
}

/** The persisted shape. `telemetry_enabled` is opt-out (defaults true); nothing
 *  leaves the machine regardless until a human flips the real endpoint (the sink
 *  defaults to a local no-op). */
export interface StoredTelemetryConfig {
  install_id: string;
  telemetry_enabled: boolean;
}

/** Default consent when no decision has been recorded yet (opt-out model, paired
 *  with the one-time first-run notice + the default no-op sink). */
export const DEFAULT_TELEMETRY_ENABLED = true;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuidV4 = (s: unknown): s is string => typeof s === "string" && UUID_V4.test(s);

/** The XDG-aware config dir: `$XDG_CONFIG_HOME/consort` else `~/.config/consort`. */
export function telemetryConfigDir(deps: HomeConfigDeps = {}): string {
  const env = deps.env ?? process.env;
  const xdg = env.XDG_CONFIG_HOME?.trim();
  const base = xdg && xdg.length > 0 ? xdg : path.join(deps.homedir ?? os.homedir(), ".config");
  return path.join(base, "consort");
}

/** The config file path (`<configDir>/telemetry.json`). */
export function telemetryConfigFile(deps: HomeConfigDeps = {}): string {
  return path.join(telemetryConfigDir(deps), "telemetry.json");
}

/** Read + validate the stored config. Returns null when absent/malformed or when
 *  the install id is missing/not a UUIDv4 (treated as "no identity yet"). Never
 *  writes. */
export function readStoredConfig(deps: HomeConfigDeps = {}): StoredTelemetryConfig | null {
  let raw: string;
  try {
    raw = fs.readFileSync(telemetryConfigFile(deps), "utf8");
  } catch {
    return null;
  }
  try {
    const data = JSON.parse(raw) as { install_id?: unknown; telemetry_enabled?: unknown };
    if (!isUuidV4(data.install_id)) return null;
    const telemetry_enabled =
      typeof data.telemetry_enabled === "boolean" ? data.telemetry_enabled : DEFAULT_TELEMETRY_ENABLED;
    return { install_id: data.install_id, telemetry_enabled };
  } catch {
    return null;
  }
}

function writeStoredConfig(cfg: StoredTelemetryConfig, deps: HomeConfigDeps = {}): StoredTelemetryConfig {
  const dir = telemetryConfigDir(deps);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(telemetryConfigFile(deps), JSON.stringify(cfg, null, 2) + "\n", "utf8");
  return cfg;
}

/**
 * The persistent per-install id. Created once (fresh UUIDv4 + default consent),
 * stable across calls, regenerated only if the file was deleted. This is the ONE
 * place install_id is minted.
 */
export function ensureInstallId(deps: HomeConfigDeps = {}): string {
  const existing = readStoredConfig(deps);
  if (existing) return existing.install_id;
  return writeStoredConfig({ install_id: randomUUID(), telemetry_enabled: DEFAULT_TELEMETRY_ENABLED }, deps)
    .install_id;
}

/** The persisted consent flag. Defaults to DEFAULT_TELEMETRY_ENABLED when no
 *  config exists yet; NEVER creates the file (a pure read). */
export function isTelemetryEnabled(deps: HomeConfigDeps = {}): boolean {
  return (readStoredConfig(deps) ?? { telemetry_enabled: DEFAULT_TELEMETRY_ENABLED }).telemetry_enabled;
}

/** True when no config file has been written yet (used to fire the one-time
 *  first-run notice exactly once, on the first consenting run). */
export function isFirstRun(deps: HomeConfigDeps = {}): boolean {
  return readStoredConfig(deps) === null;
}

/** Persist the enable/disable decision, preserving the existing install id (or
 *  minting one if none exists yet). Returns the written config. */
export function setTelemetryEnabled(enabled: boolean, deps: HomeConfigDeps = {}): StoredTelemetryConfig {
  const existing = readStoredConfig(deps);
  const install_id = existing?.install_id ?? randomUUID();
  return writeStoredConfig({ install_id, telemetry_enabled: enabled }, deps);
}
