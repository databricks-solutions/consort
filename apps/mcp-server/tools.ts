// Tool registry for the lakebase-app-dev-kit MCP server.
//
// Each tool wraps a script module function (NOT a subprocess). The MCP
// server exposes these by name + JSON Schema; an MCP-capable agent
// (Claude Desktop, OpenAI Codex, Cursor-via-MCP) reads the schema,
// validates user input, and invokes the handler over stdio.
//
// The tool list is the same five-target reach surface documented in the
// repo README; CLI behavior is in scripts/lakebase/<verb>.cli.ts, the
// canonical implementations these tools delegate to live in the matching
// non-.cli files.

import { getConnection } from "@databricks-solutions/lakebase-scm-utils/lakebase";
import { getSchemaDiff } from "@databricks-solutions/lakebase-scm-utils/lakebase";
import { createProject, type CreateProjectArgs } from "../../scripts/lakebase/create-project.js";
import { resolveGitHubToken, diagnoseGitHubAuth } from "@databricks-solutions/lakebase-scm-utils/github";
import {
  applySchemaMigrations,
  rollbackSchemaMigration,
  schemaMigrationStatus,
  listSchemaMigrations,
  type SchemaMigrationLanguage,
} from "@databricks-solutions/lakebase-scm-utils/lakebase";
import { getFeatureStatus } from "../../scripts/sftdd/feature-status.js";
import { resolveSftddDir } from "../../scripts/sftdd/sftdd-paths.js";
// PR-flow MCP tools.
import {
  createPullRequest,
  getPullRequest,
  getPullRequestReviews,
  getPullRequestFiles,
  getPullRequestComments,
  mergePullRequest,
  mergePairedPullRequest,
} from "@databricks-solutions/lakebase-scm-utils/github";
// doctor MCP tool.
import { runHealthDoctor as runDoctor } from "@databricks-solutions/lakebase-scm-utils/lakebase";
// workflow drift MCP tool.
import { detectWorkflowDrift } from "@databricks-solutions/lakebase-scm-utils/lakebase";
// branch MCP tools (full parity with the CLI).
import {
  listBranches,
  getBranchByName,
} from "@databricks-solutions/lakebase-scm-utils/lakebase";
import {
  createPairedBranch,
  deletePairedBranch,
  checkoutPaired,
  syncEnvToCurrentBranch,
} from "@databricks-solutions/lakebase-scm-utils/lakebase";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

function requireString(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  if (typeof v !== "string" || v.length === 0) {
    throw new Error(`'${key}' is required`);
  }
  return v;
}

function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

export const TOOLS: ToolDefinition[] = [
  {
    name: "lakebase_get_connection",
    description:
      "Mint a Postgres DSN string for a Lakebase branch. Single-seam credential handoff: this is the only path that mints Lakebase credentials.",
    inputSchema: {
      type: "object",
      properties: {
        instance: { type: "string", description: "Lakebase project (instance) id." },
        branch: { type: "string", description: "Branch id within the project." },
        endpointName: {
          type: "string",
          description: "Endpoint identifier on the branch. Default: 'primary'.",
        },
        database: {
          type: "string",
          description: "Database name. Default: $PGDATABASE or 'databricks_postgres'.",
        },
      },
      required: ["instance", "branch"],
      additionalProperties: false,
    },
    handler: async (args) => {
      return await getConnection({
        output: "dsn",
        instance: requireString(args, "instance"),
        branch: requireString(args, "branch"),
        endpointName: optionalString(args, "endpointName"),
        database: optionalString(args, "database"),
      });
    },
  },
  {
    name: "lakebase_schema_diff",
    description:
      "Parent-aware schema diff between two Lakebase branches. If 'against' is omitted, parent is resolved from Lakebase metadata (sourceBranchId, falling back to the project's default branch).",
    inputSchema: {
      type: "object",
      properties: {
        instance: { type: "string", description: "Lakebase project (instance) id." },
        branch: { type: "string", description: "Target branch to diff FOR." },
        against: {
          type: "string",
          description: "Explicit parent branch. Default: resolved from metadata.",
        },
        database: {
          type: "string",
          description: "Database name. Default: $PGDATABASE or 'databricks_postgres'.",
        },
      },
      required: ["instance", "branch"],
      additionalProperties: false,
    },
    handler: async (args) => {
      return await getSchemaDiff({
        instance: requireString(args, "instance"),
        branch: requireString(args, "branch"),
        comparisonBranch: optionalString(args, "against"),
        database: optionalString(args, "database"),
      });
    },
  },
  {
    name: "lakebase_github_token",
    description:
      "Resolve a GitHub token via the unified fallback chain (GITHUB_TOKEN env → VS Code session → gh auth token). Use 'diagnose: true' to inspect which sources are available WITHOUT revealing the token value.",
    inputSchema: {
      type: "object",
      properties: {
        diagnose: {
          type: "boolean",
          description:
            "If true, return { sources, primary, scopes } instead of the token itself. Safe to log.",
        },
      },
      additionalProperties: false,
    },
    handler: async (args) => {
      if (args.diagnose === true) {
        return await diagnoseGitHubAuth();
      }
      const token = await resolveGitHubToken();
      const { primary } = await diagnoseGitHubAuth();
      return { token, source: primary };
    },
  },
  {
    name: "lakebase_create_project",
    description:
      "Bootstrap a fresh Lakebase-paired project end-to-end: Lakebase project + parent branch, GitHub repo (optional), Actions runner, repo secrets, local scaffold.",
    inputSchema: {
      type: "object",
      properties: {
        projectName: { type: "string", description: "Project name (Lakebase id + local dir)." },
        parentDir: { type: "string", description: "Parent directory for the new project dir." },
        databricksHost: {
          type: "string",
          description: "Databricks workspace URL (https://....cloud.databricks.com).",
        },
        githubOwner: {
          type: "string",
          description: "GitHub user/org for the repo. Required unless createGithubRepo=false.",
        },
        createGithubRepo: {
          type: "boolean",
          description: "Create a GitHub repo? Default: true.",
        },
        privateRepo: {
          type: "boolean",
          description: "Make the GitHub repo private? Default: true.",
        },
        language: {
          type: "string",
          enum: ["java", "kotlin", "python", "nodejs"],
          description: "Project language. Default: 'java'.",
        },
        runnerType: {
          type: "string",
          enum: ["self-hosted", "github-hosted"],
          description: "Actions runner mode. Default: 'self-hosted'.",
        },
      },
      required: ["projectName", "parentDir", "databricksHost"],
      additionalProperties: false,
    },
    handler: async (args) => {
      const input: CreateProjectArgs = {
        projectName: requireString(args, "projectName"),
        parentDir: requireString(args, "parentDir"),
        databricksHost: requireString(args, "databricksHost"),
        githubOwner: optionalString(args, "githubOwner"),
        createGithubRepo: typeof args.createGithubRepo === "boolean" ? args.createGithubRepo : undefined,
        privateRepo: typeof args.privateRepo === "boolean" ? args.privateRepo : undefined,
        language: optionalString(args, "language") as CreateProjectArgs["language"],
        runnerType: optionalString(args, "runnerType") as CreateProjectArgs["runnerType"],
      };
      return await createProject(input);
    },
  },
  {
    name: "lakebase_list_migrations",
    description:
      "Enumerate migration files on disk for a paired project. No DB connection. Auto-detects language (java/kotlin via pom.xml + Flyway, python via pyproject.toml/alembic.ini + Alembic, nodejs via package.json + Knex).",
    inputSchema: {
      type: "object",
      properties: {
        projectDir: { type: "string", description: "Project root. Default: cwd of the MCP server." },
        language: {
          type: "string",
          enum: ["java", "kotlin", "python", "nodejs"],
          description: "Override language detection.",
        },
      },
      additionalProperties: false,
    },
    handler: async (args) => {
      return listSchemaMigrations({
        projectDir: optionalString(args, "projectDir"),
        language: optionalString(args, "language") as SchemaMigrationLanguage | undefined,
      });
    },
  },
  {
    name: "lakebase_apply_migrations",
    description:
      "Apply pending forward migrations against a Lakebase branch. Supports Python/Alembic, Java+Kotlin/Flyway, and Node/Knex. Auto-detects the language from project markers (alembic.ini, pom.xml, knexfile.{js,ts}).",
    inputSchema: {
      type: "object",
      properties: {
        instance: { type: "string", description: "Lakebase project (instance) id." },
        branch: { type: "string", description: "Branch to migrate against." },
        projectDir: { type: "string", description: "Project root. Default: cwd." },
        language: {
          type: "string",
          enum: ["java", "kotlin", "python", "nodejs"],
          description: "Override language detection.",
        },
        database: { type: "string", description: "Database name. Default: $PGDATABASE or 'databricks_postgres'." },
        endpointName: { type: "string", description: "Endpoint identifier on the branch. Default: 'primary'." },
      },
      required: ["instance", "branch"],
      additionalProperties: false,
    },
    handler: async (args) => {
      return applySchemaMigrations({
        instance: requireString(args, "instance"),
        branch: requireString(args, "branch"),
        projectDir: optionalString(args, "projectDir"),
        language: optionalString(args, "language") as SchemaMigrationLanguage | undefined,
        database: optionalString(args, "database"),
        endpointName: optionalString(args, "endpointName"),
      });
    },
  },
  {
    name: "lakebase_rollback_migration",
    description:
      "Roll back applied migrations on a Lakebase branch down to a target version. Supported for Python/Alembic + Node/Knex; NOT supported for Java+Kotlin/Flyway (Flyway Community Edition has no `undo`). For Alembic, 'target' can be a revision id or a relative step like '-1'. For Knex, use 'all' or '0' for full rollback; other values roll back the last batch.",
    inputSchema: {
      type: "object",
      properties: {
        instance: { type: "string", description: "Lakebase project (instance) id." },
        branch: { type: "string", description: "Branch to roll back." },
        target: { type: "string", description: "Revision id or relative step (e.g., '-1' for one step down)." },
        projectDir: { type: "string", description: "Project root. Default: cwd." },
        language: {
          type: "string",
          enum: ["java", "kotlin", "python", "nodejs"],
          description: "Override language detection.",
        },
        database: { type: "string", description: "Database name. Default: $PGDATABASE or 'databricks_postgres'." },
        endpointName: { type: "string", description: "Endpoint identifier on the branch. Default: 'primary'." },
      },
      required: ["instance", "branch", "target"],
      additionalProperties: false,
    },
    handler: async (args) => {
      return rollbackSchemaMigration({
        instance: requireString(args, "instance"),
        branch: requireString(args, "branch"),
        target: requireString(args, "target"),
        projectDir: optionalString(args, "projectDir"),
        language: optionalString(args, "language") as SchemaMigrationLanguage | undefined,
        database: optionalString(args, "database"),
        endpointName: optionalString(args, "endpointName"),
      });
    },
  },
  {
    name: "lakebase_migration_status",
    description:
      "Report the currently-applied migration version and the list of pending migrations for a Lakebase branch.",
    inputSchema: {
      type: "object",
      properties: {
        instance: { type: "string", description: "Lakebase project (instance) id." },
        branch: { type: "string", description: "Branch to inspect." },
        projectDir: { type: "string", description: "Project root. Default: cwd." },
        language: {
          type: "string",
          enum: ["java", "kotlin", "python", "nodejs"],
          description: "Override language detection.",
        },
        database: { type: "string", description: "Database name. Default: $PGDATABASE or 'databricks_postgres'." },
        endpointName: { type: "string", description: "Endpoint identifier on the branch. Default: 'primary'." },
      },
      required: ["instance", "branch"],
      additionalProperties: false,
    },
    handler: async (args) => {
      return schemaMigrationStatus({
        instance: requireString(args, "instance"),
        branch: requireString(args, "branch"),
        projectDir: optionalString(args, "projectDir"),
        language: optionalString(args, "language") as SchemaMigrationLanguage | undefined,
        database: optionalString(args, "database"),
        endpointName: optionalString(args, "endpointName"),
      });
    },
  },
  {
    name: "lakebase_feature_status",
    description:
      "One-screen snapshot of a feature's TDD workflow state (phase, plan, test-list completion, experiments, recent decisions, open smells). Reads .tdd/ on disk; no Lakebase or network calls. See skills/lakebase-sftdd-workflows/references/feature-status-schema.md for the stable payload contract.",
    inputSchema: {
      type: "object",
      properties: {
        featureId: { type: "string", description: "Feature id (e.g., 'F1-checkout')." },
        sftddDir: { type: "string", description: "Path to the .tdd/ directory. Default: './.tdd'." },
      },
      required: ["featureId"],
      additionalProperties: false,
    },
    handler: async (args) => {
      return getFeatureStatus(
        optionalString(args, "sftddDir") ?? resolveSftddDir(),
        requireString(args, "featureId")
      );
    },
  },
  // ------------------------- PR tools -------------------------
  {
    name: "lakebase_pr_open",
    description: "Create a GitHub pull request via the REST API. Returns the PR html_url.",
    inputSchema: {
      type: "object",
      properties: {
        ownerRepo: { type: "string", description: "GitHub repo slug (owner/repo)." },
        headBranch: { type: "string", description: "Head branch with the changes." },
        title: { type: "string", description: "PR title." },
        body: { type: "string", description: "PR body (markdown)." },
        baseBranch: { type: "string", description: "Target base branch. Default: repo default." },
      },
      required: ["ownerRepo", "headBranch", "title", "body"],
      additionalProperties: false,
    },
    handler: async (args) => {
      const url = await createPullRequest({
        ownerRepo: requireString(args, "ownerRepo"),
        headBranch: requireString(args, "headBranch"),
        title: requireString(args, "title"),
        body: requireString(args, "body"),
        baseBranch: optionalString(args, "baseBranch"),
      });
      return { url };
    },
  },
  {
    name: "lakebase_pr_merge",
    description: "Merge a GitHub pull request. Default deletes the remote head branch on merge.",
    inputSchema: {
      type: "object",
      properties: {
        ownerRepo: { type: "string", description: "GitHub repo slug (owner/repo)." },
        pullNumber: { type: "number", description: "PR number to merge." },
        method: { type: "string", enum: ["merge", "squash", "rebase"], description: "Merge method. Default: merge." },
        deleteRemoteBranch: { type: "boolean", description: "Delete remote head after merge. Default: true." },
      },
      required: ["ownerRepo", "pullNumber"],
      additionalProperties: false,
    },
    handler: async (args) => {
      const num = args.pullNumber;
      if (typeof num !== "number") throw new Error("'pullNumber' must be a number");
      const { message, sha } = await mergePullRequest({
        ownerRepo: requireString(args, "ownerRepo"),
        pullNumber: num,
        method: optionalString(args, "method") as "merge" | "squash" | "rebase" | undefined,
        deleteRemoteBranch: typeof args.deleteRemoteBranch === "boolean" ? (args.deleteRemoteBranch as boolean) : undefined,
      });
      return { message, sha };
    },
  },
  {
    name: "lakebase_pr_merge_paired",
    description: "Merge a GitHub PR AND delete the matching feature branch in the Lakebase project. Single-call workflow cleanup.",
    inputSchema: {
      type: "object",
      properties: {
        ownerRepo: { type: "string", description: "GitHub repo slug (owner/repo)." },
        pullNumber: { type: "number", description: "PR number to merge." },
        lakebaseInstance: { type: "string", description: "Lakebase project id used to clean up the feature branch." },
        method: { type: "string", enum: ["merge", "squash", "rebase"], description: "Merge method. Default: merge." },
        deleteRemoteBranch: { type: "boolean", description: "Delete remote head after merge. Default: true." },
        deleteLakebaseBranch: { type: "boolean", description: "Delete the Lakebase feature branch. Default: true." },
      },
      required: ["ownerRepo", "pullNumber", "lakebaseInstance"],
      additionalProperties: false,
    },
    handler: async (args) => {
      const num = args.pullNumber;
      if (typeof num !== "number") throw new Error("'pullNumber' must be a number");
      return mergePairedPullRequest({
        ownerRepo: requireString(args, "ownerRepo"),
        pullNumber: num,
        lakebaseInstance: requireString(args, "lakebaseInstance"),
        method: optionalString(args, "method") as "merge" | "squash" | "rebase" | undefined,
        deleteRemoteBranch: typeof args.deleteRemoteBranch === "boolean" ? (args.deleteRemoteBranch as boolean) : undefined,
        deleteLakebaseBranch: typeof args.deleteLakebaseBranch === "boolean" ? (args.deleteLakebaseBranch as boolean) : undefined,
      });
    },
  },
  {
    name: "lakebase_pr_status",
    description: "Look up an OPEN pull request by head branch. Returns state, CI checks, counts, review decision. Returns undefined if no open PR exists for that head.",
    inputSchema: {
      type: "object",
      properties: {
        ownerRepo: { type: "string", description: "GitHub repo slug (owner/repo)." },
        headBranch: { type: "string", description: "Head branch to look up." },
      },
      required: ["ownerRepo", "headBranch"],
      additionalProperties: false,
    },
    handler: async (args) => {
      const info = await getPullRequest(
        requireString(args, "ownerRepo"),
        requireString(args, "headBranch")
      );
      return info ?? null;
    },
  },
  {
    name: "lakebase_pr_files",
    description: "List files changed by a pull request, with status (added / modified / removed / renamed) and per-file diff stats.",
    inputSchema: {
      type: "object",
      properties: {
        ownerRepo: { type: "string", description: "GitHub repo slug (owner/repo)." },
        pullNumber: { type: "number", description: "PR number." },
      },
      required: ["ownerRepo", "pullNumber"],
      additionalProperties: false,
    },
    handler: async (args) => {
      const num = args.pullNumber;
      if (typeof num !== "number") throw new Error("'pullNumber' must be a number");
      return getPullRequestFiles(requireString(args, "ownerRepo"), num);
    },
  },
  {
    name: "lakebase_pr_reviews",
    description: "List reviews on a pull request (APPROVED / CHANGES_REQUESTED / COMMENTED / etc.).",
    inputSchema: {
      type: "object",
      properties: {
        ownerRepo: { type: "string", description: "GitHub repo slug (owner/repo)." },
        pullNumber: { type: "number", description: "PR number." },
      },
      required: ["ownerRepo", "pullNumber"],
      additionalProperties: false,
    },
    handler: async (args) => {
      const num = args.pullNumber;
      if (typeof num !== "number") throw new Error("'pullNumber' must be a number");
      return getPullRequestReviews(requireString(args, "ownerRepo"), num);
    },
  },
  {
    name: "lakebase_pr_comments",
    description: "List top-level issue comments on a pull request (separate from review-thread comments).",
    inputSchema: {
      type: "object",
      properties: {
        ownerRepo: { type: "string", description: "GitHub repo slug (owner/repo)." },
        pullNumber: { type: "number", description: "PR number." },
      },
      required: ["ownerRepo", "pullNumber"],
      additionalProperties: false,
    },
    handler: async (args) => {
      const num = args.pullNumber;
      if (typeof num !== "number") throw new Error("'pullNumber' must be a number");
      return getPullRequestComments(requireString(args, "ownerRepo"), num);
    },
  },
  // ------------------------- doctor -------------------------
  {
    name: "lakebase_doctor",
    description: "Run health checks on a Lakebase project: CLI version + auth, .env shape, project reachability, git remote, language, git hooks. Returns a structured report with per-check status + remediation hints.",
    inputSchema: {
      type: "object",
      properties: {
        projectDir: { type: "string", description: "Project directory to inspect. Default: server cwd." },
        profile: { type: "string", description: "Databricks CLI profile. Default: $DATABRICKS_CONFIG_PROFILE." },
        host: { type: "string", description: "Workspace host override." },
      },
      additionalProperties: false,
    },
    handler: async (args) => {
      return runDoctor({
        projectDir: optionalString(args, "projectDir"),
        profile: optionalString(args, "profile"),
        host: optionalString(args, "host"),
      });
    },
  },
  // ------------------------- workflow drift ----------------------
  {
    name: "lakebase_workflow_drift",
    description: "Detect drift between a scaffolded project's .github/workflows/*.yml and the kit's current templates. Returns per-file status (unchanged / drifted / missing / extra) and a unified diff for drifted files. Use when a maintainer wants to know if a project's CI templates are stale vs the kit it pins.",
    inputSchema: {
      type: "object",
      properties: {
        projectDir: { type: "string", description: "Project directory containing .github/workflows/." },
        kitDir: { type: "string", description: "Override the kit directory (default: bundled templates path)." },
      },
      required: ["projectDir"],
      additionalProperties: false,
    },
    handler: async (args) => {
      return detectWorkflowDrift({
        projectDir: requireString(args, "projectDir"),
        kitDir: optionalString(args, "kitDir"),
      });
    },
  },
  // ------------------------- branch read tools -------------
  {
    name: "lakebase_branch_list",
    description: "List branches on a Lakebase project (name, uid, parent, expiration, state).",
    inputSchema: {
      type: "object",
      properties: {
        instance: { type: "string", description: "Lakebase project id." },
        host: { type: "string", description: "Workspace host override." },
      },
      required: ["instance"],
      additionalProperties: false,
    },
    handler: async (args) => {
      return listBranches({
        instance: requireString(args, "instance"),
        host: optionalString(args, "host"),
      });
    },
  },
  {
    name: "lakebase_branch_show",
    description: "Look up a single Lakebase branch by name or uid. Returns undefined if not found.",
    inputSchema: {
      type: "object",
      properties: {
        instance: { type: "string", description: "Lakebase project id." },
        branch: { type: "string", description: "Branch name or uid." },
        host: { type: "string", description: "Workspace host override." },
      },
      required: ["instance", "branch"],
      additionalProperties: false,
    },
    handler: async (args) => {
      const info = await getBranchByName(requireString(args, "branch"), {
        instance: requireString(args, "instance"),
        host: optionalString(args, "host"),
      });
      return info ?? null;
    },
  },
  // NOTE: the unpaired `lakebase_branch_create` tool was DELETED. It exposed a
  // Lakebase-only create (no git branch, no .env) to agents. Every branch is
  // paired through the substrate; use lakebase_branch_create_paired below.
  {
    name: "lakebase_branch_create_paired",
    description: "Create a Lakebase branch + matching local git branch + .env update in one call. The canonical 'fork from current' workflow op (mirrors the post-checkout git hook).",
    inputSchema: {
      type: "object",
      properties: {
        instance: { type: "string", description: "Lakebase project id." },
        branch: { type: "string", description: "Branch name (used for both Lakebase and git)." },
        parentBranch: { type: "string", description: "Lakebase parent branch override." },
        cwd: { type: "string", description: "Project directory (must contain .git/). Default: server cwd." },
        createGitBranch: { type: "boolean", description: "Create + switch the local git branch. Default: true." },
        syncEnv: { type: "boolean", description: "Rewrite .env to point at the new endpoint. Default: true." },
        database: { type: "string", description: "Postgres database name. Default: 'databricks_postgres'." },
      },
      required: ["instance", "branch"],
      additionalProperties: false,
    },
    handler: async (args) => {
      return createPairedBranch({
        instance: requireString(args, "instance"),
        branch: requireString(args, "branch"),
        parentBranch: optionalString(args, "parentBranch"),
        cwd: optionalString(args, "cwd") ?? process.cwd(),
        createGitBranch: typeof args.createGitBranch === "boolean" ? (args.createGitBranch as boolean) : undefined,
        syncEnv: typeof args.syncEnv === "boolean" ? (args.syncEnv as boolean) : undefined,
        database: optionalString(args, "database"),
      });
    },
  },
  // NOTE: the unpaired `lakebase_branch_create_tier` tool was DELETED. It made a
  // Lakebase branch with no git branch + no .env sync. Use the paired tier-create
  // tool above: every branch is paired through the substrate.
  // NOTE: the unpaired `lakebase_branch_delete` tool was DELETED. Use
  // lakebase_branch_delete_paired so the git branch is cleaned up alongside the
  // Lakebase branch.
  {
    name: "lakebase_branch_delete_paired",
    description: "Delete a Lakebase branch + local git branch + remote git branch in one call. Skips deletion of branches that are currently checked out (local) or absent (remote). Default deletes everything; pass deleteGitLocal/deleteGitRemote: false to skip a side.",
    inputSchema: {
      type: "object",
      properties: {
        instance: { type: "string", description: "Lakebase project id." },
        branch: { type: "string", description: "Branch name." },
        cwd: { type: "string", description: "Project directory (must contain .git/). Default: server cwd." },
        deleteGitLocal: { type: "boolean", description: "Delete the local git branch. Default: true." },
        deleteGitRemote: { type: "boolean", description: "Delete the remote git branch. Default: true." },
        gitRemote: { type: "string", description: "Git remote name. Default: 'origin'." },
      },
      required: ["instance", "branch"],
      additionalProperties: false,
    },
    handler: async (args) => {
      return deletePairedBranch({
        instance: requireString(args, "instance"),
        branch: requireString(args, "branch"),
        cwd: optionalString(args, "cwd") ?? process.cwd(),
        deleteGitLocal: typeof args.deleteGitLocal === "boolean" ? (args.deleteGitLocal as boolean) : undefined,
        deleteGitRemote: typeof args.deleteGitRemote === "boolean" ? (args.deleteGitRemote as boolean) : undefined,
        gitRemote: optionalString(args, "gitRemote"),
      });
    },
  },
  {
    name: "lakebase_branch_checkout_paired",
    description: "In-process equivalent of the post-checkout git hook: sync .env to the current git branch's matching Lakebase endpoint. Use after switching git branches outside the hook flow.",
    inputSchema: {
      type: "object",
      properties: {
        cwd: { type: "string", description: "Project directory (must contain .env). Default: server cwd." },
        branch: { type: "string", description: "Target git branch override. Default: read current via git." },
        instance: { type: "string", description: "Lakebase instance override. Default: read LAKEBASE_PROJECT_ID from .env." },
        trunkAlias: { type: "string", description: "Git branch name that should pair with the project's default Lakebase branch. Mirrors LAKEBASE_TRUNK_BRANCH from the post-checkout hook." },
      },
      additionalProperties: false,
    },
    handler: async (args) => {
      return checkoutPaired({
        cwd: optionalString(args, "cwd") ?? process.cwd(),
        branch: optionalString(args, "branch"),
        instance: optionalString(args, "instance"),
        trunkAlias: optionalString(args, "trunkAlias"),
      });
    },
  },
  {
    name: "lakebase_branch_sync_env",
    description: "Refresh .env to point at the current branch's endpoint. Recovery for .env drift; equivalent of the post-checkout hook minus the git-branch step.",
    inputSchema: {
      type: "object",
      properties: {
        cwd: { type: "string", description: "Project directory (must contain .env and .git/). Default: server cwd." },
        instance: { type: "string", description: "Lakebase instance override. Default: read LAKEBASE_PROJECT_ID from .env." },
        branch: { type: "string", description: "Branch name override. Default: current git branch (sanitized)." },
        database: { type: "string", description: "Postgres database name. Default: 'databricks_postgres'." },
      },
      additionalProperties: false,
    },
    handler: async (args) => {
      return syncEnvToCurrentBranch({
        cwd: optionalString(args, "cwd") ?? process.cwd(),
        instance: optionalString(args, "instance"),
        branch: optionalString(args, "branch"),
        database: optionalString(args, "database"),
      });
    },
  },
];

export function findTool(name: string): ToolDefinition | undefined {
  return TOOLS.find((t) => t.name === name);
}
