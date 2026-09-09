// In-flight-safe kit upgrade for a scaffolded project (the deterministic core).
//
// A Consort run is a SEQUENCE of consort-drive processes with HITL gates between
// them, and the kit version is bound at each drive LAUNCH (resolved once from the
// pin). So the ONLY safe moment to upgrade is AT A STOP – between drive processes ,
// never mid-turn (a running drive already resolved the old kit; swapping files under
// it is split-brain within one run). This module is the file-level upgrade:
//   1. quiesceGate  – is the run at a clean stop (no live drive + awaiting_human/done)?
//   2. pinBoth      – dual-pin .local (run) + committed kit-ref (CI) to the target,
//                     recording the prior values to kit-ref.prev for rollback.
//   3. refreshSurface – updateAgents + updateCommands from the target kit + reset the
//                     agent-sync marker so the next drive does not re-refresh.
//   4. rollbackPins – restore the prior pins from kit-ref.prev (the instant undo).
// The bin (consort-upgrade) adds the side effects around this: `lk --refresh` to
// download the target kit into the cache, the pid liveness probe, and the output.

import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import {
  KIT_REF_FILE,
  KIT_REF_LOCAL_FILE,
  committedKitRef,
  localKitRef,
  pinRunKitRef,
} from "../config/kit-ref.js";
import { updateAgents } from "./update-agents.js";
import { updateCommands } from "./update-commands.js";
import { enableE2eForProject } from "@databricks-solutions/lakebase-scm-utils/lakebase";
import { loadConsortConfig } from "../config/consort-config-file.js";

/** Where the prior pins are recorded so an upgrade is reversible (rollback). */
export const KIT_REF_PREV_FILE = "kit-ref.prev";
/** The agent-sync marker (mirror of AGENT_SYNC_MARKER) reset on upgrade so the next
 *  drive's resyncAgentsOnKitDrift sees the surface already at the target version. */
const AGENT_SYNC_MARKER = path.join(".claude", "agents", ".kit-version");

function lakebaseFile(projectDir: string, name: string): string {
  return path.join(projectDir, ".lakebase", name);
}

export interface QuiesceInput {
  /** Is a drive process still alive? true => a drive is running (UNSAFE to upgrade);
   *  false => confirmed stopped; null => unknown (no --pid supplied). */
  pidAlive: boolean | null;
  /** Does next.json say the run is at a stop a human owns (awaiting_human) OR done? */
  atStop: boolean;
}
export interface QuiesceResult {
  safe: boolean;
  reason: string;
}

/**
 * Is it safe to upgrade right now? SAFE only when no drive is provably running AND the
 * run is at a stop. A live pid is an immediate NO (never hot-swap under a running drive).
 * With no pid (unknown liveness), fall back to the at-stop signal but say liveness is
 * unverified, so the operator knows to be sure the drive is down.
 */
export function quiesceGate(q: QuiesceInput): QuiesceResult {
  if (q.pidAlive === true) {
    return { safe: false, reason: "a drive process is still RUNNING – wait for it to stop at a gate before upgrading (never swap the kit mid-turn)." };
  }
  if (q.pidAlive === false) {
    // The drive pid is provably GONE, so NOTHING is executing – safe to swap the kit regardless of
    // what next.json queues next. pid-gone is the stop authority; next.json's primary_action is only
    // a SUGGESTION for the next cycle. A COMPLETED sprint rolls next.json forward to the next cycle's
    // first step (e.g. "dispatch product-owner for intake"), which is neither awaiting_human nor done
    // but is NOT mid-flight either – requiring atStop here wrongly blocked upgrading a finished sprint.
    return { safe: true, reason: "at a clean stop (drive pid not alive – nothing is running)." };
  }
  // pidAlive === null: liveness UNVERIFIED (no --pid). next.json is the only signal, and it cannot
  // tell a between-cycles stop from a live mid-flight dispatch, so require an explicit human-owned
  // stop (awaiting_human/done) and steer the operator to pass --pid so liveness can be verified.
  if (!q.atStop) {
    return { safe: false, reason: "no --pid given and next.json shows no clean stop (awaiting_human/done) – pass --pid <drive-pid> so drive liveness can be verified, or resolve to a gate first." };
  }
  return { safe: true, reason: "at a stop (awaiting_human/done); drive liveness UNVERIFIED (no --pid) – confirm no drive is running." };
}

export interface PinBothResult {
  ref: string;
  previousLocal?: string;
  previousCommitted?: string;
  changed: boolean;
}

/** Dual-pin the run pin (.local) + the committed kit-ref (CI) to `ref`, recording the
 *  prior values to kit-ref.prev so the upgrade is reversible. Keeps the two refs in
 *  lockstep – the fix for the committed-vs-.local drift. Idempotent: re-pinning the same
 *  ref still records prev (harmless) but reports changed=false when nothing moved. */
export function pinBoth(projectDir: string, ref: string): PinBothResult {
  const previousLocal = localKitRef(projectDir);
  const previousCommitted = committedKitRef(projectDir);
  // Record prior pins for rollback BEFORE mutating.
  const prev = { local: previousLocal ?? null, committed: previousCommitted ?? null };
  fs.mkdirSync(path.dirname(lakebaseFile(projectDir, KIT_REF_PREV_FILE)), { recursive: true });
  fs.writeFileSync(lakebaseFile(projectDir, KIT_REF_PREV_FILE), JSON.stringify(prev) + "\n", "utf8");
  // Pin the run (.local) via the shared writer, and the committed ref in lockstep.
  const local = pinRunKitRef(projectDir, ref);
  fs.writeFileSync(lakebaseFile(projectDir, KIT_REF_FILE), ref + "\n", "utf8");
  const changed = local.pinned || previousCommitted !== ref;
  return {
    ref,
    ...(previousLocal ? { previousLocal } : {}),
    ...(previousCommitted ? { previousCommitted } : {}),
    changed,
  };
}

export interface RollbackResult {
  restored: boolean;
  local?: string;
  committed?: string;
  reason?: string;
}

/** Restore the pins recorded by the last pinBoth (the instant undo when a resume on the
 *  new kit misbehaves). A missing/empty prior ref clears that file (back to unpinned). */
export function rollbackPins(projectDir: string): RollbackResult {
  const prevFile = lakebaseFile(projectDir, KIT_REF_PREV_FILE);
  if (!fs.existsSync(prevFile)) return { restored: false, reason: "no kit-ref.prev – nothing to roll back to." };
  let prev: { local: string | null; committed: string | null };
  try {
    prev = JSON.parse(fs.readFileSync(prevFile, "utf8")) as typeof prev;
  } catch {
    return { restored: false, reason: "kit-ref.prev is unreadable." };
  }
  const restore = (name: string, val: string | null): void => {
    const f = lakebaseFile(projectDir, name);
    if (val && val.trim()) fs.writeFileSync(f, val.trim() + "\n", "utf8");
    else if (fs.existsSync(f)) fs.rmSync(f);
  };
  restore(KIT_REF_LOCAL_FILE, prev.local);
  restore(KIT_REF_FILE, prev.committed);
  return {
    restored: true,
    ...(prev.local ? { local: prev.local } : {}),
    ...(prev.committed ? { committed: prev.committed } : {}),
  };
}

export interface RefreshSurfaceResult {
  agents: number; // files added/updated
  commands: number;
  scripts: number; // kit-owned scripts copied
  workflows: number; // CI workflow files copied
  e2e: boolean; // whether the Playwright E2E block was (re)wired into run-tests.sh (UI projects)
}

/** Count the files (recursively) under `dir`, or 0 if it does not exist. */
function countFiles(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) n += countFiles(path.join(dir, e.name));
    else n += 1;
  }
  return n;
}

/** Copy a kit-owned template subtree over the project's copy (recursive, overwriting), or
 *  a no-op when the source is absent. cpSync preserves file modes (so `+x` on `.sh` files
 *  survives). Files the project has that the kit does not (e.g. the scm-utils `scripts/lk`
 *  shim, project-local scripts) are LEFT untouched – only kit-owned files are refreshed. */
function copyKitTree(kitSubtree: string, projectSubtree: string): number {
  if (!fs.existsSync(kitSubtree)) return 0;
  fs.mkdirSync(projectSubtree, { recursive: true });
  fs.cpSync(kitSubtree, projectSubtree, { recursive: true, force: true });
  return countFiles(kitSubtree);
}

/** The scm-utils version THIS kit ships, parsed from consort's own dependency pin
 *  (`@databricks-solutions/lakebase-scm-utils: github:...#v<version>`). This is the value the
 *  workflow templates' scaffold-time `{{LAKEBASE_SCM_UTILS_VERSION}}` placeholder must resolve
 *  to – NOT the kit's own version (walking up from the templates would wrongly yield consort's
 *  version). Bare (leading `v` stripped) to match the template's literal `v{{...}}`. Null when
 *  the pin carries no `#ref` (unpinned dev checkout). */
function resolveSubstrateVersion(kitDir: string): string | null {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(kitDir, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };
    const pin = pkg.dependencies?.["@databricks-solutions/lakebase-scm-utils"] ?? "";
    const hash = pin.indexOf("#");
    if (hash < 0) return null;
    return pin.slice(hash + 1).replace(/^v/, "") || null;
  } catch {
    return null;
  }
}

/** Substitute the `{{LAKEBASE_SCM_UTILS_VERSION}}` scaffold placeholder in the COPIED CI
 *  workflows. The initial scaffold (scm-utils `substituteWorkflowPlaceholders`) does this;
 *  refreshSurface previously raw-copied the templates, so `consort-upgrade` SHIPPED THE LITERAL
 *  placeholder. The template's `${SCM_UTILS_REF:-v{{LAKEBASE_SCM_UTILS_VERSION}}}` then closes the
 *  bash expansion at the FIRST `}` of the unsubstituted `}}}`, leaking `}}` into the value
 *  (`SCM_UTILS_REF=v<ver>}}`), so the `npx github:...#<ref>}}` ref is unresolvable and the "Detect
 *  project language" step exits 1 (build-and-test fails, wait-ci exits 3). Substitute after the
 *  copy so an upgraded project's workflows are as valid as a freshly-scaffolded one. Best-effort
 *  per file (an unreadable workflow must never abort the upgrade). */
function substituteWorkflowVersion(workflowsDir: string, version: string): void {
  if (!fs.existsSync(workflowsDir)) return;
  for (const entry of fs.readdirSync(workflowsDir)) {
    if (!entry.endsWith(".yml") && !entry.endsWith(".yaml")) continue;
    const f = path.join(workflowsDir, entry);
    try {
      const before = fs.readFileSync(f, "utf8");
      const after = before.replace(/\{\{LAKEBASE_SCM_UTILS_VERSION\}\}/g, version);
      if (after !== before) fs.writeFileSync(f, after);
    } catch {
      /* best-effort: keep going so one bad file does not abort the surface refresh */
    }
  }
}

/** Substitute {{LAKEBASE_SCM_UTILS_VERSION}} in the scaffolded scripts on upgrade – the
 *  post-checkout / setup-federation hooks carry it in their `scm-utils/<version>` connection
 *  label (the direct-run case). refreshSurface copies scripts raw, so without this an upgrade
 *  would ship the literal placeholder, exactly like the workflow CI-ref bug. Recursive
 *  (scripts/ has no subdirs today, but keep it robust); best-effort per file. */
function substituteScmUtilsVersionInScripts(scriptsDir: string, version: string): void {
  if (!fs.existsSync(scriptsDir)) return;
  for (const entry of fs.readdirSync(scriptsDir, { withFileTypes: true })) {
    const p = path.join(scriptsDir, entry.name);
    if (entry.isDirectory()) { substituteScmUtilsVersionInScripts(p, version); continue; }
    try {
      const before = fs.readFileSync(p, "utf8");
      const after = before.replace(/\{\{LAKEBASE_SCM_UTILS_VERSION\}\}/g, version);
      if (after !== before) fs.writeFileSync(p, after);
    } catch {
      /* best-effort */
    }
  }
}

/** Refresh the FULL kit-owned scaffolded surface from the target kit dir: agents +
 *  commands (.claude/), the scripts/ helper tree, and the CI workflows (.github/workflows/).
 *  Resets the agent-sync marker to the target so the next drive sees the surface current
 *  and does not re-refresh. force:true (the propagation path) overwrites drift. Leaves the
 *  scm-utils `scripts/lk` shim + project config (`.env`, deploy-targets.yaml) untouched ,
 *  only kit-owned files move. */
export function refreshSurface(projectDir: string, kitDir: string, targetVersion: string): RefreshSurfaceResult {
  const a = updateAgents({ projectDir, kitDir, force: true });
  const c = updateCommands({ projectDir, kitDir, force: true });
  const commonDir = path.join(kitDir, "templates", "project", "common");
  const scripts = copyKitTree(path.join(commonDir, "scripts"), path.join(projectDir, "scripts"));
  const workflowsDir = path.join(projectDir, ".github", "workflows");
  const workflows = copyKitTree(path.join(commonDir, ".github", "workflows"), workflowsDir);
  // Substitute the scaffold-time {{LAKEBASE_SCM_UTILS_VERSION}} placeholder the raw copies above
  // just shipped verbatim – leaving the literal breaks the CI ref's bash expansion (workflows)
  // AND the post-checkout/setup-federation scripts' `scm-utils/<version>` connection label. The
  // scripts get it too now (they carry the same placeholder). Resolve the scm-utils version from
  // THIS kit's dep pin so an upgraded project matches a freshly-scaffolded one.
  const substrate = resolveSubstrateVersion(kitDir);
  if (substrate) {
    substituteWorkflowVersion(workflowsDir, substrate);
    substituteScmUtilsVersionInScripts(path.join(projectDir, "scripts"), substrate);
  }
  // Re-append the Playwright E2E block to run-tests.sh for a UI project. The scripts copy above
  // just reset run-tests.sh to the kit TEMPLATE, which carries NO E2E block – the block is appended
  // PER-PROJECT by enableE2eForProject, never shipped in the template. So without this, every
  // upgrade WIPES a UI project's E2E out of the deploy-verify gate (the gate then never runs the
  // client Playwright suite – exactly how F4's actor-less form shipped past a green deploy-verify),
  // and a UI project scaffolded before enable-e2e-by-default never had the block at all.
  // enableE2eForProject is idempotent: it re-appends the block + wires the harness only where
  // missing. Best-effort – a failure here must never block the upgrade.
  let e2e = false;
  try {
    const cfg = loadConsortConfig(projectDir);
    if (cfg?.project?.uiTrack === true || cfg?.project?.clientFramework === "react") {
      enableE2eForProject({ projectDir });
      e2e = true;
    }
  } catch {
    /* best-effort: keep the (possibly block-less) run-tests.sh rather than failing the upgrade */
  }
  const marker = path.join(projectDir, AGENT_SYNC_MARKER);
  try {
    fs.mkdirSync(path.dirname(marker), { recursive: true });
    fs.writeFileSync(marker, targetVersion + "\n", "utf8");
  } catch {
    /* best-effort: the drive's resyncAgentsOnKitDrift will refresh again if the marker is stale */
  }
  const count = (files: Array<{ outcome: string }>): number => files.filter((f) => f.outcome === "added" || f.outcome === "updated").length;
  return { agents: count(a.files), commands: count(c.files), scripts, workflows, e2e };
}

/** The kit-owned tracked paths refreshSurface + pinBoth rewrite. Committed by EXACT path so the
 *  commit never touches app code, the `.consort` corpus, the scm-utils `scripts/lk` shim (which
 *  refreshSurface leaves untouched), or the run-local pins (`.lakebase/kit-ref.local` / `.prev`
 *  are gitignored; `.lakebase/kit-ref` is the tracked CI pin). */
const KIT_SURFACE_PATHS = [".claude/agents", ".claude/commands", "scripts", ".github/workflows", ".lakebase/kit-ref"];

export interface CommitSurfaceResult {
  committed: boolean;
  sha?: string;
  /** When committed=false, why: "not-a-git-repo" | "nothing-to-commit" | "commit-failed". */
  reason?: string;
}

/**
 * Commit the kit-owned surface an in-flight upgrade just refreshed, so the working tree is CLEAN
 * afterwards. This is the durable fix for the mid-run-upgrade failure: refreshSurface + pinBoth
 * rewrite tracked files (`.claude/commands` + `agents` + `scripts` + `.github/workflows` +
 * `.lakebase/kit-ref`), and the very next experiment/feature fork REFUSES to fork while the tree
 * has uncommitted tracked changes (they would ride onto the new branch – paired-branch's guard).
 * Committing them here (matching the repo's own `chore: bump committed kit-ref` convention) leaves
 * the fork a clean tree. Staged by EXACT kit path (never app code or the `.consort` corpus).
 * `--no-verify` so a slow pre-commit hook (e.g. schema-diff) cannot hang the upgrade – this is kit
 * metadata, not app code. No-op (committed:false) when not a git repo or nothing changed. Never
 * throws; the git runner is injectable for tests.
 */
export function commitRefreshedSurface(
  projectDir: string,
  targetVersion: string,
  git: (args: string[]) => { status: number | null; stdout: string } = (a) => {
    const r = spawnSync("git", ["-C", projectDir, ...a], { encoding: "utf8" });
    return { status: r.status, stdout: r.stdout ?? "" };
  },
): CommitSurfaceResult {
  if (git(["rev-parse", "--is-inside-work-tree"]).status !== 0) return { committed: false, reason: "not-a-git-repo" };
  // Only stage paths that exist – `git add` fails the whole command on a missing pathspec.
  const paths = KIT_SURFACE_PATHS.filter((p) => fs.existsSync(path.join(projectDir, p)));
  if (!paths.length) return { committed: false, reason: "nothing-to-commit" };
  git(["add", "--", ...paths]);
  // Anything actually staged under the kit paths? (exit 0 = no diff => nothing to commit)
  if (git(["diff", "--cached", "--quiet", "--", ...paths]).status === 0) {
    return { committed: false, reason: "nothing-to-commit" };
  }
  if (git(["commit", "--no-verify", "-m", `chore(kit): refresh scaffolded surface to ${targetVersion}`]).status !== 0) {
    return { committed: false, reason: "commit-failed" };
  }
  return { committed: true, sha: git(["rev-parse", "--short", "HEAD"]).stdout.trim() };
}
