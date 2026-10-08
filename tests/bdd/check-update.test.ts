// Hermetic tests for the update-availability check. Inject the latest-tag fetcher + clock
// and isolate the throttle store to a temp XDG dir, so no network + no real ~/.config.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { parseSemver, isNewer, checkForUpdate, checkPinLag } from "../../consort/update/check-update.js";

describe("parseSemver / isNewer", () => {
  it("parses vX.Y.Z and X.Y.Z, rejects junk", () => {
    expect(parseSemver("v0.3.14")).toEqual([0, 3, 14]);
    expect(parseSemver("0.3.14")).toEqual([0, 3, 14]);
    expect(parseSemver("nightly")).toBeNull();
  });
  it("orders by major, then minor, then patch", () => {
    expect(isNewer("0.3.14", "0.3.13")).toBe(true);
    expect(isNewer("0.4.0", "0.3.99")).toBe(true);
    expect(isNewer("1.0.0", "0.9.9")).toBe(true);
    expect(isNewer("0.3.13", "0.3.13")).toBe(false); // equal is not newer
    expect(isNewer("0.3.12", "0.3.13")).toBe(false);
    expect(isNewer("garbage", "0.3.13")).toBe(false); // bad input never claims newer
  });
});

describe("checkForUpdate", () => {
  let xdg: string;
  const run = (
    installedVersion: string,
    fetchLatest: () => string | undefined,
    extra: { force?: boolean } = {},
  ) =>
    checkForUpdate({
      env: { XDG_CONFIG_HOME: xdg } as NodeJS.ProcessEnv,
      now: () => 1_000_000,
      installedVersion,
      fetchLatest,
      ...extra,
    });

  beforeEach(() => {
    xdg = fs.mkdtempSync(path.join(os.tmpdir(), "consort-upd-"));
  });
  afterEach(() => {
    fs.rmSync(xdg, { recursive: true, force: true });
  });

  it("reports behind + a notice with the update commands when a newer tag exists", () => {
    const r = run("0.3.13", () => "v0.3.14");
    expect(r.behind).toBe(true);
    expect(r.latest).toBe("v0.3.14");
    expect(r.notice).toContain("0.3.14");
    expect(r.notice).toContain("claude plugin update consort@databricks-solutions");
    // The project step is consort-upgrade (advances the pin), NOT --warm (re-installs the
    // version already pinned, which would leave the project on the old kit).
    expect(r.notice).toContain("consort-upgrade");
    expect(r.notice).not.toContain("./scripts/lk --warm");
    expect(r.checkedNetwork).toBe(true);
  });

  it("is silent (no notice) when up to date", () => {
    const r = run("0.3.14", () => "v0.3.14");
    expect(r.behind).toBe(false);
    expect(r.notice).toBeUndefined();
  });

  it("throttles: a second call inside the window serves cache and does NOT re-fetch", () => {
    let calls = 0;
    const fetchLatest = () => { calls++; return "v0.3.14"; };
    const first = run("0.3.13", fetchLatest);
    expect(first.checkedNetwork).toBe(true);
    expect(calls).toBe(1);
    // same clock => within throttle window => cached
    const second = run("0.3.13", fetchLatest);
    expect(second.checkedNetwork).toBe(false);
    expect(calls).toBe(1); // NOT called again
    expect(second.behind).toBe(true); // still knows from cache
    expect(second.latest).toBe("v0.3.14");
  });

  it("release-aware throttle: a changed installed version forces a re-fetch inside the window", () => {
    let calls = 0;
    const fetchLatest = () => { calls++; return calls === 1 ? "v0.3.102" : "v0.3.103"; };
    // First check on the old kit: caches latest=v0.3.102, installed=v0.3.102 (current).
    const first = run("v0.3.102", fetchLatest);
    expect(first.checkedNetwork).toBe(true);
    expect(first.behind).toBe(false);
    expect(calls).toBe(1);
    // Same clock (inside the window) but the installed version changed (a plugin upgrade):
    // the cache captured BEFORE that change can't be trusted, so it MUST re-fetch.
    const second = run("v0.3.103", fetchLatest);
    expect(second.checkedNetwork).toBe(true);
    expect(calls).toBe(2);
    // And an UNCHANGED version right after still honors the throttle (serves cache, no fetch).
    const third = run("v0.3.103", fetchLatest);
    expect(third.checkedNetwork).toBe(false);
    expect(calls).toBe(2);
  });

  it("--force bypasses the throttle", () => {
    let calls = 0;
    const fetchLatest = () => { calls++; return "v0.3.14"; };
    run("0.3.13", fetchLatest);
    run("0.3.13", fetchLatest, { force: true });
    expect(calls).toBe(2);
  });

  it("fails silent: a fetch that returns undefined (offline) yields no notice, no throw", () => {
    const r = run("0.3.13", () => undefined);
    expect(r.behind).toBe(false);
    expect(r.notice).toBeUndefined();
    expect(r.latest).toBeUndefined();
  });
});

describe("checkPinLag (project pin vs installed plugin — local, no network)", () => {
  it("flags a pin behind the plugin, naming the consort-upgrade move (not --warm)", () => {
    const r = checkPinLag("v0.3.102", "v0.3.103");
    expect(r.behind).toBe(true);
    expect(r.notice).toContain("v0.3.102");
    expect(r.notice).toContain("v0.3.103");
    expect(r.notice).toContain("consort-upgrade");
    expect(r.notice).not.toContain("--warm\n"); // the aside explains --warm does NOT move the pin, but never prescribes it
  });

  it("is silent when the pin equals the plugin", () => {
    const r = checkPinLag("v0.3.103", "v0.3.103");
    expect(r.behind).toBe(false);
    expect(r.notice).toBeUndefined();
  });

  it("never flags an unpinned project (no kit-ref)", () => {
    const r = checkPinLag(undefined, "v0.3.103");
    expect(r.behind).toBe(false);
    expect(r.notice).toBeUndefined();
  });

  it("never flags when the pin is AHEAD of the plugin (bad/ahead inputs never claim behind)", () => {
    expect(checkPinLag("v0.3.104", "v0.3.103").behind).toBe(false);
    expect(checkPinLag("nightly", "v0.3.103").behind).toBe(false);
  });
});
