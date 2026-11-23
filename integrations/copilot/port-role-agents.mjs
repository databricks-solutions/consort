#!/usr/bin/env node
// Port the kit's Claude role agents (skills/consort/agents/*.md) to Copilot agent files
// (integrations/copilot/consort-copilot/com.github.copilot/agents/*.agent.md).
//
// The ONLY change is the frontmatter: Claude's `tools: Read, Write, Edit, Bash` becomes Copilot's
// `tools: [...]` array; `model:` / `color:` are dropped (Copilot sets the model per run via --model,
// and has no per-agent color). `name` + `description` (including a folded `>-` block) are preserved
// verbatim, and the BODY — the role's system prompt — is copied unchanged. One generator keeps all
// eight roles in sync with the kit source (no hand-drift).
//
// Tool-name mapping (confirm the exact Copilot vocabulary on the live CLI — see the plugin README):
//   Read -> view, Write/Edit -> edit, Bash -> bash  (deduped, order-stable)
// Run from the consort repo root:  node integrations/copilot/port-role-agents.mjs

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const SRC = "skills/consort/agents";
const DST = "integrations/copilot/consort-copilot/com.github.copilot/agents";
const TOOL_MAP = { read: "view", write: "edit", edit: "edit", bash: "bash" };

function mapTools(line) {
  const raw = line.slice(line.indexOf(":") + 1).trim();
  const mapped = [];
  for (const t of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
    const m = TOOL_MAP[t.toLowerCase()] ?? t.toLowerCase();
    if (!mapped.includes(m)) mapped.push(m);
  }
  return `tools: [${mapped.map((t) => `"${t}"`).join(", ")}]`;
}

// Normalize a scalar YAML list field (e.g. `skills: software-design-principles`) to a JSON array —
// Claude accepts a bare string, but the Copilot agent-markdown schema requires an array (else
// "skills: Expected array, received string" at load). A value already written as `[...]` is left alone.
function mapList(line) {
  const key = line.slice(0, line.indexOf(":")).trim();
  const raw = line.slice(line.indexOf(":") + 1).trim();
  if (!raw || raw.startsWith("[")) return line;
  const items = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return `${key}: [${items.map((t) => `"${t}"`).join(", ")}]`;
}

mkdirSync(DST, { recursive: true });
const written = [];
for (const f of readdirSync(SRC)) {
  if (!f.endsWith(".md")) continue;
  const src = readFileSync(join(SRC, f), "utf8");
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(src);
  if (!m) {
    console.warn(`skip ${f}: no frontmatter`);
    continue;
  }
  const [, fm, body] = m;
  const out = [];
  for (const line of fm.split("\n")) {
    if (/^tools:/.test(line)) out.push(mapTools(line));
    else if (/^skills:/.test(line)) out.push(mapList(line)); // Copilot wants an array, not a bare string
    else if (/^(model|color):/.test(line)) continue; // Claude-only knobs
    else out.push(line);
  }
  const header =
    "<!-- GENERATED from skills/consort/agents/" +
    f +
    " by integrations/copilot/port-role-agents.mjs. Do NOT edit here; edit the kit source + re-run. -->\n";
  const dst = join(DST, f.replace(/\.md$/, ".agent.md"));
  writeFileSync(dst, `---\n${out.join("\n")}\n---\n\n${header}${body}`);
  written.push(dst);
}
console.log(`ported ${written.length} role agent(s):`);
for (const w of written) console.log("  " + w);
