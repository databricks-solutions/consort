import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { join } from "path";
import { createPairedBranch, deletePairedBranch } from "@databricks-solutions/lakebase-scm-utils/lakebase";
import type { BranchLookupOpts, LakebaseBranchInfo } from "@databricks-solutions/lakebase-scm-utils/lakebase";

function branchIdOf(info: LakebaseBranchInfo): string {
  const leaf = info.name.split("/").pop();
  if (!leaf) throw new Error(`could not derive branch_id from ${info.name}`);
  return leaf;
}

/**
 * Default spike notes.md content. When `forFeature` is given, a `for_feature:`
 * frontmatter marker is added so the note is picked up by collectSpikeInputs at
 * that feature's design-spec gate (the throwaway code is dropped; only the
 * learning carries forward).
 */
export function spikeNotes(spikeSlug: string, forFeature?: string): string {
  const frontmatter = forFeature ? `---\nfor_feature: ${forFeature}\n---\n` : "";
  const intro = forFeature
    ? `Throwaway spike for ${forFeature}.`
    : `Throwaway spike.`;
  return `${frontmatter}# ${spikeSlug}\n\n${intro} Code is **not** promoted as-is. Capture the learning here before deleting the branch.\n`;
}

export interface CutSpikeArgs extends BranchLookupOpts {
  sftddDir: string;
  /** Project root (.git + .env). Required: the spike branch is PAIRED. */
  projectDir: string;
  spikeSlug: string;
  branch: string;
  parentBranch?: string;
  ttl?: string;
  notes?: string;
}

export interface SpikeRecord {
  spike_slug: string;
  branch_id: string;
  created_at: string;
  dir: string;
}

export async function cutSpike(args: CutSpikeArgs): Promise<SpikeRecord> {
  const { sftddDir, projectDir, spikeSlug, branch, parentBranch, ttl, notes, ...lookup } = args;
  // PAIRED cut through the substrate: Lakebase branch + git branch + .env sync.
  const paired = await createPairedBranch({
    instance: lookup.instance,
    branch,
    parentBranch,
    cwd: projectDir,
    createGitBranch: true,
    syncEnv: true,
    ...(ttl ? { ttl } : { noExpiry: true }),
  });
  const branchId = branchIdOf(paired.branch);

  const dir = join(sftddDir, "spikes", spikeSlug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "branch.txt"), branchId);
  writeFileSync(
    join(dir, "notes.md"),
    notes ??
      `# ${spikeSlug}\n\nThrowaway spike. Code is **not** promoted as-is. Capture learning before deleting the branch.\n`
  );
  return {
    spike_slug: spikeSlug,
    branch_id: branchId,
    created_at: new Date().toISOString(),
    dir,
  };
}

export function listSpikes(sftddDir: string): SpikeRecord[] {
  const root = join(sftddDir, "spikes");
  if (!existsSync(root)) return [];
  const out: SpikeRecord[] = [];
  for (const slug of readdirSync(root)) {
    const dir = join(root, slug);
    if (!statSync(dir).isDirectory()) continue;
    const branchFile = join(dir, "branch.txt");
    if (!existsSync(branchFile)) continue;
    out.push({
      spike_slug: slug,
      branch_id: readFileSync(branchFile, "utf8").trim(),
      created_at: statSync(branchFile).birthtime.toISOString(),
      dir,
    });
  }
  return out;
}

export interface DeleteSpikeArgs extends BranchLookupOpts {
  sftddDir: string;
  /** Project root (.git). Required when deleteBranchToo: the teardown is PAIRED. */
  projectDir: string;
  spikeSlug: string;
  /** Delete the Lakebase branch + git branch. Default true for spikes (they're throwaway by definition). */
  deleteBranchToo?: boolean;
}

export async function deleteSpike(args: DeleteSpikeArgs): Promise<void> {
  const { sftddDir, projectDir, spikeSlug, deleteBranchToo = true, ...lookup } = args;
  const dir = join(sftddDir, "spikes", spikeSlug);
  if (!existsSync(dir)) throw new Error(`spike ${spikeSlug} not found at ${dir}`);
  if (deleteBranchToo) {
    const branchId = readFileSync(join(dir, "branch.txt"), "utf8").trim();
    // PAIRED teardown: Lakebase branch + git branch (local + remote). Best-effort.
    await deletePairedBranch({ instance: lookup.instance, branch: branchId, cwd: projectDir });
  }
  // Notes preserved on disk so the learning survives the branch teardown.
}
