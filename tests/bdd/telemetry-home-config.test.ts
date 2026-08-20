// Home-dir telemetry config (AC5): install_id created once, stable across reads,
// regenerated if the file is deleted; XDG-aware config path; enable/disable
// persists without churning the install id.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, unlinkSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ensureInstallId,
  isTelemetryEnabled,
  setTelemetryEnabled,
  telemetryConfigDir,
  telemetryConfigFile,
  readStoredConfig,
  isFirstRun,
  type HomeConfigDeps,
} from "../../consort/telemetry/home-config";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("telemetry home config", () => {
  let home: string;
  let deps: HomeConfigDeps;
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "tele-home-"));
    deps = { homedir: home, env: {} };
  });
  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  it("resolves the config under ~/.config/consort by default", () => {
    expect(telemetryConfigDir(deps)).toBe(join(home, ".config", "consort"));
    expect(telemetryConfigFile(deps)).toBe(join(home, ".config", "consort", "telemetry.json"));
  });

  it("honors $XDG_CONFIG_HOME when set", () => {
    const xdg = join(home, "xdg");
    expect(telemetryConfigDir({ env: { XDG_CONFIG_HOME: xdg } })).toBe(join(xdg, "consort"));
  });

  it("mints a UUIDv4 install id ONCE and returns it stably", () => {
    expect(isFirstRun(deps)).toBe(true);
    const id1 = ensureInstallId(deps);
    expect(id1).toMatch(UUID_V4);
    expect(isFirstRun(deps)).toBe(false);
    const id2 = ensureInstallId(deps);
    expect(id2).toBe(id1); // stable across calls
    expect(existsSync(telemetryConfigFile(deps))).toBe(true);
  });

  it("regenerates the install id if the config file is deleted", () => {
    const id1 = ensureInstallId(deps);
    unlinkSync(telemetryConfigFile(deps));
    const id2 = ensureInstallId(deps);
    expect(id2).toMatch(UUID_V4);
    expect(id2).not.toBe(id1); // a fresh identity after deletion
  });

  it("enable/disable persists and preserves the install id", () => {
    const id = ensureInstallId(deps);
    expect(isTelemetryEnabled(deps)).toBe(true); // opt-out default

    setTelemetryEnabled(false, deps);
    expect(isTelemetryEnabled(deps)).toBe(false);
    expect(readStoredConfig(deps)?.install_id).toBe(id); // id unchanged

    setTelemetryEnabled(true, deps);
    expect(isTelemetryEnabled(deps)).toBe(true);
    expect(readStoredConfig(deps)?.install_id).toBe(id);
  });

  it("setTelemetryEnabled mints an install id when none exists yet", () => {
    const cfg = setTelemetryEnabled(false, deps);
    expect(cfg.install_id).toMatch(UUID_V4);
    expect(cfg.telemetry_enabled).toBe(false);
  });

  it("a malformed config file reads as no identity (null)", () => {
    setTelemetryEnabled(true, deps);
    const file = telemetryConfigFile(deps);
    rmSync(file);
    // Write garbage.
    writeFileSync(file, "{ not json", "utf8");
    expect(readStoredConfig(deps)).toBeNull();
    // A fresh id is minted over the garbage.
    expect(ensureInstallId(deps)).toMatch(UUID_V4);
    // Sanity: the rewritten file is valid JSON now.
    expect(() => JSON.parse(readFileSync(file, "utf8"))).not.toThrow();
  });
});
