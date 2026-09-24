#!/usr/bin/env node
"use strict";

// consort/architecture/migration-history-clean.ts
var import_node_child_process = require("child_process");
var import_node_fs = require("fs");
var import_node_path = require("path");
var DEFAULT_MIGRATION_DIRS = ["alembic/versions", "migrations", "db/migrations", "src/migrations"];
var PARENT_CANDIDATES = [
  "origin/staging",
  "staging",
  "origin/develop",
  "origin/dev",
  "develop",
  "dev",
  "origin/main",
  "origin/master",
  "main",
  "master"
];
function git(args, cwd) {
  return (0, import_node_child_process.execFileSync)("git", args, { cwd, encoding: "utf8" }).trim();
}
function gitOk(args, cwd) {
  try {
    (0, import_node_child_process.execFileSync)("git", args, { cwd, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
function resolveParentRef(projectDir, explicit) {
  if (explicit) return gitOk(["rev-parse", "--verify", "--quiet", explicit], projectDir) ? explicit : void 0;
  return PARENT_CANDIDATES.find((ref) => gitOk(["rev-parse", "--verify", "--quiet", ref], projectDir));
}
function checkShippedMigrationImmutable(args) {
  const { projectDir } = args;
  if (!(0, import_node_fs.existsSync)((0, import_node_path.join)(projectDir, ".git"))) {
    return { clean: true, violations: [], skippedReason: "not a git repo" };
  }
  const parentRef = resolveParentRef(projectDir, args.parentRef);
  if (!parentRef) {
    return { clean: true, violations: [], skippedReason: "no parent-tier ref resolves" };
  }
  let base;
  try {
    base = git(["merge-base", "HEAD", parentRef], projectDir);
  } catch {
    return { clean: true, violations: [], skippedReason: `no common ancestor with ${parentRef}` };
  }
  if (!base) {
    return { clean: true, violations: [], skippedReason: `no common ancestor with ${parentRef}` };
  }
  const migrationDirs = (args.migrationDirs ?? DEFAULT_MIGRATION_DIRS).filter((d) => (0, import_node_fs.existsSync)((0, import_node_path.join)(projectDir, d)));
  if (migrationDirs.length === 0) {
    return { clean: true, violations: [], skippedReason: "no migration dirs present" };
  }
  const out = git(["diff", "--name-status", `${base}..HEAD`, "--", ...migrationDirs], projectDir);
  const violations = [];
  for (const line of out.split("\n")) {
    if (!line) continue;
    const [rawStatus, ...paths] = line.split("	");
    const status = rawStatus[0];
    if (status === "A") continue;
    if (status === "M" || status === "D" || status === "R" || status === "T") {
      violations.push({ status, file: paths[0] });
    }
  }
  if (violations.length === 0) return { clean: true, violations: [] };
  const list = violations.map((v) => `  ${v.status}  ${v.file}`).join("\n");
  const reverts = violations.filter((v) => v.status === "M" || v.status === "T").map((v) => `  git checkout ${base.slice(0, 12)} -- ${v.file}`).join("\n");
  const remediation = `SHIPPED-MIGRATION-IMMUTABILITY: the migration(s) below shipped with a MERGED feature and were mutated on this branch. A shipped migration is an immutable historical artifact: replaying the mutated history on any branch where the original already ran corrupts the schema (DuplicateObject / divergent schema). The only legal write here is ADDING a new migration for the current feature.
Violations (vs fork point ${base.slice(0, 12)} with ${parentRef}):
${list}
` + (reverts ? `Revert each mutation (restore the shipped content, then re-apply your change as a NEW migration):
${reverts}
` : "") + (violations.some((v) => v.status === "D" || v.status === "R") ? `Restore deleted/renamed files from the fork point (git checkout ${base.slice(0, 12)} -- <path>).
` : "") + `If a failing test REQUIRED this edit, the test's premise contradicts the shipped schema \u2013 do NOT bend history to green it. Revert, then flag the test as suspect (consort-cycle flag-superseded) or escalate to the human; never edit, delete, or rename a shipped migration.`;
  return { clean: false, violations, remediation };
}

// bin/consort/migration-history-clean.cli.ts
function parse(argv) {
  const out = { projectDir: process.cwd(), migrations: [], json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--project-dir" && i + 1 < argv.length) out.projectDir = argv[++i];
    else if (a === "--migrations" && i + 1 < argv.length) out.migrations.push(argv[++i]);
    else if (a === "--parent" && i + 1 < argv.length) out.parent = argv[++i];
    else if (a === "--json") out.json = true;
    else if (a === "-h" || a === "--help") help();
  }
  return out;
}
function help() {
  process.stdout.write(
    `consort-migration-history-clean: prove no shipped migration was mutated on this branch

Usage:
  consort-migration-history-clean [--project-dir <path>] [--migrations <rel> ...] [--parent <ref>] [--json]

Exit 0 = clean (or advisory skip); exit 1 = a shipped migration was edited/deleted/renamed.
`
  );
  process.exit(0);
}
var p = parse(process.argv.slice(2));
var callArgs = { projectDir: p.projectDir };
if (p.migrations.length > 0) callArgs.migrationDirs = p.migrations;
if (p.parent) callArgs.parentRef = p.parent;
var r = checkShippedMigrationImmutable(callArgs);
if (p.json) {
  process.stdout.write(`${JSON.stringify(r)}
`);
} else if (r.clean) {
  process.stdout.write(`migration-history-clean: OK (no shipped migration mutated${r.skippedReason ? `; advisory skip: ${r.skippedReason}` : ""})
`);
} else {
  process.stderr.write(`migration-history-clean: FAILED (${r.violations.length} shipped migration(s) mutated).

${r.remediation}
`);
}
process.exit(r.clean ? 0 : 1);
