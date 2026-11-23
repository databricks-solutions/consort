# The Copilot agent interface

How a Consort **role turn** run on the GitHub Copilot CLI is given its role contract. This is the
exact parallel to how Claude role turns are given theirs, and it is a **single, standard interface**
every Copilot role turn — on every path — funnels through. One door.

## The problem it solves

A Consort role turn must run with its role's full system prompt: the body of
`<projectDir>/.claude/agents/<role>.md` (spec-author, dba, navigator, architect-reviewer, …). That
contract is load-bearing — e.g. the spec-author's breakdown contract, the DBA's `db-design.json` shape
rules. Without it the model runs with only the task text and produces non-conformant output that the
kit's gates then reject (the "spec-author left the `asA/iWantTo/soThat` narrative out", "DBA
over-structured `db-design.json`" class of failures).

**Claude** gets the contract for free: the drive spawns `claude --agent <role> --setting-sources
project`, and Claude Code loads `<projectDir>/.claude/agents/<role>.md` as the agent's system prompt.

**The GitHub Copilot CLI has no `--agent`** — no way to load a per-invocation system prompt. So Consort
must **inline** the same `.md` body into the `-p` prompt. That inlining is this interface.

## The interface: `copilotRoleContract(workspaceDir, role, { nativeAgent? })`

Defined in `copilot-step-agent.ts`. Given the project workspace and the role, it reads
`<workspaceDir>/.claude/agents/<role>.md`, strips the YAML frontmatter, and returns the **preamble to
prepend** to the task:

```
You are the "<role>" agent. Your role contract follows; obey it EXACTLY.

<the full .claude/agents/<role>.md body>

---

```

- **Every role, one code path.** The role name is the agent-file stem; there is no per-role
  special-case. Adding a role (a new `.claude/agents/<role>.md`) needs no change here.
- **Degrades, never breaks.** A missing/unreadable `.md` returns a NAMED stub
  (`You are the "<role>" agent. Follow its role contract exactly.`) — never a silent empty contract.
- **`nativeAgent`** returns `""` — reserved for the follow-on seam where Copilot's own native
  `--agent` (loading `.github/agents`) carries the role instead of an inlined preamble.

## The two doors that funnel through it

Both call sites call `copilotRoleContract` and nothing else assembles the role binding, so a turn gets
**byte-identical** role binding whichever path runs it:

| Door | Where | Used by |
|------|-------|---------|
| **Live drive** | `copilotBaseArgs(cmd, projectDir)` in `copilot-runner.ts` | the production `execRunner` envelope (`claude-runner.ts` line ~610: `isCopilot ? copilotBaseArgs(cmd, cfg.projectDir) : claudeBaseArgs(cmd)`) |
| **Contained / tests** | `buildCopilotTask(invocation, levers)` in `copilot-step-agent.ts` | the direct-spawn `CopilotStepAgent` path (unit tests, integration chains) |

`copilotBaseArgs` is the Copilot sibling of `claudeBaseArgs`: where `claudeBaseArgs` adds
`--agent cmd.role`, `copilotBaseArgs` prepends `copilotRoleContract(projectDir, cmd.role)` to the
`-p` prompt. Same role binding, one interface, both executors.

## Why this doc exists (the regression it prevents)

The contract injection was first added **only to the contained door** (`buildCopilotTask`), and its
tests exercised only that door — so it looked fixed while **every live drive turn shipped with no
contract** (the live drive uses `copilotBaseArgs`, not `buildCopilotTask`). The fix consolidated both
doors onto this one interface. The regression guard lives in
`tests/bdd/consort-copilot-engine.test.ts` ("the role .md contract reaches the LIVE door"): it asserts
`copilotBaseArgs` prepends the real `.md` body, and that the live and contained doors inject the
**identical** contract. Any new Copilot invocation path MUST route through `copilotRoleContract`, and
MUST be covered by a test at *that* path — not a sibling.

## Verifying on a live run

The role contract is in the prompt when a turn's recorded transcript
(`.consort/turns/<n>-<role>/transcript.md`) contains `You are the "<role>" agent. Your role contract
follows` followed by the `.md` body. A ~2 KB transcript for a role whose `.md` is ~20 KB means the
contract is missing — the symptom this interface exists to make impossible.
