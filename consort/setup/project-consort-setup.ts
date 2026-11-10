// Consort setup hooks for project creation/adoption.
//
// The base project scaffolders (createProject / adoptLakebaseProject) live in
// @databricks-solutions/lakebase-scm-utils and are Consort-agnostic: they lay down
// the .consort/ scaffold + seed consort-config.json only when a caller injects these
// hooks. This module is that injection for the Consort kit: it owns the
// consort-bootstrap templates + the consort-config seeding that stay here.

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ConsortSetupHooks,
  ClientFramework,
} from "@databricks-solutions/lakebase-scm-utils/lakebase";
import { ARTIFACT_ROOT } from "../../consort/config/consort-paths.js";
import { defaultConsortConfig, writeConsortConfig } from "../../consort/config/consort-config-file.js";
import { adoptTdd } from "../lakebase/adopt-consort.js";
import { updateAgents } from "../lakebase/update-agents.js";
import { commitRefreshedSurface, refreshKitOwnedInstrumentation } from "../lakebase/upgrade.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Copy templates/consort-bootstrap/.consort/ into <targetDir>/.consort/.
 *
 * Resolves the bootstrap source relative to this module so it works both when
 * consumed via git URL (dist + src co-located) and from a dev clone. Safe to
 * call when <targetDir>/.consort/ already exists (existing files are preserved).
 */
/** The kit's own package name, read from the kit's package.json (works in the
 *  src, committed-dist, and git-installed layouts). The kit owns its identity; the
 *  substrate must not name it, so the scaffolder writes it into the project for the
 *  `lk` shim to resolve kit bins. */
function kitPackageName(): string {
  const candidates = [
    path.resolve(__dirname, "../../package.json"),
    path.resolve(__dirname, "../../../package.json"),
  ];
  for (const c of candidates) {
    try {
      const name = (JSON.parse(fs.readFileSync(c, "utf8")) as { name?: string }).name;
      if (typeof name === "string" && name) return name;
    } catch {
      /* try the next candidate */
    }
  }
  throw new Error(`could not resolve the kit package name; looked in: ${candidates.join(", ")}`);
}

export function layDownTddScaffold(targetDir: string): void {
  // Write the kit's package name so the scaffolded `lk` shim can resolve kit bins
  // without the substrate hardcoding it. Committed project config (like kit-ref);
  // idempotent, so a re-scaffold never clobbers an existing pin.
  const kitPkgFile = path.join(targetDir, ".lakebase", "kit-package");
  if (!fs.existsSync(kitPkgFile)) {
    fs.mkdirSync(path.dirname(kitPkgFile), { recursive: true });
    fs.writeFileSync(kitPkgFile, `${kitPackageName()}\n`);
  }

  // The substrate scaffolder must not name the kit, so it only deploys its OWN
  // skill; the kit lays down its own .claude assets (role agents, skills, and
  // workflow commands) here. Without this a scaffolded project has no
  // .claude/agents/, and the driver's `claude --agent <role>` spawns resolve
  // nothing. Runs before the .consort early-return so a re-scaffold still refreshes
  // any missing kit assets.
  layDownKitClaudeAssets(targetDir);

  const candidates = [
    path.resolve(__dirname, `../../templates/consort-bootstrap/${ARTIFACT_ROOT}`),
    path.resolve(__dirname, `../../../templates/consort-bootstrap/${ARTIFACT_ROOT}`),
  ];
  const source = candidates.find((c) => fs.existsSync(c));
  if (!source) {
    throw new Error(`consort-bootstrap template not found; looked in: ${candidates.join(", ")}`);
  }
  const dest = path.join(targetDir, ARTIFACT_ROOT);
  if (fs.existsSync(dest)) {
    return;
  }
  fs.cpSync(source, dest, { recursive: true });
}

/** Resolve the kit root (the dir holding package.json + skills/ + templates/),
 *  working in the src, committed-dist, and git-installed layouts. Anchored on
 *  skills/consort/agents so a partial layout can't resolve falsely. */
function resolveKitRoot(): string {
  const candidates = [
    path.resolve(__dirname, "../.."),
    path.resolve(__dirname, "../../.."),
  ];
  for (const c of candidates) {
    if (
      fs.existsSync(path.join(c, "package.json")) &&
      fs.existsSync(path.join(c, "skills", "consort", "agents"))
    ) {
      return c;
    }
  }
  throw new Error(
    `could not resolve the kit root (package.json + skills/consort/agents); looked in: ${candidates.join(", ")}`,
  );
}

/** The kit version, for the ${KIT_VERSION_AT_SCAFFOLD} command substitution. */
function kitVersion(root: string): string {
  try {
    return (
      (JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")) as { version?: string })
        .version ?? ""
    );
  } catch {
    return "";
  }
}

/** Copy every *.md from src to dest that is not already present (no clobber).
 *  No-op when src is absent. */
function copyMissingMd(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    if (!entry.endsWith(".md")) continue;
    const d = path.join(dest, entry);
    if (fs.existsSync(d)) continue;
    fs.copyFileSync(path.join(src, entry), d);
  }
}

/**
 * Deploy the kit-owned `.claude` assets the substrate scaffolder does not know
 * about (it only deploys its OWN skill):
 *   - the role agents  `skills/consort/agents/*.md`  -> `.claude/agents/`
 *   - the kit skills   `skills/<name with SKILL.md>` -> `.claude/skills/<name>/`
 *   - the workflow commands `templates/project/common/.claude/commands/*.md`
 *       -> `.claude/commands/` (with the ${KIT_VERSION_AT_SCAFFOLD} substitution
 *       the base scaffolder applies to its own command templates)
 * Idempotent: never overwrites a file the substrate (or a prior pass) wrote.
 */
export function layDownKitClaudeAssets(targetDir: string): void {
  const root = resolveKitRoot();
  const claudeDir = path.join(targetDir, ".claude");

  // 1. Role agents: the source `claude --agent <role>` resolves.
  copyMissingMd(
    path.join(root, "skills", "consort", "agents"),
    path.join(claudeDir, "agents"),
  );

  // 2. Kit skills (each dir carrying a SKILL.md): consort + the engineering canon
  //    the agents import. The substrate already placed its own skill; skip any
  //    that exist.
  const skillsSrc = path.join(root, "skills");
  if (fs.existsSync(skillsSrc)) {
    for (const skill of fs.readdirSync(skillsSrc).sort()) {
      if (!fs.existsSync(path.join(skillsSrc, skill, "SKILL.md"))) continue;
      const dest = path.join(claudeDir, "skills", skill);
      if (fs.existsSync(dest)) continue;
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.cpSync(path.join(skillsSrc, skill), dest, { recursive: true });
    }
  }

  // 3. Workflow commands, with the same version substitution the base applies.
  const cmdSrc = path.join(root, "templates", "project", "common", ".claude", "commands");
  if (fs.existsSync(cmdSrc)) {
    const version = kitVersion(root);
    const cmdDest = path.join(claudeDir, "commands");
    fs.mkdirSync(cmdDest, { recursive: true });
    for (const entry of fs.readdirSync(cmdSrc)) {
      if (!entry.endsWith(".md")) continue;
      const dest = path.join(cmdDest, entry);
      if (fs.existsSync(dest)) continue;
      const body = fs
        .readFileSync(path.join(cmdSrc, entry), "utf8")
        .replace(/\$\{KIT_VERSION_AT_SCAFFOLD\}/g, version);
      fs.writeFileSync(dest, body);
    }
  }
}

/** Where the kit version that last refreshed .claude/agents/ is recorded, so a
 *  drive can tell when the kit moved and the agent defs need re-syncing. */
const AGENT_SYNC_MARKER = path.join(".claude", "agents", ".kit-version");

/**
 * Version-aware agent refresh: when the running kit version differs from the
 * one that last synced this project's .claude/agents/, force-refresh the agent
 * defs (updateAgents) and record the new version. Closes the gap where a kit
 * bugfix to a role prompt never reached an already-scaffolded project
 * (create-time copyMissingMd only seeds missing files). A no-op when the marker
 * already matches the current version, so it is cheap to call on every drive
 * startup. Best-effort: any failure is swallowed (never block a drive on a
 * refresh). Returns the outcome for logging/testing.
 *
 * The caller MUST skip this during capture/replay (it mutates the project tree
 * and would pollute a recorded corpus).
 */
export function resyncAgentsOnKitDrift(projectDir: string): {
  refreshed: boolean;
  from?: string;
  to?: string;
  /** Whether the refreshed surface was committed (so the tree stays clean for the next fork). */
  committed?: boolean;
} {
  try {
    const root = resolveKitRoot();
    const current = kitVersion(root);
    const markerPath = path.join(projectDir, AGENT_SYNC_MARKER);
    let last = "";
    try {
      last = fs.readFileSync(markerPath, "utf8").trim();
    } catch {
      /* no marker yet (older scaffold): treat as drift so agents refresh once */
    }
    if (last === current) return { refreshed: false };
    updateAgents({ projectDir, kitDir: root, force: true });
    // ALSO refresh the kit-owned per-test INSTRUMENTATION (client setup.ts/globalSetup/reporter, conftests,
    // backend capture + coupled root consort-capture.ts) on the SAME kit-move trigger — not just the agents.
    // Historically the drive refreshed only .claude/agents/, so a project on a newer kit kept running stale
    // instrumentation (the F9 CI asyncUtilTimeout failure: setup.ts lagged the template fix because no
    // explicit consort-upgrade ran). Same force-overwrite set consort-upgrade uses, so a dev kit
    // (LAKEBASE_KIT_DIR) or a release both self-heal the instrumentation here. The refreshed paths are
    // threaded into the commit below (KIT_SURFACE_PATHS does NOT cover them), so the fix is COMMITTED — and
    // the promote/push step then carries it to the branch CI runs against. Best-effort ([] if unresolvable).
    const refreshedInstrumentation = refreshKitOwnedInstrumentation(projectDir, root);
    fs.mkdirSync(path.dirname(markerPath), { recursive: true });
    fs.writeFileSync(markerPath, current + "\n");
    // Commit the refreshed agent surface so a drift-resync leaves a CLEAN working tree. Otherwise
    // the run's next experiment/feature fork REFUSES to fork – the paired-branch guard rejects the
    // uncommitted tracked .claude/agents this resync just re-wrote. That is the same fork-refuse
    // class v0.3.46 fixed for consort-upgrade, but triggered by the drive's own on-resume resync
    // (e.g. after a branch checkout drifts the committed surface from the run pin). No-op outside a
    // git repo; never throws (commitRefreshedSurface returns a result).
    const commit = commitRefreshedSurface(projectDir, current, refreshedInstrumentation);
    return { refreshed: true, from: last || undefined, to: current, committed: commit.committed };
  } catch {
    return { refreshed: false };
  }
}

/** Seed .lakebase/consort-config.json from per-role model overrides + UI knobs. */
export function seedConsortConfig(
  projectDir: string,
  opts: { agentModels?: Record<string, string>; uiTrack?: boolean; clientFramework?: string; language?: "java" | "kotlin" | "python" | "nodejs" },
): void {
  const consortConfig = defaultConsortConfig();
  for (const [role, model] of Object.entries(opts.agentModels ?? {})) {
    if (model && consortConfig.roles?.[role as keyof typeof consortConfig.roles]) {
      consortConfig.roles[role as keyof typeof consortConfig.roles]!.model = model;
    }
  }
  if (consortConfig.project) {
    consortConfig.project.uiTrack = opts.uiTrack ?? true;
    consortConfig.project.clientFramework = opts.clientFramework as ClientFramework;
    // The backend language drives the build lane's product dir + file extensions (app/+.py vs
    // src/+.ts). Persist it so the drive resolves the right convention; absent -> "java" default.
    consortConfig.project.language = opts.language ?? "java";
  }
  writeConsortConfig(projectDir, consortConfig);
}

/** The workflow-setup hooks the kit injects into the base createProject.
 *  Typed by scm-utils' ConsortSetupHooks contract. */
export const kitConsortHooks: ConsortSetupHooks = {
  layDownScaffold: layDownTddScaffold,
  seedConfig: seedConsortConfig,
};

/** The Consort adoption hook the kit injects into the base adoptLakebaseProject. */
export function adoptConsortHook(projectDir: string): { added: string[] } {
  const result = adoptTdd({ projectDir });
  return { added: result.added.map((rel) => path.join(ARTIFACT_ROOT, rel)) };
}
