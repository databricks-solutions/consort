// SFTDD setup hooks for project creation/adoption.
//
// The base project scaffolders (createProject / adoptLakebaseProject) live in
// @databricks-solutions/lakebase-scm-utils and are SFTDD-agnostic: they lay down
// the .sftdd/ scaffold + seed sftdd-config.json only when a caller injects these
// hooks. This module is that injection for the SFTDD kit: it owns the
// sftdd-bootstrap templates + the sftdd-config seeding that stay here.

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  SftddSetupHooks,
  ClientFramework,
} from "@databricks-solutions/lakebase-scm-utils/lakebase";
import { ARTIFACT_ROOT } from "./sftdd-paths.js";
import { defaultSftddConfig, writeSftddConfig } from "./sftdd-config.js";
import { adoptTdd } from "../lakebase/adopt-sftdd.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Copy templates/sftdd-bootstrap/.sftdd/ into <targetDir>/.sftdd/.
 *
 * Resolves the bootstrap source relative to this module so it works both when
 * consumed via git URL (dist + src co-located) and from a dev clone. Safe to
 * call when <targetDir>/.sftdd/ already exists (existing files are preserved).
 */
export function layDownTddScaffold(targetDir: string): void {
  const candidates = [
    path.resolve(__dirname, `../../templates/sftdd-bootstrap/${ARTIFACT_ROOT}`),
    path.resolve(__dirname, `../../../templates/sftdd-bootstrap/${ARTIFACT_ROOT}`),
  ];
  const source = candidates.find((c) => fs.existsSync(c));
  if (!source) {
    throw new Error(`sftdd-bootstrap template not found; looked in: ${candidates.join(", ")}`);
  }
  const dest = path.join(targetDir, ARTIFACT_ROOT);
  if (fs.existsSync(dest)) {
    return;
  }
  fs.cpSync(source, dest, { recursive: true });
}

/** Seed .lakebase/sftdd-config.json from per-role model overrides + UI knobs. */
export function seedSftddConfig(
  projectDir: string,
  opts: { agentModels?: Record<string, string>; uiTrack?: boolean; clientFramework?: string },
): void {
  const sftddConfig = defaultSftddConfig();
  for (const [role, model] of Object.entries(opts.agentModels ?? {})) {
    if (model && sftddConfig.roles?.[role as keyof typeof sftddConfig.roles]) {
      sftddConfig.roles[role as keyof typeof sftddConfig.roles]!.model = model;
    }
  }
  if (sftddConfig.project) {
    sftddConfig.project.uiTrack = opts.uiTrack ?? false;
    sftddConfig.project.clientFramework = opts.clientFramework as ClientFramework;
  }
  writeSftddConfig(projectDir, sftddConfig);
}

/** The SFTDD hooks the kit injects into the base createProject. */
export const kitSftddHooks: SftddSetupHooks = {
  layDownScaffold: layDownTddScaffold,
  seedConfig: seedSftddConfig,
};

/** The SFTDD adoption hook the kit injects into the base adoptLakebaseProject. */
export function adoptSftddHook(projectDir: string): { added: string[] } {
  const result = adoptTdd({ projectDir });
  return { added: result.added.map((rel) => path.join(ARTIFACT_ROOT, rel)) };
}
