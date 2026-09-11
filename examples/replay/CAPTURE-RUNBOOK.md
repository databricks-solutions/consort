# Capture runbook: running an effective live capture (and troubleshooting one)

This is the operational process for `capture-scenario.sh`. Read it before every
capture. Most failed captures are not kit bugs; they are the operator running
some step through a *different* kit than the run uses, then reading the
difference as a defect.

## Rule 0: never execute or troubleshoot through a workaround

Every command you run to create, drive, verify, or reproduce a step MUST resolve
the kit the SAME way the capture does (through the project's `./scripts/lk`
shim, with the same environment). If you shortcut it, you are observing a
different system than the one you are trying to debug, and the observation is
worthless.

Concretely, do NOT:

- run `node .../dist/scripts/.../<x>.cli.js` directly (bypasses the shim, and any
  nested `lk` call inside it, e.g. `run-tests.sh` cutting an ephemeral branch,
  falls back to a different kit),
- call `./scripts/lk <bin>` with a different `LAKEBASE_KIT_DIR` / ref than the
  run had,
- hand-feed identifiers the substrate would compute (e.g. passing a branch
  **uid** `br-...` where the gate passes the cycle's branch **name** from the
  recorded cycle record),
- reproduce a gate step (honest-GREEN verify, deploy) any way other than through
  the same shim + env the drive used.

If you cannot run a step cleanly through the shim, fix the environment (below)
first. Do not invent a way around it.

## How the kit is resolved (the root of every "stale shim")

`./scripts/lk` picks the kit in this order (see the shim header):

1. `LAKEBASE_KIT_DIR` , a kit checkout/install used DIRECTLY. No cache, no
   network, `--warm`/`--rewarm` are no-ops.
2. else ref = `LAKEBASE_KIT_REF` -> `.lakebase/kit-ref.local` (gitignored run pin,
   survives checkouts) -> `.lakebase/kit-ref` (committed; CI reads it) -> `main`,
   installed from GitHub into a shared cache at `~/.cache/consort/<ref>`.

Two facts that cause split-brain runs:

- **A branch ref moves.** The cache for a branch can hold an old commit's
  `dist`. Only `lk --warm` (reinstalls when the remote SHA advanced) or
  `lk --rewarm` (forces a fresh install of the resolved SHA) refresh it. A plain
  bin run never re-resolves.
- **`claude -p` agents do not inherit env.** The shim says so explicitly. The
  orchestrator (`capture-scenario.sh` -> `consort-drive`) can be pointed
  at your working tree with `LAKEBASE_KIT_DIR`, but the spawned role agents
  (spec-author, driver, ...) resolve via `.lakebase/kit-ref` -> the GitHub
  cache. So the orchestrator and the agents can run DIFFERENT kits in the same
  capture.

Consequence: **an unpushed working-tree kit cannot reach the agents.** The cache
installs from GitHub only. If your change lives in code an agent invokes, the
agents will not see it until it is pushed to a ref and that ref is warmed.

## Pick ONE resolution mode before you start

**Mode A , working-tree only.** Valid ONLY when your kit change is entirely in
orchestrator/drive code (prompt emission, derive, effects, the deploy/honest-
GREEN verify) and NOT in anything a role agent shells out to.

1. `npm run build` in the kit (the shim runs `dist/`, not the source).
2. `export LAKEBASE_KIT_DIR=<kit working tree>` for the WHOLE session, so the
   orchestrator and every nested `lk` (run-tests.sh, verify, logging) use it.
3. Accept that agents still resolve via `.lakebase/kit-ref`; if that matters for
   your change, use Mode B.

**Mode B , pinned pushed ref (the faithful full run).** Required whenever agent-
invoked kit code changed, or when you want the orchestrator and agents to run the
identical kit.

1. Commit + push the kit to a branch or SHA.
2. Write that ref into the project's `.lakebase/kit-ref` (create it if absent;
   default is `main`).
3. Pin or clear `.lakebase/kit-ref.local`: it is gitignored and WINS over
   `.lakebase/kit-ref`, and the drive writes the launch ref into it at start
   (`pinRunKitRef`). Either write the same ref into `.lakebase/kit-ref.local` or
   delete it, so a leftover local pin from a previous run cannot silently override
   the ref you just set.
4. `./scripts/lk --rewarm` in the project , forces a fresh install of the
   resolved SHA into the cache (content-addressed, so a moved branch cannot serve
   stale `dist`).
5. Leave `LAKEBASE_KIT_DIR` UNSET so orchestrator + agents both resolve the same
   cached ref.

Never mix the two: `LAKEBASE_KIT_DIR` set AND a `.lakebase/kit-ref` that names a
different kit is the split-brain trap.

## Preflight checklist (every capture)

- [ ] Kit hermetic suite + typecheck green (`npm run typecheck`, `npx vitest run`).
- [ ] Resolution mode chosen (A or B) and its steps done.
- [ ] Cache not stale: Mode B ran `lk --rewarm`; Mode A rebuilt `dist`.
- [ ] `DATABRICKS_CONFIG_PROFILE` valid for the target workspace.
- [ ] Port 8000 free (the local deploy verify binds it): `lsof -iTCP:8000 -sTCP:LISTEN`.
- [ ] `LAKEBASE_CONSORT_AUTO_CONTINUE=1` (headless, required for `--create`).
- [ ] No leftover orphan from a prior failed run (see Teardown).

## Run

```
LAKEBASE_CONSORT_AUTO_CONTINUE=1 DATABRICKS_CONFIG_PROFILE=<profile> \
bash examples/replay/capture-scenario.sh \
  --scenario <name> --create \
  --databricks-host <url> --github-owner <owner> \
  --tiers 2 --ui \
  --inputs-from <corpus-dir> \
  --feature <F1> [--feature <F2> ...]
```

Recording lands in `examples/replay/corpora/<name>/` (`turns/`,
`recorded-artifacts/`, `recorded-build/`).

### Sprint mode (exercise the planning lane + emit `backlog.json`)

Add `--sprint <name>` to drive the whole-sprint orchestrator (planning to the
plan gate, then per-feature claim+drive) instead of the per-feature loop. Each
sprint's backlog is EXACTLY the `--feature` ids that FOLLOW its `--sprint`.
`--sprint` is REPEATABLE: sprints run sequentially on the ONE project, so you can
put each feature in its own sprint and the run continues to the next sprint after
the prior completes.

```
# one sprint, two features:
... capture-scenario.sh --scenario <name> --create ... \
  --sprint <sprint-name> --feature <F1> --feature <F2>

# two sprints, one feature each (F1 in sprint 1, F6 in sprint 2):
... capture-scenario.sh --scenario <name> --create ... \
  --sprint <name>-s1 --feature <F1> \
  --sprint <name>-s2 --feature <F6>
```

Continuing to the next sprint works because the driver clears the prior
feature/sprint's terminal coarse phase at each feature start
(`resetStaleTerminalPhase`), so sprint 2 does not inherit sprint 1's `shipped`
phase and no-op.

In `--sprint` the harness does NOT pre-seed the feature-requests: the planning
lane authors them LIVE (the proxy-as-PO author-requests step, fed by
`LAKEBASE_CONSORT_SPRINT_REQUESTS`), so `sync-backlog` projects `backlog.json` from
just those features. After the plan gate, `runSprint`'s `commitAndPushRequests`
commits + pushes the just-authored requests to `origin/<entry-tier>` before the
first fork, so each feature branch (forked from origin) inherits its request.
Without `--sprint`, the per-feature loop pre-seeds each request on the entry tier
and drives each `--feature` directly, and no `backlog.json` is produced (the plan
lane never runs).

## Observe + troubleshoot (through the shim, never around it)

- Read the run log, the recorded turns, and `.consort/escalations/*.json`.
- To reproduce a gate step, invoke it THROUGH the project's `./scripts/lk` with
  the SAME env the run had (same mode A/B). Read the identifiers from the
  recorded artifacts (e.g. the cycle's branch **name** from
  `.sftdd/cycles/<F>/<S>/...`), do not invent them.
- The honest-GREEN verify is `ensureDeployedAndVerify`: it stops any app, starts
  `make run`, polls `http://localhost:8000/` until reachable, cuts an EPHEMERAL
  branch off the cycle's branch, runs pending migrations + `./scripts/run-tests.sh`
  against it with `BASE_URL` set, then stops the app. A plain in-process `pytest`
  does NOT exercise the boot, the ephemeral-branch DB, or the migrations, so it is
  not a substitute for the gate and its green does not contradict a gate red.

## On a HIL escalation

The drive exits 0 and pauses when it raises to HIL. To resume you must clear BOTH
escalation sources, then resume through the same env:

1. Remove/resolve the explicit `.consort/escalations/*.json`.
2. Clear any blocking smell in `.consort/smells.json` (a derived escalation source).
3. Resume with a direct `consort-drive` call (NOT `run-smoke.sh`, which
   checks out `main`), same resolution mode as the run.

Only resolve an escalation once you have reproduced the gate through the shim and
confirmed the underlying condition, not from an in-process test that bypasses it.

## Teardown (a failed or finished run leaves four resources)

For project `<P>` owned by `<owner>`:

1. Runner: stop the process (`pkill -f <P>`), deregister
   (`gh api -X DELETE repos/<owner>/<P>/actions/runners/<id>`), delete
   `~/.lakebase/runners/<P>/`.
2. Lakebase project: `databricks postgres delete-project projects/<P> --profile <profile>`.
3. GitHub repo: `gh repo delete <owner>/<P> --yes`.
4. Local dir: `rm -rf <parent>/<P>`.
