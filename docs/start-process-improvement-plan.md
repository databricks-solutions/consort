# Consort `/start` + create-project — Improvement Plan

Tracking doc for start/create-process hardening surfaced 2026-10-28. Each item: **Problem → Root cause (file:line) → Fix → Test → Status**. Repo is tagged per item (`scm-utils` = `databricks-solutions/lakebase-scm-utils`, `consort` = `databricks-solutions/consort`). Nothing here is shipped yet — items ride the next respective cut.

Originating incidents / refs: `feedback_consort_create_push_hook_cold_download`, `feedback_consort_create_stale_auth`, and the 2026-10-28 live Cursor+tmux extension false-offer.

---

## A. Create-flow robustness — cold toolkit download + partial rollback  ·  `scm-utils`

**Incident:** on a cold toolkit cache, `lakebase-create-project` fails at the final `git push -u origin main` (the repo's pre-push hook fires `./scripts/lk` → one-time toolkit cold download, hundreds of npm fetches, races the push). The error handler rolls back only the Lakebase project, leaving an **empty GitHub repo + stray runner + local dir** (4-artifact manual cleanup). Retry works because the toolkit is cached by then.

### A1. Pre-warm the toolkit (prevent the race)  ·  **proposed**
- **Root cause:** `create-project.ts:625` `commitAndPush` is the FIRST `./scripts/lk` call; the pre-push hook does the cold bootstrap inline, mid-push. The `:279` "toolkit downloads on first use" line is a passive message — no active warm. Scaffold lays `scripts/lk` at `scaffoldAll` (`:381`).
- **Fix:** add an explicit warm step right after `scaffoldAll` (`:381`), before the push — run a cheap `./scripts/lk` (or `lk --refresh`) with its own progress + one retry, so the toolkit is cached before the pre-push hook fires.
- **Test:** hermetic — a create run on a cold cache warms before the push; the push's `lk` invocation finds the toolkit present.

### A2. Treat a push failure as retriable — do NOT roll back  ·  **proposed** (key design fix)
- **Root cause:** `withLakebaseRollback` (`:368`) rolls back on ANY throw inside, including the push. But by Step 8 everything (Lakebase + repo + runner + scaffold) succeeded and the commit is LOCAL — tearing it down for a transient cold-download push is backwards.
- **Fix:** on a push-only failure, keep all state intact; auto-retry the push once (toolkit now cached); if still failing, surface `"provisioning complete; finish with: cd <dir> && git push -u origin main"` and exit non-destructively (resumable).
- **Test:** hermetic — a simulated push failure leaves Lakebase/repo/runner intact + prints the resume line; a retry succeeds.

### A3. Atomic rollback for genuine provisioning faults  ·  **proposed**
- **Root cause:** the GitHub repo is created at `:310` (Step 1-2), *before* `withLakebaseRollback` opens (`:368`), so it is never in rollback scope; runner (`:476`) + local dir aren't either.
- **Fix:** replace `withLakebaseRollback` with a created-resources ledger (push repo → Lakebase → runner → local dir as each is created; tear down in reverse on a *provisioning* throw). Move repo creation inside the scope. Leaves a clean "name is free" state.
- **Test:** hermetic — a mid-provisioning throw tears down all registered resources in reverse.

---

## B. Pre-scaffolding GitHub preflight — account access + requisites  ·  `scm-utils`

**Problem:** the only GitHub requisite checked up front is the `workflow` scope (`create-project.ts:300`). Other requisites surface LATE (a wrong active account → 403 at the push; a missing `repo` scope / name collision mid-create). Primitives already exist: `getCurrentUser` (`github/repo.ts:50`), `checkGitHubScopes` (`:77`), `repoExists` (`:157`), `GITHUB_SCOPES`.

Consolidate into ONE up-front GitHub preflight (before Step 1), so a missing requisite fails in seconds with a fix and **nothing is created** (no rollback for this whole class):

### B1. Active account / push access  ·  **proposed**
Resolve the active `gh` account (`getCurrentUser`) and confirm it can push to the target `githubOwner`. Catches the wrong-account 403 (`databricks-solutions` pushes 403 as `_data`; consort needs `kevin-hartman`) up front instead of at the push.

### B2. Full required scope set, not just `workflow`  ·  **proposed**
`checkGitHubScopes(GITHUB_SCOPES)` once — private-repo create needs `repo`, runner needs admin/registration, workflows need `workflow`. Report all missing scopes together.

### B3. Name availability up front  ·  **proposed**
`repoExists(<owner>/<name>)` before `createRepo`, plus the local-dir and Lakebase-slug collision checks — fail before any resource exists.

### B4. Repo-create rights + Actions enabled  ·  **proposed**
That the account can create a repo under the target owner/org, and (self-hosted runner path) that Actions is enabled (`getActionsEnabled`) — a disabled-Actions org otherwise only shows up as silently-queued CI.

**Test:** hermetic per check (trips on the clear bad case, passes on the benign one), with injected `gh`/API responses.

---

## C. Extension + editor detection under tmux  ·  `consort`  ·  LIVE-HIT 2026-10-28

**Incident:** in Cursor (via tmux) with the SCM extension installed (v0.7.3), `/start` offered to install it as if missing.

### C1. Make extension installed/current a deterministic preflight fact  ·  **proposed** (the reported symptom's real fix)
- **Root cause:** `session/preflight.ts:13` deliberately leaves the extension probe to the agent; `:245` always lists `extension` in `offers_pending` with no installed-state fact. The agent is supposed to run the version check (`start.md:270`) and "silently skip when current" — but the check is skippable, and here the agent offered install without running it. (The shell check itself WORKS — `cursor --list-extensions --show-versions` → `kevin-hartman.lakebase-scm-extension@0.7.3`, kit `sed` → `INSTALLED=0.7.3`.)
- **Fix:** have `consort-preflight` run the `find_editor` + `--list-extensions --show-versions` probe (PATH/app-bundle based → works THROUGH tmux, unlike the env signals) and return `tooling.extension = { installed, version }`. Drop `extension` from `offers_pending` when installed. Reuse the editor helper in `consort/orchestrator/open/open-in-editor.ts` instead of the `find_editor` prose living only in `start.md`.
- **Test:** hermetic — with an installed+current extension, preflight returns `installed:true` and omits `extension` from `offers_pending`.

### C2. Harden `insideEditor()` for tmux  ·  **proposed** (companion false "move to editor")
- **Root cause:** `preflight.ts:102` keys on `TERM_PROGRAM === "vscode"` / `CURSOR_TRACE_ID` / `VSCODE_PID`. tmux rewrites `TERM_PROGRAM=tmux` and drops `CURSOR_TRACE_ID`/`VSCODE_PID`, so `inside_editor` is falsely `false` → preflight adds `move-to-editor` even though the user is in Cursor's terminal.
- **Fix:** when `$TMUX` is set / `TERM_PROGRAM=tmux`, don't conclude "external" — fall back to a tmux-aware probe (walk the parent process tree for a `Cursor`/`Code` ancestor, or read the tmux client's launch env); when genuinely uncertain, don't falsely push a move.
- **Test:** hermetic — a simulated tmux-in-editor env resolves `inside_editor:true` (or at least suppresses the false move offer).

---

## D. Planning-lane UX-designer visibility — language + dashboard  ·  `consort`  ·  LIVE-HIT 2026-10-28 (stockflow-demo)

**Problem:** at the intake gate the human is told "features will be proposed and the architect t-shirt-sizes them" with **no mention of the ux-designer**, yet the dashboard shows a ux-designer role right after PO — and the run appeared to jump PO → intake gate, skipping it.

**What really happens** (`orchestrator-drive.ts:324→341`): `PO intake` → **`ux-designer` establish (UI-track only, `:332`)** → **intake gate (`:339`)** → `spec-author propose` → `architect` t-shirt sizing → **backlog gate**. The establish authors design-guide + ia.md that JOIN the intake gate's artifact set (no new gate). It's `state.uiTrack`-gated (`uxDesignerPending` = `uiTrack && breakdownDone && !designGuideReady`), so it's skipped when `uiTrack` is off — the likely cause of the observed skip.

### D0. Root cause — planning-lane state never threads `uiTrack` (establish unreachable)  ·  **VERIFIED 2026-10-28, the real bug**
VERIFIED against `~/stockflow-demo` (home dir, not `~/code`): `run-config.ui_track=true`, clientFramework=react, kit `v0.4.28`, intake authored (product-overview/nfrs/design-brief present), no design-guide. The drive's own `next.json` (sprint `v1`) shows `primary_action = approve-intake-gate` with the prompt "hand the intake to the Spec Author" — the establish was skipped and never surfaced. (My earlier "uiTrack is false" guesses were WRONG — uiTrack IS true; verify, don't deduce.)
- **Root cause:** `bin/consort/next.cli.ts:104-105` builds the SPRINT/planning snapshot via `deriveSprintPlanningState(consortDir, sprint, {skipSizing})`, which (`orchestrator-sprint.ts:60,96`) neither accepts nor sets `uiTrack` (nor `designGuideReady`). The FEATURE path right below (`:108`) DOES thread `uiTrack: resolveConsortSettings().project.uiTrack`. So in the planning phase `state.uiTrack` is `undefined` → `orchestrator-drive.ts:332` `state.uiTrack && !designGuideReady` is always falsy → **the planning-lane ux-designer establish (`:325-333`) is DEAD CODE for every project.** The drive's planning execution uses the same state, so it skips the establish at run time too (confirmed by the stop-state).
- **Fix:** thread `uiTrack` (from `resolveConsortSettings(projectDir).project.uiTrack`) and `designGuideReady` (from `designGuideConformance(consortDir).ok`) into `deriveSprintPlanningState`'s returned state, and have BOTH callers populate them — `consort-next` (`next.cli.ts:105`) AND the drive's planning execution path. Then the establish fires before the intake gate on UI projects (idempotent once design-guide.json exists).
- **Test:** hermetic — a planning state with `uiTrack:true` + no design-guide yields `nextTransition → ux-designer establish` (not `approve-intake-gate`); with `uiTrack:false` it goes straight to the gate.
- D1-D3 (language/dashboard) still apply so the establish is surfaced once it fires.

### D1. `/plan` narrative omits the establish + conflates the two gates  ·  **proposed**
- **Root cause:** `commands/start.md:87` jumps PO intake → propose → sizing → "backlog gate", with no ux-designer step and the intake gate vs backlog gate compressed into one.
- **Fix:** insert the UI-track `ux-designer establish` between PO intake and the intake gate; name the **two** gates distinctly — the **intake gate** (approve product-overview/nfrs/brief [+ design-guide/ia.md on UI track]) and the later **backlog gate** (pick features after sizing).

### D2. Narration must name the ux-designer as NEXT + what it produces  ·  **proposed** (explicit requirement)
- **Requirement (user, 2026-10-28):** on the UI track, once intake is drafted the narration must say **the ux-designer is next and converts the design-brief into UX assets** — the named artifacts **`design-guide.json`** (project style system) + **`ia.md`** (IA skeleton) — NOT "hand the intake to the Spec Author." Fix the drive's intake-gate `hil_prompt` (`next.json` `options[].hil_prompt` — today reads "hand the intake to the Spec Author, who proposes the sprint") and the `/plan` narrative so, on UI track, the sequence reads: approve intake → **ux-designer establishes `design-guide.json` + `ia.md` from the design-brief** → spec-author proposes → architect sizes. (Depends on D0 so the establish actually routes.)

### D3. Dashboard shows the ux-designer role unconditionally  ·  **DEFERRED**
- **Fix:** reflect `uiTrack` in the planning lane — show the ux-designer establish as conditional/skipped when non-UI, so the graph matches the run (and the per-story IA role in the design lane is distinct from the planning establish).
- **Deferred (2026-10-28):** the dashboard has no access to `uiTrack` today (not in its state source), so this needs `uiTrack` plumbed into the dashboard data + the role-node render conditionalized — a contained but separate change. Lower value now that **D0** makes the establish actually fire on UI projects (the dashboard is accurate for the UI case); the residual is a non-UI grey-out. Pick up as a standalone dashboard task.

---

## Sequencing / proof
- All items are KIT-side (no live run needed except the create-flow A-items, which are hermetically testable with injected git/gh/Lakebase ops).
- `scm-utils` items (A, B) ride a scm-utils cut; `consort` items (C) ride a consort cut (coordinated order scm-utils → consort).
- Prove-before-ship per the kit rule: hermetic test per item + the pre-push full-suite gate.
