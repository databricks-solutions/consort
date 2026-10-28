// consort-preflight: the deterministic, pre-session state composer.
//
// `/start` runs this ONCE as its first step so the session opens already knowing
// the kit version, the project's phase + next action, the telemetry state, the SCM
// branch, and the first-project marker - instead of DISCOVERING them through a dozen
// ad-hoc `find`/`ls`/CLI probes (the improvisation this removes is the real win, not
// just the token count). It composes ONLY fast, LOCAL, deterministic sources (files
// on disk + one quick `git` call); every source is best-effort and wrapped so the
// composer NEVER throws and NEVER blocks - a missing/unreadable source reads as
// null/false, never an error. It is a CACHE the session reads once, not the source of
// truth: `preflight_at` is stamped so the session re-derives (git + consort-next) if
// the blob is stale or before any mutating action. Network/auth-dependent checks (the
// GitHub newer-version / extension UPGRADE check) are deliberately left to the session - a
// preflight must never gate startup on the network. The extension INSTALLED probe (a LOCAL
// `--list-extensions` spawn, no network, works through tmux) IS done here so the session never
// false-offers to INSTALL an extension that is already installed (the live Cursor+tmux miss).

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { kitVersion } from "../config/kit-bin.js";
import { resolveConsortDir, featuresDir, featureDir } from "../config/consort-paths.js";
import { readStoredConfig } from "../telemetry/home-config.js";
import { isInsideEditor, extensionInstalled } from "../orchestrator/open/open-in-editor.js";

export interface PreflightBlob {
  /** ISO timestamp the blob was composed - the session treats an old blob as stale. */
  preflight_at: string;
  project: {
    /** A `.consort/` corpus exists here. */
    is_consort: boolean;
    /** Derived phase from `.consort/next.json` (the drive's last stop-state), or null. */
    phase: string | null;
    /** The last stop's primary next-action kind (e.g. "invoke-role" | "gate"), or null. */
    next_action: string | null;
    /** The SOLE gate signal from next.json: true => surface to the human; false => resume; null => unknown. */
    awaiting_human: boolean | null;
    /** The feature the last stop was scoped to (from next.json). On a freshly cloned /
     *  rehydrated project with no next.json, falls back to the current feature branch, else
     *  the sole feature carrying a pipeline.json — so /start always has a scope. null when
     *  undeterminable. */
    feature: string | null;
  };
  kit: {
    /** The installed kit's SemVer (kitVersion()), or "unknown" when unreadable. */
    version: string;
    /** The project's committed pin (`.lakebase/kit-ref`), or null. */
    ref: string | null;
    /** The workspace-local run pin (`.lakebase/kit-ref.local`), or null. */
    ref_local: string | null;
  };
  telemetry: {
    /** The one-time notice has been shown/answered (else the session must present it). */
    acknowledged: boolean;
    level: number | null;
  };
  scm: {
    /** Current git branch, or null when not a repo. */
    branch: string | null;
    /** Uncommitted changes present (any porcelain output), or null when undeterminable. */
    dirty: boolean | null;
  };
  first_project: {
    /** The StockFlow first-project example has been offered before (skip the offer). */
    offered_before: boolean;
  };
  env: {
    /** Running inside an IDE terminal (VS Code / Cursor), per env markers. */
    inside_editor: boolean;
  };
  tooling: {
    /** The deterministic AGENDA of hand-off offers this session still owes the human in
     *  the shared "offer dashboard + viewer extension + get the terminal right" step —
     *  front-loaded into the blob the session reliably reads so step (a) is driven by DATA,
     *  not a prose reminder the agent skims past (the recurring "tooling offer got dropped"
     *  defect). `"dashboard"` and `"extension"` are ALWAYS owed — the session resolves the
     *  running / installed-vs-latest state and clears each SILENTLY when already satisfied;
     *  `"move-to-editor"` is owed ONLY when not already inside an IDE terminal (nothing to
     *  move otherwise). A non-empty list the session skipped past is the defect. */
    offers_pending: string[];
    /** DETERMINISTIC extension-installed fact (local `--list-extensions` probe, no network) so the
     *  session never false-offers to INSTALL an already-installed extension. `version` is the
     *  installed version when present; the latest-release / UPGRADE decision stays agent-side. */
    extension: { installed: boolean; version?: string };
  };
  /** Non-fatal issues collected while composing (a source that failed to read). */
  warnings: string[];
}

/** Run a fast command, returning trimmed stdout or null on any failure/timeout. */
function tryExec(cmd: string, args: string[], cwd: string, timeoutMs = 4000): string | null {
  try {
    return execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: timeoutMs }).trim();
  } catch {
    return null;
  }
}

/** The first-project marker path (mirrors commands/start.md): `$XDG_CONFIG_HOME/consort`
 *  else `~/.config/consort` + `/first-project-offered`. */
function firstProjectMarker(env: NodeJS.ProcessEnv, home: string): string {
  const base = env.XDG_CONFIG_HOME?.trim() || join(home, ".config");
  return join(base, "consort", "first-project-offered");
}


/** Resolve the in-flight feature when the drive has not written next.json yet (a freshly
 *  cloned / rehydrated project). Branch-first: a `feature-<slug>` / `feature/<slug>` branch
 *  names the feature, matched case-insensitively to a `.consort/features/<dir>` (the exact
 *  rule setup.sh uses). Returns null when the branch is not a feature branch or no dir matches. */
function featureFromBranch(consortDir: string, branch: string | null): string | null {
  const m = branch?.match(/^feature[-/](.+)$/);
  if (!m) return null;
  const slug = m[1].toLowerCase();
  try {
    for (const d of readdirSync(featuresDir(consortDir))) {
      if (d.toLowerCase() === slug) return d;
    }
  } catch {
    /* no features dir */
  }
  return null;
}

/** The SOLE feature whose design has run (carries a pipeline.json), or null when there is
 *  not exactly one — the deterministic fallback when the branch name doesn't name a feature. */
function soleFeatureWithPipeline(consortDir: string): string | null {
  try {
    const withPipeline = readdirSync(featuresDir(consortDir), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .filter((name) => existsSync(join(featureDir(consortDir, name), "pipeline.json")));
    return withPipeline.length === 1 ? withPipeline[0] : null;
  } catch {
    return null;
  }
}

export interface PreflightDeps {
  env?: NodeJS.ProcessEnv;
  home?: string;
}

/**
 * Compose the pre-session state blob for `projectDir`. Pure of side effects, never
 * throws: each source is best-effort and defaults to null/false, collecting a
 * warning. Reads only local files + one `git` call.
 */
export function buildPreflight(projectDir: string = process.cwd(), deps: PreflightDeps = {}): PreflightBlob {
  const env = deps.env ?? process.env;
  const home = deps.home ?? homedir();
  const warnings: string[] = [];

  // ── project: `.consort/` + the drive's last stop-state (next.json) ──
  const project: PreflightBlob["project"] = { is_consort: false, phase: null, next_action: null, awaiting_human: null, feature: null };
  try {
    const consortDir = resolveConsortDir(projectDir);
    project.is_consort = existsSync(consortDir);
    const nextPath = join(consortDir, "next.json");
    if (existsSync(nextPath)) {
      const n = JSON.parse(readFileSync(nextPath, "utf8")) as {
        awaiting_human?: unknown;
        feature?: unknown;
        primary_action?: { kind?: unknown };
        state?: { derived_phase?: unknown; coarse_phase?: unknown };
      };
      project.awaiting_human = typeof n.awaiting_human === "boolean" ? n.awaiting_human : null;
      project.feature = typeof n.feature === "string" ? n.feature : null;
      project.next_action = typeof n.primary_action?.kind === "string" ? n.primary_action.kind : null;
      const phase = n.state?.derived_phase ?? n.state?.coarse_phase;
      project.phase = typeof phase === "string" ? phase : null;
    }
  } catch {
    warnings.push("project: could not read .consort/next.json");
  }

  // ── kit: installed version (canonical kit-bin helper) + committed / run-local pins ──
  const kit: PreflightBlob["kit"] = { version: kitVersion(), ref: null, ref_local: null };
  const readRef = (rel: string): string | null => {
    try {
      const p = join(projectDir, ".lakebase", rel);
      return existsSync(p) ? readFileSync(p, "utf8").trim() || null : null;
    } catch {
      return null;
    }
  };
  kit.ref = readRef("kit-ref");
  kit.ref_local = readRef("kit-ref.local");

  // ── telemetry: the one-time notice's acknowledged flag (read-only) ──
  const telemetry: PreflightBlob["telemetry"] = { acknowledged: false, level: null };
  try {
    const cfg = readStoredConfig({ env, homedir: home });
    if (cfg) {
      telemetry.acknowledged = cfg.acknowledged === true;
      telemetry.level = typeof cfg.telemetry_level === "number" ? cfg.telemetry_level : null;
    }
  } catch {
    warnings.push("telemetry: could not read stored config");
  }

  // ── scm: branch + dirty (one fast git call) ──
  const scm: PreflightBlob["scm"] = { branch: null, dirty: null };
  const branch = tryExec("git", ["rev-parse", "--abbrev-ref", "HEAD"], projectDir);
  if (branch !== null) {
    scm.branch = branch || null;
    const porcelain = tryExec("git", ["status", "--porcelain"], projectDir);
    scm.dirty = porcelain === null ? null : porcelain.length > 0;
  } else {
    warnings.push("scm: not a git repo or git unavailable");
  }

  // ── project.feature fallback: a freshly cloned / rehydrated project has no next.json yet,
  //    so the block above left feature null and /start would dead-end calling consort-next
  //    with no scope. Resolve it from durable signals — the current feature branch, else the
  //    sole feature whose design has run (a pipeline.json). phase/next_action/awaiting_human
  //    stay null (the session derives them live via `consort-next --feature <F>`); feature is
  //    the one field /start needs to proceed. ──
  if (project.is_consort && project.feature === null) {
    try {
      const consortDir = resolveConsortDir(projectDir);
      project.feature = featureFromBranch(consortDir, scm.branch) ?? soleFeatureWithPipeline(consortDir);
    } catch {
      warnings.push("project: feature fallback (branch/pipeline) failed");
    }
  }

  // ── first-project marker + editor env ──
  let offeredBefore = false;
  try {
    offeredBefore = existsSync(firstProjectMarker(env, home));
  } catch {
    warnings.push("first_project: could not stat the marker");
  }

  // ── tooling: the deterministic agenda of owed hand-off offers (dashboard first, then
  //    the terminal move only when external, then the extension). Derived purely from the
  //    editor sniff — no spawn, no network — so the session clears a concrete list rather
  //    than relying on remembering to run the prose step. ──
  const inside = isInsideEditor(env);
  const extension = extensionInstalled(env);
  const offers_pending = ["dashboard", ...(inside ? [] : ["move-to-editor"]), "extension"];

  return {
    preflight_at: new Date().toISOString(),
    project,
    kit,
    telemetry,
    scm,
    first_project: { offered_before: offeredBefore },
    env: { inside_editor: inside },
    tooling: { offers_pending, extension },
    warnings,
  };
}

/** True iff the blob was composed more than `maxAgeMs` ago (the session re-derives). */
export function isPreflightStale(blob: Pick<PreflightBlob, "preflight_at">, maxAgeMs: number, now: number = Date.now()): boolean {
  const t = Date.parse(blob.preflight_at);
  return Number.isNaN(t) || now - t > maxAgeMs;
}
