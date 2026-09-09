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
// GitHub newer-version check) and the editor-extension probe are deliberately left to
// the session - a preflight must never gate startup on the network.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { kitVersion } from "../config/kit-bin.js";
import { resolveConsortDir } from "../config/consort-paths.js";
import { readStoredConfig } from "../telemetry/home-config.js";

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
    /** The feature the last stop was scoped to, or null. */
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

/** True when running inside a VS Code / Cursor integrated terminal (best-effort env sniff). */
function insideEditor(env: NodeJS.ProcessEnv): boolean {
  return (
    env.TERM_PROGRAM === "vscode" ||
    typeof env.VSCODE_GIT_IPC_HANDLE === "string" ||
    typeof env.CURSOR_TRACE_ID === "string" ||
    typeof env.VSCODE_PID === "string"
  );
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

  // ── first-project marker + editor env ──
  let offeredBefore = false;
  try {
    offeredBefore = existsSync(firstProjectMarker(env, home));
  } catch {
    warnings.push("first_project: could not stat the marker");
  }

  return {
    preflight_at: new Date().toISOString(),
    project,
    kit,
    telemetry,
    scm,
    first_project: { offered_before: offeredBefore },
    env: { inside_editor: insideEditor(env) },
    warnings,
  };
}

/** True iff the blob was composed more than `maxAgeMs` ago (the session re-derives). */
export function isPreflightStale(blob: Pick<PreflightBlob, "preflight_at">, maxAgeMs: number, now: number = Date.now()): boolean {
  const t = Date.parse(blob.preflight_at);
  return Number.isNaN(t) || now - t > maxAgeMs;
}
