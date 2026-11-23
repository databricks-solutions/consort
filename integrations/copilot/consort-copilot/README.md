# consort-copilot — Consort as a GitHub Copilot CLI plugin

Consort packaged for the GitHub Copilot CLI (Agent Plugins 1.0). The kit-side executor is **wired**
(`kind:"copilot"` → `copilot-step-agent.ts` + `copilot-runner.ts`, selected per run) and all eight
role agents are **generated** from the kit source. It is **structurally verified** (tsc + unit tests);
the **live end-to-end run is the only unproven part** — it must happen where the Copilot CLI is
permitted (a customer env, or on a Databricks machine via Unity Gateway — see below).

## The one thing to understand first

Consort's guarantees — gates that fail closed, the frozen-test TDD loop, the state machine, Lakebase
branch pairing — live in the **deterministic orchestrator** (a Node CLI), **not** in a Copilot skill.
A Copilot skill is just instructions the model reads; it cannot *be* the driver. So this plugin
**bundles** the model-facing pieces (skills, role agents, MCP) and ships the orchestrator as a **bin**
(`bin/consort-start.sh`) that runs the real `consort-drive` with Copilot executing each role turn.

## Layout (Agent Plugins 1.0)

```
consort-copilot/
├── plugin.json                              # plugin manifest (metadata)
├── mcp.json                                 # the Lakebase/consort MCP server (stdio; optional — see caveats)
├── skills/
│   └── consort/SKILL.md                     # entry skill — what Consort is + how to launch
├── com.github.copilot/
│   └── agents/
│       ├── product-owner.agent.md           # all 8 roles, GENERATED from skills/consort/agents/*.md
│       ├── spec-author.agent.md             #   by ../port-role-agents.mjs (do not hand-edit)
│       └── … (architect-reviewer, dba, driver, navigator, test-strategist, ux-designer)
├── bin/
│   └── consort-start.sh                     # wrapper → consort-drive (executor read from project config)
└── README.md

# regenerate the agents after editing a kit role:  node integrations/copilot/port-role-agents.mjs
```

## Install & use

Commands are shown as `gh copilot …` (the CLI invoked through `gh`). If you have the standalone
`copilot` binary on your PATH, drop the leading `gh ` from each. **Run the install from the consort repo
root** — the relative path is resolved against your current directory (running it from `~` is why
`Local plugin path does not exist` appears).

```bash
# Local dev install — MUST be from the consort repo root (or pass an absolute path):
cd ~/code/databricks-solutions/consort
gh copilot plugin install ./integrations/copilot/consort-copilot
#   absolute-path alternative (works from anywhere):
#   gh copilot plugin install "$HOME/code/databricks-solutions/consort/integrations/copilot/consort-copilot"
gh copilot plugin list

# Load the entry skill (instructions only — does NOT run the gated loop):
gh copilot -p "Use the /consort skill to plan a feature"   # headless
#   or interactively:  gh copilot  →  /consort

# Actually run a feature (the orchestrator; Copilot executes each role turn):
./integrations/copilot/consort-copilot/bin/consort-start.sh --feature F1-stock-visibility --target local
#   (or, once registered as a workflow:  gh copilot workflow run consort-start --args @intake.json)
```

The run switch is **persisted in the project config** — `project.executor: "copilot"` in
`.lakebase/consort-config.json`, set once at create by `lakebase-create-project --executor copilot` (the
ONE door; the drive reads it deterministically — no env var). The binary **auto-resolves** — the runner
prefers `ug copilot` → `copilot` → `gh copilot --` (`ug` beats a native `copilot` because `ug` only exists
on Databricks machines, where the native one is policy-blocked); set `CONSORT_COPILOT_BIN` only to force a
specific binary. If the kit CLIs aren't resolvable, the `/consort` skill **offers** the one install
(`npm i -g @databricks-solutions/consort`) rather than halting.

## Running on a Databricks machine (Unity Gateway)

The GitHub-hosted Copilot CLI is policy-blocked at Databricks, but you can route the same CLI through
**Unity Gateway** to Databricks models:

```bash
uv tool install git+https://github.com/databricks/unity-gateway   # provides `ug`
# the project already has project.executor=copilot (set at create --executor copilot), and once `ug` is on
# PATH the runner auto-prefers it over the (blocked) native copilot — so no CONSORT_COPILOT_BIN is needed:
./integrations/copilot/consort-copilot/bin/consort-start.sh --feature F1-stock-visibility --target local
#   (force a specific binary only if you must:  CONSORT_COPILOT_BIN="ug copilot" ./…/consort-start.sh …)
```

This is the path to **live-prove** the port on a Databricks machine. (A customer with GitHub-hosted
Copilot enabled just uses `copilot` / `gh copilot --` — no `ug`.)

## Component mapping (Claude Code plugin → this)

| Claude Code | Here |
|---|---|
| `.claude-plugin/plugin.json` | `plugin.json` (Agent Plugins 1.0 `$schema`) |
| `.mcp.json` `mcpServers.consort` (`${CLAUDE_PLUGIN_ROOT}/dist/apps/mcp-server/index.js`) | `mcp.json` (`${PLUGIN_ROOT}/mcp-server/index.js`) |
| `skills/consort/**` | `skills/consort/SKILL.md` (discovered from `.github/skills`, `.claude/skills`, or a plugin) |
| `skills/consort/agents/<role>.md` (`--agent <role>`) | `com.github.copilot/agents/<role>.agent.md` (`--agent <role>`) |
| `/consort:start` slash command | the `consort` skill + `bin/consort-start.sh` (or a `gh copilot workflow`) |

## Done vs. remaining

**Done (structurally — tsc + unit tests):**
- Live executor wired: `copilot-step-agent.ts` builds the arg vector; `copilot-runner.ts` resolves the
  binary (`ug copilot` → `copilot` → `gh copilot --`) + spawns with `--output-format json` + parses usage/text.
- Executor selection: `project.executor=copilot` in `.lakebase/consort-config.json` (set by
  `create-project --executor copilot`) swaps every role step to `kind:"copilot"` — ONE door, no env
  (`copilotExecutorSelected` / `copilotExecutorSpec` in `executor-dispatch.ts`).
- All 8 role agents generated from the kit source (`port-role-agents.mjs`).

**Remaining:**
1. **Live e2e** — the only real proof: run a feature end-to-end on a Copilot-permitted env (customer, or
   `ug copilot` here) and confirm the role turns produce conformant artifacts + pass the gates.
2. **Report-channel / transcript parity** — the contained Copilot turn surfaces `finalText` on the agent's
   `lastResult`, but the live-index transcript + the fenced ```` ```agent-report ```` channel the Claude path
   reads via `peekLastAgentTranscript` are Claude-runner specific; a Copilot turn relies on artifact-on-disk
   (the primary contract) until this is routed.
3. **MCP** — `mcp.json` is optional; the orchestrator does the Lakebase work itself. Bundling the server
   (`${PLUGIN_ROOT}/mcp-server/`) is only needed if you want Copilot *agent turns* to introspect the DB — and
   third-party MCP is often policy-disabled anyway. Leave it off for the core loop.
4. **Workflow registration** — for `gh copilot workflow run consort-start` (confirm the dynamic-workflow format).
5. **Confirm tool vocabulary + manifest schema** on the live CLI (`$schema` URLs, agent `tools` names).

## Caveats

- `--allow-all-tools`/`--allow-all-paths` (the acceptEdits-equivalent the executor uses) can be blocked by an
  enterprise managed policy — same class the kit already handles for Claude's managed-settings.
- Copilot exposes no reasoning-**effort** knob (Claude-only); Copilot role turns drop it.
- Per-turn token/cost telemetry depends on Copilot's JSONL carrying usage (unconfirmed); until verified,
  the dashboard cost card + Level-2 telemetry degrade for Copilot runs.
- The execRunner goodies the Claude live path has (warm-session reuse, context-budget guard, mid-turn
  overflow/blip retry, build-replay overlay) are **not** on the contained Copilot path — each turn is a
  fresh spawn. Fine for correctness; a later pass could generalize execRunner.
