#!/usr/bin/env node
/** The bundled seed dir (overridable for tests). */
declare function bundledSeedDir(): string;
interface StageResult {
    seedDir: string;
    consortDir: string;
    staged: string[];
    features: string[];
}
/**
 * Copy the bundled first-project seed into <projectDir>/.consort/. Returns what was
 * staged. Throws only if the seed itself is missing (a packaging fault) – the callers
 * (bin + start.md) surface that clearly rather than half-staging silently.
 */
declare function stageFirstProject(opts?: {
    projectDir?: string;
    seedDir?: string;
}): StageResult;
interface SeedCommitResult {
    committed: boolean;
    branch?: string;
    reason?: string;
}
/**
 * Commit exactly the staged seed paths onto the current (base) branch so the first feature
 * fork sees a clean tree. stageFirstProject only COPIES the seed into the work tree; the
 * first `/design <F>` then refuses to fork a dirty staging tree and halts at Step 0. This
 * closes that one-time setup friction on the real path. Scoped to the exact paths (never
 * `git add -A`). Best-effort by design: a non-git dir, an empty seed, or an idempotent
 * re-stage with no diff is a no-op (committed === false) rather than an error.
 */
declare function commitStagedSeed(projectDir: string, staged: string[]): SeedCommitResult;

export { type SeedCommitResult, type StageResult, bundledSeedDir, commitStagedSeed, stageFirstProject };
