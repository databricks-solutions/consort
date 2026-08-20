// The consent predicate truth table (AC2). Emit IFF ALL hold:
//   telemetry_enabled === true && isTTY && !CI && !DO_NOT_TRACK && CONSORT_TELEMETRY!=="0".
// Env overrides only ever DISABLE, and they always win.

import { describe, it, expect } from "vitest";
import { shouldEmitTelemetry } from "../../consort/telemetry/consent";

const base = { telemetryEnabled: true, isTTY: true, env: {} as NodeJS.ProcessEnv };

describe("telemetry consent predicate", () => {
  it("emits when all conditions hold (enabled + TTY + no CI/DNT/kill)", () => {
    expect(shouldEmitTelemetry(base)).toBe(true);
  });

  it("does NOT emit when stdout is not a TTY", () => {
    expect(shouldEmitTelemetry({ ...base, isTTY: false })).toBe(false);
  });

  it("does NOT emit when persisted telemetry is disabled", () => {
    expect(shouldEmitTelemetry({ ...base, telemetryEnabled: false })).toBe(false);
  });

  it.each(["1", "true", "TRUE"])("does NOT emit in CI (CI=%s)", (v) => {
    expect(shouldEmitTelemetry({ ...base, env: { CI: v } })).toBe(false);
  });

  it.each(["1", "true"])("does NOT emit when DO_NOT_TRACK=%s", (v) => {
    expect(shouldEmitTelemetry({ ...base, env: { DO_NOT_TRACK: v } })).toBe(false);
  });

  it("does NOT emit when CONSORT_TELEMETRY=0 (explicit kill)", () => {
    expect(shouldEmitTelemetry({ ...base, env: { CONSORT_TELEMETRY: "0" } })).toBe(false);
  });

  it("CONSORT_TELEMETRY=1 does NOT override the other conditions (no force-enable)", () => {
    // A kill env can only disable; a truthy value cannot re-enable a non-TTY run.
    expect(shouldEmitTelemetry({ ...base, isTTY: false, env: { CONSORT_TELEMETRY: "1" } })).toBe(false);
  });

  it("CI=false / CI=0 / CI unset are treated as NOT in CI", () => {
    expect(shouldEmitTelemetry({ ...base, env: { CI: "false" } })).toBe(true);
    expect(shouldEmitTelemetry({ ...base, env: { CI: "0" } })).toBe(true);
    expect(shouldEmitTelemetry({ ...base, env: { CI: "" } })).toBe(true);
  });

  it("a disabling env wins even when everything else says emit", () => {
    expect(shouldEmitTelemetry({ telemetryEnabled: true, isTTY: true, env: { DO_NOT_TRACK: "1" } })).toBe(false);
  });
});
