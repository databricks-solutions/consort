# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0-beta.36] - 2026-07-24

### Changed

- Track C Phase 2 + 3: the SCM + shared substrate now lives in the standalone
  `@databricks-solutions/lakebase-scm-utils` package, which the kit consumes as a
  dependency (v0.1.0-beta.3). The kit keeps the SFTDD orchestration, the MCP
  server, and the SFTDD-flavored project scaffolders.
- Decoupled `createProject` / `adoptLakebaseProject`: the base scaffolders moved
  to the substrate package (SFTDD-agnostic); the kit wraps them and injects the
  `.sftdd/` lay-down + sftdd-config seeding via `scripts/sftdd/project-sftdd-setup.ts`.
  The kit's `lakebase-create-project` CLI still produces SFTDD-ready projects; a
  plain SCM consumer (the VS Code extension) uses the base scaffolders directly.
- The root `.` barrel re-exports the substrate package, so createProject /
  adoptLakebaseProject / assertAdoptionPreflight remain reachable from the kit's
  public API.

## [0.3.0-beta.35] - 2026-07-24

### Changed

- **De-coupled the SCM core from SFTDD, ahead of extracting `@databricks-solutions/lakebase-scm-utils` (FEIP-8263, Phase 0).** `scm-doctor.ts` no longer imports `scripts/sftdd/*` (the only reverse edge in the SCM/substrate core): the stale experiment/spike finder is now an injected `RunDoctorDeps` dependency (`StaleBranchFinding` declared locally), and `scm-doctor.cli.ts` wires the SFTDD finder as the single accepted composition point. The `lakebase-scm-doctor` bin behaves identically (no test relied on `runDoctor` auto-finding stale branches). The dirty-tree ignore list (`.sftdd/` `.tdd/` `.lakebase/` `.claude/agent-memory/`) is centralized into `RUNTIME_ARTIFACT_IGNORE` in `constants.ts` and referenced from `paired-branch.ts` + `scm-prepare-pr.ts`, so no SFTDD-dir literals remain scattered in SCM core. Internal refactor; no user-facing behavior change.

### Added

- **Split-readiness guard test.** `scm-core-no-sftdd-import.test.ts` fails if any module under `scripts/{lakebase,github,git,util}` imports `scripts/sftdd/` outside an explicit allowlist (the project scaffolders + the `scm-doctor` CLI wiring), and asserts `scm-doctor.ts` stays SFTDD-free. Enforces the one-way dependency direction for the pending package split.

## [0.3.0-beta.34] - 2026-07-19

Documentation audit remediation (FEIP-8085), plus one CLI help-text fix. Docs match the code at this version.

### Fixed

- **`lakebase-branch --help` no longer advertises the deleted `create-tier` subcommand.** The unpaired `create-tier` was removed, but the help text (usage line, flags section, example) and two code comments still listed it; repointed to the shipped `create-paired-tier`. Help-text and comments only, no logic change.
- **Documentation brought current with the shipped code (FEIP-8085).** A four-agent audit corrected two classes of staleness: completed items still labeled proposal/future (eight `docs/refactor/*` proposals whose work shipped, five scaffolded command docs calling the shipped `lakebase-update-commands` bin "future", the SCM SKILL's shipped "future work" and stale `alpha.45` stamps), and instruction drift from the code. The largest drift fixes are in the `lakebase-sftdd-workflows` skill (read by agents at runtime): the experiment APIs are now documented story-scoped (a `storyId` threaded through the primitives + the `experiments/<feature>/<story>/<slug>/` path), the 5th `deploy` gate is in every gate list, and the model-resolution source, roles table, entry points, `feature-status-schema` example, and `CONFIG` `clientFramework` row are corrected. SCM/root docs dropped a phantom `lakebase-get-connection --write-env` flag, fixed `create-tier` -> `create-paired-tier` in the root README, `migrate-live*` -> `schema-migrate-live*` in CONTRIBUTING, and added the `.lakebase/kit-ref.local` run pin to the capture runbook's kit-ref resolution order.

### Added

- **Anti-recurrence test: `SKILL.md` must name every gate in `GATE_NAMES`.** The SFTDD skill's gate documentation had drifted behind the code (the `deploy` gate was added but the named-gate list was not); the test fails if a future gate is added without updating the doc.

## [0.3.0-beta.33] - 2026-07-17

Three field findings from the F4-pick-outbound feature of a live stockflow tier-2 run (FEIP-8070).

### Fixed

- **The drive pins the run's kit-ref to a checkout-proof `.lakebase/kit-ref.local` (Finding 28, High).** `.lakebase/kit-ref` is git-tracked, so the drive's branch operations (claim checkout, experiment cut/re-fork, which fork from `origin/<parent>`) silently restored a branch-committed kit-ref over an operator's working-tree bump, running the WRONG kit version mid-run with no signal (an entire F4 story built on the stale backend; `assertCleanForFork` even ignores `.lakebase/`, so the bump was clobbered without blocking the fork). The drive now resolves the launch ref once at startup and writes it to a gitignored `.lakebase/kit-ref.local`, which survives checkouts (git never touches untracked files); the `lk` shim reads `.local` with precedence over the committed `.lakebase/kit-ref` (which stays tracked, CI resolves its `KIT_REF` from it), so the whole run (orchestrator, subagents, and manual `lk` calls) keeps the launch ref. The drive warns loudly on drift between the committed and pinned ref. New `kit-ref.ts` service (`resolveLaunchKitRef` / `pinRunKitRef` / `kitRefDriftWarning`); `run-config` records the effective ref.
- **The per-story spec gate refuses a truncated / invalid-JSON AC at approve time (Finding 29, Medium).** A spec-author could write a truncated AC file (ending right after `architectural_notes` with no closing brace); the spec gate and reflect gate never JSON-parsed the AC files, so it passed both and only failed at deploy `gate-conformance` ("not valid JSON"), long after build + accept. `approveStoryGateFromDisk` now runs the SAME per-story conformance the deploy gate trusts (new `storyAcsConformanceReason`, reusing `checkArtifactConformance`), so a malformed AC is refused where it is produced.

### Added

- **`lakebase-scm-doctor` gains a `scm-state-git-tracked` warning (Finding 28 sibling).** `.lakebase/workflow-state.json` (the per-working-tree SCM claim state) is git-tracked, so a branch checkout or `git reset --hard origin/<tier>` can restore a stale committed claim over the live one; the finding flags this so a wrong-claim refusal after a checkout is understood as this, not a real conflict.

### Changed

- **Migration-reversibility tests must seed idempotently (Finding 30, Medium).** The agent-generated migration-reversibility test seeded a fixed-key row with a plain `INSERT` + `finally` cleanup; a run killed mid-test (the runtime caps long drives) commits the seed but never cleans up, so every later run on the long-lived reused branch DB failed on a duplicate-key `UniqueViolation` unrelated to the code under test. The guidance in `test-strategist.md` + `navigator.md` now requires an idempotent seed at the START (a per-run-unique key, or `DELETE`-before-`INSERT` / `INSERT ... ON CONFLICT DO NOTHING`) in addition to the `finally` cleanup.

## [0.3.0-beta.32] - 2026-07-17

### Fixed

- **A re-driven story now re-runs RED/GREEN instead of reusing its stale (false-GREEN) build (FEIP-8052, Finding 27).** `discard` / `pipeline revise` / `set --status building` reset the pipeline status but left the per-story cycle records under `.sftdd/cycles/` intact. The drive derives "build already GREEN" (`codeWritten` → `storyTestProgress.allGreen`) from those stale `green_at` files, so a story sent back to be rebuilt skipped the RED/GREEN cycle and jumped straight to deploy, re-failing the same deploy-verify in a loop; recovery required hand-deleting kit-internal cycle records + the paired Lakebase experiment branch. Root cause: split-brain, `resetStoryBuildState` (the exact clear-cycles primitive) existed but was wired into only the `lakebase-sftdd-experiment discard --revise` door. Now both revise doors (`applyReviseSelfHeal` + the plain reset) call it, so the operator `pipeline revise` and the driver's auto revise-route re-drive from a clean slate.

### Added

- **`lakebase-sftdd-pipeline rebuild-story` (Finding 27).** The sanctioned "re-drive this story from a clean slate" op, replacing the `rm -rf .sftdd/cycles/...` recovery dance. It clears the build cycles + test-list, BOTH HIL escalation sources (escalation files and blocking smells, the dual-source rule), marks the experiment for a clean re-fork, and puts the story back on the single build lane (refuses when the lane is busy with a different story).
- **`lakebase-sftdd-experiment cut --reset-stale-branch` (Finding 27).** Drops a pre-existing paired branch of the same deterministic name before forking, so a re-cut after a discarded experiment re-forks clean off feature HEAD instead of reusing the branch that still carries the discarded build's schema (mirroring the ci-pr `--reset-stale-branch` precedent). The drive auto-passes it on a re-cut after a discarded experiment. The drop-then-fork ordering is hermetically tested via an injected paired-branch ops seam; the live DROP + re-fork against a real Lakebase branch is validated by a live drive.

## [0.3.0-beta.31] - 2026-07-16

### Fixed

- **The build's honest-GREEN verify now runs the client (Vitest) suite, not just the backend (FEIP-8051, Finding 26).** The build lane could mark a story GREEN while the client Vitest suite failed deterministically; only the later deploy feature-verify caught it, a violation of the core TDD guarantee. Root cause: the build honest-GREEN runs the Python backend via the `SFTDD_PYTEST_MARKER` two-pass, and `run-tests.sh`'s marked branch exited BEFORE its client Vitest block, so the client suite never ran under build GREEN (the deploy gate runs `run-tests.sh` unmarked, reaches the client block, and failed, exposing the drift). Python + client scaffolds only. Now `run-tests.sh` gains `SFTDD_CLIENT_ONLY=1` (skip the backend, run only the client Vitest block), and `ensureDeployedAndVerify` runs one client-only pass after the two marked backend passes (when a `client/` workspace exists), gating GREEN on its captured exit code, so build honest-GREEN gates on the SAME client tests the deploy gate runs. The marked passes stay backend-only (no double-run, migration isolation intact).
- **The scaffold's client API layer teaches the RFC 9457 Problem Details field-error pattern (Finding 26, secondary).** `client/src/api/client.ts` previously surfaced a validation `detail` only when it was a string, so an object-shaped `detail: { field, message }` refusal was dropped and thrown as a generic error, never reaching a form's `field-<field>-error` seam. It now parses both shapes via `_problemDetail`, carries the field on `ApiError`, and adds a `postJson` mutation helper that throws it, so the driver has a reference for the object-detail + field-seam pattern.

## [0.3.0-beta.30] - 2026-07-16

Handover findings batch (FEIP-8050): six field findings from a stockflow tier-2 run. Cross-cutting theme: a branch's DB is addressed by its `{instance, branch}` DSN, never `LAKEBASE_BRANCH_ID` / ambient `LAKEBASE_HOST`.

### Fixed

- **`lakebase-feature-status` no longer shows a shipped feature's deploy/promote as `open` (Finding 13).** It dumped the raw `gates.json` approval bit, so a feature the drive had already deployed + merged disagreed with `lakebase-sftdd-next` (which reconciles from `deploy-evidence.json` + the SCM workflow-state). feature-status now consumes the SAME reconciliation (`readDriveContext`) via a new `progression` snapshot field and renders `done (deployed)` / `done (merged)`. The CLI gains `--project-dir` to reach `.lakebase/`.
- **CI workflows follow `.lakebase/kit-ref` instead of a baked version pin (Finding 24).** Scaffolded `pr.yml` / `merge.yml` hardcoded the scaffold-time kit version at every kit call site, so bumping `.lakebase/kit-ref` (which the runtime substrate follows) never reached CI, every run executed the stale kit. Both workflows now resolve `KIT_REF` from `.lakebase/kit-ref` (fallback = the scaffold version) and use `#"${KIT_REF}"` at all call sites. `lakebase-scm-doctor` gains a `ci-workflow-kit-pin` warning that flags workflows still carrying the literal pin.
- **The `/design` reflect gate and `pipeline revise` now converge instead of looping (Findings 22 + 23).** The operator-facing `lakebase-sftdd-pipeline revise` was hollow: it reset the story but never cleared the blocking smell (so the next drive re-raised it at action 000) and never re-briefed the test-strategist (so the regenerated test block re-omitted the requested coverage, forever). `revise` now runs the same self-heal the driver's auto-route uses: it resolves the smell, writes a coverage-forcing hand-back brief so the test-strategist MUST add the named test, and spends the one-revise budget so a re-fire hard-halts to the human. `discard` clears a discarded story's blocking smell; a new `resolve-smell` subcommand replaces hand-editing `smells.json`.
- **The promote local-migrate fallback verifies the target before reporting in-sync (Finding 25).** It reported "git and Lakebase schema are in sync" purely from the apply exit code, a lie when the apply no-ops against the wrong branch or applies partially. `applyAndVerifyTierMigration` now reads the TARGET branch's status back (pending == 0) after applying; when it is not verified at head it reports `migrate-unconfirmed`, which BLOCKS workflow completion instead of printing a false in-sync.
- **Shared tier reconcile + `ci-pr` reset (Finding 21).** Two gaps beyond the beta.27/.28 feature-branch recovery:
  - CI reused `ci-pr-<N>` across runs, so a branch first cut while its source tier was polluted rode that pollution through even after the tier was reconciled. `lakebase-ci-resolve-branch --reset-on-db-ahead` (wired in `pr.yml`) probes a reused, source-verified `ci-pr` for db-ahead-of-code and re-forks it from the now-clean source.
  - There was no path to reconcile a shared TIER branch (you cannot delete + recreate staging/prod). New `lakebase-reconcile-tier` reconciles a tier whose DB is ahead of code: it refuses on a healthy tier, drops the named orphan tables (identifier-safe), and stamps the branch to the code head. Backed by a new `stampSchemaMigration` primitive + an Alembic adapter `stamp` (`alembic stamp --purge`, which clears a phantom `alembic_version`).

  The live-DB halves (Finding 25's target verify, Finding 21's tier stamp + table drop, and the `ci-pr` reset) are validated by a live drive; their decision + orchestration logic is hermetically tested via injected seams.

## [0.3.0-beta.29] - 2026-07-16

### Fixed

- **The pre-push hook now provisions a DURABLE CI credential instead of a ~1h OAuth token (FEIP-8020).** CI reruns and the downstream (staging) migrate authenticate with `DATABRICKS_TOKEN` from GitHub secrets, but `pre-push.sh` synced a short-lived (~1h) OAuth session token (`databricks auth token`) frozen at push time, so a rerun or migrate firing more than an hour after the push failed auth (partial promotion). The `create-token-and-sync-secrets.sh` script (mints a 90-day PAT, OAuth fallback only where PATs are disabled) already shipped but nothing invoked it. `pre-push.sh` now delegates to it, wrapped so a mint/sync failure WARNS rather than blocking the push. A 90-day token re-minted on every push outlives any realistic rerun / migrate window. (The full OAuth service-principal M2M , client-credentials, no long-lived secret at rest , remains a documented future hardening.)

## [0.3.0-beta.28] - 2026-07-16

### Fixed

- **A feature claim refuses (and can reset) a paired branch whose DB is ahead of code (FEIP-8039 recover).** Completes the beta.27 fix (which prevented a build from migrating a tier + added a `db-ahead-of-code` doctor check). Feature Lakebase branches are non-expiring, so a re-claim REUSES an existing branch as-is; if an earlier aborted build migrated it and a `git reset` removed the migration file, the reused branch carries a phantom alembic revision + orphan table and later fails "Can't locate revision". Now:
  - `lakebase-scm-claim-feature-branch` runs a live DB-ahead-of-code probe on the cut/reused branch and **refuses** (`db-ahead-of-code`) rather than silently adopting a polluted branch; `--reset-stale-branch` drops it and re-forks clean from the tier instead.
  - `lakebase-scm-doctor --fix db-ahead-of-code` resets an already-claimed stuck project (delegates to abandon: deletes the polluted branch + resets state to `scaffold-complete`), so a re-claim re-forks clean.
  - New `branchRevisionOrphan` probe wraps the beta.27 detectors. The live probe + branch delete are validated by a smoke; the refuse/reset/fix decision logic is hermetically tested.

## [0.3.0-beta.27] - 2026-07-16

### Fixed

- **Design subagents no longer strand artifacts at a malformed project root, and a stray tree self-heals (FEIP-8038).** The story-scoped design roles (spec-author draft, architect-reviewer) were handed RELATIVE artifact paths, so (per FEIP-8006, the Write tool needs an absolute path) each resolved the project root itself and sometimes malformed it , the parent workspace dir and the project dir joined with a hyphen instead of a slash , writing every artifact outside the real project; the out-of-root guard then bailed and the "re-run" remedy looped forever. Two parts: (a) every design directive now names the ABSOLUTE artifact root for its write targets, so no role resolves the root itself; (b) the out-of-root guard now relocates a stray `.sftdd`/`.tdd` tree from the one known malformed sibling (`<parent>-<project>`) back into the real root and re-checks, so the run self-heals instead of deadlocking (and names the sibling in the error otherwise). Bounded to that sibling pattern, no filesystem scan.
- **A build/experiment migration refuses a protected-tier target, and scm-doctor detects a DB ahead of code (FEIP-8039).** An aborted build ran `alembic upgrade` against its paired Lakebase branch; a later `git reset --hard` rolled back only git, and because feature branches are non-expiring and `createBranch` is idempotent-on-existing, the re-cut feature reused that same stale branch, so its DB carried a phantom `alembic_version` + an orphan table and accept/deploy/promote failed "Can't locate revision". `applySchemaMigrations` now refuses a protected-tier target branch (main/master/staging/dev + configured tiers) before any DB work; the promote path (`scm-merge` local fallback) opts in via `allowTier`, since it migrates the parent tier by design. New `lakebase-scm-doctor` check `db-ahead-of-code` flags a paired branch whose applied revision has no local migration file. (The recover , resetting the polluted branch so the next claim re-forks clean , lands separately with a live smoke.)

## [0.3.0-beta.26] - 2026-07-16

### Fixed

- **The /design breakdown no longer deadlocks when the spec-author writes the
  story stubs but not feature-spec.json (FEIP-8024).** The driver gates the
  breakdown on `feature-spec.json` (a non-empty `stories[]`), but the spec-author
  prompt said the breakdown deliverable was ONLY the story stubs, and the
  breakdown directive named neither `feature-spec.json` nor the absolute artifact
  root. So the agent wrote just the stubs, the drive failed
  "produced no feature-spec.json", and on re-run the agent saw its stubs already
  present, reported the breakdown done, wrote nothing, and failed the identical
  guard forever (the printed "re-run" remedy looped). Three-part fix:
  - **Aligned the breakdown contract.** The breakdown directive now requires
    writing `feature-spec.json` (id/name/status/tdd_mode + a non-empty `stories[]`)
    plus the story stubs, and interpolates the ABSOLUTE artifact root (mirroring
    the propose directive). Naming the root also ends the malformed project-root
    guess the subagent made in breakdown mode.
  - **A deterministic deadlock-breaker.** Before every breakdown turn the driver
    resets an INCOMPLETE breakdown (story stubs present but `feature-spec.json`
    absent or empty-stories), so a re-dispatch always regenerates from a clean
    slate regardless of the agent's idempotency behavior. A no-op on a complete
    breakdown or a clean slate. New `lakebase-sftdd-pipeline reset-breakdown`.
  - **Spec-author prompt.** The breakdown deliverable is now `feature-spec.json`
    (the feature index) + the stubs, with idempotency keyed on `feature-spec.json`.

## [0.3.0-beta.25] - 2026-07-16

### Fixed

- **A Tier-2 drive of a fresh feature no longer commits build output onto the
  shared tier when a prior feature shipped out-of-band (FEIP-8023).** With a
  predecessor feature promoted outside the drive and `.lakebase/workflow-state.json`
  never reconciled, driving the NEXT feature cut no feature branch and committed
  the GREEN build straight onto `staging`: `buildCfg` adopted the stale
  predecessor's branch as this feature's `featureBranch`, so the experiment forked
  from (and the build committed onto) the wrong branch, bypassing the experiment
  to feature to promote-PR flow entirely. Two hard-block guards, defense in depth:
  - **Foreign-claim refusal.** `lakebase-sftdd-drive --feature <F>` now refuses
    loud (names both features + the remedy, exits non-zero) when the recorded SCM
    claim names a DIFFERENT feature, before the driver runs, killing the stale
    experiment-parent derivation at the source. Claim this feature (or reconcile
    the prior out-of-band one) first.
  - **Protected-branch commit guard.** The build lane's commit path
    (`commitExperimentCode`) now refuses to commit onto a protected tier
    (`main`/`master`/`staging`/`dev` plus any `LAKEBASE_TIER_NAMES` /
    configured trunk/staging/base names), and the per-cycle commit re-throws that
    refusal instead of swallowing it. Even with stale bookkeeping, a build commit
    aimed at a shared branch now fails loud rather than silently polluting it.

## [0.3.0-beta.24] - 2026-07-15

### Added

- **An orchestrator operating contract so the driving agent drives to completed
  software instead of narrating (FEIP-8021).** The kit governed the ROLE agents
  (`agent-operating-rules.md`) but had no contract for the agent DRIVING
  `/sprint` `/design` `/build` `/deploy`, whose default was to narrate every step
  and ask the human at each one. `references/orchestrator-contract.md` (loaded by
  the four command templates, the same way role prompts load
  `agent-operating-rules.md`) makes the default: drive to completion via
  `lakebase-sftdd-next`, stop for the human ONLY at a HITL gate or a blocker,
  present the decision (option titles + `hil_prompt`) not the CLIs run, report
  outcomes not process, show working software at the acceptance + deploy gates;
  verbose/eval narration is explicit opt-in (`LAKEBASE_SFTDD_VERBOSE=1`), off by
  default. Pairs with FEIP-8017.

### Fixed

- **The Tier-1 sprint drive no longer re-enters shipped features or leaks the
  coarse feature phase across features (FEIP-8022).** Two coupled defects: (1)
  the coarse `phase` in `.sftdd/workflow-state.json` is per-PROJECT and was
  honored for any feature, so a prior feature's phase leaked into the next
  (`lakebase-sftdd-next --feature F2` reported F2 at "deploy" with only a
  feature-request). Now the phase is stamped with its owning feature and honored
  only for that feature (planning is sprint-global + exempt); an un-owned/foreign
  phase falls back to "feature" so the drive AND `lakebase-sftdd-next` re-derive
  from the feature's own artifacts. (2) the sprint loop re-claimed + re-drove a
  completed feature; it now SKIPS a backlog feature whose own workflow derives to
  `done`. A feature shipped fully out-of-band (promotion merged outside the drive)
  is recovered by the forthcoming reconcile (FEIP-8018).

## [0.3.0-beta.23] - 2026-07-15

### Fixed

- **The surfaced promote-gate approval command now includes the required
  `--promote-ref` (FEIP-8019).** At the promote gate, both the drive's stop
  message and `lakebase-sftdd-next` printed `lakebase-sftdd-approve-gate
  --feature <F> --gate promote --approver <you>` with no `--promote-ref`. The
  promote gate requires a non-empty `promote_ref`; running the surfaced command
  returned "skipped promote (no promote_ref supplied)", a silent no-op, and the
  drive re-surfaced the same gate. The drive's own internal approval already
  supplied it (`cfg.featureBranch ?? feature`); only the human-facing command
  omitted it. The single structured `gateEnactCommand` map now emits the promote
  enact with `--promote-ref <feature-branch>` (read from the SCM workflow state),
  and both `approveHint` (the drive hint) and `lakebase-sftdd-next` project from
  it, so following the surfaced command records the approval.

### Added

- **`lakebase-scm-merge` interim mitigation for the short-lived-CI-token migrate
  failure (FEIP-8020).** The promote merge's downstream (staging) migrate
  authenticates with a `DATABRICKS_TOKEN` secret frozen at push time; it can
  expire before the run, so git promotes (PR merged, code on staging) but the
  parent Lakebase schema migration never applies, a partial promotion. Two
  mitigations (the durable service-principal M2M credential fix is FEIP-8020's
  deferred main scope): (1) a **migrate-auth precondition** run before the merge
  (when waiting on the migrate) that verifies migrations can be applied and fails
  fast (`migrate-auth`) rather than promoting git without the schema; (2) a
  **local-migrate fallback** that, when the downstream migrate does not confirm
  (a failed conclusion or a fatal timeout), applies the parent migrations locally
  with a freshly-minted token so git and Lakebase schema stay in sync
  (`migrate.appliedLocally`). Flags `--no-verify-migrate-auth` /
  `--no-local-migrate-fallback` opt out.

### Internal

- The kit's tag now ships a current, complete `dist/` for these fixes (the
  consumer install runs the committed dist; `prepare.mjs` skips the build for
  non-dev installs), correcting a stale-dist gap in beta.22 where FEIP-8016 /
  FEIP-8017's changed bundles had been reverted after the release build.

## [0.3.0-beta.22] - 2026-07-15

### Added

- **`lakebase-sftdd-next`: an authoritative, strictly read-only "what do I do
  next?" surface (FEIP-8017).** The deterministic drive knows exactly where the
  workflow is and what it would do next, but only WHILE it runs; every time it
  stops (a HITL gate, a raised escalation, feature-complete, an error, a killed
  run) an orchestrating agent otherwise reverse-engineers the next move from
  source and drifts into freeform (improvised CLIs, manual git, manual state
  edits). `lakebase-sftdd-next (--feature <F> | --sprint <S>) [--json]` answers,
  from the SAME engine the drive uses (`deriveDriveState` -> `nextTransition`, so
  it can never drift): the reconciled state (coarse + pipeline-derived phase,
  per-story statuses, open gates, blockers), the decision MENU (not just the one
  next action, but the real HIL choices, e.g. accept/discard/revise at
  acceptance, each with its correct enact command + a prompt to pose to the
  human), and a truthful summary. It is strictly read-only: no model spawn, no
  writes to workflow artifacts, no actions. The drive also auto-emits the feature
  snapshot to `.sftdd/next.json` on every stop (skipped under replay/record), so
  an agent's contract becomes "on any stop, read next.json and present its
  options." The gate -> CLI mapping is now a single structured source
  (`gateEnactCommand`) that the drive's stdout hint projects from, so the hint
  and the menu can never diverge. See `references/next-schema.md`.

### Fixed

- **`lakebase-sftdd-feature-status` now reflects per-story-driven completion
  (FEIP-8016).** A fully built + accepted feature rendered as `Phase: discovery`
  with its feature-level gates still `open`, because the coarse
  `workflow-state.json` phase is not advanced per story and so lags behind the
  per-story `pipeline.json` (the source of truth). The snapshot gains
  `derived_phase` (DERIVED from the pipeline: `complete` when every story is done
  + accepted, `build` when a story is past its spec gate, `design` otherwise,
  `null` when no stories are tracked) and a `stories[]` array of per-story rows;
  the renderer prefers `derived_phase` and annotates the coarse phase only when
  it lags. A bounded deploy drive over an already-deployed feature now reads
  `already complete (0 actions, nothing to do; the per-story pipeline already
  carried it out)` instead of the misleading `deploy complete in 0 actions`.
  `derived_phase` + `stories` are append-only additions to the feature-status
  snapshot's public shape.

## [0.3.0-beta.21] - 2026-07-15

### Fixed

- **The acceptance gate now LANDS the accepted story's code, not just its state
  (FEIP-8013).** The drive's `accept` was two commands (`lakebase-sftdd-experiment
  merge` + `lakebase-sftdd-pipeline accept`); the git-merge lived only in the
  experiment CLI and `pipeline accept` recorded state. Interactive, the gate stops
  before the accept effect, so a human running the hinted `pipeline accept` recorded
  `done` but never merged, and the accepted story's code stayed on the experiment
  branch (the next story then forked from a feature branch missing it). Now
  running `lakebase-sftdd-pipeline accept` LANDS the code: it RESOLVES the merge
  args (experiment slug + branches from the persisted experiment record; instance
  from `--instance` else scm-state) and DELEGATES to `lakebase-sftdd-experiment
  merge`, the single CLI that owns the git-merge (+ migrations + teardown) and
  records acceptance. `pipeline accept` itself never touches the merge substrate
  in-process, it routes through that CLI (as does the drive's single `accept`
  effect). The merge is idempotent: a re-run whose experiment is already merged
  skips the merge and just ensures the acceptance state. Cut and merge agree by
  construction (accept reads the branches `cut` persisted).

## [0.3.0-beta.20] - 2026-07-15

### Fixed

- **`lakebase-sftdd-approve-gate` is now the one human door for the per-story spec
  gate too (FEIP-8008).** At a per-story spec gate the drive printed a generic hint
  (`lakebase-sftdd-approve-gate --feature <id> [--gate <name>]`), but that records
  the FEATURE-level `gates.json` gate, not the PER-STORY gate the design lane blocks
  on (managed by `pipeline.json`, approved by `lakebase-sftdd-pipeline approve-gate
  --story`). Following it recorded the wrong gate, exited 0, and the drive never
  advanced. `lakebase-sftdd-approve-gate` now accepts `--feature <id> --story <s>`
  and routes the per-story gate through a shared helper (`approveStoryGateFromDisk`)
  that `lakebase-sftdd-pipeline approve-gate` also uses, so both write identical
  state. The drive's `GATE` message now prints the EXACT command per gate kind:
  per-story spec → `--feature --story`, plan → `--sprint`, deploy/promote →
  `--feature --gate <name>`, PO acceptance → `lakebase-sftdd-pipeline accept`.

- **Scaffolded React client vitest collects its own `tests/` component-test layout
  (FEIP-8009).** `templates/project/client/vite.config.ts` set `test.include` to
  `["src/**/*.test.{ts,tsx}"]` only, yet the scaffold ships `client/tests/pages/`
  (where the design lane routes client component tests) as the Vitest home. Any
  client component test placed there was silently uncollected, so a client RED test
  could not run and the build escalated with a blocking `scaffold-defect` ("no
  runner for the layer"). `include` is now `["src/**/*.test.{ts,tsx}",
  "tests/**/*.test.{ts,tsx}"]` with `exclude` = `[...configDefaults.exclude,
  "tests/e2e/**"]`, so component tests under `tests/` are collected out of the box
  while Playwright's `tests/e2e/` stays Playwright's.

- **The Driver agent's own log lines are now visible in the default agent-log view
  (FEIP-8010).** The Driver role doc told it to emit its narration at `--level
  debug`, while the Navigator emits `reasoning` at `info` and the standard log view
  (and the drive's own tail) read `--min-level info`, so the Driver's self-narration
  was filtered out and the Driver appeared to log nothing. The Driver role doc now
  emits `reasoning` at `info` once per GREEN/REFACTOR turn, at parity with the
  Navigator.

## [0.3.0-beta.19] - 2026-07-15

### Fixed

- **A design subagent writing its artifact OUTSIDE the project root no longer
  causes a cryptic, misattributed crash (FEIP-8006).** A role subagent (seen with
  the Test Strategist) wrote its output to a hallucinated path outside
  `<project>/.sftdd/`, and a downstream consuming effect then crashed reading the
  absent file, blaming the wrong step. Two layers close it. (1) Root cause: role
  prompts now name ABSOLUTE artifact paths under the resolved `sftddDir` (the
  directive root was a bare basename, a relative path the Claude Code `Write` tool
  cannot use, so the agent guessed the project root). (2) Guard: after each
  design/planning role turn the orchestrator emits a `verify-artifact` check that
  asserts the role's expected output landed under the project `sftddDir` BEFORE any
  consuming effect runs; on a miss the driver throws `ArtifactOutOfRootError`, a
  loud, attributed failure naming the role, the artifact, and where it looked, with
  the hint that the agent likely resolved the root wrong. Build turns
  (navigator/driver) and the human-input author-requests step are exempt.

- **The pre-build reflection gate now CONVERGES instead of looping the Navigator to
  the stall guard (FEIP-8007).** When the reflect gate correctly flagged a design
  defect (e.g. a `reflect-testlist-defect`), the run could re-dispatch the Navigator
  reflect turn repeatedly and exit with "driver stalled ... repeated without
  advancing state", because the defect lived in the Test Strategist's artifact and
  re-running the Navigator could never fix it. Two root-cause gaps are closed so the
  existing revise-route machinery converges. (1) The revise self-heal now
  INVALIDATES the stale `reflect-verdict.json` (`clearReflectVerdict`), so after the
  owning author re-authors, the re-dispatched Navigator recomputes fresh against the
  corrected artifact instead of reusing the pre-fix `passed:false` verdict. (2)
  `recordReflectionGate` is now idempotent (records an owner's smell only when one is
  not already open, via a shared `hasOpenSmell` guard) and self-clearing (a passing
  verdict drains the open reflect smell(s) for the story via `resolveOpenSmells`,
  with a new `cleared` resolution kind that does NOT spend the one-revise budget). Net
  behavior: a flagged defect routes to the producing role for one informed retry, then
  a fresh recompute passes (proceed) or the spent budget escalates to a clean HITL
  pause. The Navigator is never re-dispatched against an unchanged artifact, and the
  smell log never accumulates duplicate open entries.

## [0.3.0-beta.18] - 2026-07-15

### Added

- **`lakebase-sftdd-approve-gate` , a human-facing gate-approval CLI (FEIP-8005).**
  The interactive plan gate (and per-feature HITL gates) await a human's approval,
  but the only CLI that RECORDED an approval was `lakebase-sftdd-human-proxy`,
  which is explicitly labeled "NOT for production use" and defaults the approver
  to "human-proxy". A real Product Owner approving a real gate had to reach for a
  not-for-production tool. The new `lakebase-sftdd-approve-gate` is the production
  counterpart: it REQUIRES an explicit `--approver` (no silent default identity,
  the deciding human names themselves) and reuses the SAME approval substrate
  (`approveSprintPlanGate` for the sprint plan gate; `drainGatesAsHumanProxy`,
  which assembles each open gate's artifact hashes and calls `approveGate`, for a
  feature's gates), so the recorded approval is byte-for-byte what the workflow
  expects. Usage: `lakebase-sftdd-approve-gate --sprint <s> --approver <you>` (plan
  gate) or `--feature <id> --approver <you> [--gate <name>]` (a feature's gates).
  The tool records ATTRIBUTION; the decision must be the approver's. The `/plan`
  doc and the driver's `GATE` message now point humans at it; the Human Proxy
  remains the headless / smoke path.

## [0.3.0-beta.17] - 2026-07-15

### Added

- **`lakebase-sftdd-sync-backlog` , the human door to commit an interactive
  sprint backlog (FEIP-8002).** Interactive sprint planning deadlocked at
  `author-requests`: `backlog.json` (from which `requestsAuthored` is derived) is
  written only by the `author-requests` effect (`supply-requests` + `sync-backlog`),
  which the interactive driver stops BEFORE performing; `supply-requests` reads
  sprint membership only from the proxy env channel; and there was no standalone
  sync-backlog CLI. So a human-in-the-loop Product Owner could author
  `feature-request.md` files but never commit a backlog or reach the plan gate.
  The new `lakebase-sftdd-sync-backlog --sprint <s> [--features F1,F2]` declares
  this sprint's membership to `sprints/<s>/requested.json` (the SAME one file the
  Human Proxy writes, via new shared `readRequested`/`writeRequested` helpers , one
  membership source, no contradictory door) and projects `backlog.json` from the
  requested features that have a `feature-request.md`. The interactive loop is now:
  driver pauses at `author-requests` -> PO authors requests + runs `sync-backlog` ->
  re-run advances to the (interactive) plan gate. The `author-requests` PAUSE
  message names the CLI; `/plan` documents the step. Headless (Human Proxy) is
  unchanged , its `supply-requests` performs the same projection automatically.

## [0.3.0-beta.16] - 2026-07-15

### Fixed

- **Interactive `--plan-only` no longer misreports a PO pause as an approved plan
  (FEIP-8001).** In interactive mode (the default), `lakebase-sftdd-drive --sprint
  <s> --plan-only` correctly stops after the Architect's estimate at the Product
  Owner's `author-requests` (the human must write the feature-request(s)). But
  that stop is a human-INPUT action, not an approval gate, and the completion
  handlers only inspected the approval-gate stop , so the run printed
  `planning complete (plan gate approved)` and exited 0 despite producing nothing
  (no `backlog.json` / `gates.json` / `feature-request.md`, workflow-state still
  at `discovery`). A caller would advance on an empty backlog. The human-input
  stop is now carried distinctly (`pendingInput`): `runSprint` halts on it instead
  of falling through to an empty backlog, and the CLI reports a clear
  `PAUSED , the PO must author feature-request(s), then re-run. Nothing was
  approved or produced` and exits NON-ZERO in the `--plan-only`, sprint, and
  `--feature` bound paths (the postcondition , an approved plan , is not met). A
  genuine approval gate still exits 0 (work produced, awaiting approval).

## [0.3.0-beta.15] - 2026-07-14

Hardening from field feedback against beta.14, plus a consumer-facing packaging
fix. The through-line: a replay is a RECORDING. It now fails loud on a missing
corpus artifact instead of silently spawning a live agent, the shipped scenario
corpus is guarded complete, and the declared gate policy is human-in-the-loop by
default. Validated by a full live stockflow F1+F6 replay (design through promote,
zero agent-takeovers) on top of the hermetic suite.

### Added

- **Replay-corpus completeness guard.** The scenario-corpus integrity test was
  broadened from "every test-list `ac_id` resolves to a tracked ac file" to the
  FULL set of artifacts the driver restores on replay: per-feature
  `feature-spec.json` / `architecture.json` / `test-list.json`, per-story
  `story.json` / `reflect-verdict.json` / at least one ac, the uiTrack
  `design-guide.json`, and the per-story `recorded-build` turns. It keys off what
  the corpus SHIPS (tracked `story.json` / feature dir), so it cannot false-fail
  on an optional feature. A dropped artifact now fails hermetically in CI naming
  the exact file, long before it could surface as a live-replay hard-fail.

### Changed

- **HITL-first gate policy (field feedback).** The declared project gate policy
  (`project.gates`) now defaults to `interactive` (a human approves each gate).
  `proxy` (headless, Human Proxy approves) is a deliberate opt-in. A run-scoped
  `--gates` flag no longer persists into `sftdd-config.json` (a single headless
  `--gates proxy` invocation could permanently flip an interactive project); the
  drive resolves the effective mode per run as `--gates ?? project.gates` and
  records it run-scoped only. `proxy` with no non-interactive signal
  (`AUTO_CONTINUE` / CI) now refuses rather than silently auto-continuing.

### Fixed

- **Consumer installs missing every `scripts/sftdd` bin (FEIP-7989, GH #168).**
  The shipped `dist` was incomplete, so a `github:...#tag` consumer install
  received a partial CLI set. The release now ships a complete `dist` and guards
  it: `prepare.mjs` verifies every bin is present on a consumer install, the
  scaffolded `scripts/lk` warm-check refuses an incomplete kit, and a
  `dist-bins-shipped` test asserts parity.
- **Replay fell through to a live agent on a corpus miss.** When a replay lane
  was told to reproduce a turn the corpus lacked, the driver printed a note and
  SPAWNED THE REAL AGENT, letting an agent "take over" a deterministic run and
  masking an incomplete corpus. All three fall-throughs (design turn, build turn,
  reflect verdict) now throw `ReplayCorpusMissError`, failing loud (exit 2) and
  naming the missing artifact. No agent is ever spawned in a replay lane.
- **`.gitignore` silently dropped shipped files.** An org-init `*conf*.json`
  glob matched any tracked file whose name contains "conf", so several shipped
  artifacts were never committed and a consumer never received them: scenario ac
  data (`*-confirmed.json`, `*-nonconforming-*.json`), a dropped corpus ac
  (`AC3-confirmation-shown.json`), and, most impactfully, the React client
  template's **`tsconfig.json`** (its `build`/`typecheck` scripts are
  `tsc --noEmit && vite build`, so a scaffolded client could not typecheck or
  build without it). The ignore is now anchored to the actual runtime file
  (`run-config.json`) by exact basename, and every dropped shipped file is
  restored. Non-shipped local scenario recordings (`stockflow-live/`,
  `stockflow-s3-selfheal-verify/`, no tracked `scenario.json`) that the removal
  un-hid are kept out via exact directory paths (never a glob).
- **Replay/capture smoke harness gate policy.** The harness is headless by
  construction (it exports `LAKEBASE_SFTDD_HUMAN_PROXY=1`), but it only passed
  `--gates proxy` on the capture path, relying on the old global `proxy` default
  for replay. With the HITL-first flip that default is gone, so a pure replay
  blocked at the first per-story spec gate. The harness now declares
  `--gates proxy` in both directions.

## [0.3.0-beta.14] - 2026-07-11

A deploy-verify failure caused by a shared-state-fragile prior test can now
self-heal instead of dead-ending at the human gate. Surfaced by the live
stockflow capture (F6/S3): three integrity-probe tests written for an earlier
story asserted an absolute whole-table aggregate, so they passed on their own
isolated build branch but failed the full-feature deploy-verify once later
stories' rows shared the table. That is a fragile test, not broken software, but
the only route was the terminal HIL, and re-driving just re-failed the same
unscoped test.

### Added

- **Deploy-verify self-heal routing (FEIP-7916).** When a per-story
  deploy-verify fails, the deploy step re-runs the failing tests in ISOLATION on
  a fresh child branch. If they all pass alone, the failure is shared-state
  contamination, so instead of the terminal escalation the orchestrator records
  a one-shot marker and routes a story-level **Navigator ASSESS-DEPLOY** turn
  (confirm the fragile set, prescribe how to scope each to own its rows) then a
  **Driver SCOPE-DEPLOY** turn (refactor only those tests), and re-deploys to
  re-verify. A passing re-verify clears the marker and the story proceeds to
  acceptance. The self-heal is bounded to a single attempt: if the re-deploy
  still fails, the one shot is spent and it raises to the human, so a fragile
  test can never spin. A genuine regression (any failing test that still fails in
  isolation) takes the terminal gate exactly as before. Validated live end to
  end on the stockflow F6/S3 capture.

### Fixed

- **`capture-scenario.sh` relative `--inputs-from`.** The path was consumed after
  the script `cd`s into the freshly created project, so a relative `--inputs-from`
  resolved against the project dir and the recorded intake vanished (the
  human-proxy "recorded source not found: .../intake/product-overview.md"
  refusal). It is now absolutized up front, and fails loud if the directory is
  missing.
- **Deterministic sprint-planning PROPOSE.** The propose directive named its
  artifact only in passing, so the Spec Author (an LLM) could invent candidates in
  its reply, write no file, then on a re-dispatch claim it "already exists" , the
  handoff guard then aborted the run on the empty artifact. The directive is now
  explicit (WRITE `planning/feature-proposals.md`, author it fresh), and in
  capture/replay (recorded feature-requests present) the propose step is
  DETERMINISTIC: a new `lakebase-sftdd-human-proxy supply-proposals` projects a
  conforming `feature-proposals.md` from the recorded requests instead of spawning
  the LLM. Interactive users keep the live propose turn.

## [0.3.0-beta.13] - 2026-07-09

Hardening surfaced by a live React-SPA capture: the SFTDD build now has a
first-class client test lane, a SPA's e2e no longer collides with the backend's
in CI, and the scaffolded full run can no longer green client code whose tests
never ran. Plus a downstream-migrate matching fix.

### Added

- **Client test lane for SFTDD (FEIP-7915).** The test-list gains a `client`
  kind: the test-strategist routes client-verified ACs to it, the navigator
  authors them under `client/tests/`, and the driver dispatches them to the
  client's Vitest/Playwright runners. The reflect gate is aware of the lane, so
  a client-verified AC can no longer be silently proven by a backend test.

### Fixed

- **A React SPA owns its e2e lane (FEIP-7916).** A SPA was scaffolded with two
  e2e harnesses , the `client/` Playwright suite and the backend's
  server-rendered Python `tests/e2e` live_server , both binding the backend
  port, which collided in CI (`reuseExistingServer:false`) with
  "http://localhost:8000/health is already used". `create-project` /
  `enable-e2e` now make the client Playwright suite the sole e2e for a SPA (no
  Python `tests/e2e`, no root `playwright.config` on a Node backend).
- **CI e2e port resiliency (FEIP-7916).** `port_in_use` + `free_port` are
  factored into a shared `scripts/port-utils.sh` (run-dev.sh sources it);
  `client/playwright.config.ts` takes `E2E_BACKEND_PORT` / `E2E_CLIENT_PORT`
  (defaults 8000/5173) threaded into the uvicorn command, the `/health` poll,
  and the Vite proxy; and `pr.yml` gains an "Allocate free E2E ports" preflight
  that moves off a stale port instead of hard-failing (multi-tenant safe).
- **The full run can no longer false-GREEN client code (FEIP-7915).**
  `run-tests.sh` installs client deps and runs the client suite instead of
  silently skipping when `client/node_modules` is absent, so a broken client
  test fails in-build, not at the deploy gate.
- **`discard --revise` resets the story's build state (FEIP-7915).**
  Reviving a story now clears its cycle records + test-list statuses so the
  build lane genuinely re-drives instead of reading the stale build as allGreen.
- **`scm-merge --wait-migrate` matches the downstream run by merge-commit SHA**
  instead of a `mergedAt` time window, ending the false "(no matching run)"
  timeout when `mergedAt` reflected a post-cleanup local clock.
- **Claiming resumes an in-flight feature instead of refusing (FEIP-7916).**
  The sprint driver re-claims each backlog feature right before driving it, so
  resuming a sprint whose feature was mid-promote (`pr-ready` / `ci-green`)
  failed with "Cannot claim feature branch from state pr-ready". The idempotent
  same-feature no-op now covers all in-flight claimed states, so a re-claim
  hands back the existing claim and the drive resumes where it stopped; a
  different feature in one of those states is still `already-claimed-other`.
- **Whole-table aggregate tests must own their state (FEIP-7916).** A test that
  asserts an absolute table-wide aggregate (an integrity probe / global
  `COUNT`/`SUM`) passed on the isolated per-cycle build branch but failed the
  full-feature deploy-verify once other stories' rows shared the table. The
  test-strategist + navigator canon now requires scoping the seed AND the
  assertion to the test's own rows (or a delta), never a global total, enforced
  by a new spec-level `shared-state-aggregate-assertion` smell the reflect critic
  surfaces at design time.

## [0.3.0-beta.12] - 2026-07-09

A first-class React SPA client scaffold (a single-page app is now the path of
least resistance for a UI project, not a build-from-scratch fight), plus two
scaffold-hygiene fixes that every Databricks-internal adopter was hitting.

### Added

- **First-class React SPA client scaffold (FEIP-7910).** `templates/project/
  client/` ships a React 18 + TypeScript + Vite single-page app, layered into
  `api/` (the only `fetch` layer), `hooks/`, `components/`, `pages/`, and
  `styles/` (Databricks design tokens as CSS custom properties), with Vitest +
  Testing Library (jsdom) unit tests and a Playwright e2e example. A new
  `clientFramework` knob (`create-project --client react|none`) defaults to
  `react` for a `--ui-track` project and `none` otherwise, and is persisted to
  `sftdd-config.json` (`project.clientFramework`). The Python backend serves the
  built client from `client/dist` in production (single-process deploy), the
  client's Vitest suite runs in CI (`pr.yml`) and `run-tests.sh`, and the
  Architect and Driver now treat the React SPA as a first-class `renders_via`
  path, defaulting to it when a client was scaffolded. The dev/CI/hook plumbing
  keyed on `client/package.json` (Vite boot, client build + Playwright, npm
  install) now has a real scaffold to find.

### Fixed

- **scm-doctor no longer reports permanent false workflow drift (FEIP-7911).**
  `detectWorkflowDrift` now substitutes `{{LAKEBASE_KIT_VERSION}}` in the
  template before comparing (the same substitution the writer and the command
  drift detector already applied), so a correctly version-pinned project reads
  as `unchanged` instead of standing drift.
- **get-connection reference no longer trips the secret scanner (FEIP-7912).**
  The example DSN's fake `eyJ...` JWT is replaced with a `<jwt-token>`
  placeholder, so the doc no longer blocks commits behind a Databricks
  secret-scan pre-commit hook.

## [0.3.0-beta.11] - 2026-07-09

Architect-canon design-lane optimization (FEIP-7902) plus a cluster of live-capture
hardening fixes surfaced by a full stockflow F1+F6 sprint run.

### Added

- **Architecture canon (FEIP-7902).** The architect's cross-cutting standing
  decisions (NFR posture, AC layer placement, persistence-invariant patterns) are
  established once into a project-level `architecture/canon.json` (twin of
  `conventions.json`). Per-story architectural notes are then PROJECTED
  deterministically with no live architect turn in the common case; a live turn
  fires only when a story is novel, recovered through the existing revise-routing
  self-heal (`architect-canon-gap` smell, owning role architect-reviewer). The
  establishing feature is exempt from gap-checking its own stories.
- **Durable per-turn timing.** `lakebase-sftdd-timing` now rolls up the driver's
  measured `turn.usage` durations by role and role/model (with cost), independent
  of stdout capture, plus a `--skip-planning` flag. The old inter-event gap
  rollups remain for orchestration-overhead analysis.
- **Multi-sprint capture.** `capture-scenario.sh` accepts repeatable `--sprint`
  groups driven sequentially on one project; the backlog is scoped per sprint
  (`sprints/<sprint>/requested.json`), so a later sprint no longer re-drives an
  earlier sprint's feature.

### Changed

- **Apps mint their Lakebase DB credential at RUNTIME; no token is stored in
  `.env`.** Scaffolded Python and Node apps (and all-language migrations) build
  from connection metadata and mint a short-lived Postgres token on demand via the
  databricks CLI; `.env` carries metadata only. An explicit `DATABASE_URL` still
  overrides (CI/Docker). This fixes deployed apps and long runs failing once the
  old baked-in token expired. (Java/Kotlin Spring app-runtime minting is tracked
  separately as a follow-up.)

### Fixed

- **The sprint halts on a raise-to-HIL instead of advancing.** A feature that
  escalates (e.g. a failed deploy-verify) now stops the sprint and exits non-zero,
  rather than being counted "complete", which previously advanced to the next
  sprint and crashed the next feature's claim with `already-claimed-other`.
- **`story.json` field drift no longer hard-fails the feature-complete gate.** The
  reconcile seam normalizes a stray `feature` to `feature_id` and strips non-spec
  keys (e.g. `status`) into `story.schema` conformance.
- **Capture reconstitute only runs when a design-lane log exists.** A fully-live
  capture (which designs straight into the project agent-log) no longer prints a
  spurious "requires --design-log" error.

## [0.3.0-beta.10] - 2026-07-07

Design-lane hardening surfaced by the live SFTDD capture (a fresh run that reached
feature-complete but flagged two design defects along the way).

### Added

- **A persistence invariant belongs to exactly one story (no cross-story
  re-test).** A declared `persistence_invariant` is realized once by the feature's
  schema, so its fitness test belongs to the one story whose migration realizes it.
  A later story re-emitting a fitness item for an invariant an earlier story already
  covers is a redundant re-test that drifts (one copy asserts the field-named
  validation message, the other only the raw rejection) and dead-locks the reflect
  gate. New `checkInvariantCoverageDistinct`, wired into the test_list gate
  (`gate-conformance-guard`), hard-blocks Gate 3 on the duplicate. The reflect critic
  caught only the one duplicate phrased weaker; the deterministic gate catches all.
  Types `invariant_id` on `TestListItem` and adds the rule to the Test Strategist
  canon.

### Fixed

- **The UX Designer's `design-guide.json` conforms at the source, and the design
  lane gates on it.** The UX Designer (told never to read the schema) drifted on
  shape (camelCase keys, a nested `spacing.scale`, extra typography props) and, since
  the guide was gated only on existence, the non-conformant file rode all the way to
  the final feature drain. The `typography` schema is expanded to hold the tokens the
  model legitimately produces (`line_heights`, `font_weights`; the numeric font uses
  the existing `font_mono`), mapped to `--line-height-*` / `--font-weight-*` in
  `design-adherence`. The UX Designer now gets the exact JSON shape inline in its
  prompt plus a response-formatter self-check, and `designGuideReady` requires the
  guide to EXIST and CONFORM (one shared `designGuideConformance` helper backs both
  the self-check and the gate), so a malformed guide keeps the role pending instead
  of surfacing at the drain.

## [0.3.0-beta.9] - 2026-07-07

Follow-on to beta.8, surfaced by the live SFTDD capture at an S2 REFACTOR that
dead-locked.

### Fixed

- **A UI test that asserts the implementation instead of the seam no longer
  dead-locks the REFACTOR.** The Test Strategist authored a test that grepped the
  page source for an inline `style=` (e.g. `text-align: right`); the design lane then
  refactored that inline style into a token-driven class, so the test could never
  stay green and the REFACTOR halted. New `ui-style-implementation-test` smell
  (spec-level, owned by the Test Strategist, re-gates `test_list`) plus a reflect
  critic directive that flags a styling test asserting raw inline CSS in the page
  source rather than the rendered seam (a design-guide class / `data-testid`) or the
  design-adherence gate. The Test Strategist guidance now directs, for a
  design-guide-governed visual property, asserting the seam and leaving the rendered
  property to the design-adherence gate. This is a design-lane guard: it prevents the
  test from being authored, it does not retroactively rewrite a frozen test list.

## [0.3.0-beta.8] - 2026-07-07

Follow-on to beta.7, surfaced by the live SFTDD capture at the S1 experiment cut.

### Fixed

- **Stray agent-created junk no longer blocks the experiment cut, and never rides a
  commit.** A design-lane agent wrote a mis-quoted file (named `"`) to the project
  root; the fork guard refused the cut because the build commit ran `git add -A` and
  would have committed that junk onto the experiment branch. `commitExperimentCode`
  now allow-lists what it stages (every tracked change anywhere, plus new untracked
  files only under the source/test/migration roots or with a recognized source
  extension, so root-level `app.py` is still committed), and `assertCleanForFork`
  ignores untracked files (uncommitted edits to tracked source still refuse). Adds an
  `untracked` toggle to `isDirty` and an `untrackedAllow` option to
  `commitAllIfChanged`.

## [0.3.0-beta.7] - 2026-07-07

Resilience hardening surfaced by a live SFTDD capture run (paired-branch build +
deploy + PR/CI).

### Fixed

- **alembic subcommands can import app code (PYTHONPATH parity).** `alembic upgrade`
  runs `env.py` (which prepends the project root to `sys.path`), but `alembic
  history`/`heads` do not, yet still import every migration module to build the
  revision map. A data migration importing app code then failed
  `ModuleNotFoundError` under the migration-lineage check while working under
  upgrade. `spawnAlembic` now puts the project root on `PYTHONPATH` for every
  subcommand, and the scaffolded `alembic.ini` gains the idiomatic `prepend_sys_path
  = .`.
- **Ephemeral-verify branch create tolerates a silent client flake.** A
  `create-branch` that exits non-zero yet lands the branch server-side no longer
  aborts: `createBranch` re-checks and adopts the landed branch. `classifyDatabricksError`
  folds stdout + the exit code into the message when stderr is empty, so a silent
  failure is legible.
- **Ephemeral-verify child name capped at the 63-char Lakebase limit.** An over-limit
  name was truncated on create but looked up untruncated ("branch id not found"); the
  name now truncates the descriptive prefix and preserves the unique `-vrfy-<nonce>`
  suffix.
- **Pre-build reflection turn is guarded.** A reflect turn that produces no readable
  `reflect-verdict.json` now escalates to the human instead of the driver silently
  re-invoking it into a stall.

### Added

- **`migration-app-coupling` smell + `lakebase-sftdd-migration-clean` gate.** A
  deterministic check (mirroring contract-clean) that fails a build cycle when a
  migration imports app code at module scope, routing a repair to make the migration
  self-contained before it reaches CI.

## [0.3.0-beta.6] - 2026-06-30

EMU / CI robustness, surfaced by a partner project on an Enterprise Managed Users
org.

### Fixed

- **Host-aliased git remotes resolve to the correct owner/repo.** `getGitHubUrl`
  only normalized a literal `git@github.com:` remote, so an SSH host-alias remote
  (common for EMU, e.g. `org-140212977@github-emu:databricks-field-eng/partner-
  asset-tracker.git`) was mis-parsed into a garbage owner and every owner/repo API
  call 404'd , Create PR and self-hosted runner setup both failed with "Not
  Found". The normalizer now extracts owner/repo after any host (SCP, `ssh://`,
  `https://`, with or without a user) and re-homes it on github.com.

### Added

- **`getActionsEnabled(ownerRepo)`** , reports whether GitHub Actions is enabled
  for a repo (returns `undefined` when undeterminable, so a missing token never
  false-alarms). Used by the new scm-doctor check + the extension's Health Check.
- **scm-doctor `github-actions-disabled` finding** , when Actions is off (commonly
  an org policy on EMU repos a repo admin cannot override), the kit's CI workflows
  (pr.yml / merge.yml) silently never run; the doctor now surfaces this explicitly
  with remediation instead of leaving "CI never happened" unexplained.

## [0.3.0-beta.5] - 2026-06-29

Greenfield hardening: scaffolded-project fixes surfaced by a hands-on evaluation
of a freshly created project. All changes are additive and validated live on a
real workspace (project provision + Flyway migrate + multi-schema diff + a full
create-project run with a GitHub repo).

### Added

- **Monorepo-aware migration-layout resolver (single source of truth).**
  `scripts/lakebase/migration-layout.ts` owns language detection and the
  migration path / pattern / glob conventions (`detectLanguageAt`,
  `resolveMigrationLanguage`, `resolveMigrationLayout`, `compileMigrationPattern`);
  `schema-migrate` delegates to it, and the VS Code extension consumes it so a
  subdir app (e.g. `recipe-app/migrations`) is detected correctly instead of
  assuming a repo-root Flyway layout.
- **Multi-schema schema diff (`--schema`).** `branch-schema.ts` now owns one
  shared `buildSchemaQuery` / `schemaObjectName` / `isAllSchemas`; both
  `queryBranchSchema` and `getSchemaDiff` consume it and accept a `schema`
  argument (default `public`, a named schema, or `all` / `*` which qualifies
  names as `schema.table`). `lakebase-schema-diff` gains `--schema <name|all>`.
  Objects outside `public` are no longer silently invisible to the diff. The
  schema name is bound, never interpolated.
- **Create-project preflight + cleanup (`scripts/lakebase/create-preflight.ts`).**
  - `checkDatabricksAuth` runs as create Step 0: a missing/stale token fails with
    an actionable `databricks auth login --host <host>` message up front, before
    any GitHub repo or Lakebase project is created.
  - `warmAndVerifyKit` warms AND verifies the fast-CLI cache at create time and
    surfaces a specific warning if it fails (a silent warm failure used to
    surface later as a mysterious commit hang).
  - `withLakebaseRollback` wraps the post-create steps so a failure deletes the
    just-created Lakebase project, leaving no orphaned slug to block a same-name
    retry.

### Fixed

- **Flyway baseline trap.** The java + kotlin fallback `pom.xml` and the dynamic
  `pom-patch.ts` now pin `<baselineVersion>0</baselineVersion>` alongside
  `baselineOnMigrate=true`, so `mvn flyway:migrate` applies `V1` on a fresh
  database instead of consuming it as the baseline (parity with the kit's
  Flyway runner, which already passed `-baselineVersion=0`).
- **`pre-push` no longer blocks a push on a stale Databricks token.** A failed
  OAuth token refresh now warns and lets the push proceed (the token only
  affects the downstream CI secret sync); it no longer `exit 1`s.
- **Commit-time schema diff can no longer stall a commit.** `lk` honors
  `LK_NO_INSTALL` so a cold kit cache skips the synchronous `npm install` (the
  ~70s stall) and exits 97; `prepare-schema-diff.sh` sets it and wraps the diff
  in a portable hard timeout (`LAKEBASE_SCHEMA_DIFF_TIMEOUT`, default 10s). A
  cold cache or slow Lakebase yields a commit without the diff, never a blocked
  commit.

## [0.3.0-beta.4] - 2026-06-27

### Added

- **Artifact-root resolution + auto-migration.** The on-disk artifact/log directory
  name now lives in one place (`scripts/sftdd/sftdd-paths.ts`: `ARTIFACT_ROOT`,
  `resolveTddDir`) instead of being a `"./.tdd"` default copy-pasted across ~20 call
  sites. `resolveTddDir` is dual-read: it prefers `.sftdd`, falls back to a legacy
  `.tdd` when that is what exists, and defaults a fresh project to `.sftdd`. The
  orchestrator (`lakebase-sftdd-drive`) auto-migrates a legacy `.tdd` to `.sftdd` on
  its next run (`git mv` to preserve history when possible, else a filesystem
  rename), and rewrites the project `.gitignore` entries to match.
- **Per-story build granularity: contract/cleanup stories auto-drop to `ac`.** A
  story that drops, removes, or renames an existing shape (a column / endpoint /
  field, detected from the story id verb) now builds one verifiable increment per
  AC regardless of the run default, since its lockstep DB+code change is too heavy
  for one story-level GREEN turn (`effectiveLoopForStory` in `orchestrator-derive.ts`,
  applied in both the routing and the RED/GREEN/REFACTOR prompt builder).
- **Reactive supersession self-heal.** When greening an AC breaks PRIOR-story tests,
  a failed honest-GREEN verify routes a Navigator ASSESS turn that classifies each
  failure as supersession (the latest AC intentionally changed that behavior) or a
  genuine regression. Superseded tests are flagged for permissive Driver refactor; a
  regression routes one bounded Driver repair. A MIXED verdict (some superseded plus a
  regression) is served in a single repair turn (the repair directive now carries the
  superseded-tests allowlist).
- **Ephemeral verify branch.** With `LAKEBASE_SFTDD_EPHEMERAL_VERIFY=1`, each GREEN /
  deploy verify runs its migrations + tests on a disposable child Lakebase branch
  forked off the story's experiment branch (then deleted), so a contract story's
  up/down migration fixtures cannot leave the shared DB half-migrated for the next
  run (`scripts/sftdd/ephemeral-verify.ts`).
- **Mid-turn context-overflow recovery.** A role turn that overflows the model window
  ("prompt is too long") is retried on a fresh session (bounded), continuing from the
  on-disk artifacts rather than failing the run (`scripts/sftdd/context-budget.ts`).
- **`sftddEnv` env accessor.** `scripts/sftdd/sftdd-env.ts` reads `LAKEBASE_SFTDD_*`
  with a fallback to the legacy `LAKEBASE_TDD_*` name, the read-side half of the
  env-prefix rename below.

### Changed

- **Config file + env prefix renamed `tdd` -> `sftdd` (back-compat).** The unified
  config is now `.lakebase/sftdd-config.json` and the runtime env knobs are
  `LAKEBASE_SFTDD_*`, matching the `lakebase-sftdd-workflows` skill, the `scripts/sftdd/`
  dir, and the `lakebase-sftdd-*` bins. Both are dual-read: `loadTddConfig` prefers
  `sftdd-config.json` and falls back to a legacy `tdd-config.json`; every env read goes
  through `sftddEnv`, which falls back to `LAKEBASE_TDD_*`. Existing projects / shells
  keep working with no manual change; new writes use the canonical names.
- **Supersession + contract-completeness canon (`software-design-principles`).** Hard
  rule 8 (a later AC can supersede earlier tests) now requires scanning for
  supersession COMPREHENSIVELY, including FITNESS / migration tests that assert a
  property of a dropped shape (reversibility, schema-shape), not only tests that name
  it. Hard rule 9 makes a schema-contract change update the data model AND the code
  (ORM / queries / serializers / views) in lockstep with the migration. The Navigator
  ASSESS and Driver REPAIR prompts enforce both.
- **Artifact directory renamed `.tdd` -> `.sftdd`.** New projects (and the
  `sftdd-bootstrap` template) scaffold a `.sftdd/` directory to match the
  `lakebase-sftdd-workflows` naming. Existing `.tdd` projects keep working (dual-read)
  and are auto-migrated on the next orchestrated run, so no manual action is required.
  The `tdd-paths.ts` module was renamed to `sftdd-paths.ts`.
- **Spec Driven Development (SDD) framing.** `lakebase-sftdd-workflows` docs now name
  the two lanes explicitly: the design lane (`/design`) is Spec Driven Development
  (SDD), which produces and freezes the executable spec at the `spec` + `test_list`
  gates; the build lane (`/build`) is Test Driven Development (TDD), which builds
  against that frozen spec. Narrative added to the skill README + SKILL, the
  spec-format reference, the design-lane agent prompts (spec-author,
  architect-reviewer, test-strategist), and the kit README + CLAUDE.

### Fixed

- **Deploy resilience on a port already in use.** Before refusing to deploy because a
  port is occupied, the deploy stops its OWN prior app instance and re-probes, so a
  re-run reclaims its own port instead of failing on a foreign-port refusal
  (`scripts/sftdd/deploy.ts`).

## [0.3.0-beta.1] - 2026-06-10

Second beta on the 0.3.0 line. Consume via
`npx github:databricks-solutions/lakebase-app-dev-kit#v0.3.0-beta.1`.

### Added

- **Promote phase.** After a feature is accepted, the deterministic driver runs a
  PR cycle (prepare-pr -> wait-ci -> HITL promote gate) then merges the feature up
  to its parent tier in git + Lakebase, so the next sprint forks from a populated
  parent.
- **Universal turn recorder.** `LAKEBASE_TDD_RECORD_DIR` makes the driver record
  every state-machine turn (design, build, gates, deploy, promote) as a replayable
  per-turn corpus: `turns/<NNNN>-<label>/` (manifest + the .tdd/code delta that
  turn produced) + `turns/index.json`, plus the cumulative `recorded-artifacts`
  and `recorded-build` mirrors the existing replay engine consumes.
- **imports-clean gate** (`lakebase-sftdd-imports-clean`): the app entry must import
  without an optional build artifact (e.g. `client/dist`) present, catching
  import-time coupling before deploy. New `import-time-build-coupling` bad smell
  plus a dev/prod-parity rule in the `software-design-principles` canon.
- **Claude Code plugin.** The kit installs as a plugin: `claude plugin
  marketplace add databricks-solutions/lakebase-app-dev-kit` then `claude plugin
  install lakebase-app-dev-kit@lakebase-app-dev-kit`. Launch the workflow with
  `/lakebase-app-dev-kit:tdd` (resumes in a scaffolded project, guides creation
  elsewhere).
- **Per-role agent runtime.** Eight role agents (product-owner, spec-author,
  ux-designer, architect-reviewer, test-strategist, navigator, driver,
  release-engineer) scaffolded into a project's `.claude/agents/` and invoked by
  the driver as `claude --agent <role>`.
- **Per-story pipeline + experiments.** Stories stream through design -> build
  with a ready queue; each story builds on its own experiment branch
  (cut / accept=merge / discard), paired with a Lakebase branch.
- **Deterministic deploy + Release Engineer handoff** at story acceptance, with
  deploy-evidence as the backstop; **honest GREEN** (no GREEN without a passing
  runner outcome) + **escalate-to-HIL** on any agent-surfaced error.

### Changed

- **Build commits working software at each GREEN + REFACTOR** (code only, on the
  experiment branch), so accept's merge carries real commits to the feature branch
  and the promote phase opens a clean PR. CI now builds the client before tests
  (dev/CI parity).
- **Agent-loop performance (P0-P7).** Per-turn timing report
  (`lakebase-sftdd-timing`), a leaner pre-digested REVIEW rubric, a fresh-per-story
  build session, a low-effort REVIEW turn, and reduced inter-phase shell overhead.
- **Kit CLIs resolve through a project's `scripts/lk`** (ref-keyed cache or
  `LAKEBASE_KIT_DIR`) instead of per-call `npx` git resolution.
- The orchestrator is a **deterministic state-machine driver**
  (`lakebase-sftdd-drive`), not an LLM agent.

## [0.3.0-beta.0] - 2026-06-05

First beta on the 0.3.0 line, graduating from the alpha series. Consume via
`npx github:databricks-solutions/lakebase-app-dev-kit#v0.3.0-beta.0`.

### Added

- **Artifact-conformance gate.** Per-artifact format registry: JSON
  artifacts are validated against their schema and narrative markdown against its
  required sections. The mock HITL approver hard-blocks a gate whose artifact
  exists but is malformed, rather than approving it.
- New schemas shipped in `dist`: `agent-log-event`, `architecture`,
  `design-guide`, `plan`. Shared schema loader removes duplicated validation
  wiring.
- `lakebase-sftdd-gate-conformance` CLI to scan a feature's artifacts for
  conformance.
- **Structured agent logging.** JSON-lines events (role, timestamp, level,
  event) written to `.tdd/agent-log.jsonl`, with the `lakebase-sftdd-log` CLI.
  HITL decisions are recorded (the mock reviewer validates expected elements and
  the human response is captured).
- **Per-role-agent contracts.** Relay headers on every role agent; a
  new Spec Author (Business Analyst) role and a conditional UX Designer (UI-only)
  role with token-level design adherence enforced at the Playwright layer.
- `feature-request.md` artifact: the Feature Requester's original ask, the Spec
  Author's read-only input.

### Changed

- **Explicit artifact authorship.** `spec.md` renamed to `product-overview.md`
  (Product Owner, project-level), and `feature.{md,json}` renamed to
  `feature-spec.{md,json}` (Spec Author). "spec" is now reserved for the Spec
  Author.
- NFRs moved off the spec-gated `feature-spec.json` / `story.json` onto
  `architecture.json` (the architect proposes, the HIL adjudicates at Gate 2),
  removing spec-gate drift.
- SCM feature-branch naming now goes through the shared sanitizer as the single
  source of truth; claim preserves the canonical `feature_id` case and is
  idempotent.

### Fixed

- The Spec Author no longer overwrites the Feature Requester's original ask: the
  requester's document is preserved as `feature-request.md` and never
  overwritten.

[0.3.0-beta.1]: https://github.com/databricks-solutions/lakebase-app-dev-kit/releases/tag/v0.3.0-beta.1
[0.3.0-beta.0]: https://github.com/databricks-solutions/lakebase-app-dev-kit/releases/tag/v0.3.0-beta.0
