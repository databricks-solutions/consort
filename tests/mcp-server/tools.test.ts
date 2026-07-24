// Unit tests for the MCP server tool registry. These exercise the tool
// surface (names, schemas, handlers) without speaking the MCP wire
// protocol – that's covered by handshake.test.ts.

import { describe, it, expect, vi, beforeEach } from "vitest";

// The substrate now lives behind the lakebase-scm-utils barrel, so a single
// mock of that module must spread the real exports (tools.ts imports many
// symbols from it) and override only the two we assert forwarding for.
// createProject is an SFTDD-coupled scaffolder that stays in this kit, so it is
// mocked at its local module path.
vi.mock("@databricks-solutions/lakebase-scm-utils/lakebase", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@databricks-solutions/lakebase-scm-utils/lakebase")>();
  return {
    ...actual,
    getConnection: vi.fn(async (args: unknown) => ({
      url: "postgres://stub@host:5432/db",
      received: args,
    })),
    getSchemaDiff: vi.fn(async (args: unknown) => ({
      target: { branch: "br-feature" },
      parent: { branch: "br-main" },
      changes: [],
      received: args,
    })),
  };
});
vi.mock("../../scripts/lakebase/create-project.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../scripts/lakebase/create-project.js")>();
  return {
    ...actual,
    createProject: vi.fn(async (args: unknown) => ({
      ok: true,
      project: args,
    })),
  };
});
vi.mock("@databricks-solutions/lakebase-scm-utils/github", () => ({
  resolveGitHubToken: vi.fn(async () => "ghs_FAKE_TOKEN"),
  diagnoseGitHubAuth: vi.fn(async () => ({
    sources: ["env", "gh"],
    primary: "env",
    scopes: ["repo", "workflow"],
  })),
}));

import { TOOLS, findTool } from "../../apps/mcp-server/tools.js";

describe("MCP tool registry", () => {
  it("exposes the expected tool surface", () => {
    expect(TOOLS.map((t) => t.name).sort()).toEqual([
      "lakebase_apply_migrations",
      "lakebase_branch_checkout_paired",
      "lakebase_branch_create_paired",
      "lakebase_branch_delete_paired",
      "lakebase_branch_list",
      "lakebase_branch_show",
      "lakebase_branch_sync_env",
      "lakebase_create_project",
      "lakebase_doctor",
      "lakebase_feature_status",
      "lakebase_get_connection",
      "lakebase_github_token",
      "lakebase_list_migrations",
      "lakebase_migration_status",
      "lakebase_pr_comments",
      "lakebase_pr_files",
      "lakebase_pr_merge",
      "lakebase_pr_merge_paired",
      "lakebase_pr_open",
      "lakebase_pr_reviews",
      "lakebase_pr_status",
      "lakebase_rollback_migration",
      "lakebase_schema_diff",
      "lakebase_workflow_drift",
    ]);
  });

  it("every tool has name, description, schema, handler", () => {
    for (const t of TOOLS) {
      expect(t.name).toMatch(/^lakebase_[a-z_]+$/);
      expect(t.description.length).toBeGreaterThan(20);
      expect(t.inputSchema).toMatchObject({ type: "object" });
      expect(typeof t.handler).toBe("function");
    }
  });

  it("get_connection requires instance + branch", () => {
    const tool = findTool("lakebase_get_connection")!;
    const required = (tool.inputSchema as { required?: string[] }).required ?? [];
    expect(required).toContain("instance");
    expect(required).toContain("branch");
  });

  it("schema_diff: instance + branch required, against optional", () => {
    const tool = findTool("lakebase_schema_diff")!;
    const schema = tool.inputSchema as { required?: string[]; properties: Record<string, unknown> };
    expect(schema.required).toEqual(["instance", "branch"]);
    expect(schema.properties).toHaveProperty("against");
  });

  it("create_project: requires projectName + parentDir + databricksHost", () => {
    const tool = findTool("lakebase_create_project")!;
    const schema = tool.inputSchema as { required?: string[]; properties: Record<string, unknown> };
    expect(schema.required).toEqual(["projectName", "parentDir", "databricksHost"]);
    expect(schema.properties).toHaveProperty("language");
    expect(schema.properties).toHaveProperty("runnerType");
  });

  it("github_token has no required args (diagnose-or-token surface)", () => {
    const tool = findTool("lakebase_github_token")!;
    const required = (tool.inputSchema as { required?: string[] }).required;
    expect(required ?? []).toEqual([]);
  });

  it("feature_status: requires featureId, sftddDir optional", () => {
    const tool = findTool("lakebase_feature_status")!;
    const schema = tool.inputSchema as {
      required?: string[];
      properties: Record<string, unknown>;
    };
    expect(schema.required).toEqual(["featureId"]);
    expect(schema.properties).toHaveProperty("featureId");
    expect(schema.properties).toHaveProperty("sftddDir");
  });
});

describe("MCP tool handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("get_connection forwards args to getConnection() with output='dsn'", async () => {
    const tool = findTool("lakebase_get_connection")!;
    const result = await tool.handler({ instance: "proj-abc", branch: "br-feature" });
    expect(result).toMatchObject({
      url: "postgres://stub@host:5432/db",
      received: {
        output: "dsn",
        instance: "proj-abc",
        branch: "br-feature",
      },
    });
  });

  it("get_connection rejects missing instance", async () => {
    const tool = findTool("lakebase_get_connection")!;
    await expect(tool.handler({ branch: "br-only" })).rejects.toThrow(/instance/);
  });

  it("schema_diff maps 'against' to comparisonBranch", async () => {
    const tool = findTool("lakebase_schema_diff")!;
    const result = (await tool.handler({
      instance: "proj-abc",
      branch: "br-feature",
      against: "br-main",
    })) as { received: { comparisonBranch: string } };
    expect(result.received.comparisonBranch).toBe("br-main");
  });

  it("github_token returns { token, source } by default", async () => {
    const tool = findTool("lakebase_github_token")!;
    const result = (await tool.handler({})) as { token: string; source: string };
    expect(result.token).toBe("ghs_FAKE_TOKEN");
    expect(result.source).toBe("env");
  });

  it("github_token with diagnose=true returns diagnosis (no token)", async () => {
    const tool = findTool("lakebase_github_token")!;
    const result = (await tool.handler({ diagnose: true })) as {
      sources: string[];
      primary: string;
      scopes: string[];
    };
    expect(result.sources).toEqual(["env", "gh"]);
    expect(result).not.toHaveProperty("token");
  });

  it("create_project forwards typed enums", async () => {
    const tool = findTool("lakebase_create_project")!;
    const result = (await tool.handler({
      projectName: "demo",
      parentDir: "/tmp",
      databricksHost: "https://example.cloud.databricks.com",
      githubOwner: "me",
      language: "python",
      runnerType: "github-hosted",
    })) as { project: Record<string, unknown> };
    expect(result.project.language).toBe("python");
    expect(result.project.runnerType).toBe("github-hosted");
  });
});
