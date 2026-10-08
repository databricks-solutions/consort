// Update-availability check: tell the operator when a newer Consort is published, and
// how to install it. Runs from the code the user invokes (consort-check-update, wired
// into /consort:start). Same discipline as telemetry: NEVER throws into the caller,
// bounded network, and THROTTLED (once/day) so it is not a per-run tax.
//
// It compares the installed kit version to the highest published git tag and, if behind,
// returns a one-line-ish notice with the exact update commands. On any error (offline,
// git missing, parse failure) it degrades to "no notice" silently.

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { telemetryConfigDir, type HomeConfigDeps } from "../telemetry/home-config.js";

/** The kit's public repo (tags are the source of truth for "latest"). */
export const CONSORT_REPO = "https://github.com/databricks-solutions/consort";
/** Default throttle: check the network at most once per 24h. */
export const DEFAULT_THROTTLE_MS = 24 * 60 * 60 * 1000;

/** Parse `1.2.3` / `v1.2.3` -> [1,2,3]; null when it does not look like a semver. */
export function parseSemver(v: string): [number, number, number] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** True when `latest` is a strictly higher semver than `installed` (bad inputs => false). */
export function isNewer(latest: string, installed: string): boolean {
  const a = parseSemver(latest);
  const b = parseSemver(installed);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return false;
}

/** The highest `vX.Y.Z` tag on the repo via `git ls-remote --tags` (bounded, no auth).
 *  Returns undefined on any failure (offline, no git, no tags) — a silent degrade. */
export function fetchLatestTag(repo: string = CONSORT_REPO, timeoutMs = 4000): string | undefined {
  try {
    const out = execFileSync("git", ["ls-remote", "--tags", repo], {
      timeout: timeoutMs,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    let best: [number, number, number] | null = null;
    let bestStr: string | undefined;
    for (const line of out.split("\n")) {
      // "<sha>\trefs/tags/v0.3.13" (ignore the "^{}" peeled-tag duplicates).
      const m = /refs\/tags\/(v\d+\.\d+\.\d+)(\^\{\})?$/.exec(line.trim());
      if (!m || m[2]) continue;
      const parsed = parseSemver(m[1]);
      if (!parsed) continue;
      if (!best || parsed[0] > best[0] || (parsed[0] === best[0] && (parsed[1] > best[1] || (parsed[1] === best[1] && parsed[2] > best[2])))) {
        best = parsed;
        bestStr = m[1];
      }
    }
    return bestStr;
  } catch {
    return undefined;
  }
}

interface UpdateState {
  last_check_ms?: number;
  last_latest?: string;
  /** The installed version at the last network check. When the installed version changes
   *  (a plugin/kit upgrade), the cached `last_latest` can no longer be trusted — a release
   *  may have landed inside the throttle window — so the next check MUST re-fetch rather
   *  than serve a cache captured before the upgrade. */
  last_installed?: string;
}

/** The throttle-state file, in the SAME XDG dir as telemetry config but a SEPARATE file
 *  (so it works regardless of telemetry consent, and never perturbs the telemetry state). */
function stateFile(deps: HomeConfigDeps): string {
  return path.join(telemetryConfigDir(deps), "update-check.json");
}
function readState(deps: HomeConfigDeps): UpdateState {
  try {
    return JSON.parse(fs.readFileSync(stateFile(deps), "utf8")) as UpdateState;
  } catch {
    return {};
  }
}
function writeState(deps: HomeConfigDeps, s: UpdateState): void {
  try {
    fs.mkdirSync(telemetryConfigDir(deps), { recursive: true });
    fs.writeFileSync(stateFile(deps), JSON.stringify(s, null, 2) + "\n", "utf8");
  } catch {
    /* never throw: a failed throttle-write just means we may re-check sooner */
  }
}

/** The one-time notice (stderr-style). Names both layers: the plugin AND the runtime kit.
 *  The project step is `consort-upgrade`, NOT `--warm`: `--warm` only re-installs the
 *  version a project is ALREADY pinned to; it does not advance `.lakebase/kit-ref`, so a
 *  project pinned to the old release keeps running it. `consort-upgrade` dual-pins the ref
 *  to the target (at a stop), which is the move that actually puts the project on the new kit. */
export function formatUpdateNotice(installed: string, latest: string): string {
  return (
    `[consort] A newer Consort is available: ${latest} (you have ${installed}).\n` +
    `          Update the plugin:  claude plugin marketplace update databricks-solutions \\\n` +
    `                              && claude plugin update consort@databricks-solutions\n` +
    `          Move a project onto it (at a stop): ./scripts/lk consort-upgrade --pid <drive-pid>\n` +
    `          (advances .lakebase/kit-ref to ${latest}; a plain --warm does NOT move the pin)\n`
  );
}

/** The pin-lag notice: this project's runtime-kit PIN is behind the INSTALLED plugin.
 *  A `claude plugin update` advances the plugin on disk but NOT a project's pinned kit
 *  (moving a project is a separate, explicit step), so a resume silently keeps running the
 *  older kit. This is the signal that catches that gap. */
export function formatPinLagNotice(pin: string, plugin: string): string {
  return (
    `[consort] This project's runtime kit is pinned to ${pin}, but your installed plugin is ${plugin}.\n` +
    `          The project will keep running the OLDER kit until you move it (at a stop):\n` +
    `            ./scripts/lk consort-upgrade --pid <drive-pid>\n` +
    `          (dual-pins .lakebase/kit-ref + kit-ref.local to ${plugin}; a plain --warm does NOT move the pin)\n`
  );
}

export interface PinLagResult {
  /** The project's effective runtime-kit pin (kit-ref.local ?? kit-ref), if any. */
  pin?: string;
  /** The installed plugin version to compare the pin against. */
  plugin: string;
  /** True when the pin is strictly behind the plugin. */
  behind: boolean;
  /** Present only when behind: the notice to print. */
  notice?: string;
}

/** Compare a project's runtime-kit PIN against the installed PLUGIN version. LOCAL,
 *  network-free, and UN-throttled — a resume can run it every time at no cost. Returns a
 *  notice only when the pin is strictly behind the plugin (an unpinned project — no pin —
 *  is never flagged: it resolves the plugin version anyway). Bad inputs never claim behind. */
export function checkPinLag(pin: string | undefined, plugin: string): PinLagResult {
  const behind = !!pin && isNewer(plugin, pin);
  return { pin, plugin, behind, notice: behind ? formatPinLagNotice(pin!, plugin) : undefined };
}

export interface UpdateCheckDeps extends HomeConfigDeps {
  /** The installed kit version (e.g. from package.json / plugin.json). */
  installedVersion: string;
  /** Latest-tag fetcher (tests inject a fake). Default: fetchLatestTag(). */
  fetchLatest?: () => string | undefined;
  /** Clock (tests). Default Date.now. */
  now?: () => number;
  /** Throttle window. Default 24h. */
  throttleMs?: number;
  /** Bypass the throttle for this call (a `--force` / manual check). */
  force?: boolean;
}

export interface UpdateCheckResult {
  installed: string;
  latest?: string;
  behind: boolean;
  /** Present only when behind: the notice to print. */
  notice?: string;
  /** True when this call hit the network (vs served the cached last_latest). */
  checkedNetwork: boolean;
}

/**
 * Check whether a newer Consort is published. Throttled: hits the network at most once per
 * `throttleMs` (else serves the cached last-seen latest), unless `force`. NEVER throws.
 */
export function checkForUpdate(deps: UpdateCheckDeps): UpdateCheckResult {
  const now = (deps.now ?? Date.now)();
  const throttleMs = deps.throttleMs ?? DEFAULT_THROTTLE_MS;
  const state = readState(deps);
  // Release-aware throttle: a cache captured BEFORE an upgrade can mask a release that landed
  // inside the window, so force a re-fetch whenever the installed version changed since the
  // last check — otherwise honor the once/day throttle.
  const versionChanged = state.last_installed !== undefined && state.last_installed !== deps.installedVersion;
  const due = deps.force || versionChanged || state.last_check_ms === undefined || now - state.last_check_ms >= throttleMs;

  let latest = state.last_latest;
  let checkedNetwork = false;
  if (due) {
    const fetched = (deps.fetchLatest ?? (() => fetchLatestTag()))();
    checkedNetwork = true;
    // Persist the check time + the installed version we checked against; only overwrite
    // last_latest when the fetch succeeded (an offline fetch keeps the prior cached latest).
    writeState(deps, { last_check_ms: now, last_latest: fetched ?? state.last_latest, last_installed: deps.installedVersion });
    if (fetched) latest = fetched;
  }

  const behind = !!latest && isNewer(latest, deps.installedVersion);
  return {
    installed: deps.installedVersion,
    latest,
    behind,
    notice: behind ? formatUpdateNotice(deps.installedVersion, latest!) : undefined,
    checkedNetwork,
  };
}
