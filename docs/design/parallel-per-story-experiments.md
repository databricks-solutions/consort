# Parallel per-story experiments (N≥2), elected at the spec gate

## Context

Consort's design already describes racing a story as **N≥2 parallel experiments** (SKILL.md hard-rule 9: N=1 = iterative refinement; N≥2 = competing strategies, PO promotes/synthesizes a winner). The *pieces* exist but are **not wired into the operational drive**, so the only way to get a second experiment today is a manual `consort-experiment cut --slug exp2`, and the drive won't race, budget, or help pick among them. Verified gaps:

- `orchestrator-effects.ts:1105` hardcodes `const EXPERIMENT_SLUG = "exp1"` (used at `:1107`, `:1631`); the orchestrator never auto-cuts a second experiment.
- **The design-spec ANALYZER is itself orphaned (deeper than first recorded).** `analyzeForGate` (which computes `ExperimentPlan.N` + `budget.per_experiment`, `gates/design-spec-gate.ts`) plus its writers `writePlan` / `recordPlan` have **zero live callers** (grep-verified 2026-09-10, whole repo excl. tests): only `readPlan` from that module is used live. So the plan is **never produced/written at the gate** in the operational drive, not merely "written but `nextBuildAction` never reads `plan.N`". The consequence chain is: no caller computes the plan, so `plan.json` is not written by the gate, so `plan.N` is never set, so `nextBuildAction` has nothing to read. Wiring `analyzeForGate` into the drive at the design-spec gate (so it actually runs and writes `plan.json`) is therefore a prerequisite of M3/M7, not just "make `nextBuildAction` read `plan.N`".
- `promoteExperiment()` (`experiment/promote-experiment.ts:50`), `synthesizeExperiments()` (`orchestrator/status/synthesis.ts:47`), and `checkPerExperimentCap()` (`experiment/experiment-cap.ts:68`) are fully implemented but **dead** — zero non-test call sites.
- `pipeline.json` tracks a single `experiment?: StoryExperiment` per story (`story-pipeline.ts`), not a set.
- The gate menus offer no election / pick: spec gate = approve/hold (`next.ts:237–247`); acceptance = accept/discard/revise (`next.ts:195–225`).

> **Update (2026-09-10, how the orphaned-analyzer gap surfaced):** it was found the hard way. The `registered-breakdown` guard (consort v0.3.86) and the chrome/shell guard (v0.3.87) were wired into `analyzeForGate`'s `transition_blockers`; because nothing calls `analyzeForGate`, they never ran live. A pre-registered example (stockflow-3-87) diverged from its `registration.json` and the spec gate surfaced with `blockers: []`. v0.3.88 moved the registered-breakdown check onto the LIVE gate path (`registeredBreakdownReason` inside `resolveArtifactInputs`, the function `human-proxy` actually invokes at the gate). Takeaway for THIS workstream: `analyzeForGate` is not on the operational path today, so any gate logic this feature adds (notably the M7 `plan.N` election) must either run inside the live gate (`resolveArtifactInputs` / `orchestrator-derive`) or FIRST wire `analyzeForGate` into the drive. Treat "wire `analyzeForGate` into the drive so it runs + writes `plan.json`" as an explicit predecessor step to M3/M7.

**Goal:** elect "run this story as N≥2 parallel experiments (with a per-experiment budget)" at the **spec gate**, run those experiments with **true parallel execution**, enforce the per-experiment budget, and offer a **promote/synthesize** pick at acceptance — all while the **N=1 path stays byte-for-byte unchanged**.

**Reuse, don't reinvent — parallel execution already exists in the kit (tuning lane):**
- The optimize sweep runs **one git worktree per candidate, concurrency-capped** (`scripts/optimize-role.sh --concurrency N`).
- `orchestrator/drive/claude-runner.ts:213–505` already does **per-worktree (per-cwd) isolation** of turn metadata / transcript / cost so concurrent drives don't clobber each other.
- `optimize-snapshot.ts` shows the git-fork + paired-branch re-fork pattern; `cutExperiment` already forks a paired Lakebase branch per experiment.
- The feature = **promote this proven worktree-parallel executor from the off-path tuning harness into the operational build lane**, gated on `plan.N`.

## The N=1 safety guarantee (non-negotiable)

`N` defaults to `1` everywhere. Every N≥2 code path is gated behind `plan.N >= 2`; when `plan.N === 1` (or absent) the drive takes **exactly today's serial single-`exp1` path**, untouched. **M0 locks this with regression tests that must stay green through every later milestone, and the full suite (currently 4373 passing) must stay green throughout.**

## Milestones (sequenced; each independently shippable, each preserves N=1)

**M0 — N=1 regression lock (tests only, no product change).** Add/confirm BDD tests pinning current behavior: auto-cut produces exactly `exp1`; `pipeline.json` tracks one experiment; accept = merge `exp1`; spec gate = approve/hold; acceptance = accept/discard/revise; no promote/synthesize offered. These are the tripwire for M1–M8. Files: `tests/bdd/` (new `parallel-experiments-n1-regression.test.ts`).

**M1 — Parameterize the experiment slug (pure refactor).** `orchestrator-effects.ts:1105` `EXPERIMENT_SLUG="exp1"` → a slug parameter defaulting to `"exp1"`; `experimentBranchName(storyId, slug="exp1")`. All callers pass the default. Behavior identical for N=1. Prove: suite green; branch names unchanged.

**M2 — State model tracks N experiments (back-compat).** `story-pipeline.ts`: represent a story's experiments as a set (array or `experiments/<F>/<S>/` dir-scan) where N=1 reads/serializes identically to today's single `experiment?`. An old single-experiment `pipeline.json` reads as the N=1 case (no migration required). Prove: existing pipeline.json fixtures parse unchanged; N=1 status/derivation identical.

**M3 — Derivation reads `plan.N` (gated).** `orchestrator/state/orchestrator-derive.ts` + `orchestrator-drive.ts:110`: read `plan.N` (default 1). N=1 → today's single `cut-experiment(exp1)` path, unchanged. N≥2 → derive N cut actions (`exp1..expN`). Prove: N=1 derivation identical (M0); N≥2 derives N cuts (new hermetic tests with `plan.N` set in a fixture).

**M4 — Parallel build-lane executor (the core; its own PR + live proof).** Promote the optimize worktree-parallel executor into the operational build lane: for `plan.N ≥ 2`, run each experiment's build lane **concurrently**, each in its own **git worktree** + **paired Lakebase branch** (`cutExperiment`), **concurrency-capped** (default 2, configurable — see decisions), reusing `claude-runner`'s per-cwd isolation for cost/telemetry. **N=1 keeps the existing serial single-lane path (no worktree, no pool)** — parallel is entered only when N≥2. Prove: N=1 = serial path unchanged (regression + one live N=1 run); N≥2 = concurrent worktrees live-proven on a 2-experiment story. Reuses: `optimize-snapshot.ts`, `claude-runner.ts:213–505`, the unified build-agent dispatch seam, `cutExperiment`.

**M5 — Per-experiment budget enforcement.** Wire the built-but-dead `checkPerExperimentCap()` into the lane; stop a lane at its `max_cycles`/`max_wall_clock_minutes`. Apply only under N≥2 (or with an N=1 default generous enough that a single experiment is never newly throttled). Prove: cap fires for a runaway lane; N=1 unaffected.

**M6 — Promote / synthesize pick at acceptance.** Expand the acceptance-gate menu (`next.ts:195`): when `n>1`, offer `promote <expK>` (winner) / `synthesize`; wire `promoteExperiment()` / `synthesizeExperiments()` (+ archive the losers). When `n==1`, the menu is unchanged (accept/discard/revise = merge `exp1`). Prove: n=1 acceptance identical; n>1 promote and synthesize both work end-to-end.

**M7 — Gate election UI (built last, on purpose).** Spec-gate menu (`next.ts:237`): add "Approve, and run this story as N=⟨k⟩ parallel experiments (budget ⟨X⟩ each)"; the pick sets `plan.N` + `budget.per_experiment` via the existing `ExperimentPlan` writer. Default (no election) = N=1, unchanged. Built after M1–M6 so the option only surfaces once the whole path works. Prove: default spec gate identical; electing N=2 writes `plan.N`/budget and the run races two experiments.

**M8 — deploy/verify for N.** Ensure deploy/verify verifies each of the N experiments (per-branch) and merges only the chosen one; N=1 path unchanged. Prove: N=1 deploy/verify identical; N≥2 verifies each experiment and promotes only the pick.

## Critical files / seams

- `consort/orchestrator/drive/orchestrator-effects.ts` (slug de-hardcode :1105; emit N cuts)
- `consort/orchestrator/state/orchestrator-derive.ts` + `drive/orchestrator-drive.ts` (read `plan.N`, derive N cuts)
- `consort/pipeline/story-pipeline.ts` (N-experiment state, back-compat)
- `consort/orchestrator/status/next.ts` (spec-gate election :237; acceptance promote/synthesize :195)
- `consort/gates/design-spec-gate.ts` (`ExperimentPlan`/`budget.per_experiment` writer — reuse)
- Parallel executor: reuse `consort/optimize/optimize-snapshot.ts` + `orchestrator/drive/claude-runner.ts:213–505` (per-cwd isolation) + `consort/experiment/cut-experiment` (paired-branch fork); wire the dead `experiment/promote-experiment.ts`, `orchestrator/status/synthesis.ts`, `experiment/experiment-cap.ts`.

## Verification

- **Hermetic (every milestone):** `npm test` — the M0 N=1 regression tests must stay green throughout; new per-milestone tests set `plan.N` in fixtures to exercise N≥2 derivation/state without cloud.
- **Live (M4 + whole feature, before shipping):** one **N=1** run to prove no regression (serial path), and one **N=2** run on a small story to prove concurrent worktrees + per-experiment budget cap + a promote and a synthesize acceptance. (Live proof required per the project's "nothing done until live-tested e2e" rule.)

## Open decisions (recommended defaults; confirm before/at build)

1. **Concurrency cap default** — recommend **2** (configurable up to the optimize sweep's proven 4). N concurrent worktrees = N live Lakebase branch endpoints + N concurrent Claude drives = N× compute/token burn *at once*, which matters on single-project/quota accounts (e.g. Free Edition).
2. **Execution shape** — run each experiment lane as a **separate `consort-drive` build-lane process per worktree** (mirrors how the optimize sweep spawns), vs in-process concurrency. Recommend subprocess-per-worktree (reuses the proven pattern + isolation).
3. **Budget applicability** — apply `checkPerExperimentCap` only under N≥2 (leave N=1 unthrottled), unless you want the cap on single experiments too.
4. **Shipping cadence** — each milestone is independently shippable; recommend grouping into ~3 releases (M1–M3 plumbing; M4 executor; M5–M8 budget+pick+UI+deploy). You own the version numbers.

## Explicitly NOT in scope

No change to the serial N=1 drive behavior; no new scheduler (reuse the optimize worktree pool); no telemetry schema change (per-worktree cost isolation already exists).
