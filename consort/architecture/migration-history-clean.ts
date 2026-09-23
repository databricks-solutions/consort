// Deterministic shipped-migration-immutability check (the schema-history-corruption
// smell, issue #196). A migration that exists at the feature's fork point – i.e. it
// shipped with a MERGED feature – is an immutable historical artifact: editing,
// deleting, or renaming it rewrites schema history, and any branch where the original
// already ran replays into a hard failure (DuplicateObject, or a silently divergent
// schema). The only legal write in the migration dirs is ADDING a new migration for
// the current unit of work.
//
// This catches the mutation DETERMINISTICALLY, no model judgment: diff the migration
// dirs between the fork point (git merge-base with the parent tier) and HEAD. M / D /
// R / T entries on files present at the fork point are violations; A (a new
// migration) is always fine. A Driver that "needs" to edit a shipped migration to
// green a test has a MIS-PREMISED test: the honest-GREEN verify passes on the
// doctored history (that is exactly why this corruption ships silently), so the guard
// flips the cycle to failed with a revert + flag-premise directive instead.
//
// Mirrors the `migration-app-clean` / `contract-clean` / `layering-clean` gates:
// advisory on uncertainty (no git repo, no resolvable parent, no common ancestor)
// rather than failing a cycle on an unestablished boundary.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

export interface MigrationHistoryCleanArgs {
  /** Project working-tree root (a git repo). */
  projectDir: string;
  /** Migration dirs to guard (relative to projectDir). Default: common locations. */
  migrationDirs?: string[];
  /** Parent-tier ref to measure "shipped" against (e.g. "staging", "origin/main").
   *  Default: first resolvable of the usual tier candidates. */
  parentRef?: string;
}

export interface MigrationHistoryViolation {
  /** "M" modified | "D" deleted | "R" renamed (old path) | "T" type-changed. */
  status: "M" | "D" | "R" | "T";
  /** Project-relative path of the SHIPPED migration that was mutated. */
  file: string;
}

export interface MigrationHistoryCleanResult {
  clean: boolean;
  violations: MigrationHistoryViolation[];
  /** A precise, Driver-actionable revert + flag-premise directive, when unclean. */
  remediation?: string;
  /** Set when the boundary could not be established (advisory skip): the check
   *  reports clean and names why, so the caller can log the skip honestly. */
  skippedReason?: string;
}

const DEFAULT_MIGRATION_DIRS = ["alembic/versions", "migrations", "db/migrations", "src/migrations"];
const PARENT_CANDIDATES = [
  "origin/staging", "staging",
  "origin/develop", "origin/dev", "develop", "dev",
  "origin/main", "origin/master", "main", "master",
];

function git(args: string[], cwd: string): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function gitOk(args: string[], cwd: string): boolean {
  try {
    execFileSync("git", args, { cwd, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** The parent-tier ref: explicit arg, else the first resolvable candidate. */
function resolveParentRef(projectDir: string, explicit?: string): string | undefined {
  if (explicit) return gitOk(["rev-parse", "--verify", "--quiet", explicit], projectDir) ? explicit : undefined;
  return PARENT_CANDIDATES.find((ref) => gitOk(["rev-parse", "--verify", "--quiet", ref], projectDir));
}

/**
 * Diff the migration dirs between the fork point (merge-base with the parent tier)
 * and HEAD. Files present at the fork point are SHIPPED: any M/D/R/T is a violation.
 */
export function checkShippedMigrationImmutable(args: MigrationHistoryCleanArgs): MigrationHistoryCleanResult {
  const { projectDir } = args;
  if (!existsSync(join(projectDir, ".git"))) {
    return { clean: true, violations: [], skippedReason: "not a git repo" };
  }
  const parentRef = resolveParentRef(projectDir, args.parentRef);
  if (!parentRef) {
    return { clean: true, violations: [], skippedReason: "no parent-tier ref resolves" };
  }
  let base: string;
  try {
    base = git(["merge-base", "HEAD", parentRef], projectDir);
  } catch {
    return { clean: true, violations: [], skippedReason: `no common ancestor with ${parentRef}` };
  }
  if (!base) {
    return { clean: true, violations: [], skippedReason: `no common ancestor with ${parentRef}` };
  }

  const migrationDirs = (args.migrationDirs ?? DEFAULT_MIGRATION_DIRS).filter((d) => existsSync(join(projectDir, d)));
  if (migrationDirs.length === 0) {
    return { clean: true, violations: [], skippedReason: "no migration dirs present" };
  }

  const out = git(["diff", "--name-status", `${base}..HEAD`, "--", ...migrationDirs], projectDir);
  const violations: MigrationHistoryViolation[] = [];
  for (const line of out.split("\n")) {
    if (!line) continue;
    const [rawStatus, ...paths] = line.split("\t");
    const status = rawStatus[0];
    if (status === "A") continue; // a NEW migration is the only legal write
    if (status === "M" || status === "D" || status === "R" || status === "T") {
      // For R (rename) paths[0] is the OLD path, which is the shipped one.
      violations.push({ status, file: paths[0] });
    }
  }
  if (violations.length === 0) return { clean: true, violations: [] };

  const list = violations.map((v) => `  ${v.status}  ${v.file}`).join("\n");
  const reverts = violations
    .filter((v) => v.status === "M" || v.status === "T")
    .map((v) => `  git checkout ${base.slice(0, 12)} -- ${v.file}`)
    .join("\n");
  const remediation =
    `SHIPPED-MIGRATION-IMMUTABILITY: the migration(s) below shipped with a MERGED feature and were mutated` +
    ` on this branch. A shipped migration is an immutable historical artifact: replaying the mutated history` +
    ` on any branch where the original already ran corrupts the schema (DuplicateObject / divergent schema).` +
    ` The only legal write here is ADDING a new migration for the current feature.\n` +
    `Violations (vs fork point ${base.slice(0, 12)} with ${parentRef}):\n${list}\n` +
    (reverts ? `Revert each mutation (restore the shipped content, then re-apply your change as a NEW migration):\n${reverts}\n` : "") +
    (violations.some((v) => v.status === "D" || v.status === "R")
      ? `Restore deleted/renamed files from the fork point (git checkout ${base.slice(0, 12)} -- <path>).\n`
      : "") +
    `If a failing test REQUIRED this edit, the test's premise contradicts the shipped schema – do NOT bend` +
    ` history to green it. Revert, then flag the test as suspect (consort-cycle flag-superseded) or escalate` +
    ` to the human; never edit, delete, or rename a shipped migration.`;
  return { clean: false, violations, remediation };
}
