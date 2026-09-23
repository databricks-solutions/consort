<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/logo/consort-lockup-white.svg">
    <img src="docs/logo/consort-lockup.svg" alt="Consort" width="340">
  </picture>
</p>

**Consort keeps AI-written code clean and correct: spec-first and test-driven, driven by a deterministic state machine with human-approval gates and immutable tests. Engineering discipline is no longer left to chance at the whim of a model. Every green is a real test run on a live branch of a real Lakebase database, enforced by contract, not suggestions.**

Consort takes its name from the field of music. A *consort* is an ensemble that plays in concert: each musician holds one part, and a conductor keeps them in time. Consort is that, applied to building software. A set of agents each take on one familiar role from the software lifecycle — a spec author, an architect, a DBA, a test strategist, a UX designer, and a navigator/driver pair at the keyboard — while the product owner is the human's own seat (you, or a Human Proxy standing in headless), a deterministic conductor keeps them in sequence, and the human approves every gate. No agent plays another's part.

**What Consort builds.** Consort, an open-source framework from Databricks (`databricks-solutions/consort`), builds **transactional applications**: an application backend (and an optional web UI) whose system of record is a **Lakebase** database. [Lakebase](https://www.databricks.com/product/lakebase) is Databricks' serverless, Postgres-compatible **transactional (OLTP)** database, branchable in about a second. Each git branch is paired with its own Lakebase Postgres branch, so every branch has a real, isolated database and the schema evolves in lockstep with the code. It is not the Delta Lakehouse, and Consort is not an ETL, analytics, BI, or data-pipeline tool; it is a way to build and evolve application backends on Postgres. For what Consort is and is not, and how it compares to other spec-first tools, see [`docs/positioning.md`](docs/positioning.md).

## Why Consort

AI agents write code fast, but you can't trust that the code is correct or maintainable over the long haul. On their own they mark a task "done" with no test behind it, drift off the request, weaken a test to reach green, tangle the layers, and lose the plan across a context reset. The database is the hardest part to get right: it's the one dependency you can't cheaply branch, so it gets faked with mocks that fall out of sync with production, or shared across a staging box the tests quietly diverge from.

Lakebase removes that constraint. A database branch is a real, governed, copy-on-write copy created in about a second, so the work runs against real data instead of a mock. Consort builds on that to make an agent's "done" checkable. Every increment is:

- **Verified against real data**: "green" means a real test runner passed against a live database branch, not an agent's say-so.
- **Independently reviewed**: the agent that writes the code is never the one that judges it.
- **Spec-first and immutable**: intent is frozen at a hashed gate, and within a unit of work the tests can't be edited to force a pass.
- **Deterministically driven**: the control loop is codified, so it can't drift, skip a step, or get lost after a long session.
- **Human-gated**: the gates fail closed, and nothing advances past one without your approval.

**What makes Consort different.** Other spec-first frameworks ask the agent to comply: a strong spec then a trusted build (Spec Kit), or a firm test-first rule the model is told to honor (superpowers). Under pressure to go green, an agent can set either aside. Consort puts the controls in a deterministic state machine the agent runs inside but cannot edit: routing is code, human-approval gates fail closed, tests are immutable within a unit of work, and green means a real run against a real database. Engineering discipline is enforced by contract, not suggestions.

The domain is the other half of the distinction. Consort is for building and evolving **application backends on Lakebase Postgres**, using one-second database branching to make test-driven development safe. It is not a data-engineering tool: no ETL or ELT, no analytics, BI, or dashboards, no Lakeflow / Declarative Pipelines / Jobs / notebooks, no Spark or warehouse compute, and no work against the Delta Lakehouse or the Unity Catalog analytics surface. And it is not a drop-in prompt or skill pack for any repo; it is a deterministic orchestrator bound to a Lakebase-paired project.

|  | Consort | GitHub Spec Kit | superpowers |
|---|---|---|---|
| **Enforcement** | Deterministic state machine the agent runs inside but cannot edit | Strong spec, then a trusted build | Test-first rules the model is told to honor |
| **"Green" means** | A real test run against a live, throwaway Postgres branch | The agent's report | A local red-green-refactor pass |
| **Substrate** | Live Lakebase (Postgres / OLTP) copy-on-write branch | Infrastructure-free | Infrastructure-free, local |
| **Domain** | Transactional apps backed by Postgres | General software | General software |
| **Gates** | Human-approval gates that fail closed | Advisory | Advisory |

**Runs in your editor.** Consort is terminal-first but detects and launches into any VS Code-compatible IDE (VS Code, Cursor, and others). On start it offers to open your project and its **Consort extension** there, or to keep driving from the terminal. The extension is a live viewer that keeps you in lockstep with what Consort is building: the paired branches, the current phase and gates, and each role's progress, turn by turn, with each artifact surfaced as it lands.

For the full positioning, comparison, and FAQ, see [`docs/positioning.md`](docs/positioning.md). Two papers describing Consort and the methodology behind it are forthcoming.

## The ensemble

Each agent owns one concern and communicates only through the artifacts it produces and the ones it consumes, in the order a lifecycle would run them. No shared memory, one job each: the spec the Spec Author produces is what the Architect Reviewer reads, whose contract the DBA and Test Strategist build on in turn.

| Agent | Lifecycle role | Owns |
|---|---|---|
| **Product Owner** | Product | the backlog and each story's acceptance criteria |
| **Spec Author** | Analysis | the structured, testable specification |
| **Architect Reviewer** | Architecture | the layering lens, NFRs, and the persistence invariants |
| **DBA** | Data | the physical schema and the per-story migration plan |
| **Test Strategist** | Test design | the ordered master test list drawn from the ACs |
| **UX Designer** | Experience | the interface design, for user-facing work |
| **Navigator** | Test + review | the failing test (RED), and review of the code that answers it |
| **Driver** | Implementation | the minimal honest code (GREEN), then the refactor |

## How it works

Consort runs as a loop of small increments, `/plan -> /design -> /build -> /deploy`, and you decide every gate:

- **Design (spec-first).** Intent becomes a specification and the list of tests that will demonstrate it, then freezes at a hashed gate so the target cannot move mid-build. The Spec Author, Architect Reviewer, DBA, and Test Strategist each add their part (plus the UX Designer for user-facing work).
- **Build (test-driven).** The Navigator writes a failing test; the Driver makes it pass with the least code that honestly passes, then refactors, each cycle against a copy-on-write branch of real data. A failed verify routes to a bounded repair that never touches the tests.
- **Deploy + promote (deterministic).** The orchestrator, not an agent, deploys and verifies the increment and drives the PR, CI, merge, and parent-tier migration. You approve the deploy and promote gates.

Routing between phases is a program, not a model's choice, so the loop cannot drift, be argued out of a step, or be lost across a context reset.

## Getting started

**Step 0: install Consort + set up your environment.** Consort runs against a real Lakebase database (no mock mode), so a few tools and a Lakebase-enabled workspace have to be in place first. One command detects what's missing, offers to install it, installs the Claude Code plugin, and pre-downloads the Consort toolkit (so your first project's setup doesn't stop for that download):

```bash
bash <(curl -sL https://raw.githubusercontent.com/databricks-solutions/consort/main/bootstrap.sh)
```

The doctor verifies the Databricks CLI (and that the workspace has **Lakebase enabled**), plus Node 20+, Python 3.10+, JDK 17+, `gh`, and npm, each with a fix hint. `/consort:start` and `lakebase-create-project` run the same doctor as a gate and refuse to provision until it passes, so if you skip this step the check still happens before anything is created. (Prefer to run just the check yourself? `npx --yes --package="github:databricks-solutions/lakebase-scm-utils#v0.2.0" lakebase-doctor`.)

Then, in any session, run:

```
/consort:start
```

**Your first run.** In a fresh folder, `/consort:start` walks you through creating a Lakebase-paired project: a repo, a paired database, and the role agents and commands scaffolded into it. In a project that already has a `.consort/` directory (Consort's spec-first, test-driven state), it resumes wherever you left off. (The command, skills, and MCP server ship in the plugin; the role agents live in your project's `.claude/agents/`, spawned by the orchestrator `consort-drive` as `claude --agent <role>`.)

**What to expect.** Consort drives the loop `/plan -> /design -> /build -> /deploy` and stops at every gate for you:

- at the **design gate**, you review and approve the frozen spec: the stories and acceptance criteria, the ordered test list, and the DBA's schema plan;
- through the **build**, each cycle writes a failing test, makes it pass against a live database branch, then refactors;
- at the **deploy** and **promote** gates, you approve the release and the migration to the parent tier.

Nothing advances past a gate without you.

**Walk through a full first project.** [`examples/first-project/`](examples/first-project/) is a step-by-step walkthrough of one session, install to first shipped feature, using a sample inventory app (StockFlow). It ships copy-ready seed files so you can launch your own project from ours instead of starting from a blank page.

### Other ways to install

For coding agents other than the Claude Code plugin, `install.sh` copies the skill trees under `skills/` into the path each agent reads from, pulling the latest vendored skills first (best-effort; skipped offline). It auto-detects installed agents; `--tools` overrides.

```bash
# Auto-detect installed agents, prompt to pick
bash <(curl -sL https://raw.githubusercontent.com/databricks-solutions/consort/main/install.sh)

# Specific targets
./install.sh --tools claude,cursor

# Upload skills into a Databricks workspace for Genie Code
./install.sh --install-to-genie --profile DEFAULT
```

Targets:

- **Claude Code** (`.claude/skills/`)
- **Cursor** (`.cursor/skills/`)
- **Databricks Genie Code** (workspace upload)
- **Claude Desktop / OpenAI Codex** via the MCP manifest at `.mcp.json` (the server lives at `apps/mcp-server/`, also on PATH as `lakebase-mcp-server`)
- **OpenAI Foundry** consumes the pre-rendered spec at [`tools/openai-foundry/consort.tools.json`](tools/openai-foundry/consort.tools.json)

`manifest.json` is a machine-readable index of every skill and its files (regenerated by `python3 scripts/skills.py`).

Or run the bins directly from a clone:

```bash
git clone https://github.com/databricks-solutions/consort
cd consort
npm install   # the prepare script builds dist/
```

### Prerequisites

The bootstrap in [step 0](#getting-started) checks and installs these for you; they are listed here for reference and surface only when the doctor reports one missing.

<details>
<summary>Tool prerequisites</summary>

- **Node.js 20+** and npm
- **Databricks CLI v1.0.0+**, authenticated to a workspace with Lakebase enabled (macOS: `brew install databricks/tap/databricks`)
- **Python 3.10+** (for `scripts/openai-foundry.py` and the alembic venv the live driver manages)
- **GitHub CLI (`gh`)** authenticated, for self-hosted-runner setup
- **JDK 17+** for the Flyway live path (the CLI itself is auto-downloaded)

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full live-test prerequisites and the `.env.template.test.config` / `.env.local.test.config` pattern.

</details>

### Updating the kit in an existing project

When a new kit version ships, refresh what a scaffolded project runs against:

- **Know when there is one.** `/consort:start` runs `consort-check-update` (throttled to once/day, silent when current, never blocks) and surfaces a notice if you are behind. Check any time with `./scripts/lk consort-check-update` (`--force` skips the throttle).
- **Get the latest kit** (the one `/design`, `/build`, etc. actually run): `./scripts/lk --warm`. The shim compares the project's pinned commit to the live tip of its ref and reinstalls on drift, so `--warm` is the canonical "pull the newest kit" step. (`./scripts/lk --rewarm` forces a fresh install of the resolved commit.)
- **Refresh the role-agent definitions**: `./scripts/lk lakebase-update-agents`. Project creation only *seeds* `.claude/agents/` (it never overwrites a file already there), so a kit bugfix to a role prompt does not reach an already-scaffolded project until you refresh. The drive also auto-refreshes agents when it detects the kit version moved; run the command yourself to refresh out of band. Use `--dry-run` to preview, `--keep-local` to keep a project-edited agent.
- **Refresh the workflow commands**: `./scripts/lk lakebase-update-commands` (the `.claude/commands/*.md` counterpart; hook files are left untouched).
- **Refresh the plugin** (Claude Code): first refresh the marketplace cache, then update, then restart Claude Code:
  ```bash
  claude plugin marketplace update databricks-solutions
  claude plugin update consort@databricks-solutions
  ```
  The marketplace refresh matters – without it `plugin update` compares against a stale view of the repo and reports "up to date." The plugin version tracks each release (`.claude-plugin/plugin.json`), which is what `plugin update` uses to detect the new version. Note: `claude plugin install` on an already-installed plugin is a no-op – use `update`.

## What's in this repo

- **`consort/`** the deterministic orchestrator and the per-role logic: the drive loop, design/build routing, the gates, experiments and spikes, bad-smell detection, and agent logging.
- **`skills/consort/`** the agent-facing contract (`SKILL.md`), the eight role-agent prompts under `agents/`, and its references. Plus the engineering-canon skills (`software-design-principles`, `architectural-design-principles`, `ui-ux-design-principles`) the roles import, and the vendored Databricks skills (`databricks-core`, `databricks-lakebase`).
- **`templates/`** the `.consort/` bootstrap and the project-level `.claude/commands` a scaffolded project carries.
- **`apps/mcp-server/`** a single MCP server exposing the tool surface to MCP-capable agents (Claude Desktop, OpenAI Codex, Cursor-via-MCP, Genie Code).
- **`tools/openai-foundry/`** a pre-rendered OpenAI Foundry / Codex tool spec, generated from the same `apps/mcp-server/tools.ts` registry.
- **`tests/`** Vitest BDD tests. Live Lakebase paths skip cleanly when the `LAKEBASE_TEST_*` env vars are not set.

A scaffolded project keeps its live state under `.consort/` (`features/`, `experiments/`, `spikes/`, `cycles/`, `workflow-state.json`, `smells.json`), where the orchestrator reads and writes as the loop runs.

## Skills

Consort ships its own skill plus the engineering canon its roles import.

- **[`consort`](skills/consort/README.md)** Consort itself: the `/design` and `/build` lanes, the role agents, and the gates.
- **[`software-design-principles`](skills/software-design-principles/SKILL.md)** SOLID, DRY, clean code, layered architecture, cross-cutting concerns, NFRs. Imported by the roles.
- **[`architectural-design-principles`](skills/architectural-design-principles/SKILL.md)** system-level canon: layered architecture, ports and adapters, twelve-factor, evolutionary architecture and database design.
- **[`ui-ux-design-principles`](skills/ui-ux-design-principles/SKILL.md)** experience-level canon for the UX Designer and any user-facing build.
- **Vendored** `databricks-core` and `databricks-lakebase` are read-only mirrors of [`databricks/devhub`](https://github.com/databricks/devhub/tree/main/.agents/skills) (the `databricks postgres` CLI surface). Refresh with `npm run sync:devhub` (drift-checked in CI via `npm run check:devhub`).

## CLIs

The bins are Consort's command surface plus a few project-lifecycle helpers. Run any with `--help`.

- **`consort-drive`** the deterministic orchestrator: routes the design/build/deploy/promote phases, spawns the role agents, and holds the gates. The `consort-*` family (`-intake`, `-cycle`, `-experiment`, `-spike`, `-deploy`, `-approve-gate`, `-gate-conformance`, `-next`, `-test-list`, `-human-proxy`, ...) are its building blocks.
- **`lakebase-create-project`** end-to-end Lakebase-paired project bootstrap that also scaffolds the Consort commands.
- **`lakebase-adopt-consort`** add Consort to an existing Lakebase-paired project.
- **`lakebase-feature-status`** report where each feature sits in the loop.
- **`lakebase-update-commands`** refresh a scaffolded project's `.claude/commands` to the current version.
- **`lakebase-update-agents`** refresh a scaffolded project's `.claude/agents` role definitions to the current kit (so a role-prompt bugfix reaches an existing project; the drive also auto-refreshes on a kit-version change).
- **`lakebase-mcp-server`** stdio MCP server exposing the tool surface to MCP-capable agents.

## Contributing

Maintainer-facing docs (development setup, build, test tiers, the single-seam contributor rule, release flow, and the pull-request checklist) live in [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## Support

Databricks does not offer official support for content in this repository. For questions or bugs, please open a GitHub issue and the team will help on a best-effort basis.

## License

See [LICENSE.md](LICENSE.md).
