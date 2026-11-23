---
name: consort
description: Launch and run the Consort spec-first, test-driven workflow on a Lakebase-paired project — scaffold a new project (or the bundled StockFlow example) or resume an existing one, then drive design → build → deploy, pausing at human gates. Use when the user wants to start Consort, plan/design/build/deploy a transactional-app feature on Lakebase (Databricks' serverless Postgres), or says "run consort". Not for ETL/analytics.
---

# Consort (interactive coordinator)

Consort builds transactional apps on **Lakebase** (Databricks' serverless Postgres) through a
**deterministic orchestrator** that drives role agents (product-owner, spec-author, architect,
ux-designer, test-strategist, navigator, driver, release-engineer) through a spec-first **design lane**
and a test-driven **build lane** — every cycle against a live **copy-on-write branch** of a real
Postgres database, with human-in-the-loop gates that fail closed and tests immutable within a unit of work.

## Your role: COORDINATE — don't do the work

When this skill is active YOU are the operator (the human's hands at the terminal). You **run the kit's
CLIs**, read what they report, and **surface every gate/question to the human** for a decision. You do
**NOT** write specs, tests, migrations, or code yourself, and you never approve a gate on the human's
behalf. Ask **one question at a time and WAIT** for each answer — never assume, default silently, or skip.

## Setup — executor from CONFIG; the binary auto-resolves; the kit auto-installs if missing

**The executor backend is NOT an env var.** It lives in the project's `.lakebase/consort-config.json`
(`project.executor`), set ONCE at create by `lakebase-create-project --executor copilot` (the ONE door —
the drive reads it deterministically). Do NOT set or export `LAKEBASE_CONSORT_EXECUTOR` anywhere.

**The Copilot binary auto-resolves — you normally set NOTHING.** The runner prefers `ug copilot` (Unity
Gateway) when `ug` is on PATH, else a native `copilot`, else `gh copilot --`. On a Databricks machine `ug`
is present and the native `copilot` is policy-blocked, so the auto-preference is already right. Set
`CONSORT_COPILOT_BIN` — on the LAUNCH command, since a per-call shell drops an in-session `export` — ONLY to
force a specific binary against that default.

**The kit is a SEPARATE install from this plugin** (the plugin ships skills + agents + the drive wrapper,
NOT the kit's CLIs). Resolve it in this order; if it's missing, OFFER the one canonical install — do NOT
hunt for a stray `dist/`:

1. **On PATH** — the customer / `npm i -g` / dev `npm link` case: `lakebase-create-project`, `consort-drive`,
   `consort-dashboard`, `consort-telemetry`, etc. resolve as bare names.
2. **`LAKEBASE_KIT_DIR`** — DEV ONLY, a built checkout: resolve `node "$LAKEBASE_KIT_DIR/dist/bin/lakebase/<name>.cli.js"`
   (or `.../bin/consort/<name>.cli.js`).
3. **Neither resolves?** Tell the human the kit isn't installed and OFFER the ONE install (the same npm
   package Claude's plugin host installs under the hood — one door, not a stray dist), then WAIT:
   > "I don't see the Consort kit installed. Install it now? `npm i -g @databricks-solutions/consort`"
   - **yes** → run `npm i -g @databricks-solutions/consort`, confirm `lakebase-create-project` now resolves, proceed.
   - **no** (or offline / the install errors) → STOP. (A dev can instead relaunch with `LAKEBASE_KIT_DIR=<built checkout>`.)

Detect once, up front:
```bash
command -v lakebase-create-project >/dev/null 2>&1 && echo "KIT=on-PATH" \
  || { [ -n "${LAKEBASE_KIT_DIR:-}" ] && echo "KIT=dev:$LAKEBASE_KIT_DIR" || echo "KIT=absent"; }
```
On `KIT=absent`, do step 3 (offer the install); never hunt for a `dist/` relative to the current directory.
Resolve every kit bin `<name>` through whichever of (1)/(2) applies:
```bash
#   on PATH:        <name>
#   dev checkout:   node "$LAKEBASE_KIT_DIR/dist/bin/lakebase/<name>.cli.js"  (or bin/consort/<name>.cli.js)
```

## Step 0 — telemetry (one-time, quiet)

Consort reports pseudonymous usage telemetry to its maintainers (event names/counts/timings — no code,
paths, or names). Check ONCE via the kit's telemetry CLI (resolve from the kit: `consort-telemetry` on
PATH, or `node "$LAKEBASE_KIT_DIR/dist/bin/consort/telemetry.cli.js"`):
```bash
<telemetry-cli> status --json      # read "acknowledged"
```
- `acknowledged: true` → say NOTHING about telemetry; go to Step 1.
- `acknowledged: false` (first time) → briefly offer **ok** (leave on, Level 1) / **level 2** (adds per-turn
  cost + loop dynamics) / **opt out**, record it (`<telemetry-cli> ack` | `enable --level 2` | `disable`),
  then `<telemetry-cli> beacon` (one-time install marker, regardless of choice). Then go to Step 1.

## Step 1 — where are we? (run this, don't guess)

```bash
ls -d .consort >/dev/null 2>&1 && echo EXISTING || echo GREENFIELD
```
- **`GREENFIELD` → Step 2 (create a project).**
- **`EXISTING` → Step 2.5 (tooling), then Step 3 (resume/drive).**

## Step 2 — greenfield: create a project

### 2a — First-project (StockFlow) offer — FIRST RUN ONLY

```bash
MARKER="${XDG_CONFIG_HOME:-$HOME/.config}/consort/first-project-offered"
test -f "$MARKER" && echo SEEN || echo FIRST-RUN
```
- `SEEN` → skip the offer, go to **2c** (own project).
- `FIRST-RUN` → ask: *"Create your **own** project, or run the bundled **StockFlow** example (a warehouse-inventory product you drive end to end)?"* Then record it either way: `mkdir -p "$(dirname "$MARKER")" && touch "$MARKER"`.
  - picks StockFlow → **2b**; picks own → **2c**.

### 2b — StockFlow example (fixed: `--language python --ui-track`, E2E on)

Ask only: **project name**, **parent dir**, **Databricks workspace URL**, **GitHub owner** (or none → `--no-github`), and **tiers** (see 2c). Then:
```bash
lakebase-create-project --project-name <name> --parent-dir <dir> --databricks-host <url> \
  --github-owner <owner> --language python --ui-track --tiers <1|2|3> --executor copilot
cd <parent-dir>/<name>
./scripts/lk lakebase-stage-first-project     # stages the StockFlow intake + design system + feature-requests, commits to base
```
Then go to **Step 2.5**. (First feature to drive: `F1-stock-visibility`.)

### 2c — own project: INTERVIEW (one question at a time, WAIT for each)

1. **Project name?**
2. **Parent directory?** (where the project dir is created)
3. **Databricks workspace URL?**
4. **GitHub owner** (user/org)? — or none → pass `--no-github` (local-only).
5. **Language?** java | kotlin | python | nodejs
6. **Does it have a UI?** yes → `--ui-track --client react`
7. **How many tiers?** — an architectural choice, ask explicitly; features are short-lived branches, NOT tiers:
   - **1** = prod only (features fork from prod)
   - **2** = prod + staging (features fork from staging)
   - **3** = prod + staging + dev (features fork from dev)
8. **Model profile?** **Default** (recommended — the kit's tuned per-role/per-step models + effort, no
   overrides) or **Customize** (override a role's model: repeatable `--agent-model <role>=<model>`; roles:
   spec-author, architect-reviewer, dba, test-strategist, ux-designer, navigator, driver, product-owner).

Only with all answers, scaffold (resolve `lakebase-create-project` from the installed kit; dev checkout:
`node <kit>/dist/bin/lakebase/create-project.cli.js`):
```bash
lakebase-create-project --project-name <name> --parent-dir <dir> --databricks-host <url> \
  [--github-owner <owner> | --no-github] --language <lang> [--ui-track --client react] --tiers <1|2|3> \
  --executor copilot [--agent-model <role>=<model> ...]     # --executor copilot persists the backend; --agent-model ONLY on Customize
cd <parent-dir>/<name>
./scripts/lk --install     # cache this project's pinned kit (instant when warm; a one-time download when cold)
```
Then go to **Step 2d** (intake interview — an own project has only an EMPTY intake, so you MUST capture it here).

### 2d — own project: INTAKE INTERVIEW → write `.consort/intake/answers.md`

A fresh own project scaffolds an EMPTY `product-overview.md` (template) and **no `.consort/intake/`**. Before
any planning you MUST interview the human and record their answers to `.consort/intake/answers.md` — the
product-owner `intake` turn (run by `/plan`) DRAFTS `product-overview.md` / `nfrs.md` / `design-brief.md`
FROM this file. Without it, planning has nothing to draft (do NOT jump to a sprint).

**Methodology lives in the kit's references — follow them, don't re-paraphrase:** the wizard-style
one-question-at-a-time flow is `skills/consort/references/hil-interview.md`; the exact file structure is
`skills/consort/references/intake-answers-template.md` (the headers below mirror it verbatim); and the
drive/gate contract you operate under is `skills/consort/references/orchestrator-contract.md`. UI track is
FIXED at scaffold (derive it from `.lakebase/consort-config.json` — `clientFramework: "react"` ⇒ UI), never
re-asked; run the design-brief questions only for a UI project.

Ask **one question at a time, in order**; record the human's answer under the matching header (keep headers
verbatim; use "No specific requirement" for a skipped item — record ANSWERS only, do NOT draft the briefs):

- **Domain and name:** product name; what it is + who uses it (1–2 sentences)
- **Product overview:** core user jobs; first usable version vs. later; expected growth; explicit non-goals; what to see after each sprint
- **NFRs:** performance; scalability; security; observability; operability; resilience; anything the architect should NOT pursue
- **Design brief (UI only):** 1–3 reference sites (URL + what to take from each); brand constraints (colors/logo/type/app icon); interaction/accessibility constraints

Then write `.consort/intake/answers.md` with EXACTLY this structure (the intake turn parses these headers):

```markdown
# Intake Answers

## Domain and name
- **Product name:** …
- **What it is + who uses it (1–2 sentences):** …

## Product overview
- **Core jobs the users need to accomplish:** …
- **First usable version vs. what comes later:** …
- **Expected growth over the next few iterations:** …
- **Explicit non-goals / out of scope:** …
- **What you want to see after each sprint (delivery expectations):** …

## Non-functional requirements
- **Performance (latency / throughput targets):** …
- **Scalability (data + concurrency growth):** …
- **Security (authn/authz, data sensitivity, audit):** …
- **Observability (what must be logged / measurable):** …
- **Operability (deploy, config, runbook expectations):** …
- **Resilience (failure modes that must degrade gracefully):** …
- **Anything the architect should explicitly NOT pursue:** …

## Design brief (UI track only)
- **Reference site 1 — URL + what to take from it:** …
- **Reference site 2 — URL + what to take from it:** …
- **Reference site 3 — URL + what to take from it:** …
- **Brand constraints (colors, logo, typography, app icon):** …
- **Interaction / accessibility constraints:** …
```
Then go to **Step 2.5**. (Later, `/plan` runs the PO intake turn that drafts the briefs from this file for your approval at the intake gate.)

## Step 2.5 — tooling hand-off (offer BOTH, ONCE, before driving)

Do this once a project exists (after 2b/2c, or immediately for an EXISTING project).

**Dashboard** (watch the run live). Check first, then offer:
```bash
./scripts/lk consort-dashboard --status --project-dir "$PWD"
```
- prints `running <URL>` → offer to open it: `./scripts/lk consort-dashboard --open --project-dir "$PWD"` (tell them the URL).
- prints `stopped` → offer to start it: `./scripts/lk consort-dashboard --detach --project-dir "$PWD"` (returns at once; read the `Consort dashboard → <URL>` line and tell them). It shows the RUN: phase/gate state, per-role progress, cost.

**Editor + SCM extension** (the Git + Lakebase **source-control view** — your code branch and its paired database branch side by side: working-tree changes, schema migrations, schema/branch diff, the PR, the CI runner. Complementary to the dashboard — the dashboard is the RUN, the extension is the CODE + DATABASE — NOT a replacement). Work these in order:

**(i) Decide install OR upgrade — a presence check is not enough.** A new release means an already-installed OLDER extension must still be upgraded, so read the installed version AND the latest release and compare:
```bash
ED="$(find_editor)"                                                          # see (ii); resolves bundle path too
INSTALLED="$([ -n "$ED" ] && "$ED" --list-extensions --show-versions 2>/dev/null | sed -n 's/^kevin-hartman\.lakebase-scm-extension@//p')"
LATEST="$(gh release view --repo databricks-solutions/lakebase-scm-extension --json tagName --jq .tagName 2>/dev/null | sed 's/^v//')"
```
Up-to-date (skip the offer silently) ONLY when `[ -n "$INSTALLED" ] && [ "$INSTALLED" = "$LATEST" ]`. A MISSING `$INSTALLED` **or** one OLDER than `$LATEST` ⇒ offer the install/upgrade (the block below force-installs the latest `.vsix`, which upgrades in place).

**(ii) Find the editor by APP-BUNDLE path, never a bare `command -v`.** A stripped PATH makes `command -v cursor`/`which code` fail even when the editor is plainly installed — the false "no editor" miss. Resolve the macOS app bundle as a fallback:
```bash
find_editor() {
  local order="cursor code"
  if [ -z "${CURSOR_TRACE_ID:-}" ] && { [ -n "${VSCODE_PID:-}" ] || [ "${TERM_PROGRAM:-}" = "vscode" ]; }; then order="code cursor"; fi
  for c in $order; do command -v "$c" >/dev/null 2>&1 && { echo "$c"; return; }; done
  for p in "/Applications/Cursor.app/Contents/Resources/app/bin/cursor" "$HOME/Applications/Cursor.app/Contents/Resources/app/bin/cursor" \
           "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" "$HOME/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"; do
    [ -x "$p" ] && { echo "$p"; return; }
  done
}
```
Only conclude "no editor" when `find_editor` is empty (then point them at installing Cursor/VS Code + the manual VSIX path). If you used a bundle path, mention they can add the short command via the editor's *"Shell Command: Install 'code'/'cursor' command in PATH"*.

**(iii) Install/upgrade + open**, on the human's yes:
```bash
DEST="$(mktemp -d)"   # fresh dir so a stale older .vsix can't be picked
gh release download --repo databricks-solutions/lakebase-scm-extension --pattern '*.vsix' --dir "$DEST" --clobber
"$ED" --install-extension "$(ls -t "$DEST"/*.vsix | head -1)" --force
"$ED" "$PWD"          # open the project with the extension active
```

**(iv) Already inside the IDE terminal?** (`$TERM_PROGRAM` has `vscode`/`cursor`, or `$CURSOR_TRACE_ID`/`$VSCODE_PID` set) → do NOT tell them to move or open a new terminal (that pushes them out of where they are). Just run the version check; install/upgrade only if MISSING or OLDER, else say nothing, and continue in THIS terminal. **Skip the move offer entirely in this case.**

**(v) Move-to-editor — a standalone STOP (only when NOT already in the IDE terminal).** Ask ONLY *"move to the editor + SCM viewer, or keep driving here?"* and then STOP — do NOT bundle it with any other setup question, and do NOT proceed to driving until the human answers THIS one. It is still an offer (keep driving here is fine), but the human must actively choose the terminal; never skip or fold it.

**(vi) After the editor opens, offer to resume the workflow in the editor — don't just leave them in a fresh window.** The new window has no session driving it. Tell them: open a terminal there (**Ctrl+`**), run `copilot`, then re-run this skill (`/consort` — it reads project state from disk, `consort-next` is authoritative, and picks up exactly where this leaves off). Or offer to keep driving from here while they watch. Drive from ONE session at a time (two concurrent drives race on the git worktree).

Honor each yes/no; force neither. Then → Step 3.

## Step 3 — resume/drive

**3a — Situation report (take stock FIRST).** For an EXISTING project, read and briefly summarize to the
human before driving: `.consort/product-overview.md`, `.consort/nfrs.md`, `.consort/design/design-brief.md`
(UI), `.consort/planning/feature-proposals.md`, and each `.consort/features/*/` (feature-request, spec,
architecture, test-list). Say what the product is, the current phase (per `consort-next` below), and each
feature's status. (Skip for a project you scaffolded this session — you already know it.)

**3b — Intake readiness (check BEFORE planning).** A project can have `.consort/` but still no intake (e.g. a
freshly-created own project). If `.consort/intake/answers.md` is ABSENT and `product-overview.md` is still
the empty template, the project has no intake yet — do NOT run planning. Instead:
- own project → do **Step 2d** now (interview the human → write `.consort/intake/answers.md`), or
- the bundled example → run `./scripts/lk lakebase-stage-first-project` (pulls in the StockFlow intake + feature-requests).

**3c — Drive mode.** Offer the human one of: **whole sprint** (autonomous — flows plan → per-feature
design → build → deploy, pausing only at gates; re-invoke to continue past an approved gate) OR **one phase
at a time** (you run a single phase and stop for review). Carry their choice into the enact below.

**3d — Enact.** The kit DERIVES the next ready action. Ask it, then run exactly what it hands back:
```bash
./scripts/lk consort-next --feature <F> --json | jq -r '.options[].enact'   # feature scope
./scripts/lk consort-next --sprint  <S> --json | jq -r '.options[].enact'   # planning scope (no feature yet)
```
Run the `enact` command **verbatim** — it is the authoritative next step the kit derived from disk. The
shapes below are ILLUSTRATIVE (so you recognize what you get back); never substitute a form from this list
for the actual `enact` string, and never "fix up" its flags from memory. It is one of:
- planning: `./scripts/lk consort-drive --sprint <S> --plan-only` (proposes features; you commit the backlog at its gate)
- a feature phase: `./scripts/lk consort-drive --feature <F> --only design` → `--only build` → `--only deploy --deploy-target local`

The deploy target flag is `--deploy-target <t>` (default `local`) — NOT `--target`; `consort-drive` silently
ignores unknown flags, so a stray `--target` would quietly do nothing. A feature drive **must** name its
phase (`--only design|build|deploy`) — a bare `--feature` is refused.
These CLIs are what Claude's scaffolded slash commands wrap, so invoke **the CLIs they wrap** directly
(`./scripts/lk consort-drive` / `consort-next`) rather than any `/sprint`-style command. Launch a long
phase **detached** and relay it with poll-once `consort-watch --since <cursor>` (never a blocking
foreground watch; Copilot has no Monitor tool, so repeat the poll until the pid is gone):
```bash
./scripts/lk consort-drive --feature <F> --only build --detach   # returns pid + watch cmd (build takes no target)
./scripts/lk consort-watch --since 0 --pid <pid>                                 # relay live; repeat with the printed cursor
```

**Gate authority (verbatim from `/consort:start` — do NOT weaken it):** `consort-watch` / `drive-live.log`
are NARRATION ONLY, never your gate or completion authority. Decide the two real questions only from
authoritative sources — **did the drive stop?** ⇒ its `--pid` is gone; **is a human needed?** ⇒ run
`consort-next` (reads `.consort/next.json`). Its **`awaiting_human` is the SOLE gate signal** — `true` ⇒
surface the decision to the human at once (use the non-`resume` option's `hil_prompt` + `enact`); `false` ⇒
resume the drive. Do NOT gate on `primary_action.kind` / `state.open_gates` — the planning backlog pause is
an `invoke-role` with empty `open_gates`, so those miss it.

## Gates — the human decides

When the drive pauses at a gate (intake / plan / spec / architecture / test-list / **acceptance** / deploy /
promote), STOP, present the artifacts + the decision, and approve / modify / reject only on the human's word.
Then loop back to Step 3 for the next action until the feature (or sprint) is done. NEVER accept a gate
without surfacing it, and KEEP RELAYING the detached drive (consort-watch / re-check `consort-next`) so a
park is never silent — a drive that exited at a gate is waiting on the human, not done.

**Working-software gates (`acceptance` / `deploy`) — SERVE THE APP; do NOT hand-wave.** At a per-story
`acceptance` gate (the story's experiment is built + merged to the feature branch) or the feature `deploy`
gate, the human reviews RUNNING software. Do NOT tell them to "check out the branch and run it" — Consort
serves it for you. Offer to run:
```bash
./scripts/run-dev.sh      # migrates the branch DB + starts the backend AND (full-stack) the client, hot-reload
```
It prints the local URL(s) (default: client `http://127.0.0.1:5200`, backend `http://127.0.0.1:8200`). It
runs until Ctrl-C, so launch it so it stays up and relay the URL at once. Give the human the URL **plus the
story's expected behavior to click through**, taken from the story's ACs (e.g. "file a stock record via the
Home form and see it in the table"). Accept ONLY on the human's word; then run the `consort-next` `enact`
to accept + resume, and keep relaying. (The `deploy` lane already proved reachability; `run-dev.sh` is the
hands-on review surface on top of that.)

## Teardown / reclaim (run from inside the project)

- **Done with a spike?** `./scripts/lk consort-spike delete --slug <slug>` tears down its paired Lakebase +
  git branch (notes kept; add `--purge-notes` to remove them too).
- **Reclaim a project's substrate?** `./scripts/lk lakebase-scm-cleanup list` (see what's there), then
  `… branches` (delete ephemeral branches; tiers + trunk protected) or `… project --confirm <id>` (destroy
  the project). Dry-run unless `--yes`.

## Parity with `/consort:start` — transforms + intentional omissions

This coordinator mirrors EVERY `content` step of `/consort:start` (enforced by
`tests/bdd/coordinator-parity.test.ts` against `integrations/copilot/coordinator-parity.ts`). The following
Claude-Code mechanics are **transformed** for Copilot (same intent, Copilot-native mechanism):

- **AskUserQuestion** structured prompts → plain chat questions, one at a time; NEVER wrap a free-text
  answer (name/dir/host/owner) in an options prompt.
- **`$CLAUDE_PLUGIN_ROOT`** / `$CONSORT_ROOT` plugin-binary resolution → the kit resolution order in Setup
  (on PATH → `LAKEBASE_KIT_DIR` → offer `npm i -g @databricks-solutions/consort`).
- The **`consort-preflight`** `--json` cache → direct checks at the point of use (`ls -d .consort`,
  `git status`, `consort-next`, `consort-dashboard --status`).
- `claude plugin marketplace update` / `claude plugin update` → **`gh copilot plugin install`** (plugin) +
  `npm i -g @databricks-solutions/consort` (kit).
- Claude's scaffolded slash commands (`/sprint` `/plan` `/design` `/build` `/deploy` `/spike`) → **the CLIs
  they wrap** (`./scripts/lk consort-drive` / `consort-next`), invoked directly.
- The **Monitor tool** → poll-once `./scripts/lk consort-watch --since <cursor>` relay (or a background
  watch); Copilot has no Monitor tool.
- **Per-turn artifact-open** in the editor → surface each finished artifact in chat (the dashboard shows
  them too); there is no editor auto-open seam in the Copilot CLI.
- The telemetry **silent Bash-description** discipline → ask in plain chat prose; Copilot surfaces no
  tool-call description to suppress, so only the one-time briefing text carries over.

**Intentional omissions** (documented, not gaps — Claude-plugin kit-version management that is out of this
coordinator's drive flow):

- The project-vs-plugin **pin-lag** check (`check-pin-lag`): specific to the Claude plugin host (a committed
  `.lakebase/kit-ref` pinned behind a newer plugin); the Copilot kit is one global/npm install.
- The **legacy pin**→`main` repin: version-management housekeeping; a modern create pins an immutable tag.
- The in-place **`consort-upgrade`** kit-swap ritual (dual-pinning `.lakebase/kit-ref*`, rollback): a Copilot
  kit is upgraded out of band via `npm i -g @databricks-solutions/consort`, then `gh copilot plugin install`.

If you find a behavior `/consort:start` has that materially affects a run and is missing here, it's a bug —
add it (and the manifest + the parity test with it).

## Notes

- Role turns run on Copilot through the auto-resolved binary (Setup); the role contracts are the bundled
  `com.github.copilot/agents/<role>.agent.md` files.
- Lakebase work is the orchestrator's own; the `consort` MCP (`mcp.json`) is OPTIONAL and often policy-disabled.
- If `ug copilot -p "hi"` 403s "not authorized to use this Copilot feature", the GitHub identity lacks the
  Copilot-CLI entitlement (Opal group / entitled token) — an account grant, not something this flow fixes.
- **After editing this skill or the role agents, REINSTALL the plugin** (`gh copilot plugin install <dir>`) —
  Copilot caches plugin content at install time.