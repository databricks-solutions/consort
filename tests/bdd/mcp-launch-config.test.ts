// Regression guard for the "consort MCP server never came up" bug: .mcp.json
// launched the server with a RELATIVE path (`./dist/apps/mcp-server/index.js`).
// Claude Code launches a plugin's MCP server from a cwd that is NOT the plugin
// dir, so `node ./dist/...` throws module-not-found and the stdio connection
// closes immediately ("Connection closed"). The path must be resolved via
// ${CLAUDE_PLUGIN_ROOT} (which Claude Code substitutes to the installed plugin
// dir) — or be absolute — never a bare relative path.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("consort .mcp.json launch config (server must resolve from any cwd)", () => {
  const cfg = JSON.parse(readFileSync(join(__dirname, "..", "..", ".mcp.json"), "utf8"));

  it("declares the consort stdio server", () => {
    expect(cfg.mcpServers?.consort?.command).toBe("node");
    expect(Array.isArray(cfg.mcpServers?.consort?.args)).toBe(true);
  });

  it("launches via ${CLAUDE_PLUGIN_ROOT}, NOT a bare relative path (the connection-closed bug)", () => {
    const entry: string = cfg.mcpServers.consort.args.find((a: string) => a.includes("mcp-server/index.js"));
    expect(entry, "an arg must point at the mcp-server entry").toBeTruthy();
    // Must be plugin-root-resolved (or absolute) so it works from Claude Code's launch cwd.
    expect(entry).toMatch(/\$\{CLAUDE_PLUGIN_ROOT\}\/dist\/apps\/mcp-server\/index\.js|^\/.*dist\/apps\/mcp-server\/index\.js/);
    // Must NOT be the bare relative form that fails from a non-plugin cwd.
    expect(entry.startsWith("./"), "a bare relative ./dist path fails from Claude Code's launch cwd").toBe(false);
  });
});
