# Runbook: rewind an eval bed to design-complete and test a change live

Reset a built/in-flight feature bed back to **design-complete** (all stories designed +
gate-approved, zero build code, clean DB) and re-drive the build with a candidate kit
change, to measure times and confirm the build still produces the same outputs. The bed
is the evaluation artifact — the kit is what's under test, never edited to fake a result.

Worked example throughout: bed `~/code/f6-bed-01`, feature `F6-split-tracking-code`
(stories `S1-expand-split-columns`, `S2-show-batch-serial`, `S3-contract-drop-tracking-code`),
anchor commit `af813f7`, Lakebase project `f6-bed-01` on profile `fevm-stockflow`.

---

## The one thing to understand first: THE REWIND IS A RESTORE, NOT A REBUILD

The design-complete state is already captured in a committed **anchor commit**. That
commit tracks the full `.consort` design state **including the per-story ledger**
`.consort/features/<F>/pipeline.json`, in which every story is
`gate=approved / status=ready`, `build_queue=[all stories]`, `build_active=null`.

That ledger is the design lane's own committed output and the single thing the build
planner reads to decide what to dispatch. **It is NOT disposable run-state.** Rewinding =
restoring the committed snapshot; you never reconstruct the ledger by hand.

Verify the anchor carries it before you start:

```bash
git show <anchor>:.consort/features/<F>/pipeline.json | python3 -c \
  "import json,sys; d=json.load(sys.stdin); print(d['build_active'], d['build_queue']); \
   [print(k, v.get('status'), (v.get('gate') or {}).get('status')) for k,v in d['stories'].items()]"
# expect:  None  ['S1...','S2...','S3...']   and every story: ready approved
```

### What NOT to do (the thrash this runbook exists to prevent, 2026-10-24)

- **`git clean -fdx .consort`** deletes the *tracked* ledger's working copy. Then the
  planner reads an empty/rebuilt pipeline and prints `build already complete (0 actions,
  nothing to do; the per-story pipeline already carried it out)` and dispatches nothing.
- **Hand-rebuilding** with `story-pipeline set --status ready` makes bare
  `{"status":"ready"}` entries with **no gate approval** — same "0 actions" dead end.
- **`story-pipeline approve-gate`** on a design-COMPLETE feature is **refused**:
  `per-story draft invariant violated: ACs already exist for <other stories>` — approve-gate
  enforces the streaming one-story-at-a-time DRAFT flow, which an all-ACs-present feature
  violates. There is no hand path to the gate-approved ledger; restore it.

---

## Procedure

### 0. Trust the bed workspace FIRST (headless-agent prerequisite)

A bed **rewound in place** was never trusted interactively, so it has no entry in
`~/.claude.json` and is untrusted by default. Headless role agents (`claude -p` for
navigator/driver) then print `Ignoring N permissions.allow entries … this workspace has
not been trusted` and their tool allowlist is dropped, so a `Write`/`Bash` tool call
**gates with no approver and hangs ~600s** → `turn stalled: no agent output for ~600s;
killing … retrying on a fresh session` → burns all 5 retries → HIL. The build makes a
cycle or two then stalls forever. Before launching, confirm the bed is trusted (every
working bed has `hasTrustDialogAccepted: true`):

```bash
python3 -c "import json;p=json.load(open('$HOME/.claude.json')).get('projects',{}).get('<BED_ABS_PATH>');print(p and p.get('hasTrustDialogAccepted'))"
# None/False -> trust it: open `claude` in the bed once and accept the dialog, OR set
#   projects["<BED_ABS_PATH>"].hasTrustDialogAccepted = true in ~/.claude.json
```

NOTE: setting this from inside an agent is blocked by the auto-mode classifier
(self-modification of the trust guard) — the human must accept the dialog or set the flag.

### 1. Restore the committed design-complete snapshot (git)

On the **feature** branch (not a leftover `experiment-*` branch), forward-reconcile so
`origin` fast-forwards (never hard-reset to an older commit — see
`project_design_complete_reset_procedure`, trap 1):

```bash
git checkout feature-<F>
git read-tree -u --reset <anchor>         # restores design corpus AND the tracked ledger together
git commit -m "reset: clean <F> to design-complete"
git branch -D experiment-<story>-exp1 2>/dev/null   # drop any leftover experiment git branch
```

### 2. Purge ONLY untracked run-state (keep the tracked ledger)

```bash
rm -rf .consort/turns .consort/cycles .consort/escalations .consort/deploy
rm -f  .consort/next.json .consort/run-config.json
git checkout HEAD -- uv.lock              # tracked; a deleted/dirty uv.lock makes the experiment cut REFUSE (trap 4)
git status --short -- app tests client alembic uv.lock   # MUST be empty (cut forks a clean source tree only)
```

Do **not** touch `.consort/features/<F>/pipeline.json` — it was restored in step 1 and is
the ledger. (Force-tracked replay artifacts `.consort/agent-log.jsonl` + `.consort/turns`
from a parallel snapshot are gitignored runtime; `git rm --cached` them if they show as
tracked, but never the ledger.)

### 3-FAST. Reset the Lakebase side via a SNAPSHOT (preferred once a baseline snapshot exists)

Step 3 below (delete + recreate `feature-<F>` from empty `staging`) leaves the branch
empty, so the build's first verify rebuilds the baseline schema from migrations
(`alembic upgrade head` from base). If you capture the design-complete baseline ONCE as
an immutable snapshot, every future reset is an instant copy-on-write branch from it — no
rebuild, a fixed point, and it skips the empty-staging/`Can't locate revision` traps.

```bash
P=f6-bed-01 ; PROF=fevm-stockflow ; F=feature-f6-split-tracking-code
# ONE-TIME: after a branch is at the clean design-complete baseline (F1/F2 schema, no
# F6 migrations), snapshot it. (A snapshot is immutable + point-in-time; see snapshot.ts.)
./scripts/lk lakebase-snapshot create --instance $P --snapshot f6-design-complete --branch $F --no-expiry

# EACH RESET: drop the dirty feature branch, then branch it back from the snapshot (seconds).
databricks postgres delete-branch projects/$P/branches/$F --profile $PROF   # unprotect first if blocked
./scripts/lk lakebase-branch create --instance $P --branch $F --from-snapshot f6-design-complete --no-expiry
./scripts/lk lakebase-branch sync-env --instance $P --branch $F --host "$LAKEBASE_HOST"
```

This is the provisioning win of the snapshot primitive (NOT a per-cycle verify speedup —
the verify already COW-forks the experiment branch in ~7s). `list`/`delete` the snapshot
with `lakebase-snapshot list|delete`. If no baseline snapshot exists yet, use the
rebuild-from-staging path below.

### 3. Reset the Lakebase side (destructive — needs explicit ok each time)

The build forks the experiment branch from the feature branch; a stale `alembic_version`
there → `Can't locate revision`. Reset the feature branch to the empty `staging` base —
`alembic upgrade head` rebuilds the baseline from the in-tree migrations.

```bash
P=f6-bed-01 ; PROF=fevm-stockflow
databricks postgres delete-branch projects/$P/branches/experiment-<story>-exp1 --profile $PROF
databricks postgres delete-branch projects/$P/branches/feature-<F> --profile $PROF   # unprotect first if blocked
databricks postgres create-branch projects/$P feature-<F> \
  --json '{"spec":{"source_branch":"projects/'$P'/branches/staging","no_expiry":true}}' --profile $PROF
./scripts/lk lakebase-branch sync-env --instance $P --branch feature-<F> --host "$LAKEBASE_HOST"
# verify empty: to_regclass('public.alembic_version') and 'public.stock_records' both NULL
```

### 4. Confirm the drive will dispatch (not "nothing to do")

```bash
python3 -c "import json;d=json.load(open('.consort/features/<F>/pipeline.json'));\
print(d['build_active'], d['build_queue'])"     # None  [all stories]
# first drive iteration must log: 'dispatched <S1> to the build lane' + '001 EXPERIMENT cut'
```

### 4b. Installing a modified scaffold file for the test? COMMIT it first (cut guards ALL tracked source)

To live-test a scaffold change in place (e.g. drop the new `#2` client-scoped
`scripts/run-tests.sh` onto the bed), copying it leaves a **dirty tracked file**, and the
experiment cut refuses: `cannot cut experiment … uncommitted changes to tracked source
files … Changed paths: M scripts/run-tests.sh`. The cut guards the WHOLE tracked source
tree — `scripts/` included, not just `app/tests/client/alembic/uv.lock` (a refinement to
the reset memory's trap 4). So after installing it, **commit it** (it then rides onto each
experiment fork intentionally, which is what you want for the test):

```bash
cp <scm-utils>/templates/project/common/scripts/run-tests.sh scripts/run-tests.sh
git add scripts/run-tests.sh && git commit -m "test: install <change> run-tests.sh for live validation"
git status --short -- app tests client alembic scripts uv.lock   # MUST be empty before driving
```

### 5. Launch the timed build (kit under test via LAKEBASE_KIT_DIR)

Rebuild the kit dist first (the drive runs dist, not source). Agent canon changes also
need `.claude/agents/*.md` refreshed (layDownKitAgents only runs at provisioning).

```bash
( cd <consort> && npm run build )
export LAKEBASE_KIT_DIR=<consort> LAKEBASE_CONSORT_AUTO_CONTINUE=1
# loop: drive --only build ; on a story reaching awaiting-acceptance -> story-pipeline accept ; until all done.
# Capture per-iteration wall-clock + peak `pgrep -f '<bed>.*uvicorn'` (server-leak check).
```

Gate/done/fail detection must read **pipeline state** (`awaiting-acceptance` / `done` /
a `RAISED TO HIL` line), never a loose log-grep like `for S\d` — that false-matches
`EXPERIMENT cut for S1` and prematurely accepts.

**NEVER rebuild the kit dist while a drive is live.** The build runs dist, and the parallel
per-AC fan-out spawns each lane as its OWN `consort-drive` sub-process that resolves dist fresh at
spawn time. Running `npm run build` mid-run leaves the parent on its in-memory code while a lane
loads the newly-written (or half-written) bundle — a split-brain that surfaces as lanes failing
straight to the **sequential fallback** (the parallelism — and any timing you were measuring — is
lost). If a code/instrumentation change is needed after a run has started, the order is always:
**stop the drive** (`consort-drive --stop` then `pkill -f dist/bin/consort/drive.cli.js`) → `npm run
build` → relaunch. Never build against a live drive.

**Iterating ONLY the fan-out (no AC1 re-author).** A contract story's fan-out drives the serial-first
AC, runs the one-shot supersession sweep, then forks AC2..n into isolated lanes. To re-run just the
fan-out, resume from the `consort-fanout-begin` anchor (serial-first AC built + swept + committed,
captured by `snapshotBeforeFanout`, preserved durably outside the per-run `.consort`). The resume
re-triggers the fan-out on the serial-first AC's REVIEW turn (the `serialFirstReview` gate path), so
AC1 is a fast re-verify, not a rebuild. Two known costs on resume: the up-front supersession sweep is
**not idempotent** (it re-detects + re-retargets, ~minutes each replay), and the lane worktrees from a
crashed/killed prior run are not auto-torn-down (`git worktree prune` + remove the stale `ac-lane-*`
tmp dirs first, or you will read a prior run's sidecars by mistake).

**Databricks OAuth token expiry mid-run (recurs — not a fluke).** The workspace OAuth token lives ~1h;
a long build (and even the ~5m supersession sweep) can outlast it. The TOP-LEVEL drive's auth preflight
passes at launch, but by the time the fan-out spawns each lane as its own `consort-drive`, the token can
be expired — every lane then fails `Databricks auth preflight FAILED … refresh token is invalid`, exits
2, falls to the sequential fallback, and the drive aborts. This reads exactly like a fan-out failure but
is NOT — it is auth. **Surface, don't misdiagnose:** (a) the run scripts auth-preflight before launch and
halt loud; (b) the run-health classifier returns a dedicated `AUTH-EXPIRED` verdict on the preflight
signature, checked before the generic exit/fallback verdicts. **Fix:** `databricks auth login --profile
<profile>`, then relaunch (from the anchor if iterating the fan-out). If runs routinely outlast the token,
mint a longer-lived credential for the build instead of relying on the interactive OAuth token.

### 6. Same-outputs check

All stories reach `done` + accepted, and the per-story test-lists are fully green — the
same final state as the known-good build. Diverging greens/final state = the change broke
the build; a wall-clock delta with identical final state = a real speed result.

---

## Maintenance rule

Any new step discovered through a discrepancy or a change in implementation MUST be
documented back into this runbook in the same change. (Standing requirement.)
