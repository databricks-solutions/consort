// consort-telemetry CLI (AC8): status / enable / disable persist through the
// home-dir config. Uses an injected temp homedir so the real user config is
// never touched.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runTelemetryCli, type TelemetryStatus, type TelemetryCliDeps } from "../../bin/consort/telemetry.cli";

describe("consort-telemetry CLI", () => {
  let home: string;
  let out: string[];
  let err: string[];
  let deps: TelemetryCliDeps;
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "tele-cli-"));
    out = [];
    err = [];
    deps = { homedir: home, env: {}, isTTY: true, out: (s) => out.push(s), err: (s) => err.push(s) };
  });
  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  const status = (): TelemetryStatus => {
    out.length = 0;
    expect(runTelemetryCli(["status", "--json"], deps)).toBe(0);
    return JSON.parse(out.join("")) as TelemetryStatus;
  };

  it("status reports the pseudonymous install id + schema/level", () => {
    const s = status();
    expect(s.schema).toBe("consort/v1");
    expect(s.level).toBe(1);
    expect(s.install_id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(s.telemetry_enabled).toBe(true); // opt-out default
  });

  it("enable then disable persists across CLI invocations", () => {
    expect(runTelemetryCli(["disable"], deps)).toBe(0);
    expect(out.join("")).toContain("disabled");
    expect(status().telemetry_enabled).toBe(false);

    expect(runTelemetryCli(["enable"], deps)).toBe(0);
    expect(out.join("")).toContain("enabled");
    expect(status().telemetry_enabled).toBe(true);
  });

  it("status reflects consent: enabled + TTY -> will emit; disabled -> will not", () => {
    expect(status().will_emit_now).toBe(true);
    runTelemetryCli(["disable"], deps);
    expect(status().will_emit_now).toBe(false);
  });

  it("status honors env kills (DO_NOT_TRACK) even when enabled", () => {
    deps = { ...deps, env: { DO_NOT_TRACK: "1" } };
    const s = status();
    expect(s.telemetry_enabled).toBe(true);
    expect(s.do_not_track).toBe(true);
    expect(s.will_emit_now).toBe(false);
  });

  it("status reports the endpoint is NOT armed by default", () => {
    expect(status().endpoint_armed).toBe(false);
  });

  it("an unknown subcommand exits 2 with usage; no args prints help (exit 0)", () => {
    expect(runTelemetryCli(["bogus"], deps)).toBe(2);
    expect(err.join("")).toContain("unknown command");
    expect(runTelemetryCli([], deps)).toBe(0);
  });

  it("install id is stable across CLI calls (created once)", () => {
    const a = status().install_id;
    const b = status().install_id;
    expect(a).toBe(b);
  });
});
