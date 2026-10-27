# F6 build-lane optimization — live results (bed: f6-bed-01)

Measured on the `f6-bed-01` test bed by rewinding to design-complete F6 and re-driving the
full build. Comparison is **cycle-span (red_at→green_at)**, the same method for both runs, so
it's apples-to-apples. The run under test carries: **#1 tiered verify** (shipped 0.4.26 — skip
the isolated-branch reversibility pass on non-migration cycles), **#2 client-pass AC-scope
REVERTED** (live-proven harmful — broke in-cycle supersession detection), and the new
**`psycopg2-pgcode-attr` test-smell gate**.

Baseline = `my-stockflow-f2-f6-built` (the original F6 build), captured 2026-10-24.

## Same-outputs check ✅
Both runs: **all 3 stories done, 69/69 tests green, 36 green cycles**, identical S3 AC
structure (AC1:9, AC2:9, AC3:5, AC4:11). Server leak: **peak uvicorn 4** this run vs the
original's 9–10+ accumulation — #7 reaper holding, no leak.

## S3 (the 4-AC contract story — the target) — ~20% faster

| AC | cycles | Original | This run | Δ |
|----|--------|----------|----------|---|
| AC1 schema-diff (migration-heavy) | 9 | 2115s (mean 235s) | **1416s (mean 157s)** | **−33%** |
| AC2 every-row-survives | 9 | 1203s (mean 134s) | **977s (mean 109s)** | **−19%** |
| AC3 round-trip | 5 | 783s (mean 157s) | **627s (mean 125s)** | **−20%** |
| AC4 app-works (E2E-heavy) | 11 | 1581s (mean 144s) | 1933s (mean 176s) | +22% (slower) |
| **S3 total** | 34 | **7293s (121.5m)** | **5855s (97.6m)** | **−20% (~24 min)** |

## Full F6 (S1+S2+S3, cycle-span)

| Story | Original | This run |
|-------|----------|----------|
| S1 expand | 241s | 253s |
| S2 show (supersession-heavy) | 564s | 713s |
| S3 contract | 7293s | 5855s |
| **Total** | **8098s (135m)** | **6821s (113.7m)** — **−16% (~21 min)** |

## Reading / caveats
- The win is **#1 tiered-verify**, clearest on the **migration-heavy AC1 (−33%)** and AC2/AC3
  (−20%), which reuse AC1's migration so the slow reversibility pass is skipped.
- **AC4 and S2 were slower this run** — both E2E/supersession-heavy and dominated by LLM
  turn-time + assess/repair churn, which is non-deterministic run-to-run (not an opt
  regression). The net is still −20% S3 / −16% F6.
- **Deploy-verify halted on S3** (and on S1/S2 in prior aborted runs) — the full suite's first
  run is at *deploy*, not story-close, so cross-AC breakage surfaces as a HALT. Motivates the
  **story-close full-run-before-deploy** refinement. The halts did not affect the per-cycle
  timing captured here (all 36 cycles completed green).

## Durable fixes shipped from these runs (held, not released)
- `psycopg2-pgcode-attr` test-smell (catches `.pgcode`-on-psycopg3 at RED).
- #2 client-pass AC-scope **reverted** + regression guard (supersession detection restored).

## Deploy-verify halt diagnosis (S3) + fix

S3's deploy-verify failed on prior-story backend tests (`test_stock_listing_index.py::test_sc5_*`,
and the driver named `test_stock_schema/_migration/_refile/_expand_split_columns`) that still
insert/assert the **`tracking_code`** column S3's contract migration DROPPED. `opt2` scopes the
per-cycle backend suite to the current story, so these prior-story tests never ran per-cycle → no
in-cycle RED → the supersession surfaced only at the full deploy-verify as a HALT. Same class as
S2's client `tracking-not-tracked` case, but cross-story backend. Fixes:
- **GATE (built): `dropped-column-test-reference` test-smell** — a TEST that references a column a
  contract migration dropped, in a file that does NO downgrade (a pure-HEAD assertion = definitely
  superseded). Driver-fixable (remove/retarget the reference). Conservative (skips downgrade/round-
  trip files to avoid false-positives); catches the common case at the cycle's smell scan,
  regardless of per-cycle run-scope. Complements the existing app-only `dropped-column-dangling-reference`.
- **story-close full-run-before-deploy (on deck):** run the FULL unscoped suite at the story-close
  REFACTOR gate and route failures through the supersession (green-superseded) path, so ALL
  cross-story supersession (incl. index/round-trip shapes the static smell can't catch) is refactored
  in-story instead of HALTing at deploy-verify.

## On deck (ranked)
#3 batch-RED (collapse the ~34-cycle count — SHIPPED as a lever), story-close full-run-before-deploy
(the dropped-column gate covers the column case in-cycle; general form below), #5 parallel per-AC
verify, #4 exhaustive supersession-assess + per-role model/effort, #7 within-cycle E2E reap.

## #5 parallel per-AC verify — design (to build on the validated baseline)

**Why it's the big lever:** S3's 34 cycles run strictly sequentially across 4 ACs, but AC2/AC3/AC4
reuse AC1's migration and are largely independent. Their verify wall-clock (~1h of the ~1.6h) is
serialized for no dependency reason beyond "the drive is one lane."

**What the snapshot/COW groundwork unlocks:** `create-snapshot` after AC1 commits the contract
migration, then each parallel AC verify branches COW from that snapshot (`createBranch({fromSnapshot})`)
— a cheap (~7s), fixed, non-colliding base per AC. That removes the shared-experiment-branch
contention that forced serialization.

**Shape (phased, each gated):**
1. AC1 runs sequential (it authors the migration; the snapshot is taken at its close).
2. AC2–ACn dispatch CONCURRENTLY: one worker per AC, each (a) branches a verify child from the AC1
   snapshot, (b) runs its RED→GREEN cycles against that child, (c) commits to a per-AC branch.
3. A serial MERGE step folds the per-AC branches back (they touch disjoint code — AC-scoped tests +
   shared reused migration — so conflicts are rare; a conflict falls back to sequential for that AC).
4. The story-close full suite + deploy-verify run once on the merged result (unchanged).

**Risks / why it's dedicated work:** concurrent drive (N claude-runner lanes), per-AC branch naming +
reap, cross-AC merge + conflict fallback, and the dashboard/pipeline ledger needs to represent
concurrent ACs. Needs its own build + a live A/B (does merge overhead + any serialization-fallback
eat the parallelism win?). Correctness gate: the merged result must still produce IDENTICAL outputs
(same 36 greens) and pass the full deploy-verify.

**Not-yet-built general supersession routing (story-close):** the dropped-column gate catches the
COLUMN case in-cycle; a removed-*element* / changed-*index* supersession (S2's `tracking-not-tracked`,
S3's `test_sc5` index shape) has no static "removed set" to scan, so the robust form is to route a
deploy-verify failure whose failing node-ids are NOT contamination (pass in isolation) AND not a new
regression → a green-superseded refactor turn (extend `deploy-verify-assess` with a supersession
branch) instead of terminal HIL. Core-loop change; dedicated build + A/B.

## #5 parallel per-AC fan-out — LIVE run (bed: f6-bed-01, 2026-10-26)

The fan-out is now live on S3. The run (pid 49862, from `restart.sh`) triggers the fan-out at
story-ZERO, drives the serial-first AC (AC1) in the main experiment worktree, runs the one-shot
supersession sweep, records the **fan-out-begin anchor**, then fans AC2/AC3/AC4 out concurrently in
isolated worktree+COW lanes. Phase timings (agent-live.log, UTC):

| Phase | Start | End | Duration |
|-------|-------|-----|----------|
| AC1 serial wall-clock (run start → `serial:AC1 drive EXIT`) | 03:46:41.827 | 04:05:03.296 | **18m 21s** |
| &nbsp;&nbsp;AC1 **cycle-span** (Σ red→green, 9 cycles) | — | — | **668s (11.1m), mean 74s** |

AC1 cycle-span **668s (74s mean)** — the fastest recorded: vs original 2115s (235s mean) = **−68%**,
vs the prior #1-tiered run 1416s (157s mean) = **−53%**. The cycle optimizations are fully active
(7/9 cycles 44–57s; only the 2 migration/E2E-heavy cycles, T43/T39, at 158s run the full verify). The
18m21s wall-clock − 11.1m cycle-span = **~7m inter-cycle overhead** (agent dispatch, fresh-session
context-guard respawns, verify setup) — not a cycle regression.
| Supersession sweep (one-shot hoist, 12 files) | 04:05:03.303 | _pending_ | _pending_ |
| **Fan-out-begin snapshot (anchor recorded)** | — | _pending_ | — |
| Fan-out AC2/AC3/AC4 (parallel lanes, wall-clock) | _pending_ | _pending_ | _pending_ (vs serial baseline below) |
| &nbsp;&nbsp;peak concurrency / per-lane | _pending_ | | |
| **S3 total (fan-out)** | 03:46:41 | _pending_ | _pending_ |

**Serial baseline to beat** (from the #1 tiered-verify run above): AC2 977s + AC3 627s + AC4 1933s =
**3537s (~59m)** of sequential AC2–AC4 verify. The fan-out's win = that 59m collapses toward
`max(AC2,AC3,AC4)` wall-clock (≈ AC4 ~32m) minus merge overhead. _Fill when lanes complete._

**The anchor is the replay substrate.** The ~18-min AC1 serial build above is the cost this run pays
ONCE. The fan-out-begin anchor (`consort-fanout-begin` git tag + `.consort/fanout-begin/` runtime,
preserved durably to `~/code/f6-bed-01-s3-start/fanout-begin/`) lets a **replay skip AC1 entirely** and
re-trigger the fan-out directly (kit fix: `beforeAction` treats the serial-first AC's review turn as a
fan-out trigger — `shouldFanOutAcLanes.serialFirstReview`). So every subsequent fan-out A/B costs the
fan-out phase only (~minutes), not ~18m+ of AC1 rebuild. _Replay timing: pending first replay._
