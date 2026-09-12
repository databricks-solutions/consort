// The one-time install beacon: sends a random id + version + date ONCE per install, idempotent,
// best-effort, and – the whole point – REGARDLESS of the ongoing-telemetry opt-out (it records only
// that Consort was installed somewhere). The only suppressor is a total kill (CONSORT_TELEMETRY=0).
// `beacon_sent` is set ONLY on a 2xx, so an offline first run retries until the marker lands once.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sendInstallBeacon } from "../../consort/telemetry/install-beacon";
import { readStoredConfig, setTelemetryEnabled, markTelemetryAcknowledged, markBeaconSent } from "../../consort/telemetry/home-config";
import { retryInstallBeaconBestEffort } from "../../consort/telemetry/with-telemetry";

let home: string;
const deps = () => ({ homedir: home, env: {} as NodeJS.ProcessEnv });

/** A fetch stub that records calls and returns a fixed ok/status. */
function stubFetch(calls: Array<{ url: string; body: string }>, ok: boolean, throws = false): typeof fetch {
  return (async (url: string, init: { body?: string }) => {
    calls.push({ url: String(url), body: String(init?.body ?? "") });
    if (throws) throw new Error("network down");
    return { ok, status: ok ? 202 : 500 } as Response;
  }) as unknown as typeof fetch;
}

describe("sendInstallBeacon (one-time, opt-out-independent, disclosed marker)", () => {
  beforeEach(() => { home = mkdtempSync(join(tmpdir(), "beacon-")); });
  afterEach(() => rmSync(home, { recursive: true, force: true }));

  it("sends id + version + ts, then marks beacon_sent on a 2xx", async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const r = await sendInstallBeacon({ version: "0.3.51", deps: deps(), env: {}, fetchImpl: stubFetch(calls, true) });
    expect(r.sent).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toMatch(/\/v1\/traces$/);
    const line = JSON.parse(calls[0].body.trim());
    expect(line).toMatchObject({ name: "consort.install", version: "0.3.51" });
    expect(line.install_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(typeof line.ts).toBe("string");
    expect(readStoredConfig(deps())?.beacon_sent).toBe(true);
  });

  it("is idempotent – a second call sends nothing", async () => {
    const calls: Array<{ url: string; body: string }> = [];
    await sendInstallBeacon({ version: "0.3.51", deps: deps(), env: {}, fetchImpl: stubFetch(calls, true) });
    const again = await sendInstallBeacon({ version: "0.3.51", deps: deps(), env: {}, fetchImpl: stubFetch(calls, true) });
    expect(again).toMatchObject({ sent: false, reason: "already-sent" });
    expect(calls).toHaveLength(1); // only the first call hit the network
  });

  it("fires REGARDLESS of the opt-out (telemetry disabled) – the whole point", async () => {
    setTelemetryEnabled(false, deps()); // user opted out of ongoing telemetry
    const calls: Array<{ url: string; body: string }> = [];
    const r = await sendInstallBeacon({ version: "0.3.51", deps: deps(), env: {}, fetchImpl: stubFetch(calls, true) });
    expect(r.sent).toBe(true); // still sent – the marker is opt-out-independent
    expect(calls).toHaveLength(1);
  });

  it("a TOTAL kill (CONSORT_TELEMETRY=0) suppresses even the beacon", async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const r = await sendInstallBeacon({ version: "0.3.51", deps: deps(), env: { CONSORT_TELEMETRY: "0" }, fetchImpl: stubFetch(calls, true) });
    expect(r).toMatchObject({ sent: false, reason: "hard-disabled" });
    expect(calls).toHaveLength(0);
  });

  it("a failed POST does NOT mark beacon_sent – it retries next run", async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const r = await sendInstallBeacon({ version: "0.3.51", deps: deps(), env: {}, fetchImpl: stubFetch(calls, false) });
    expect(r).toMatchObject({ sent: false, reason: "post-failed" });
    expect(readStoredConfig(deps())?.beacon_sent ?? false).toBe(false);
  });

  it("never throws when the network is down (best-effort)", async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const r = await sendInstallBeacon({ version: "0.3.51", deps: deps(), env: {}, fetchImpl: stubFetch(calls, false, true) });
    expect(r).toMatchObject({ sent: false, reason: "post-failed" });
  });
});

describe("retryInstallBeaconBestEffort (deterministic per-run retry, gated on disclosure)", () => {
  beforeEach(() => { home = mkdtempSync(join(tmpdir(), "beacon-retry-")); });
  afterEach(() => rmSync(home, { recursive: true, force: true }));
  const rdeps = () => ({ homedir: home, env: {} as NodeJS.ProcessEnv, command: "build" as const, version: "0.3.90" });

  it("FIRES when acknowledged and not yet sent — the missed-first-beacon retry the /consort:start one-shot never did", async () => {
    markTelemetryAcknowledged(deps());
    const calls: Array<{ url: string; body: string }> = [];
    await retryInstallBeaconBestEffort(rdeps(), stubFetch(calls, true));
    expect(calls).toHaveLength(1);
    expect(readStoredConfig(deps())?.beacon_sent).toBe(true);
  });

  it("does NOT fire before disclosure (acknowledged=false) — the honesty invariant", async () => {
    const calls: Array<{ url: string; body: string }> = [];
    await retryInstallBeaconBestEffort(rdeps(), stubFetch(calls, true));
    expect(calls).toHaveLength(0);
  });

  it("does NOT re-fire once beacon_sent (idempotent)", async () => {
    markTelemetryAcknowledged(deps());
    markBeaconSent(deps());
    const calls: Array<{ url: string; body: string }> = [];
    await retryInstallBeaconBestEffort(rdeps(), stubFetch(calls, true));
    expect(calls).toHaveLength(0);
  });

  it("fires EVEN when run telemetry is opted out (beacon is opt-out-independent)", async () => {
    markTelemetryAcknowledged(deps());
    setTelemetryEnabled(false, deps());
    const calls: Array<{ url: string; body: string }> = [];
    await retryInstallBeaconBestEffort(rdeps(), stubFetch(calls, true));
    expect(calls).toHaveLength(1);
  });
});
