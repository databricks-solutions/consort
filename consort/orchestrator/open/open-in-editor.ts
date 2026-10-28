// Open the Consort roles' reviewable artifacts in the user's editor at a gate – so
// they review the spec/architecture/test-list/ACs in Cursor/Code instead of hunting
// for files. Shared by BOTH triggers the user named: the drive (or a session) via
// the `consort-open` bin, and the log narrator (`consort-watch`) when it stops at a
// gate. Opens ONLY when the session is actually inside Cursor/Code (its integrated
// terminal), so we never launch an editor window uninvited; otherwise it reports the
// paths for the caller to surface. The `spawn` seam keeps it unit-testable.

import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { reviewArtifacts, roleArtifacts } from "./resolve-review-artifacts.js";

/** macOS app-bundle CLIs per editor, the fallback when the editor's `cursor`/`code` shim was
 *  never installed on PATH (users skip that step). Mirrors start.md's find_editor. */
const CURSOR_BUNDLES = [
  "/Applications/Cursor.app/Contents/Resources/app/bin/cursor",
  `${process.env.HOME}/Applications/Cursor.app/Contents/Resources/app/bin/cursor`,
];
const CODE_BUNDLES = [
  "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code",
  `${process.env.HOME}/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code`,
];

/** The editor whose integrated terminal this process runs in, by env markers, or null when
 *  undetermined. BOTH Cursor and VS Code set TERM_PROGRAM=vscode (Cursor is a VS Code fork), so
 *  Cursor is distinguished by its own CURSOR_TRACE_ID — checked FIRST — and VS Code by
 *  VSCODE_PID / VSCODE_GIT_IPC_HANDLE / TERM_PROGRAM=vscode with no Cursor marker. This is what
 *  decides WHICH editor to open files in: a user running inside VS Code must not get Cursor just
 *  because the `cursor` shim happens to be first on PATH. */
export function hostEditor(env: NodeJS.ProcessEnv = process.env): "cursor" | "code" | null {
  if (env.CURSOR_TRACE_ID) return "cursor";
  if (env.VSCODE_PID || env.VSCODE_GIT_IPC_HANDLE || env.TERM_PROGRAM === "vscode") return "code";
  return null;
}

/** Find a usable editor CLI, PREFERRING the host editor (the one whose terminal we run in): its
 *  PATH shim first, then the other editor's shim, then the host's .app CLI, then the other's.
 *  Undetermined host keeps the legacy cursor-then-code order. */
export function findEditorCmd(env: NodeJS.ProcessEnv = process.env): string | null {
  const host = hostEditor(env);
  const names = host === "code" ? ["code", "cursor"] : ["cursor", "code"];
  const bundles = host === "code" ? [...CODE_BUNDLES, ...CURSOR_BUNDLES] : [...CURSOR_BUNDLES, ...CODE_BUNDLES];
  const pathDirs = (env.PATH ?? "").split(path.delimiter).filter(Boolean);
  for (const name of names) {
    for (const dir of pathDirs) {
      const p = path.join(dir, name);
      try {
        if (fs.existsSync(p) && fs.statSync(p).isFile()) return name; // on PATH => bare name
      } catch {
        /* ignore */
      }
    }
  }
  for (const p of bundles) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** Walk the process ancestry (bounded) for a Cursor/Code/Electron editor parent. The fallback
 *  when the editor env markers are STRIPPED — the tmux case: tmux rewrites TERM_PROGRAM=tmux and
 *  does NOT propagate CURSOR_TRACE_ID/VSCODE_PID into its panes, so the env sniff alone wrongly
 *  reads "external" for a terminal that is in fact inside the editor (the live Cursor+tmux miss).
 *  Best-effort: any ps error / non-macos => false (no worse than the old env-only sniff). */
function hasEditorAncestor(startPpid: number = process.ppid): boolean {
  try {
    let pid = startPpid;
    for (let i = 0; i < 24 && pid > 1; i++) {
      const r = spawnSync("ps", ["-o", "ppid=,comm=", "-p", String(pid)], { encoding: "utf8" });
      const line = (r.stdout ?? "").trim();
      const m = line.match(/^\s*(\d+)\s+(.*)$/);
      if (!m) break;
      if (/cursor|visual studio code|code helper|electron/i.test(m[2])) return true;
      pid = parseInt(m[1], 10);
    }
  } catch {
    /* best-effort: ps unavailable / non-macos */
  }
  return false;
}

/** True when the process runs INSIDE Cursor/Code's integrated terminal – the signal
 *  that the user is actually viewing this project in the editor. Both Cursor and VS
 *  Code set TERM_PROGRAM=vscode; a Cursor-specific marker also counts. Under tmux the
 *  env markers are stripped (TERM_PROGRAM=tmux, no CURSOR_TRACE_ID), so fall back to a
 *  process-ancestry probe rather than falsely concluding "external". */
export function isInsideEditor(env: NodeJS.ProcessEnv = process.env): boolean {
  if (/vscode|cursor/i.test(env.TERM_PROGRAM ?? "") || Boolean(env.CURSOR_TRACE_ID) || Boolean(env.VSCODE_PID) || Boolean(env.VSCODE_GIT_IPC_HANDLE)) {
    return true;
  }
  if (Boolean(env.TMUX) || env.TERM_PROGRAM === "tmux") return hasEditorAncestor();
  return false;
}

/** DETERMINISTIC extension-installed probe (reverses start.md's "left to the agent" decision for the
 *  INSTALL check): find the editor CLI (PATH shim or app bundle — works THROUGH tmux, unlike the env
 *  markers) and read its installed extensions. Returns the installed Lakebase SCM extension version, or
 *  installed:false. A local spawn, NO network (the latest-release/upgrade check stays agent-side). This
 *  is what lets `/start` stop offering to INSTALL an extension that is already installed (the live
 *  Cursor+tmux false-offer). */
export function extensionInstalled(env: NodeJS.ProcessEnv = process.env): { installed: boolean; version?: string } {
  const cmd = findEditorCmd(env);
  if (!cmd) return { installed: false };
  try {
    const r = spawnSync(cmd, ["--list-extensions", "--show-versions"], { encoding: "utf8" });
    const m = (r.stdout ?? "").match(/^kevin-hartman\.lakebase-scm-extension@(.+)$/m);
    return m ? { installed: true, version: m[1].trim() } : { installed: false };
  } catch {
    return { installed: false };
  }
}

export interface OpenResult {
  files: string[];
  opened: boolean;
  editor?: string;
  /** Why it did not open (when opened=false): "no-artifacts" | "no-editor" | "not-in-editor". */
  reason?: "no-artifacts" | "no-editor" | "not-in-editor";
}

export interface OpenOpts {
  feature?: string;
  story?: string;
  /** Open even when not inside the editor's terminal (an explicit --force). */
  force?: boolean;
  env?: NodeJS.ProcessEnv;
  /** Injectable spawner (tests). Defaults to opening the files in the editor. */
  spawn?: (cmd: string, files: string[]) => void;
  /** PER-TURN delta: when set, open ONLY the reviewable artifacts modified at/after this
   *  epoch-ms – i.e. the files the just-finished role actually produced/updated this turn,
   *  not the whole review set. Left unset (consort-open, manual) opens the full set. */
  changedSinceMs?: number;
}

/** Resolve the reviewable artifacts and open them in the editor when appropriate.
 *  Never throws; returns what it did (or why not). */
export function openArtifactsInEditor(consortDir: string, opts: OpenOpts = {}): OpenResult {
  const env = opts.env ?? process.env;
  const all = reviewArtifacts(consortDir, { feature: opts.feature, story: opts.story });
  // Per-turn open narrows to what THIS turn touched (mtime >= the previous turn boundary),
  // so the human sees only what the role just produced, not the whole set re-opened.
  const files =
    opts.changedSinceMs === undefined
      ? all
      : all.filter((f) => {
          try {
            return fs.statSync(f).mtimeMs >= (opts.changedSinceMs as number);
          } catch {
            return false;
          }
        });
  if (!files.length) return { files, opened: false, reason: "no-artifacts" };

  const cmd = findEditorCmd(env);
  if (!cmd) return { files, opened: false, reason: "no-editor" };
  if (!isInsideEditor(env) && !opts.force) return { files, opened: false, editor: cmd, reason: "not-in-editor" };

  const spawn = opts.spawn ?? ((c, fs2) => { spawnSync(c, fs2, { stdio: "ignore" }); });
  try {
    spawn(cmd, files);
  } catch {
    return { files, opened: false, editor: cmd, reason: "no-editor" };
  }
  return { files, opened: true, editor: cmd };
}

/** Per-turn open: reveal exactly what the role that just finished its turn produced (from
 *  roleArtifacts), opening in the editor when inside its terminal. Same guards + result shape
 *  as openArtifactsInEditor, but role-scoped instead of the whole review set – so each turn
 *  shows only its own output. Never throws. */
export function openRoleArtifacts(consortDir: string, role: string, opts: OpenOpts = {}): OpenResult {
  const env = opts.env ?? process.env;
  const files = roleArtifacts(consortDir, role, { feature: opts.feature, story: opts.story });
  if (!files.length) return { files, opened: false, reason: "no-artifacts" };

  const cmd = findEditorCmd(env);
  if (!cmd) return { files, opened: false, reason: "no-editor" };
  if (!isInsideEditor(env) && !opts.force) return { files, opened: false, editor: cmd, reason: "not-in-editor" };

  const spawn = opts.spawn ?? ((c, fs2) => { spawnSync(c, fs2, { stdio: "ignore" }); });
  try {
    spawn(cmd, files);
  } catch {
    return { files, opened: false, editor: cmd, reason: "no-editor" };
  }
  return { files, opened: true, editor: cmd };
}
