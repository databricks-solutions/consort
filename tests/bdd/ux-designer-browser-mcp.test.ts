// The UX Designer builds an app's look from the reference sites the design brief names
// ("make it look like X, Y, Z"). For that to be more than a promise it needs a real
// browser: a headless browser MCP loaded for its turn (under the base --strict-mcp-config)
// AND the matching tool grant in its agent frontmatter. This guards the three
// load-bearing, regressable facts of that wiring:
//   1. ux-designer defaults ON to the kit-shipped browser MCP (one source of truth for
//      the default path); no OTHER role gets an MCP by default.
//   2. the kit ships that config as valid JSON declaring the Playwright server.
//   3. the agent's frontmatter actually grants the browser tools (without the grant the
//      loaded MCP tools are forbidden, and the feature silently does nothing).

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { defaultMcpConfigForRole, UX_BROWSER_MCP_CONFIG, UX_BROWSER_INSTALL_CMD } from "../../consort/orchestrator/drive/claude-runner.js";

const KIT_ROOT = path.resolve(__dirname, "..", "..");
const CONFIG_PATH = path.join(KIT_ROOT, UX_BROWSER_MCP_CONFIG);
const UX_AGENT = path.join(KIT_ROOT, "skills", "consort", "agents", "ux-designer.md");

describe("ux-designer browser MCP: default-on wiring", () => {
  it("defaults the ux-designer role to the kit-shipped browser MCP (absolute path)", () => {
    const p = defaultMcpConfigForRole("ux-designer");
    expect(p, "ux-designer should default to a browser MCP config").toBeTruthy();
    expect(path.isAbsolute(p!), "the default path must be absolute (resolves in dev + installed layouts)").toBe(true);
    expect(p!.endsWith(UX_BROWSER_MCP_CONFIG), `expected ${p} to end with ${UX_BROWSER_MCP_CONFIG}`).toBe(true);
  });

  it("gives NO other role an MCP by default (every other spawn is unchanged)", () => {
    for (const role of ["driver", "navigator", "spec-author", "architect", "product-owner", "dba"]) {
      expect(defaultMcpConfigForRole(role), `${role} must not get a default MCP`).toBeUndefined();
    }
  });
});

describe("ux-designer browser MCP: the shipped config file", () => {
  it("is valid JSON declaring a single browser server the ux turn loads", () => {
    const cfg = JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as {
      mcpServers?: Record<string, { command?: string; args?: string[] }>;
    };
    const servers = cfg.mcpServers ?? {};
    expect(Object.keys(servers), "exactly one MCP server (--strict-mcp-config loads only this file)").toHaveLength(1);
    const playwright = servers.playwright;
    expect(playwright, "server must be named 'playwright' (tools namespace as mcp__playwright__*)").toBeTruthy();
    expect(playwright!.command).toBe("npx");
    // Playwright manages its own Chromium and runs headless in the drive.
    expect(playwright!.args?.some((a) => a.includes("@playwright/mcp"))).toBe(true);
    expect(playwright!.args).toContain("--headless");
    // --yes is LOAD-BEARING: the MCP launches non-interactively (no TTY). Without it, npx blocks
    // on the first-use "Ok to proceed?" install prompt for @playwright/mcp, the server never comes
    // up, and the ux-designer reports the browser unavailable. It must precede the package spec.
    expect(playwright!.args, "npx must run non-interactively (--yes) or the first-use install prompt hangs the MCP").toContain("--yes");
    expect(playwright!.args!.indexOf("--yes")).toBeLessThan(playwright!.args!.findIndex((a) => a.includes("@playwright/mcp")));
  });
});

describe("ux-designer browser MCP: Chromium is ensured before the turn", () => {
  it("the kit installs Chromium (npx --yes playwright install chromium) so the browser can launch", () => {
    // @playwright/mcp does not auto-install a browser; without this the MCP starts but every
    // navigate fails and the ux-designer silently degrades to the brief. The drive runs this
    // BEFORE the spawn (outside the MCP startup timeout).
    expect(UX_BROWSER_INSTALL_CMD.command).toBe("npx");
    expect(UX_BROWSER_INSTALL_CMD.args).toContain("--yes");
    expect(UX_BROWSER_INSTALL_CMD.args).toContain("install");
    expect(UX_BROWSER_INSTALL_CMD.args).toContain("chromium");
    // @latest keeps the installed browser aligned with @playwright/mcp@latest in the config.
    expect(UX_BROWSER_INSTALL_CMD.args.some((a) => a.startsWith("playwright"))).toBe(true);
  });
});

describe("ux-designer agent: frontmatter grants the browser tools", () => {
  it("allow-lists mcp__playwright and WebFetch (else the loaded MCP is forbidden)", () => {
    const content = readFileSync(UX_AGENT, "utf8");
    const m = /^---\n([\s\S]*?)\n---/.exec(content);
    expect(m, "ux-designer.md must have frontmatter").toBeTruthy();
    const toolsLine = m![1].split("\n").find((l) => l.startsWith("tools:")) ?? "";
    expect(toolsLine, "frontmatter must have a tools: line").toContain("tools:");
    expect(toolsLine).toContain("mcp__playwright");
    expect(toolsLine).toContain("WebFetch");
    // WebSearch: find representative reference sites when the brief names none.
    expect(toolsLine).toContain("WebSearch");
    // The pre-existing text-only tools stay granted.
    for (const t of ["Read", "Write", "Edit", "Bash"]) expect(toolsLine).toContain(t);
  });
});

describe("ux-designer procedure: open EVERY named reference, not just the first", () => {
  // Live gap (portfolio-manager20): the brief named Robinhood + Wealthfront, but the ux-designer
  // navigated to Robinhood ONLY, then wrote the guide citing Wealthfront from prior knowledge.
  // The procedure must force opening EVERY named reference and block writing until it has.
  const md = readFileSync(UX_AGENT, "utf8");

  it("requires enumerating + opening EVERY named reference (forbids one-and-fill-the-rest-from-memory)", () => {
    expect(md).toMatch(/enumerate EVERY reference|OPEN EVERY ONE|open every named reference/i);
    expect(md, "must forbid opening one site and filling the rest from memory").toMatch(/from memory|prior knowledge/i);
    // A hard gate: no writing the guide until every named reference has been navigated.
    expect(md).toMatch(/may not write [\s\S]*?until[\s\S]*?navigat/i);
  });

  it("requires per-reference provenance (browsed vs guessed is distinguishable)", () => {
    expect(md).toMatch(/provenance MUST cite, per reference|per reference, which tokens/i);
  });
});
