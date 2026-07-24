// Live BDD: MCP server tool/call against a real Lakebase project.
//
// Complements handshake.test.ts (which covers the JSON-RPC envelope
// with mocked handlers) by exercising the tools
// (lakebase_branch_*, lakebase_doctor) end-to-end through the stdio
// protocol against a freshly-provisioned Lakebase project.
//
// Gating: LAKEBASE_TEST_E2E=1 + DATABRICKS_HOST + DATABRICKS_CONFIG_PROFILE.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  createLakebaseProject,
  deleteLakebaseProject,
} from "@databricks-solutions/lakebase-scm-utils/lakebase";
import { getDefaultBranch } from "@databricks-solutions/lakebase-scm-utils/lakebase";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SERVER_PATH = resolve(__dirname, "../../dist/apps/mcp-server/index.js");

const E2E = process.env.LAKEBASE_TEST_E2E === "1";
const DATABRICKS_HOST = process.env.DATABRICKS_HOST ?? "";
const DATABRICKS_PROFILE =
  process.env.DATABRICKS_CONFIG_PROFILE ?? "DEFAULT";

function hasCmd(cmd: string): boolean {
  const res = spawnSync(cmd, ["--version"], { stdio: "ignore" });
  return res.status === 0;
}
const DATABRICKS_AVAILABLE = E2E ? hasCmd("databricks") : false;
const RUN_SUITE =
  E2E && DATABRICKS_HOST && DATABRICKS_AVAILABLE && fs.existsSync(SERVER_PATH);

// ---- minimal JSON-RPC client over stdio ----
interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

class McpClient {
  private buffer = "";
  private pending = new Map<number, (r: JsonRpcResponse) => void>();
  private nextId = 1;

  constructor(private child: ChildProcessWithoutNullStreams) {
    child.stdout.on("data", (chunk: Buffer) =>
      this.onData(chunk.toString("utf8"))
    );
  }

  private onData(s: string) {
    this.buffer += s;
    let nl: number;
    while ((nl = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, nl).trim();
      this.buffer = this.buffer.slice(nl + 1);
      if (!line) continue;
      let msg: JsonRpcResponse;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      const cb =
        typeof msg.id === "number" ? this.pending.get(msg.id) : undefined;
      if (cb) {
        this.pending.delete(msg.id);
        cb(msg);
      }
    }
  }

  async request(method: string, params: unknown): Promise<JsonRpcResponse> {
    const id = this.nextId++;
    const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params });
    return new Promise<JsonRpcResponse>((resolveResp, reject) => {
      this.pending.set(id, resolveResp);
      this.child.stdin.write(payload + "\n", (err) => err && reject(err));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`Timeout waiting for ${method} (id=${id})`));
        }
      }, 60_000);
    });
  }

  notify(method: string, params: unknown): void {
    const payload = JSON.stringify({ jsonrpc: "2.0", method, params });
    this.child.stdin.write(payload + "\n");
  }
}

function parseContent(result: unknown): unknown {
  const content = (result as { content: { type: string; text: string }[] })
    .content;
  return JSON.parse(content[0].text);
}

describe.skipIf(!RUN_SUITE)(
  "MCP server live tools (surface)",
  () => {
    let projectId: string;
    let defaultBranchName: string;
    let pairedDir: string;
    let child: ChildProcessWithoutNullStreams;
    let client: McpClient;

    beforeAll(async () => {
      projectId = `lbscm-mcp-7327-${Date.now()}`;
      console.log(
        `  [setup] creating Lakebase project ${projectId} on ${DATABRICKS_HOST}`
      );
      await createLakebaseProject({ projectId, host: DATABRICKS_HOST });
      const dflt = await getDefaultBranch({
        instance: projectId,
        host: DATABRICKS_HOST,
      });
      const fullName = dflt?.name ?? "";
      defaultBranchName =
        fullName.split("/branches/").pop() ?? dflt?.uid ?? "production";
      console.log(`  [setup] default branch: ${defaultBranchName}`);

      // Synthetic paired project dir for the doctor tool
      pairedDir = fs.mkdtempSync(path.join(os.tmpdir(), "lbscm-mcp-paired-"));
      fs.writeFileSync(
        path.join(pairedDir, ".env"),
        [
          `DATABRICKS_HOST=${DATABRICKS_HOST}`,
          `LAKEBASE_PROJECT_ID=${projectId}`,
          `LAKEBASE_BRANCH_ID=${defaultBranchName}`,
        ].join("\n") + "\n"
      );
      spawnSync("git", ["init", "-b", "main"], {
        cwd: pairedDir,
        stdio: "ignore",
      });

      // Spawn MCP server
      child = spawn("node", [SERVER_PATH], {
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          DATABRICKS_HOST,
          DATABRICKS_CONFIG_PROFILE: DATABRICKS_PROFILE,
        },
      });
      client = new McpClient(child);

      // Initialize handshake
      await client.request("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "vitest-mcp-live", version: "0.0.0" },
      });
      client.notify("notifications/initialized", {});
    }, 300_000);

    afterAll(async () => {
      if (child && !child.killed) child.kill("SIGTERM");
      try {
        fs.rmSync(pairedDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
      if (projectId) {
        try {
          await deleteLakebaseProject({ projectId, host: DATABRICKS_HOST });
          console.log(`  [teardown] deleted Lakebase project ${projectId}`);
        } catch (err) {
          console.warn(
            `  [teardown] FAILED to delete ${projectId}: ${(err as Error).message}`
          );
        }
      }
    }, 180_000);

    it("tools/list advertises all 27 expected tools", async () => {
      const resp = await client.request("tools/list", {});
      const tools = (resp.result as { tools: { name: string }[] }).tools;
      expect(tools.length).toBe(27);
      const names = tools.map((t) => t.name).sort();
      expect(names).toContain("lakebase_branch_list");
      expect(names).toContain("lakebase_branch_show");
      expect(names).toContain("lakebase_branch_create");
      expect(names).toContain("lakebase_branch_delete");
      expect(names).toContain("lakebase_doctor");
      expect(names).toContain("lakebase_pr_open");
    });

    it("lakebase_branch_list returns real branches from the project", async () => {
      const resp = await client.request("tools/call", {
        name: "lakebase_branch_list",
        arguments: { instance: projectId },
      });
      const branches = parseContent(resp.result) as Array<{
        name: string;
      }>;
      expect(Array.isArray(branches)).toBe(true);
      expect(branches.length).toBeGreaterThan(0);
      const found = branches.some((b) =>
        (b.name ?? "").endsWith(`/${defaultBranchName}`)
      );
      expect(found).toBe(true);
    });

    it("lakebase_branch_show returns the default branch info", async () => {
      const resp = await client.request("tools/call", {
        name: "lakebase_branch_show",
        arguments: { instance: projectId, branch: defaultBranchName },
      });
      const info = parseContent(resp.result) as { name?: string };
      expect(info.name).toMatch(/\/branches\//);
    });

    it("lakebase_branch_show on missing branch returns null payload", async () => {
      const resp = await client.request("tools/call", {
        name: "lakebase_branch_show",
        arguments: { instance: projectId, branch: "does-not-exist-xyz" },
      });
      const info = parseContent(resp.result);
      expect(info).toBeNull();
    });

    it("lakebase_branch_create + lakebase_branch_delete round-trip", async () => {
      const branchName = `lbscm-mcp-${Date.now()}`;

      const created = await client.request("tools/call", {
        name: "lakebase_branch_create",
        arguments: {
          instance: projectId,
          branch: branchName,
          parentBranch: defaultBranchName,
        },
      });
      const info = parseContent(created.result) as {
        uid?: string;
        state?: string;
        name?: string;
      };
      expect(info.uid).toBeTruthy();
      expect(info.state).toBe("READY");

      const deleted = await client.request("tools/call", {
        name: "lakebase_branch_delete",
        arguments: { instance: projectId, branch: branchName },
      });
      const del = parseContent(deleted.result) as { deleted?: boolean };
      expect(del.deleted).toBe(true);
    }, 120_000);

    it("lakebase_doctor against the paired project returns 8 checks", async () => {
      const resp = await client.request("tools/call", {
        name: "lakebase_doctor",
        arguments: { projectDir: pairedDir },
      });
      const report = parseContent(resp.result) as {
        overall: string;
        checks: { name: string; status: string }[];
      };
      expect(report.checks.length).toBe(9);
      expect(["ok", "warn"]).toContain(report.overall);
      const byName = (n: string) =>
        report.checks.find((c) => c.name === n)!;
      expect(byName("lakebase-project").status).toBe("ok");
      expect(byName("env-file").status).toBe("ok");
    });

    it("calling a tool with missing required args returns an MCP error", async () => {
      const resp = await client.request("tools/call", {
        name: "lakebase_branch_list",
        arguments: {}, // missing instance
      });
      // Server returns either an error envelope or an isError content block;
      // both are valid per MCP spec. Accept either.
      const result = resp.result as
        | { isError?: boolean; content?: { type: string; text: string }[] }
        | undefined;
      const hasError =
        resp.error !== undefined ||
        (result && result.isError === true) ||
        (result?.content?.[0]?.text ?? "").toLowerCase().includes("required");
      expect(hasError).toBe(true);
    });
  }
);
