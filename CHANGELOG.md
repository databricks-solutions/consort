# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **NFR tiering (`platform` vs `product`) — cut the per-story NFR management burden that makes non-registered builds flighty.** `architecture.json` `nfrs[]` gains optional `tier` (`platform`|`product`, default `product`) + `defended_by_gate`. A `platform` NFR (cross-cutting/substrate-guaranteed: layering, config-in-env, observability, auth-ready, operability) is defended ONCE – it is NOT injected into the per-story rubric (`build-context.ts` `contextRubric` filter) and gets no per-story fitness test – but it is never dropped: `checkPlatformNfrDefended` HARD-BLOCKS the spec gate unless it names its defense (`defended_by_gate` in the allowlist `consort-layering-clean`/`config-in-env`, or a single feature-level `fitness_function`). `checkFitnessClauseCoverage` excludes platform NFRs; `checkNfrCoverage` is unchanged (the `R<n>` -> `brief_ref` traceability is preserved). Role prompts (architect-reviewer/test-strategist/navigator/driver) tag + honor the tier. Fully back-compatible: an untiered NFR is `product` and behaves exactly as before.
- **Chrome/shell decomposition guard (advisory) — stop the design lane inventing an `app-shell` story for non-registered builds.** `checkChromeShellStory` (in `design-spec-gate.ts`, surfaced via `analyzeForGate` as a PO-clearable `chrome-shell-story` transition_blocker) flags a NON-behavioral chrome/shell mis-slice: a CONJUNCTION of (structural) all-E2E ACs AND (lexical) a tight chrome-noun match (navbar/favicon/branding/app-shell/...). A legit all-E2E UI story (sku-detail-view) is not flagged. Advisory, never fail-closed (the lexical half is heuristic); no-op for a registered project (the hard registered-breakdown guard owns it). `spec-author.md` gains the positive rule: every story delivers a user-observable behavior, never app chrome (chrome + IA live in `ia.md`/the design guide).

## [0.3.64] - 2026-08-30

### Fixed

- **Repoint `@databricks-solutions/lakebase-scm-utils` `#v0.2.20 -> #v0.2.21` – correct the `application_name` brand.** v0.2.20/v0.3.63 wrongly branded EVERY Lakebase connection `consort/<version>`. Restored the two-brand scheme, each with its OWN version: `consort/<consort-version>` when the work comes from Consort (`CONSORT_VERSION` set), `scm-utils/<scm-utils-version>` when scm-utils is invoked directly (extension / bare CLI). Flows through the DSN to the app runtime, `alembic`, `pytest`, `knex`, `psql`.
- **Scaffolded scripts resolve the two-brand label, and `consort-upgrade` stamps it.** `post-checkout.sh` / `setup-federation.sh` export `PGAPPNAME=consort/<consort-version>` under a drive, else `scm-utils/<scm-utils-version>` (the scm-utils version stamped at scaffold time). `refreshSurface` now substitutes `{{LAKEBASE_SCM_UTILS_VERSION}}` in the scripts on upgrade too (new `substituteScmUtilsVersionInScripts`), so an upgraded project never ships the literal placeholder – the same guarantee the workflows already had.

## [0.3.63] - 2026-08-30

### Changed

- **Repoint `@databricks-solutions/lakebase-scm-utils` `#v0.2.19 -> #v0.2.20` – `application_name = consort/<version>` on EVERY Lakebase connection.** scm-utils v0.2.20 stamps a uniform, versioned `consort/<version>` on every connection it opens or hands out: `connectionApplicationName()` always brands `consort` (running Consort version under a drive, else the package SemVer), and `buildPostgresUrl()` puts `application_name` IN the DSN – so the app's uvicorn/psycopg runtime, `alembic`, `pytest`, `knex`, and `psql` all inherit it, not just the three direct `pg.Client`/pool sites. The scaffolded app + scripts follow suit. (Also folds in v0.2.20's widened `.claude/settings.json` verify-allowlist patterns.)
- **Scaffolded scripts (`post-checkout.sh`, `setup-federation.sh`) export `PGAPPNAME=consort/<version>` and write it into `.env`.** Derived from `CONSORT_VERSION` (a drive) or the pinned `.lakebase/kit-ref`, so the psql readiness probes, the Spring `jdbc` `ApplicationName`, and every `.env`-sourcing tool connect labeled instead of unlabeled.

## [0.3.62] - 2026-08-29

### Fixed

- **Repoint `@databricks-solutions/lakebase-scm-utils` `#v0.2.18 -> #v0.2.19` – scaffold a `.claude/settings.json` that lets a headless drive self-verify.** A scaffolded project's role agents are spawned headlessly (`claude --agent <role>`, no human to approve a permission prompt) but must run the real-branch-DB verify (`run-tests.sh`, `uv run alembic`/`pytest`, the client `test`/`test:e2e`, `playwright install`). With no allowlist those invocations gated pending approval, so the drive could not self-confirm GREEN and re-raised a stale escalation. scm-utils now deploys a committed `.claude/settings.json` carrying those verify commands. It MUST be `settings.json` (the project source): the drive spawns agents with `--setting-sources project` (see `claude-runner.ts`), which loads ONLY `.claude/settings.json`; an allowlist in `settings.local.json` is never sourced by the spawned agent (the observed "allowlist not honored" wall).
- **The build's honest-GREEN escalation no longer glues a STALE diagnosis to a fresh failure (`cycle-record.ts`).** When self-heal rounds are exhausted, the HIL escalation carried the last-recorded Navigator diagnosis blended with the current verify summary. If the failure MODE changed since that diagnosis (a repair exposed a different break, or – observed – a sandbox-blocked driver re-raised without a fresh diagnosis), the two contradict (e.g. an "e2e 500" diagnosis on a "client Vitest failed" summary). The escalation now includes the diagnosis ONLY when its recorded `summary` matches the current verify's; on a mode change it drops the stale diagnosis and says "the failure MODE changed – re-diagnose from the current failure." (2 guard tests.)
- **Stale-experiment guardrail: a build experiment whose design was re-authored under it is re-cut, not reused (`nextBuildAction` + new `design-fingerprint.ts`).** Sending a story back to design with `withdraw-gate` + `set --status designing` (instead of `revise` / `consort-reopen-story`, which discard the experiment) left the experiment active, so the rebuild REUSED it and rode the abandoned design's code/tests into the accept-merge – surfacing as unrelated failures cycles later, with no gate flagging it. The experiment is now stamped at cut time with a fingerprint of its design (test-list content); when the story's current design fingerprint no longer matches, the derivation flags the experiment STALE and `nextBuildAction` re-cuts a fresh one off the feature branch (reset-stale-branch), exactly as for a discarded experiment. So ANY back-to-design path – including the manual hand-surgery – can no longer merge superseded artifacts. Backward-compatible: an experiment cut before this guardrail (no stamped fingerprint) is never falsely flagged. (10 tests: 4 routing + 6 fingerprint/storage.)

### Changed

- **`/consort:start` resume: the newer-kit upgrade offer is now a non-skippable step, surfaced BEFORE any diagnosis (`start.md`).** When `consort-check-update` reports a newer version, the resume flow must relay it and offer the upgrade first – even when a build blocker/escalation is open (the newer kit may be the fix). The prior wording let an open blocker draw attention and the upgrade offer get dropped.

## [0.3.61] - 2026-08-29

### Fixed

- **Repoint `@databricks-solutions/lakebase-scm-utils` `#v0.2.17 -> #v0.2.18` – complete the migrate-before-serve e2e fix by pinning the served DB.** v0.2.17 made the scaffolded Playwright backend `webServer` run `alembic upgrade head && uvicorn …` (migrate-before-serve, no reuse), but the `webServer` command does not inherit the shell `DATABASE_URL`, so `alembic` could migrate a different database than `uvicorn` served – leaving the served schema missing a story's new table (the reconcile 500). The scaffolded `client/playwright.config.ts` now forwards `DATABASE_URL` and `VERIFY_DATABASE_URL` into the backend `webServer` env when set, so migrate + serve resolve the SAME DB.
- **The build's honest-GREEN verify now isolates the client/E2E pass on an ephemeral child branch, like the backend passes.** `ensureDeployedAndVerify` already forked a throwaway child off the experiment branch for the two marked backend pytest passes (`VERIFY_DATABASE_URL`), but the client-only pass – which runs the appended client Playwright E2E block, and that block boots a real backend that exercises the DB – ran in place against the SHARED experiment branch. So one build turn's e2e writes bled into the next turn's verify (cross-run state on the shared branch), and a server started before a later story's migration served a stale schema. The client pass now routes through the same `runVerifyMaybeEphemeral` wrapper, so every client-E2E verify gets a pristine DB at the committed schema; the child is deleted after (opt-out `LAKEBASE_CONSORT_EPHEMERAL_VERIFY=0`; falls back in-place when no experiment branch is bound). This isolates ACROSS verifies; a suite that piles up rows WITHIN one run without per-test cleanup remains the suite's own concern. Internally, an injectable `verifyBranchOps` seam (threaded `CycleVerifyArgs -> runVerifyMaybeEphemeral -> withEphemeralVerifyBranch`) makes the fork path hermetically testable; new guard tests assert the client pass forks with `VERIFY_DATABASE_URL` set and falls back in-place with no branch bound.

## [0.3.60] - 2026-08-29

### Fixed

- **Repoint `@databricks-solutions/lakebase-scm-utils` `#v0.2.16 -> #v0.2.17` – two connection/e2e-harness fixes.** (1) The `application_name` connection label now reaches the PRIMARY pooled path: `createLakebasePool` (used by schema-diff / reconcile-tier) silently dropped a passed `application_name`, so those connections were unlabeled; scm-utils now sets `PGAPPNAME` (which node-postgres honors) so the pooled connections land in `pg_stat_activity` as `consort/<version>` / `scm-utils/<version>` (live-verified). (2) The scaffolded Playwright `client/playwright.config.ts` backend now runs `alembic upgrade head && uvicorn …` with `reuseExistingServer: false` – previously it reused a uvicorn started before a later story's migration, serving a STALE schema (GET ok; a write to the new table 500'd) and reuse skipped any migration; every e2e run now gets a fresh, migrated backend. The frontend keeps reuse (no schema). NOTE: `consort-upgrade` won't clobber an existing project's `playwright.config.ts` (idempotent), so this benefits future scaffolds; an existing project applies it by re-scaffolding the client config or hand-editing.

## [0.3.59] - 2026-08-29

### Added

- **Transparent `application_name` on the substrate's Postgres connections (via `@databricks-solutions/lakebase-scm-utils` v0.2.16).** The pg connections the substrate opens (branch-schema diff, connection ping) now carry `application_name = consort/<consort-version>` when made under a Consort run, or `scm-utils/<scm-utils-version>` when scm-utils is used directly (the VS Code extension, a bare `lakebase-*` CLI). A transparent label – visible to the database OWNER in their own `pg_stat_activity` – identifying which tool + build connected, reading no table contents. Consort stamps its brand by exporting its own version: new `exportConsortVersionEnv()` (config/kit-bin.ts) sets `CONSORT_VERSION` from `kitVersion()` (idempotent – never overwrites an outer run's value – and skips an unresolved version), called at the connection-leading entry points (`consort-drive`, `lakebase-create-project`, `lakebase-adopt-consort`); child processes inherit it. scm-utils reads that env to pick the `consort/` brand, else falls back to its own `scm-utils/` brand. Re-pinned scm-utils `#v0.2.15 -> #v0.2.16`. Tests: `export-consort-version-env.test.ts` (3); scm-utils `application-name.test.ts` (5).

### Fixed

- **`bootstrap.sh` now checks for `uv`, reported as an advisory (not a blocker) – consistent with the JDK.** `uv` is required for the Python project path (every install/test/migrate/run is `uv run`, and pr.yml sets it up only when the detected language is python), but a Node project uses npm and a Java project Maven. `bootstrap.sh` has no `--language`, so – exactly like the JDK – a missing `uv` is reported as an advisory that does not fail the run (failing would block a Node/Java author who needs no `uv`). Probes `uv --version`, offers `brew install uv`, and advises if still absent. `uv` is also why the system-`python3` floor is moot for a Python project: `uv sync` builds the project's venv on its own interpreter regardless of the system `python3` version. Test: `bootstrap-prereqs.test.ts` (+2).

## [0.3.58] - 2026-08-28

### Fixed

- **`consort-upgrade` no longer ships the literal `{{LAKEBASE_SCM_UTILS_VERSION}}` placeholder into a project's CI workflows.** `refreshSurface` copies `.github/workflows` with a raw recursive `cpSync` and – unlike the initial scaffold (scm-utils `substituteWorkflowPlaceholders`) – never substituted the `{{LAKEBASE_SCM_UTILS_VERSION}}` placeholder. So every upgrade re-shipped the literal into `pr.yml`/`merge.yml`, and the CI ref fallback `${SCM_UTILS_REF:-v{{LAKEBASE_SCM_UTILS_VERSION}}}` then broke: bash closes the parameter expansion at the FIRST `}` of the unsubstituted `}}}`, leaking `}}` into the emitted value (`SCM_UTILS_REF=v<ver>}}`), so the next step's `npx github:databricks-solutions/lakebase-scm-utils#<ref>}}` could not resolve the ref – the "Detect project language" step exited 1, build-and-test failed, and `wait-ci` exited 3 (this had bitten CI before this was traced). `refreshSurface` now resolves the scm-utils version from consort's OWN dependency pin (`#v<version>` – not the kit's own version, which walking up the template tree would wrongly yield) and substitutes the placeholder in the copied workflows, so an upgraded project's workflows are as valid as a freshly-scaffolded one. Test: `upgrade-e2e-rewire.test.ts` (+1, asserts no literal placeholder survives and the value is a clean `${SCM_UTILS_REF:-v<version>}`).

## [0.3.57] - 2026-08-28

### Fixed

- **`bootstrap.sh` no longer reports a green environment it cannot actually run on.** (PR #188, antonyprasad-db.) Three prerequisite checks could pass while the tool was present-but-unusable. The Python check only tested that `python3` existed, never its version, so macOS's system 3.9 satisfied a floor CONTRIBUTING documents as 3.10+. The JDK and Node checks offered `brew install openjdk@17` / `node@20`, both **keg-only** formulas: brew installs them without linking them onto PATH, so `java` / `node` still failed immediately afterwards, and because a successful install made `offer_brew_install` return 0, `MISSING` stayed at zero and the script exited 0 ("All required tools are present") with no working toolchain. Every check now judges the **end state** rather than the installer's exit status: after any remediation it re-probes the tool and only counts it present if it actually resolves. Keg paths resolve via `brew --prefix` (falling back to the well-known prefixes, linuxbrew included) instead of two hardcoded macOS locations, and a detected keg-only install prints the exact `export PATH=...` line for the user's real shell rather than dead-ending. Also folded three hand-rolled version idioms into one `version_at_least` helper and added the JDK 17 floor that CONTRIBUTING promises but nothing enforced (a JDK 8 previously passed green). The JDK is reported as an **advisory, not a blocker**, matching `consort/lakebase/create-doctor-gate.ts`: it gates creation only for java/kotlin, and `bootstrap.sh` has no `--language`, so failing the run would block Python and Node authors who need no JDK at all. Advisories print on both the success and failure paths so a broken JDK is never a silent green. Test: `tests/bdd/bootstrap-prereqs.test.ts` (+8).
- **The provisioning doctor now enforces the documented Python 3.10 floor (via `@databricks-solutions/lakebase-scm-utils` v0.2.15).** PR #188 flagged that the doctor which actually gates provisioning had the SAME Python gap as `bootstrap.sh`: its prereq spec was `minMajor: 3`, which can only express "some Python 3", so a 3.9.6 interpreter printed `[doctor] environment ok` while the hint promised 3.10+. Fixed in scm-utils v0.2.15 (a new `minMinor` field on the prereq spec; python is now `minMajor:3, minMinor:10`, so `checkPrereq` warns when the major matches but the minor is short) and re-pinned here (`#v0.2.14` -> `#v0.2.15`). Both env-doctor fixes – the bootstrap script and the provisioning gate – now ship together.

## [0.3.56] - 2026-08-28

### Added

- **Cross-story field-contract check – the design lane now catches a later story adding a required field an earlier user-submit path never supplies (the actor-not-sent defect at its root).** Diagnosed from the live run: F4's `S4-record-audit-metadata` (an *auditor* story) correctly authors backend `API` ACs and mandates `actor` NOT NULL (`PI2`), while the sibling `S2-submit-valid-pick` owns the operator's form-submit (it has a real E2E AC) but captures only SKU/quantity/location – so the required `actor` column has NO client path to fill it and the real form 422s. This is a MISSING-SUPPLY (field-contract) gap, not a contradiction, so navigator reflect check #8 (opposite-outcome test) sailed past it, and it is NOT a per-story authoring flatten (so a spec-author advisor would not see it – S4 is legitimately backend). The cross-story reviewer already had every sibling story's ACs in context; it was only missing the mandated-fields signal. `buildCrossStoryContext` now surfaces `required_persistence_fields` – the architecture's `not_null` persistence invariants (deterministic, curated, off `architecture.json`) – and navigator reflect gains **check (9)**: a mandated field written through a user submit must be SUPPLIED by that submit's AC; if the sibling that owns the submit path doesn't capture it, flag `owner:"spec-author"` (extend that submit AC, or re-slice so one story owns capture->record). The deterministic half (`required_persistence_fields`) makes the review concrete; the one semantic step (which sibling owns the submit) is the navigator's, and it has the sibling ACs to make it. Reuses the existing cross-story infra – no new gate, no fan-out. Test: `cross-story-context.test.ts` (+1). GOTCHA recorded: the run's `db-design.json` had EMPTY `schema_changes[]`, so per-story column attribution via schema-changes is unreliable; the architect's `not_null` `persistence_invariants` are the dependable mandated-field signal.

## [0.3.55] - 2026-08-28

### Added

- **`requires_e2e` – a HUMAN-authoritative, per-story spec-gate lever that forces a client-facing story to carry an E2E AC (flatten-proof).** v0.3.54's `checkE2eLayerPresent` is FEATURE-wide, so a sibling story's E2E AC satisfies it – it cannot catch a single story the design lane collapses into a backend "the record is saved" API AC when other stories already carry E2E work. Observed live: a browser-submit story flattened into an `API` AC on THREE successive attempts (appended note, premise rewrite, and v0.3.54's sharpened agent instructions all overridden), because every signal we can steer with is agent-derived – the AC layer tags, the architect's `renders_via`, prose in story.md – and the design lane flattens its own classification. `requires_e2e` (optional boolean on `story.json`, added to the schema) is set by the HUMAN/PO, so the design lane cannot override it: a story with `requires_e2e: true` and no `layer:"E2E"` AC HARD-BLOCKS the spec gate (`storyRequiresE2eReason`), fail-closed, both at the per-story approval (`approveStoryGateFromDisk`) and as a feature-wide backstop in the spec gate. It does not force the Spec Author to author the AC – it makes the system fail-closed and hands the human a lever, so a flattened spec halts at the gate (and, after the revise budget, at HIL) instead of opening on a form the browser can never exercise. `spec-author.md`: a UI-interaction story must carry a client-facing AC and set `requires_e2e`, never flatten it to a backend record. Test: `consort-e2e-layer-presence.test.ts` (+6, incl. an end-to-end proof through `approveStoryGateFromDisk`).

## [0.3.54] - 2026-08-28

### Fixed

- **The spec gate now hard-blocks a client-facing feature designed as all-backend (`checkE2eLayerPresent`).** `checkE2ECoverage` (v0.3.48) only bites once an AC is tagged `layer:"E2E"`, so a design lane that mis-classifies every client-facing AC as `API`/`Infra` produces a feature with ZERO E2E ACs that satisfies the coverage guard vacuously – exactly how the actor-less pick form shipped, and it recurred even after the story premise was rewritten to "the operator submits the form in the browser" (the Spec Author flattened it into a backend "the pick is saved" API AC). The new `checkE2eLayerPresent` cross-checks TWO client-facing signals against the AC-layer evidence and requires ≥1 `layer:"E2E"` AC: (1) the architect's own `boundary.renders_via` declaration, AND (2) the architect-INDEPENDENT project signal – a React UI-track project (`consort-config.json`) with an `API`-layer AC. Signal 2 matters because the same mis-classification that drops the E2E tags can also drop `renders_via`, so keying only on the architect's declaration lets the failure dodge the net. It mirrors `checkServiceBackedDeclaration` (structure cross-checked against evidence, not overridable prose) and defers until every declared story is designed (the streaming design lane). Feature-wide by design (no sound purely-mechanical per-story "client-facing" signal exists – the E2E tag IS that signal): it catches the systematic "whole UI feature as backend" case with no false positives. Test: `consort-e2e-layer-presence.test.ts` (11).
- **Design-lane instruction hardening for the same defect class.** `architect-reviewer.md`: the E2E-classification rule now names the exact trap – an outcome phrased "record WHO performed the action", entered on a form with no auth, IS a client form submission (`layer:"E2E"`), not a backend/authenticated-identity concern; and `## Out of bounds` NFR items are a HARD NEGATIVE constraint (no AC/architecture may REQUIRE an excluded capability – "no authentication for V1" means the actor is a form field, never a derived authenticated identity). `spec-author.md`: same `## Out of bounds` discipline – never flatten a browser-round-trip premise into a backend AC.

### Changed

- **Docs true-up (no behavior change):** `scm-workflow-state.md` prepare-pr guard now lists the current `RUNTIME_ARTIFACT_IGNORE` set (`.consort/` + `.sftdd/` + `.tdd/` + `.lakebase/` + `.claude/agent-memory/`, was the stale `.sftdd/` + `.lakebase/`); `workflow-state-machine.md` reflects the E2E-coverage/E2E-presence gate teeth (test_list + spec) and that a UI deploy-verify runs the client Playwright E2E; `reopen-story` CLI `-h` text now matches the full accepted-story reset (v0.3.53).

## [0.3.53] - 2026-08-27

### Fixed

- **`consort-reopen-story` now reopens a DONE + merged + ACCEPTED story in one command.** Reopening a story for genuine re-design cleared its design artifacts (ACs / test-list / reflect-verdict / plan + `story.json.acs[]`) but left the *pipeline* entry untouched – so for a story the feature had already accepted, the entry stayed `status: done` + `acceptance: accepted`, `deriveFeaturePhase` kept reading the feature as complete, and the drive routed to DEPLOY instead of re-dispatching the Spec Author. The only workaround was to hand-compose four primitives (reopen-story + set-status + rebuild-story + withdraw-gate), which lands the run in an inconsistent state. `reopenStoryForRedesign` now also (1) resets the pipeline entry to a bare `{ status: "designing" }` – dropping the spec gate, the experiment record, AND the acceptance in one write – and pulls the story off `build_queue`/`build_active`; (2) clears the feature `deploy-evidence.json` so the stale deploy gate evaporates and the feature re-deploy-verifies after the rebuild; (3) clears the coarse `phase` + its owner in `workflow-state.json` so the drive re-derives design/build from the (now-reset) artifacts (the FEIP-8022 un-owned re-derive path). Everything is backed up first. The one thing it cannot clear is the actual git/Lakebase experiment *branch* (a live external resource); the CLI prints that as the remaining manual step so it is never silently stranded. Idempotent and safe for a not-yet-accepted story. Test: `tests/bdd/reopen-story.test.ts` (+1).

## [0.3.52] - 2026-08-27

### Fixed

- **Kit upgrade no longer strips (and now retrofits) the Playwright E2E block from a UI project's deploy-verify.** `refreshSurface` resets `scripts/run-tests.sh` to the kit template, which carries **no** E2E block (the block is appended per-project by `enableE2eForProject`, never shipped in the template). So every `consort-upgrade` silently wiped a UI project's client-E2E out of the deploy-verify gate, and a project scaffolded before enable-e2e-by-default never had it – the gate then never ran the client Playwright suite. That is exactly how F4's actor-less pick form (the browser can't record a pick) shipped past a **green** deploy-verify, caught only by an out-of-band review. `refreshSurface` now re-appends the E2E block for a UI project (`uiTrack`/`clientFramework: react`) via the idempotent `enableE2eForProject` after the scripts copy, so an upgraded UI project's deploy-verify runs the client Playwright E2E. The `run-tests.sh` change is committed by `commitRefreshedSurface` (v0.3.49). Pairs with v0.3.48's `checkE2ECoverage` (which requires the happy-path E2E to *exist*): the test is now both authored **and** executed at the feature gate.

## [0.3.51] - 2026-08-27

### Added

- **One-time install marker (beacon).** On first run, `/consort:start` sends a `consort.install` beacon carrying only a **random install id + kit version + timestamp** – so the maintainers can count installs. It is **disclosed in the briefing** and sent **once per install** (idempotent via a `beacon_sent` flag), **regardless of the ongoing-telemetry opt-out** (it records only that Consort was installed somewhere; the opt-out still governs all run/gate/turn telemetry). A total kill (`CONSORT_TELEMETRY=0`) suppresses it too. New `consort-telemetry beacon` subcommand (fired by the briefing after disclosing it); best-effort, never blocks, marks `beacon_sent` only on a successful send so an offline first run retries until it lands once. Server (consort-telemetry-ingest): new `telemetry.installs` table (`install_id` PK, `version`, `first_seen`) + ingest route + SP grant. Disclosure added to TELEMETRY.md + start.md.

## [0.3.50] - 2026-08-27

### Added

- **Telemetry L1 `fail_class` + `revise_class` (the "why" categories).** `fail_class` (the categorized signature of a failed/aborted gate) was declared but never populated and was Level-2-only; it is now **wired + promoted to L1** – classified into a closed enum from the action's reason/source (never the error text) whenever a gate fails/aborts. New **`revise_class`** (also L1) classifies why a `revise-route` re-routed (`nfr-coverage-gap` / `e2e-layer-misroute` / `invariant-leg-missing` / `ac-independence` / `test-list-drift` / `migration-reversibility` / `other`), turning the L1 `revise_rounds` count into a reason. Both are closed CATEGORY enums – no free text ever reaches a span. So the DEFAULT telemetry now answers not just *where* time goes (role × phase) but *why* runs fail / re-route.
- **Telemetry L2 `phase` on the `consort.turn` span.** The per-turn span carried `role` but not `phase`, so model/effort couldn't be attributed to a phase (build roles multiplex red/green/review/assess/refactor). The turn span now carries `phase` (same closed enum as the gate span), making the L2 view a clean `GROUP BY phase, role, model`.

Server (consort-telemetry-ingest): `telemetry.gates` gains `revise_class`, `telemetry.turns` gains `phase` (both idempotent `ADD COLUMN`), and the ingest INSERTs carry them. `fail_class`'s gate column already shipped in v0.3.44.

## [0.3.49] - 2026-08-27

### Fixed

- **The drive's on-resume kit-drift resync now commits its refreshed surface, so the next fork sees a clean tree.** `resyncAgentsOnKitDrift` re-writes `.claude/agents` when the running kit drifts from the last-synced version, but left them uncommitted – so the run's next experiment/feature fork REFUSED (paired-branch rejects a dirty tree whose uncommitted tracked changes would ride onto the new branch). This is the same fork-refuse class v0.3.46 fixed for `consort-upgrade`, but triggered by the drive's OWN resync – e.g. after a `git checkout` of the feature branch drifts its committed surface (an older kit version) from the run pin, the drive re-refreshes the agents on resume and, previously, stranded them uncommitted. The resync now commits the refreshed surface via `commitRefreshedSurface` (no-op outside a git repo; never throws).
- **The per-turn-open force test no longer launches the developer's real editor.** The v0.3.47 `LAKEBASE_CONSORT_OPEN` test resolved a fake editor via a fixture `PATH`, but `spawnSync` resolves against the real `process.env.PATH` – so it opened the temp fixture files in the developer's actual editor on every release push (the pre-push suite runs locally). `reportRoleOpen` now takes an injectable `spawn` (production behavior unchanged – the poll-once/tail callers never pass it) and the test injects a `vi.fn()`, so no subprocess launches.

## [0.3.48] - 2026-08-27

### Added

- **`checkE2ECoverage` – a deterministic gate that a client↔server-contract AC has a REAL e2e, not a mocked component test.** An AC tagged `layer:"E2E"` (the client rendering an outcome derived from a real server response – a validation rejection shown inline, a success confirmation, an error state) now HARD-BLOCKS the test_list gate unless the test-list holds a Playwright e2e for it (`scenario_file` under an `e2e/` path). A mocked component test alone no longer passes: it stubs the response envelope, so a fabricated shape goes green while the real wire contract drifts – the recurring S2/S3 inline-error defect (the client mocked a flat `{quantity}` body; the backend sent `{detail:{quantity}}`, so the form rendered nothing against the live API). This turns test-strategy.md's long-standing E2E rule from prose the supervisor was asked to catch into an enforced gate condition (`gate-conformance-guard`).

### Changed

- **Architect classifies client↔server-render ACs as `layer:"E2E"`.** `architect-reviewer.md` now carries an explicit rule: an AC whose observable outcome is the client rendering something derived from a real server response is a client↔server contract and MUST be `E2E` (never `API`, which tests only the server half, and never a pure-presentation tag). This is the classification that routes such ACs into the E2E coverage gate above. `test-strategist.md` notes the E2E rule is now deterministically enforced.

## [0.3.47] - 2026-08-27

### Fixed

- **Per-turn artifact open now resolves the LIVE feature/story (the reason nothing ever opened).** `consort-watch`'s per-turn open scoped the review artifacts from `workflow-state.json`, whose `feature_id`/`story_id` are `null` during a design/build drive (its `phase_feature_id` also drifts stale) – so the scope resolved empty and EVERY turn reported "no reviewable artifact for this scope" and opened nothing, regardless of editor. New `resolveScope` reads the drive's authoritative per-turn snapshot `next.json` (`feature` + `state.stories`), picking the freshest mid-design story (the one the finishing role just wrote into), and falls back to `workflow-state.json`. Verified against a live run: spec-author now resolves 7 artifacts, architect 2, test-strategist 3, navigator 2 (previously 0).

### Added

- **`LAKEBASE_CONSORT_OPEN=1` force-opens per-turn artifacts from a background monitor.** The open otherwise fires only when `consort-watch` runs inside the editor's integrated terminal (the `isInsideEditor` guard, so it never launches an editor uninvited) – but a Monitor-TOOL background task is not in that terminal. Setting `LAKEBASE_CONSORT_OPEN=1` (or `=force`) opts in: the editor CLI surfaces each file in the already-running instance regardless of the caller's terminal. A skipped design-role open now names this in its relay line. `commands/start.md` documents launching the monitor with it.

## [0.3.46] - 2026-08-27

### Fixed

- **In-flight kit upgrade now leaves a clean working tree.** `consort-upgrade` refreshes the scaffolded surface (`.claude/agents` + `.claude/commands` + `scripts` + `.github/workflows`) and re-pins `.lakebase/kit-ref`, but left those tracked files uncommitted – so the run's NEXT experiment/feature fork refused (`paired-branch` rejects a dirty tree whose uncommitted tracked changes would ride onto the new branch), stranding a mid-run bump with a `refusing to fork` error. `consort-upgrade` now commits that refreshed surface itself (`chore(kit): refresh scaffolded surface to <version>`, `--no-verify`), scoped by EXACT kit-owned path so it never sweeps in app code or the `.consort` corpus, and no-ops cleanly when there's nothing to commit or it's not a git repo. Matches the repo's own `chore: bump committed kit-ref` convention. (The raw `./scripts/lk --refresh` remains a fresh-install tool – use `consort-upgrade --pid <drive-pid>` to bump a live run.)

## [0.3.45] - 2026-08-27

### Fixed

- **Per-turn artifact open now fires in the design lane's actual relay.** The per-turn "open what the role just produced" (added in 0.3.43) lived only in `consort-watch`'s blocking-tail / `--monitor` loop, but the design lane is narrated through the mandatory POLL-ONCE `consort-watch --since` relay, which returns before that loop – so the open never fired during a normal run and artifacts silently never opened. It is now wired into the `--since` relay: on each finished role turn it opens EXACTLY what that role produced (new role→artifact map: spec-author→spec/ACs, architect-reviewer→architecture, dba→db-design, test-strategist→test-list, ux-designer→design-guide/ia, navigator→the reflected story), scoped to the live feature/story. A design-role open that is skipped is NO LONGER silent – it relays why (not inside the editor's terminal / no editor CLI / nothing authored yet); build (driver) turns stay quiet. Opening still only happens inside the editor's integrated terminal (visibility only, never launches an editor uninvited).
- **`consort-watch --monitor` no longer false-alarms exit-3 at benign turn boundaries.** The deterministic drive exits per turn and is re-run, so a gone pid is usually a benign boundary, not a crash. The monitor now classifies a gone pid by the next-action identity: advanced to a new action → exit 0 with a re-run hint; the SAME pending action with no stop recorded → the exit-3 crash alarm. Real stops (a gate / done / escalation via `next.json`) are unchanged.

## [0.3.44] - 2026-08-27

### Added

- **Cross-story design review (prevents the cross-story AC conflict).** The design lane reviewed each story in isolation, so a later story could author an AC that contradicts an earlier, already-gated story (e.g. rejecting a SKU that an earlier story's gated AC establishes stock for) – invisible until the build lane. New `consort-cross-story-context` CLI surfaces the feature's OTHER stories' ACs + the architecture's open decisions; the navigator reflect turn now checks this story's ACs against gated sibling ACs (and against open decisions) and, on a contradiction, records a spec-author finding that HOLDS the spec gate. The architect records/reconciles the decisions.
- **`open_decisions[]` in `architecture.json`.** First-class record of deliberately-unresolved boundary decisions, so a later story cannot silently resolve one in a way that breaks a sibling; the architect records them and reconciles when a later story settles one.
- **`consort-reopen-story` – reopen a story for genuine re-design.** `withdraw-gate`/`revise` leave a story's ACs on disk (so the drive just re-approves the stale spec); this backs up + clears the ACs/test-list/reflect-verdict and empties `story.json.acs[]` so `hasAcs` is false and the Spec Author is re-dispatched.
- **Telemetry L1 gate fidelity – `role` + `phase` on the gate span.** The default (L1) telemetry lumped every role turn under the coarse `gate:"invoke-role"`; it now carries the `role` + `phase` (both closed enums) of each invoke-role turn, so the default view attributes a run's duration to role × phase (where most of the time goes).
- **Telemetry L2 token cost split.** The `consort.turn` span now carries coarse `token_bucket_input` / `token_bucket_output` / `token_bucket_cache_read` bands – read-heavy vs write-heavy vs cache reuse.
- **E2E runs locally before CI for UI projects.** A UI project (React SPA client) now ALWAYS wires the Playwright E2E harness, so the LOCAL deploy-verify gate (which runs before `prepare-pr` -> CI) runs the client E2E – instead of CI being the first place E2E ever runs. Previously `enable-e2e` defaulted off, so a default-scaffolded UI project shipped its Playwright suite un-run until CI. Backend-only projects are unchanged (honor the flag; default off).

### Changed

- **Repair/loop dynamics promoted from L2 to L1.** `red_green_cycles`, `refactor_iterations`, `revise_rounds`, `selfheal_attempts`, `hil_escalations` are now on the DEFAULT level (aggregate health – "is the ensemble thrashing"), tallied on every run. Coarse project-shape counts + the per-turn cost span stay L2. The disclosure (`start.md` / `TELEMETRY.md`) is updated accordingly: L1 = WHERE the time goes (role × phase + loop dynamics); L2 = WHY a turn is costly (model/effort/token split) + the failure taxonomy.

## [0.3.43] - 2026-08-26

### Changed

- **Review artifacts now open per turn, as each role finishes – not batched at the gate.** `consort-watch` opens the reviewable artifacts a role just produced the moment its turn completes (keyed on the `turn-done` line), so a human sees what is going into the next turn instead of the whole set at once when a gate is reached. It opens ONLY what that turn touched (reviewable artifacts modified since the previous turn boundary), stays visibility-only (never blocks the drive; gates remain the only pause points), and is a no-op unless the watcher runs inside an editor (`isInsideEditor`). The old gate-boundary batch-open (`emitStop`/`emitNextStop`) is removed; `consort-open` still opens the full set on demand.

### Fixed

- **The silent telemetry precondition no longer leaks through the Bash tool-call description.** `start.md`'s "do NOT narrate" rule covered prose but not the tool-call *description*, which is equally user-visible – so the `status --json` check surfaced as "Checking telemetry requirements quietly". The command now requires a neutral description (no "telemetry"/"checking"/"quietly") for that check, so step 0 is truly silent on an already-acknowledged install.

## [0.3.42] - 2026-08-26

### Added

- **`consort-upgrade` – in-flight-safe kit upgrade.** A run is a sequence of `consort-drive` processes with HITL gates between them, and the kit version is bound at each drive launch, so the only safe moment to upgrade is *at a stop*. The command **quiesce-gates** (refuses unless no drive is provably running via `--pid` and the run is at a clean stop per `next.json awaiting_human`/`done`), refreshes the kit cache to the target, **dual-pins** `.lakebase/kit-ref.local` (run) + committed `.lakebase/kit-ref` (CI) in lockstep — fixing the committed-vs-`.local` drift that ran a stale kit under a resumed run — refreshes the full kit-owned surface (agents + commands + `scripts/` helpers + CI workflows, leaving the scm-utils `scripts/lk` shim + project config untouched), and prints the resume + rollback commands. Reversible: `consort-upgrade --rollback` restores the prior pins instantly (reversibility + upgrading only at a stop is the safety net, not a speculative version check). `start.md` documents the quiesce → upgrade → resume process.

### Fixed

- **A run's telemetry `outcome` now derives from its actual exit code (never `completed` on a non-zero exit).** Both `finish()` sites computed `outcome` separately from the exit code and neither mapped exit `2`, so a guard / empty-backlog / pending-input failure (exit 2) was recorded `outcome=completed` — a failed run logged as a success (observed on real installs). New `outcomeForExit` (`0`→completed, `3`→aborted, any other non-zero→error) is the single source; the feature path now captures its real exit code and derives both `outcome` and `exit_code` from it, so they can never disagree.

## [0.3.41] - 2026-08-26

### Fixed

- **The persistent watch monitor now alerts the instant the drive stops, instead of sitting at a gate for hours.** `consort-watch --monitor` skipped the pid-gone check and emitted only on a `[drive]` terminal marker in `drive-live.log` — but that log is transient and may carry no stop marker at all, so a marker-less drive-exit (a gate that wrote `next.json` but no `[drive]` line) left the monitor polling forever while `next.json` already said `awaiting_human`. It now tracks the authoritative `.consort/next.json` (written on every stop) + the drive pid: the moment the drive stops it emits `[consort-watch] DRIVE STOPPED …` + `HUMAN NEEDED: <prompt> — run: <enact>` and exits. `start.md` + the orchestrator-contract now say to pass `--pid` and never wait on a log marker.
- **`/plan` now labels its telemetry run `plan`, not `sprint`.** `/plan` is `consort-drive --sprint <s> --plan-only`, which enters `runSprintMode`; that path hardcoded `command: "sprint"` regardless of `--plan-only`, so a planning-only run reported `sprint` and `plan` never appeared. Now `command = args.planOnly ? "plan" : "sprint"`.
- **Re-running `--sprint` on a fully-shipped sprint reports complete (exit 0) instead of erroring (exit 2).** Once the last feature shipped and the SCM claim cleared, neither the own-workflow `done` derive nor `shippedBecauseLaterFeatureClaimed` recognized the shipped features, so the loop re-drove them and errored. New `shippedByClearedClaim`: a cleared claim + a fully-`complete` feature ⇒ shipped (the claim frees only at merge), so the sprint skips every feature and reports complete.

## [0.3.40] - 2026-08-25

### Fixed

- **A plain `--feature` drive now labels its telemetry by the feature's phase, not a hardcoded `build`.** `/design`, `/build`, and `/deploy` all invoke `consort-drive --feature <F>` with no phase flag (the drive derives the phase from disk), but the feature path hardcoded the `consort.run` `command` to `build` — so a design or deploy drive mislabeled as `build`, and the dashboard showed everything under `build`. A new `commandForFeaturePhase` maps the feature's derived phase (`design` → `design`, `build` → `build`, a fully-accepted `complete` feature → `deploy`; null/unknown → `build`) to the command; an explicit `--plan-only` / `--only` bound still wins. `runs.command` is `TEXT`, so no server change.

## [0.3.39] - 2026-08-25

### Fixed

- **The sprint umbrella run is now labeled `sprint`, not `build`.** `/consort:start` (`runSprintMode`) hardcoded the root `consort.run`'s `command` as `build`, so a whole-sprint run (planning + every feature drive under one root run) was indistinguishable from a single build-phase run on the dashboard. Added `sprint` to the `command` allowlist and emit it from the sprint path; the feature path is unchanged (a Tier-2 bound still maps to `plan` / `design` / `build` / `deploy`, and a full feature run still reports `build`). `runs.command` is `TEXT`, so no server change.

## [0.3.38] - 2026-08-25

### Added

- **Level 2 per-turn tuning telemetry (opt-in).** `consort.turn` spans now carry content-free tuning fields populated from the runner's per-turn meta: `model` (`opus`|`sonnet`|`haiku`|`fable`|`other`), `effort` (`low`|`medium`|`high`|`unknown`), `token_bucket` (xs–xl band of input+output tokens, cache reads excluded), and `retry_count` (context-overflow + transient retries). Still enums/counts/buckets only, never prompts or code.

### Fixed

- **Breakdown story.json heal + fail-fast.** `consort-pipeline sync-breakdown` heals each `story.json` from the authoritative `story.md` narrative, then fails fast (halts at design) if a stub still lacks `asA`/`iWantTo`/`soThat`, instead of the conformance gate detonating at feature-complete and blocking the next feature.
- **Sprint-stop next.json feature-scoping.** Once a feature is claimed, the sprint stop emits the feature-scoped snapshot so `awaiting_human` reads correctly at a real feature gate.

## [0.3.37] - 2026-08-25

### Fixed

- **`awaiting_human` is now the authoritative "a human is needed" signal.** The planning `author-requests` pause is modeled with empty `open_gates`, so every consumer (the driving session, a watcher, guidance) read it as "resume" and never surfaced it. `consort-next` / `next.json` now carries `awaiting_human: true` when the only way forward is a human decision (a gate, the backlog commit, or a per-story accept/discard/revise), and `false` otherwise. `start.md` + the orchestrator contract gate solely on `awaiting_human`, never `primary_action.kind` / `open_gates` which miss the backlog pause.
- **Gate authority is `consort-next` + pid, never the log.** `drive-live.log` is a transient per-process sink and must never drive a gate decision. The "is a human needed / what next" decision comes from `consort-next`; "did the drive stop" comes from the pid being gone.

## [0.3.36] - 2026-08-25

### Changed

- **Every command emits telemetry (was: `--feature` only).** Sprint mode (`/consort:start`, `/sprint`, `/plan`) now begins its own `consort.run`, wraps planning + each per-feature drive in `withTelemetry`, and finishes on every exit path, delivered by the detached sender. `consort-spike` emits its own `consort.run` with `command: "spike"`. A guard test fails the build if any `runDriver` is not telemetry-wrapped.
- **Sprint mode emits the authoritative next.json on every stop.** Parity with the feature path, so the driving session + extension have a deterministic on-disk signal instead of tailing the transient `drive-live.log`.

## [0.3.35] - 2026-08-25

### Fixed

- **Telemetry actually lands now: delivered via a detached sender that survives `process.exit`.** The emitter POSTed fire-and-forget in-process, and `consort-drive` calls `process.exit` immediately after finish, tearing down the in-flight socket before the request completes. `resolveSink` now returns a `detachedHttpSink` that spools to a temp file and hands it to a detached, `unref`'d background sender (`consort-telemetry-send`), which owns the POST with a 10s timeout. The drive exits instantly with no wait or latency, no blocking.

## [0.3.34] - 2026-08-25

### Fixed

- **Sprint-resume no longer hard-stops re-claiming an already-shipped feature.** Once a later feature (F2) is claimed, the single SCM workflow-state holds F2's claim, so deriving an earlier shipped feature's (F1) next-action never returns `done`. The loop re-claimed F1, tripping `already at feature-claimed for F2`, a hard stop that repeated on every relaunch. Now a later backlog feature holding the claim proves the earlier one was released, so the sprint treats it as shipped and skips it.

## [0.3.33] - 2026-08-24

### Fixed

- **Local deploy-verify now runs the client Playwright suite.** The deploy gate's `run-tests.sh` only ran the project-root Playwright layout, skipping the full-stack project's SPA Playwright under `client/` (which CI runs as its own gated step), so local acceptance skipped the client E2E entirely. It now runs `cd client && playwright install chromium && playwright test --pass-with-no-tests`, mirroring CI.
- **Scaffold starter E2E is now a recognized supersession case.** The scaffold's throwaway starter spec (`client/tests/e2e/home.spec.ts`), which asserts the placeholder home page, is now explicitly flag-supersede-and-delete when the first story replaces that placeholder with real content. Left in place it asserts removed UI and fails CI forever.
- **Language-aware idempotent-seed UUID guidance.** UUID guidance across Navigator, Test Strategist, and behavior analyst is now language-aware, Python `uuid.uuid4()` / JS `crypto.randomUUID()` / Java `java.util.UUID`, never the `uuid` npm package (not a scaffolded dependency; fails CI).

## [0.3.32] - 2026-08-24

### Fixed

- **CLI-effect failures now surface to the watcher / Monitor.** A deterministic CLI effect (SCM steps `wait-ci` / `merge` / `prepare-pr`) that exits non-zero now rejects with a typed `CliEffectError`, recorded as a resumable escalation with a classified `[drive] RAISED TO HIL` halt line. Previously the reject fell to a bare, unprefixed line that `classifyDriveLine` skipped, so a session tailing `drive-live.log` never surfaced it. The last-resort catch also now emits a classified `[drive] ABORTED` line.
- **A staged brand asset must be declared as `app_icon`.** A brand asset staged under `.consort/design/assets/` with no `app_icon` in `design-guide.json` is now a UX Designer self-check violation (`brandAssetDeclared`), fixing the "built app doesn't incorporate the brand icon" gap.

## [0.3.31] - 2026-08-24

### Changed

- **`consort-next` surfaces the backlog command.** At the planning `author-requests` step, `consort-next` emits the exact `consort-sync-backlog --sprint <s> --features <id[,id...]>` command instead of a bare "resume", so a session reads the backlog-commit command off the authoritative surface.
- **`consort-watch --monitor` (persistent Monitor mode).** For the Monitor tool: follows the log across the drive's mid-turn silences AND its turn-by-turn re-runs (truncation-aware), stopping only at a real terminal marker, unlike a `--pid`-bound follow which exits when that process dies.
- **Test-strategist fan-out provisioning + coverage completeness.** The serial reflect whack-a-mole was rooted in under-provisioned analysts; the first-pass list is now complete, with the behavior analyst covering infrastructure-layer ACs' observable behavior and boundary validation, the client analyst owning client-render NFR fitness functions, the fitness analyst covering every leg of multi-column invariants, and the supervisor ensuring every NFR with a `fitness_function` gets a covering test.

## [0.3.30] - 2026-08-24

### Fixed

- **Measured watch liveness (relay, never infer).** `consort-watch` poll-once returns measured `silent_for_s` (log mtime) + `pid_alive` (pid probe). The rule: relay these numbers, never infer a "hung" verdict from a long silence, since one model call is silent until it returns.
- **Reflect-loop root cause fixed at the spec gate.** A `create_table` attributed to a pure UI/E2E shell story (no API/Infra AC) is now hard-blocked at the spec gate as a deterministic db-design error (`checkSchemaChangeStoryRealizes`), instead of the fitness tests anchoring to the shell story and getting bounced through the whole design lane.
- **Self-documenting escalations.** Each escalation record is stamped with `how_to_resolve`, and `consort-next` emits a structured `resolver` + hint pointing at `consort-resolve-escalation --id <id> --resolution "<why>"`, which clears the escalation AND any blocking smell and keeps the audit trail.

### Changed

- **Standalone IDE-terminal gate.** `/consort:start` surfaces the "move to the editor + live viewer vs keep driving here" choice as its own hard gate, on a fresh project OR a resume, and skips it when the session is already inside the IDE terminal.

## [0.3.29] - 2026-08-24

### Changed

- **Poll-once is the single mandated relay.** `./scripts/lk consort-watch --since <cursor>` returns immediately with new transitions + a `cursor=<N> status=<…>` trailer. A blocking `consort-watch` (any `--timeout`) run as a Bash call buffers and shows nothing until it returns, so it is now forbidden; `--timeout 0` is documented as Monitor-tool-only. No hand-rolled `tail -f | while read; case`.

### Fixed

- **Auto-open artifacts on any late attach.** When a fast detached drive wrote its terminal marker and exited before the watch attached (following from EOF), the watcher now scans the log for the real last stop of any step and reports it, opening the review artifacts at a gate/pause, instead of a false exit-3 "unclean exit".
- **Silent telemetry step 0.** `/consort:start` never narrates "checking telemetry"; on an already-acknowledged install it emits nothing and proceeds.

## [0.3.28] - 2026-08-24

### Changed

- **Live, timeout-proof create (Part 1).** `lakebase-create-project --detach` re-launches scaffolding in its OWN session (setsid via `spawn(detached:true).unref()`) and returns immediately, capturing `[doctor]` + every `[stage]` line + the final JSON to a log the caller relays poll-once. Create now runs from the plugin's own binary, not `npx`, which used to re-download the whole kit just to run create.
- **Live, timeout-proof kit download (Part 2).** Requires scm-utils v0.2.13: the scaffolded `lk` streams npm's per-package install progress and supports `./scripts/lk --refresh --detach`.
- **`start.md` updated.** Explicit "Part 1 does NOT download the toolkit" directive; swept every `--refresh` to `--detach` + poll-once; `$CLAUDE_PLUGIN_ROOT` resolved with a plugin-cache fallback.

## [0.3.27] - 2026-08-24

### Fixed

- **Plugin-binary resolution without `$CLAUDE_PLUGIN_ROOT`.** `$CLAUDE_PLUGIN_ROOT` is not reliably exported into the Bash tool shell, so the telemetry briefing and create-relay hard-failed. Both now resolve the plugin's shipped `dist/` via `$CLAUDE_PLUGIN_ROOT` when set, else the plugin cache (`~/.claude/plugins/cache/databricks-solutions/consort/<newest>/`).

### Changed

- **Reworded telemetry offer.** Leads with what it is; three uniformly-structured replies with opt out last; the accept-the-default reply is **ok** (telemetry is on by default). Level 2 framed as the biggest favor to the project.

## [0.3.26] - 2026-08-24

### Added

- **Create relay (heartbeat + poll-once).** The `npx` git-fetch of the kit is silent for ~1-3 min. A new `scripts/consort-create.sh` wrapper prints an elapsed-time heartbeat during the fetch, then forwards create's `[stage]` lines. `start.md` launches via `consort-create.sh` backgrounded to a log and relays it poll-once with `consort-watch --since`, instead of a foreground tail loop the harness buffers.

### Fixed

- **Telemetry-briefing persistence fix.** The `/consort:start` briefing runs before the Create/Resume branch, so on a fresh install there is no `./scripts/lk` yet and every persist call silently failed. The briefing now invokes the plugin's own telemetry binary, records the choice by actually running the command, and confirms the write landed before continuing.

## [0.3.25] - 2026-08-24

### Added

- **Launch durability (`consort-drive --detach`).** Re-launches the drive in its OWN session (setsid via `spawn(detached:true).unref()`) and returns immediately. A `nohup … &` leaves the drive in the tool call's process group, which the harness SIGTERMs on turn-end; `--detach` escapes that group.
- **Live relay (one relay for drive / create / refresh).** `consort-watch --since <cursor>` poll-once returns immediately with new log lines + a `cursor=<N> status=<running|gate|pause|escalation|done|waiting>` trailer. The classifier now relays create `[stage]` lines and refresh `lk:` lines too. `lakebase-create-project --progress-log <path>` tees stage lines to a caller-owned file for the same poll-once relay.
- **Telemetry briefing at `/consort:start`.** New `acknowledged` gate (distinct from config existence) + `consort-telemetry ack`. The Level-1 opt-out and Level-2 opt-in are disclosed where the human can read them, gated on `acknowledged=false`, instead of a stderr notice that only fired once inside `consort-drive`.

## [0.3.24] - 2026-08-23

### Fixed

- **The driver self-writes `.consort/drive-live.log`** – visibility no longer depends on how it's launched. It used to rely on the caller's `> .consort/drive-live.log` redirect, so detaching the drive (e.g. as a harness background task) diverted its output and `consort-watch` followed an empty log. The drive now tees its stderr narration to that file itself. Launch **detached** (`nohup … >/dev/null 2>&1 &`) – do NOT redirect to `drive-live.log` (double-writes).
- **`consort-watch` surfaces the `[consort]` telemetry disclosure (L1/L2 briefing).** The classifier returned null for non-`[drive]`/`[sprint]` lines, so the one-time notice landed in `drive-live.log` and the narrator silently dropped it – the human was never briefed despite the contract requiring it. Now surfaced verbatim (first line + indented continuation). + guard test.
- **`consort-watch --timeout` (default ~90s)** – a bounded, resumable foreground wait, so a watcher can't exceed the harness's ~2min bash timeout (whose SIGTERM had killed a same-group drive). Prints "still running" and exits 0; re-run to keep watching.
- **`/consort:start` take-stock uses `consort-next` as the authoritative state.** `workflow-state.json`'s `phase` is a coarse per-project slot that only advances during a FEATURE drive, so it reads `discovery` through planning; treating it as the source of truth misreported a planning-done project.
- **Extension install uses a fresh temp dir.** The snippet reused a fixed `/tmp/consort-ext` with `--clobber`, so a stale older `.vsix` lingered and `--install-extension *.vsix` could pick the wrong version ("two versions came down"). Now downloads into a fresh `mktemp -d` and installs the newest.

### Changed

- **`reviewArtifacts` now covers the full artifact channel, enforced.** Expanded to the complete authored set (product-overview, nfrs, ia.md, design-guide.md, test-list.md, estimates.json, …), and a test derives the artifact-channel outputs from the step manifests and **asserts `reviewArtifacts` opens every one** – so the editor-review set can never drift from what the roles actually write.
- **Repointed to `@databricks-solutions/lakebase-scm-utils` v0.2.12** – `lk` now prints an install heartbeat during a backgrounded `--refresh` (npm's progress is TTY-gated, so the log otherwise sat silent for 1-2 min).

## [0.3.23] - 2026-08-23

### Added

- **`consort-watch` – a live drive-log narrator.** Follows a backgrounded drive's `.consort/drive-live.log`, relays each phase/role/gate transition in plain language as it lands, and STOPS at a gate / pause / escalation / run-end (exit 3 on escalation). Replaces the brittle hand-rolled `tail -f … | while read; case …` monitors; the classifier owns the drive's line formats. Wired into `sprint.md`, `/consort:start`, and the orchestrator contract; opens the review artifacts (below) at a gate.
- **`consort-diagnose` – failure analysis + a redacted, shareable bundle.** On an escalation it ANALYZES the failure (class + real reason/assertion + a suggested remediation to attempt) and bundles the local forensics (escalations, green-failures, workflow-state, log tails) into `.consort/diagnostics/<ts>/`. The bundle is AUTO-REDACTED (DSN passwords / `dapi…` tokens / `Bearer` headers / secret assignments / home-path usernames masked) before it can be shared; the terminal analysis stays full-fidelity for local troubleshooting. Sharing is manual + consented (attach to a consort issue), never auto-uploaded.
- **`consort-resolve-escalation` – clear a HIL halt the supported way.** Stamps `resolved_at` on escalation FILES (keeps the record, never `rm`) AND marks blocking SMELLS `cleared` – the dual-source rule – so a smell-derived halt (e.g. a reflect-gate defect) is clearable without hand-editing `smells.json`. The driver then retries the failed action fresh.
- **`consort-open` – open the role artifacts in the editor for review.** Opens the feature-spec / architecture / db-design / test-list / story + ACs in Cursor/Code when the session is inside the editor (else prints paths; never launches one uninvited). Driven both by `consort-watch` (at a gate) and directly.

### Changed / Fixed

- **Telemetry is captured whenever Consort is used** – the `isTTY` consent gate is gone (an agent-driven run is non-TTY yet fully human-driven; the gate silently suppressed telemetry for the primary usage). Disclosure fires regardless of TTY, and the first-run notice now presents the **Level-2 opt-in** as a way to help the maintainers.
- **Behavior-analyst no longer mis-routes backend tests onto E2E ACs.** Its prompt said "cover EVERY story AC with a behavior item," so it authored a backend pytest-bdd test even for a UI/E2E AC (the recurring reflect-gate bounce). It now covers only backend-layer ACs and never anchors a behavior/response-shape test to an E2E/UI AC (those are the client analyst's Playwright job).
- **Repointed to `@databricks-solutions/lakebase-scm-utils` v0.2.11** – the scaffold's `deploy-targets.yaml` now ships a `migrate:` command so the deploy gate forward-migrates the served branch (no more `relation … does not exist` 500s on a green verify), and transient `.consort/drive-live.log` + `.consort/diagnostics/` are gitignored.

## [0.3.22] - 2026-08-23

### Fixed

- **Feature ids in the sprint proposal are now the canonical folder ids – the `/sprint` commit command is correct.** The Spec Author's `/plan` proposal must label each candidate with its `features/<id>/` folder id (`F<n>-<slug>`) and, when `feature-request.md` folders already exist (a staged first-project or a re-plan), REUSE those exact ids – never invent a fresh positional `## F1 — <title>` numbering. A positional label is a different id space from the folders, so `consort-sync-backlog` (which matches folder ids exactly) can't commit it (empty backlog) or, under a looser matcher, maps `F5` to the WRONG `F5-*` folder (e.g. a deferred `F5-cycle-count`). Two-sided fix: (1) `spec-author` propose guidance requires canonical folder ids; (2) the `/sprint` planning pause (`composeInputPause`) now validates the proposal's ids against the authored folders and pre-fills `--features` only with exact matches – when the proposal used non-folder labels it emits the placeholder plus a NOTE naming them, instead of a bogus contiguous `--features F1,F2,F3,F4,F5` that a run then mis-committed. Also corrected the stale "no `feature-request.md` exists yet" planning premise that led the Spec Author to ignore the staged folders.

## [0.3.21] - 2026-08-23

### Changed

- **Repointed to `@databricks-solutions/lakebase-scm-utils` v0.2.10** – its `run-tests.sh` now fails fast (before any backend/migration work) when client test files exist under `client/` with no `client/package.json` to run them, instead of silently skipping the client suite and greening client-owned ACs with zero coverage (a false GREEN that surfaced only as "the home screen doesn't exist" at the acceptance gate).

### Fixed

- **`/sprint` planning pause no longer mislabels a pre-seeded backlog as "author the feature-requests".** When `feature-request.md` files already exist on disk (a staged first-project, or a prior propose turn), the pause now reads as a COMMIT decision – it names the already-authored features, surfaces the Spec Author's proposed set, and prints the exact `consort-sync-backlog` command (pre-filled from the proposals) – instead of telling the human to author requests that already exist.
- **Navigator RED authoring rule for source-scanning fitness tests.** A config-in-env / no-hard-coded-DB-URL / ORM-only-import fitness test MUST scope its scan to the app source tree (never `rglob` the repo root, which descends into `.venv`/`site-packages` and matches a dependency's docstring DSN – unclearable, dead-locking honest GREEN into a HIL escalation), use any source-roots constant it declares, and never flag env-interpolated URL construction as a hard-coded URL.

### Added

- **`/consort:start` now treats the UI track as a first-class create decision.** The create flow asks it as a structured either/or (UI SPA ⇒ `--ui-track`, backend-only ⇒ `--no-ui-track`) and the command template carries the flag; the StockFlow example forces `--ui-track` on. Previously the flow neither asked nor passed it, so `lakebase-create-project`'s opt-in default silently made every project backend-only (`clientFramework=none`) – starving a UI product of its client scaffold.
- **`/consort:start` relays long steps live instead of running them foreground.** `lakebase-create-project`, `./scripts/lk --refresh`, and the resume-phase driver (`/sprint`, `/plan`, `/design`, `/build`, `/deploy`) must be backgrounded to a log and tailed, announcing each role AT ITS DISPATCH line (start), not narrated from chunked foreground reads that surface a role only once it has finished.

## [0.3.20] - 2026-08-23

### Changed

- **Repointed to `@databricks-solutions/lakebase-scm-utils` v0.2.9** – its dual-format build is now correct in BOTH directions: the CJS build bundles the ESM-only deps (octokit + @databricks/*), fixing the lakebase-scm-extension activation, while the ESM build keeps `@databricks/*` external so consort's own ESM import of the substrate loads cleanly (v0.2.8 inlined `@databricks/sdk-experimental` into the ESM output, whose runtime `require("https")` threw "Dynamic require of https is not supported"). create also no longer prefetches the toolkit (it downloads once at first `./scripts/lk` use / `--refresh`).

### Added

- **`/consort:start` presents an itemized create timeline up front** – the ordered steps (repo, Lakebase DB, files, CI runner[, tiers], commit) with per-step durations + a total ETA + "come back in ~N min", and the toolkit download shown as the one-time post-create `--refresh` step – so a multi-minute create is a known wait, not a mystery.

## [0.3.19] - 2026-08-23

### Fixed

- **Auth resolution is now fixed centrally (repoint to scm-utils v0.2.6).** Every
  in-project `databricks` call auto-targets the project's workspace (the wrapper reads
  `.env` `DATABRICKS_HOST`), so the drive's auth preflight, credential mint, and every
  role turn use the project workspace instead of falling back to the DEFAULT profile.
  This closes the doctor / tier-cut / drive-preflight class in one place; you no longer
  need to source `.env` or export a profile before a run.
- **The architect-reviewer can no longer corrupt an AC.** New `consort-annotate-ac`
  safe-writer (parse → merge `layer` + `architectural_notes` on top → write valid JSON,
  every field preserved); the agent is rewired to call it instead of hand-editing the AC
  JSON with Edit (a dropped brace previously yielded malformed JSON that aborted the drive
  two steps later on a conformance PROTOCOL VIOLATION).

### Changed

- **The orchestrator narrates live instead of going silent.** The drive's per-turn
  progress (`[drive] NNN <phase/role>`) is on by default (`LAKEBASE_CONSORT_QUIET=1`
  silences it for captures/CI), and the operating contract + `/sprint` now direct the
  session to run the drive in the background, tail its progress, and relay each
  phase/role/gate transition in plain language – never a multi-minute silent wait, still
  no per-CLI play-by-play.
- **Plain-language kit + create narration** (scm-utils v0.2.6): `--install` / `--refresh`
  replace `--warm` / `--rewarm` (old flags still work); the toolkit download and
  create-project both narrate with durations; `/consort:start` sets the one-time
  provisioning expectation up front and offers to install the Consort viewer extension.

## [0.3.18] - 2026-08-22

### Fixed

- **`--tiers 2` / `--tiers 3` now actually cut the staging/dev tiers** (repoint to
  `@databricks-solutions/lakebase-scm-utils` v0.2.5). The tier-cut primitive dropped the
  workspace host, so it resolved auth ambiently and fell back to the DEFAULT profile ,
  silently leaving a multi-tier create prod-only. It now runs against the same workspace
  the rest of create used.

### Added

- **`lakebase-cut-tier` recovery bin** (from scm-utils v0.2.5) – cut a missing tier
  without re-creating the project: `./scripts/lk lakebase-cut-tier --name staging
  --fork-from main` (defaults instance + host from `.env`). A create-time tier-cut failure
  is now a loud "INCOMPLETE TIERS" warning that names this exact recovery command.

## [0.3.17] - 2026-08-22

### Changed

- **Repointed the substrate to `@databricks-solutions/lakebase-scm-utils` v0.2.4** – the
  runtime-kit install (`lk --warm` / `--rewarm`) now narrates instead of going dark (a
  leading "installing ... ~1-2 min" line + streamed npm progress + a "ready" line) and
  installs leaner (`--omit=dev --no-audit --no-fund`, since the kit ships prebuilt dist/).

### Fixed

- **`/consort:start` now pins `lakebase-create-project` to the installed plugin's own
  version, instead of a bare `github:databricks-solutions/consort`.** The unpinned spec
  let `npx` resolve create-project from its cache or the mutable `main` branch, so a
  fresh plugin install could scaffold from the wrong kit. The create ref now resolves,
  in order: `LAKEBASE_KIT_REF` → the running plugin's version (`${CLAUDE_PLUGIN_ROOT}/
  .claude-plugin/plugin.json`) → a release-stamped floor (guarded by
  `tests/bdd/start-kit-pin.test.ts`, which forces the stamp to equal `package.json`).
- **`lakebase-create-project` now refuses to scaffold from a STALE substrate.** `npx` can
  update the top-level kit while reusing a cached older nested
  `@databricks-solutions/lakebase-scm-utils` (it does not re-resolve transitive git deps
  on cache reuse) – which silently produced a broken project (old `sftdd.sh` launcher +
  mismatched `.lakebase/scm-utils-ref`). Create now compares the resolved substrate to the
  version this kit declares and, on mismatch, **aborts before provisioning anything** with
  a clear remediation (clear the npx cache and retry). An explicit `LAKEBASE_SCM_UTILS_REF`
  / `_DIR` override still wins. Together with the pin above, a clean install resolves to a
  coherent project and a dirty cache is caught, not shipped.

## [0.3.16] - 2026-08-22

### Added

- **Scaffolded projects now pin the runtime kit to the kit's release version.**
  `lakebase-create-project` defaults `LAKEBASE_KIT_REF` to `v<version>`, which the
  substrate writes to `.lakebase/kit-ref`, so a new project resolves an IMMUTABLE,
  version-keyed kit cache (`~/.cache/consort/v<version>`) instead of a mutable `main`
  that silently goes stale. Mirrors the substrate's `scm-utils-ref` pin. An explicit
  `LAKEBASE_KIT_REF` (dev override / capture) still wins. `/consort:start`'s resume
  guidance now explains that upgrading a project's kit is a deliberate `kit-ref` bump.

### Deprecated

- **Legacy `sftdd` / `tdd`-era names are deprecated (removed in v0.4.0).** The
  `lakebase-sftdd-*` / `lakebase-tdd-*` bin aliases and the `LAKEBASE_SFTDD_*` /
  `LAKEBASE_TDD_*` env prefixes still work, but now warn once when used (`consortEnv()`
  for env; the scaffolded `scripts/lk` launcher for the aliases), pointing at the
  `consort-*` / `lakebase-*` names and `LAKEBASE_CONSORT_*`. See `DEPRECATIONS.md`.

### Changed

- **Repointed the substrate to `@databricks-solutions/lakebase-scm-utils` v0.2.3**
  (its share of the de-sftdd sweep + the lk-alias deprecation warning).
- **Swept leftover `sftdd`-era drift** from help text, error messages, code comments,
  and docs (the framework is Consort); env-var display strings now show
  `LAKEBASE_CONSORT_*`. Back-compat literals (the alias bins, `ENV_PREFIXES`, the
  `.sftdd`/`.tdd` artifact roots + migration, the legacy `sftdd-config.json` read, the
  `--sftdd-dir` flag alias) are unchanged.

## [0.3.15] - 2026-08-22

### Changed

- **Repointed the substrate to `@databricks-solutions/lakebase-scm-utils` v0.2.2** —
  the doctor now resolves the profile from a pinned `--databricks-host` and threads that
  host into the auth checks, so `lakebase-create-project`'s environment gate no longer
  fails spuriously against the DEFAULT profile's stale token when a target host is pinned.

### Fixed

- **`/consort:start` create flow now force-refreshes the runtime kit (`./scripts/lk --rewarm`)
  before staging / resuming.** The runtime kit is cached per-ref in a shared location
  (`~/.cache/consort/<ref>`); a project created after an older kit was last used could run
  that stale cache and miss newly-added bins (e.g. `lakebase-stage-first-project`). The
  create + first-project-example paths now rewarm unconditionally so a fresh project runs
  the kit that was just installed.
- **`/consort:start` no longer routes free-text create answers through a multiple-choice
  prompt** (project name / parent dir / Databricks host / GitHub owner), which triggered an
  "Invalid tool parameters" error; only the genuine either/or decisions (tiers, language,
  E2E, model profile, own-project-vs-example) use a structured choice.

## [0.3.14] - 2026-08-22

### Added

- **Update-availability notice.** `/consort:start` now runs `consort-check-update`, which
  compares the installed kit version to the highest published git tag and, if you are
  behind, prints the exact update commands (`claude plugin marketplace update … && claude
  plugin update …`, plus `./scripts/lk --warm`). Throttled to once/day (a timestamp in the
  XDG config dir), bounded network, and fail-silent, so it is never a per-run tax and never
  blocks a run. Check any time with `consort-check-update [--force]`. Also documents the
  update flow (incl. the required marketplace refresh) in the README.

## [0.3.13] - 2026-08-22

### Added

- **First-project example on `/consort:start`.** On a first run, `/consort:start` offers
  the bundled StockFlow example; accepting stages the seed via the new
  `lakebase-stage-first-project` bin (intake + one `feature-request.md` per feature into
  the fresh project's `.consort/`), so you can drive a real product end to end without
  authoring your own intake. Offered once (a marker separate from telemetry state).
- **`consort-spike delete --purge-notes`** (default off): also removes the spike's
  `.consort/spikes/<slug>/` dir. Notes are preserved by default so the learning survives
  the branch teardown. `consort-spike` cut/delete now default `--instance`/`--host` from
  the project `.env`.

### Changed

- **`/consort:start` model profile is now Default or Customize** (Lean removed). Default
  uses the tuned per-turn manifest defaults as-is; Customize sets model AND effort, per
  role and per manifest step, in `consort-config.json`. Fixed the stale `agent-config.json`
  reference.
- **Re-pointed `@databricks-solutions/lakebase-scm-utils` to v0.2.1** — the
  `scripts/consort.sh` launcher rename (was the stale `sftdd.sh`) and `lakebase-scm-cleanup`
  resolving `--instance`/`--host` from the project `.env`. Added a Teardown/reclaim section
  to `/consort:start`.

## [0.3.12] - 2026-08-21

### Added

- **Level 2 (opt-in) usage telemetry** (#186, thanks @kemjim). A separate, explicit opt-in
  (OFF by default) on top of the shipped Level 1: `consort-telemetry enable --level 2` or
  `CONSORT_TELEMETRY_LEVEL=2`. It answers "why does a run fail / where is the bottleneck" and
  emits a `consort.turn` span per role invocation (role + timing, with coarse
  model/effort/token_bucket/retry_count buckets), coarse `consort.run` loop dynamics
  (`red_green_cycles`, `refactor_iterations`, `revise_rounds`, `selfheal_attempts`,
  `hil_escalations`), coarse project shape (`story_count` / `ui_track`), and a gate
  `fail_class` failure-signature enum. Still closed enums / counts / durations only, never
  free text; every Level-1 opt-out applies unchanged. Also fixes stale `consort-telemetry`
  help/status strings that described the pre-armed local-sink behavior.

### Changed

- **Re-pointed `@databricks-solutions/lakebase-scm-utils` to v0.2.0** (was v0.1.3). Picks up
  the `lakebase-scm-cleanup` teardown bin (safe list / branches / project cleanup) and the
  doctor JDK version-gate fail-open fix.

## [0.3.11] - 2026-08-21

### Changed

- **Usage telemetry is now armed by default (opt-out, always-on).** A normal interactive
  `consort-drive` run reports its pseudonymous, allowlisted trace to the Consort maintainers'
  ingest endpoint automatically (no per-machine setup); previously the endpoint defaulted to a
  local no-op sink. Opt out with `consort-telemetry disable`, `CONSORT_TELEMETRY=0`, or by
  running non-interactively / in CI; un-arm with `CONSORT_TELEMETRY_SIGNOFF=0`; re-point with
  `CONSORT_TELEMETRY_ENDPOINT`. The endpoint accepts anonymous POSTs, so no secret ships in the
  client. First consenting run prints a one-time notice; TELEMETRY.md documents what is (and is
  not) collected, and why. Fire-and-forget (never changes CLI behavior, latency, or exit code).

## [0.3.10] - 2026-08-20

Adds opt-out usage telemetry, makes the kit installable off the Databricks network,
and completes the faithful-replay recorder change. All changes fold onto 0.3.9;
legacy `sftdd` names/paths still read for back-compat.

### Added

- **Level-1 usage telemetry for `consort-drive`** (#185, thanks @kemjim). Opt-out
  (on by default), allowlist-scoped OpenTelemetry spans for drive turns, plus a
  `consort-telemetry` CLI and a local collector tool. Emits only from real
  interactive runs (never in CI / non-TTY, and never when `CONSORT_TELEMETRY=0`
  or after `consort-telemetry disable`); a one-time first-run notice prints how to
  turn it off. Only allowlisted, non-sensitive fields are emitted, nothing leaves
  the machine until a maintainer arms a real endpoint, and a config-write failure
  never breaks a run. See TELEMETRY.md.
- **Pre-turn `.consort` capture** (`replay-set/pre-consort/`). The turn recorder
  snapshots the full pre-turn `.consort` STATE (cycles / features / experiments /
  design / smells / workflow), excluding append-only streams + runtime ephemera,
  so a replay lays the pre-turn state verbatim instead of reconstructing it.
- **`stockflow-optimization-study` replay corpus**: the two-sprint F1+F6 scope
  re-recorded under the v0.3.9-tuned model matrix, with `pre-consort/` on every
  agent turn and a clean (zero-HIL) run.

### Changed

- **Driver repair/refactor replays lay `pre-consort/` verbatim; the handroll is
  retired.** `layReplayDriverPreCycle` + the legacy `DRIVER_TURN_SEEDS` are removed;
  a repair/refactor turn without `pre-consort` now fails loud pointing at a
  pre-consort corpus. A `LAKEBASE_SFTDD_CORPUS_DIR` override selects the replay
  corpus.

### Fixed

- **npm lockfiles are installable off the Databricks network.** Committed lockfiles
  resolved to the internal npm proxy (`npm-proxy.cloud.databricks.com`); `npm ci`
  fetches those verbatim and HANGS for anyone off-network. They now resolve to the
  public registry (the proxy is a faithful npmjs mirror, so `integrity` stays valid
  and internal machines still reach them through their `HTTP_PROXY`). The scaffold
  self-heals its `client/package-lock.json` before install, and a CI guard blocks a
  non-public `resolved` host from being committed.

## [0.3.9] - 2026-08-19

A tuning release. The per-turn model/effort matrix is optimized from a
corpus-faithful live experiment harness (each recorded turn is replayed under
lever perturbations and the candidate is judged against what that turn recorded),
and the per-turn config now has a single home. All changes fold onto 0.3.8; no
behavior is removed. Legacy `sftdd` names/paths still read for back-compat.

### Changed

- **Per-turn model defaults are tuned to the fastest configuration that holds
  quality.** Each default is the winner of a replicated live panel judged against
  the recorded turn:
  - **Navigator ASSESS → opus.** The regression-assessment is judgment-heavy
    (root-cause diagnosis); opus holds the assessment and is ~18% faster than the
    prior sonnet default on the heavy regression variant.
  - **Navigator RED → sonnet + low effort.** Authoring a story's failing tests is
    mechanical; the cheaper model holds coverage at ~29% faster / ~half the cost
    of the opus default.
  - **Driver REFACTOR → opus.** In a 5-lever × 3-replica panel ranked by
    clean-in-one-step rate (the post-refactor review comes back clean, so no
    follow-on refactor loop is needed), opus ties for the best hold rate AND is
    the fastest holder — and being efficient it costs less than sonnet. The prior
    haiku default was the worst (it thrashed).
- **One home for the per-turn model/effort matrix: the step manifests.** The
  per-turn `agentOptions` on each step manifest is now the single source for a
  turn's model + effort; the scaffolded config file no longer carries a second
  copy that could shadow it, and the separate optimized-defaults file is removed.
  A project still overrides any turn by adding `roles.<role>.model/effort` to its
  own `.lakebase/consort-config.json`.

### Added

- **The Navigator's assess discriminator grades regression root-cause fidelity.**
  When a candidate lands the `regression` determination, the diagnosis +
  fix-directive content is graded against the recorded ground truth, so a
  class-match with a wrong root cause no longer passes.

### Fixed

- **Robust agent-report capture in the drive.** The Driver/Navigator report block
  is now captured wherever it appears in the transcript (full text, with a file
  fallback) and tolerates a prose/YAML report block, so a well-formed turn is no
  longer dropped on a formatting variation.
- **Navigator-RED test authoring enforces test-state ownership.** Every RED
  authoring directive now carries a mandatory canon: a test owns the state it
  asserts on. For an empty / collection / aggregate assertion the test must scope
  to per-run-unique keys (assert only its own rows, or query a per-run-unique slice
  that is genuinely empty) or explicitly clear the aggregate — never assume a clean
  shared DB or assert absolute whole-table state (e.g. `len(all) == 0`). This
  prevents a class of flaky/false tests on the reused per-branch acceptance DB
  (an empty-state test that asserts the whole store is empty while a prior story's
  committed rows persist), and it holds on the tuned `navigator-RED` model tier.

## [0.3.8] - 2026-08-14

A defect-fix release hardening the design lane and the per-story acceptance gate,
plus two capture/replay fidelity fixes. All fixes fold onto 0.3.7; no behavior is
removed. Legacy `sftdd` names/paths still read for back-compat.

### Fixed

- **Persistence-invariant fitness tests now anchor to the story that REALIZES the
  invariant, not the first story that merely names its table.** The Test
  Strategist previously front-loaded every persistence invariant (including those
  for a not-yet-created table) onto an early display/read-only story's fitness
  tests; the write story that actually migrates the table could then never obtain
  a distinct coverage tag, and the story-scoped reflection revise could not clear
  it (the fix required editing a different, already-gated story) — a dead-loop to
  HIL. A new `invariantRealizingStory` primitive joins
  `architecture.persistence_invariants[].table` to `db-design.schema_changes[]`
  to resolve the realizing story; the fitness analyst prompt, the spec-gate
  distinct-coverage check, and the reflect remediation all key off it, so
  mis-anchoring is prevented at authoring time and, if it still occurs, is caught
  and correctly attributed at the story's own gate.
- **The per-story acceptance gate no longer serves an UNMIGRATED experiment
  branch.** Honest-GREEN verify runs the migration only on a disposable child
  branch (to isolate a reversibility test's up/down fixtures), so the experiment
  branch the deploy bound the review app to was never upgraded — the write path
  500'd with `relation ... does not exist` even though every test passed. The
  `--gate` deploy now applies a forward-only, idempotent migrate
  (`migrate:` target, the language-agnostic entrypoint) to the bound branch
  BEFORE starting the app, and a failing migrate fails the deploy honestly
  (`reachable:false` + escalation) instead of certifying a broken app.
- **Gate-deploy reachability is now a strict non-5xx serving probe.** A
  booted-but-erroring app (e.g. one bound to an unmigrated branch) previously
  certified as "reachable" because any HTTP response counted as up; the acceptance
  gate now requires a non-5xx response. Non-gate deploys and the foreign-port
  guard keep the lenient probe.
- **Story-scoped `review-verdict` resolves at the cycles story-root** (route/
  contract seam fix), so a story-loop review no longer mis-resolves its path.
- **Replay reads the intake design-brief + assets from the finalize-corpus mirror
  layout** (nested `design/`), fixing the live replay launcher after the corpus
  mirror moved where those assets land.

### Added

- **agent-log.jsonl is mirrored into the corpus during a recording**, so the
  central agent-log stream is preserved alongside correspondence for replay.

## [0.3.7] - 2026-08-12

A large consolidation release: the orchestrator's internals were reorganized into
cohesive domain families, every agent turn now dispatches through one executor
seam, a per-role/per-turn optimization harness landed, the capture/replay corpus
tooling was rebuilt, and the whole kit was renamed from the internal `sftdd`
lexicon to **Consort** (legacy names/paths still read for back-compat).

### Added

- **One executor dispatch path for every agent turn.** Design, planning, and
  build turns (spec-author breakdown, navigator RED/assess/review/reflect, driver
  green/refactor/repair, and the deploy/superseded variants) all dispatch through
  a single parameterized `ClaudeStepAgent` via a manifest-declared
  `agent:{kind,config}` + step-contract seam, replacing the per-turn
  command-builder arms. Each shipped step declares its agent and its
  inputs/outputs/route contract, with a pre-dispatch route-satisfiable check and a
  three-channel output model (product code / `.consort` artifact / meta).
- **Per-role and per-turn optimization harness.** A committed sweep engine
  experiments on each design and navigator build turn across model tiers and
  effort/tool-scope levers, judged against the recorded reference output, with
  visible results, `summary.json`, baseline compare, and programmatic auto-apply
  of a winner into an `optimized-defaults.json` overlay. The test-strategist was
  rewritten as a supervisor over per-kind test analysts with their own levers.
- **Capture/replay corpus tooling.** Faithful per-turn snapshot replay with an
  honest live verify and a divergence guard; a browsable `.consort` mirror with a
  retroactive path sweep; per-turn replay sets; a two-sprint `/sprint`-driven
  capture launcher that records the full orchestrator↔HIL correspondence; and a
  planning-only (`--plan-only`) capture/replay path. The `stockflow-full` and
  `stockflow-plan` reference corpora were added.
- **Deterministic UI reachability + token-consumption gate** with design-guide
  components, and an **app-icon design-adherence check** wired into the UX-clean gate.

### Changed

- **Renamed the kit from `sftdd` to Consort.** Canonical symbols are now
  `resolveConsortSettings`, `consortEnv`, `LAKEBASE_CONSORT_*`, the `.consort/`
  artifact root, `.lakebase/consort-config.json`, and `consort-*` bin names. The
  tri-read env prefixes, legacy config/artifact-root fallbacks, and `lakebase-*`
  bin aliases still resolve, so projects scaffolded before the rename keep working.
  The scaffolded launcher is now `scripts/consort.sh`.
- **Reorganized the source tree into domain families** under `consort/`
  (config, logging, gates, experiment, pipeline, smells, architecture, intake,
  deploy, orchestrator/{steps,runners,turns,state,workflow,drive,settings,build},
  provisioning) with acyclic-import and single-home anti-recurrence guards; the
  executable CLIs moved to `bin/consort/` + `bin/lakebase/`.
- **Fact-checked and de-jargoned all documentation** to the real symbols, and
  swept stale `sftdd` naming out of source comments, shell scripts, and test
  descriptions (functional legacy literals preserved).
- **navigator RED defaults to opus** (model tiering, matching driver);
  per-invocation-step effort/model config is the single per-step home.

### Fixed

- **Live-drive resilience:** a stalled agent turn now self-heals (inactivity
  timeout kills + retries instead of hanging), with the inactivity clock gated on
  content lines; headless spawns use `acceptEdits` (managed-settings downgrade the
  bypass mode); the build fails fast on expired Databricks auth.
- **Supersession / self-heal routing** (classes k–n): `ctx.loop` sourced from the
  config file so derive + effects agree; the `superseded_tests` key alias is
  tolerated; the green-superseded route reads the correct per-story test list; and
  a `superseded:true` regression verdict is honored.
- **Story-loop `ux-adherence`** self-heals on the story loop, not only per-AC;
  `architect-reviewer` augments `ac.json` in place (never drops `independence`);
  the reflection-gate revise brief is additive; migration-reversibility asserts
  schema-recreation, not data-survival.
- **Terminal `done` turn is now recorded**; after merge the working tree lands on
  the parent tier and the merged feature branch is removed; `prepare-pr --force`
  gets past the produced `.consort` corpus dirty tree.
- **Hardcoded `.sftdd/` path literals removed** from source (derived from
  `ARTIFACT_ROOT`/`cycleDir()` instead), a broken `dist/bin/sftdd/…` reference in
  `capture-scenario.sh` corrected, `watch-artifacts.sh` resolves `.consort` with a
  legacy fallback, and `.gitignore.base` ignores `.consort/` per-run files.

## [0.3.6] - 2026-08-02

### Fixed

- **Story independence is now enforced at each story's own spec gate.** A story
  after the first that omitted its `independence` determination used to pass
  every per-story spec gate and only fail at the full-feature ship gate, tens of
  turns and a full build later. The per-story approve path (`approveStoryGate`)
  now runs a story-scoped independence check, so the gap fails at the story's
  own gate. The spec-author also self-checks it at breakdown (a new breakdown
  mode of the response formatter), and the breakdown prompt + task hint demand
  the determination up front, so it is caught before the gate at all.
- **The build fails fast on expired Databricks auth instead of hanging.** When
  the OAuth refresh token had expired, `generate-database-credential` failed and
  the app's connection pool hung, so a per-turn verify stalled indefinitely (a
  cached access token let `current-user me` pass, masking it). A drive-time
  auth preflight (`driveAuthPreflight`) now checks `databricks auth token
  --force-refresh` before the run, and an auth-expired verify failure escalates
  immediately (source `auth-expired`) rather than routing a self-heal detour, so
  the human sees a clear "re-authenticate" message in seconds, not a spin. (The
  runtime-token app template also raises a typed `DatabricksAuthExpired` instead
  of hanging the pool.) Pairs with `@databricks-solutions/lakebase-scm-utils`
  v0.1.0, which the kit now pins.
- **Reactive-green supersession turns are labeled so replay stays aligned.** When
  a story's honest-GREEN verify failed because it superseded a prior test, the
  Navigator assessed it and the Driver permissively re-greened – but that
  re-green turn recorded with no build-mode suffix, so a build-turn replay saw a
  spurious extra `green` ([red,green,green,review]) it could not drop. That turn
  now routes with a distinct `green-superseded` build mode (running the identical
  honest GREEN; only the recorded label changes), and both the replay filter and
  the corpus-integrity guard drop it like the other verify-failure detours.

### Added

- **A re-recorded `stockflow-rerecord` scenario corpus** captured end-to-end on
  the current kit (design + build lanes both live, including the DBA design-lane
  role and a fully live planning lane). Two sprints on one project, both shipped
  end-to-end (build + deploy + promote/merge to staging): F1 record-stock
  visibility and F6 the split-tracking-code expand/contract migration. It is the
  standing replay-scenario regression corpus.

### Added

- **`lakebase-update-agents`** refreshes a scaffolded project's `.claude/agents/`
  role definitions from the current kit. Project creation only *seeds* agents
  (it never overwrites one already present), so a kit bugfix to a role prompt
  did not reach an already-scaffolded project; this closes that gap, and the
  drive additionally auto-refreshes agents when it detects the kit version moved
  (a `.claude/agents/.kit-version` marker). `--dry-run` previews; `--keep-local`
  preserves a project-edited agent.
- **Recorded turns now carry an agent transcript** (`transcript.md`: the task
  prompt, the tools used in order, and the turn's final reasoning), summarized in
  `turn.json` and flagged in the turns index. Purely additive (replay and corpus
  integrity ignore it); it gives a demo/visualization the "what each role was
  asked, did, and decided" material the artifact delta alone does not carry.

### Changed

- **The plugin manifests track the release version.** `.claude-plugin/plugin.json`
  (and `.cursor-plugin/plugin.json`) were frozen at `0.1.0`, so
  `claude plugin update` compared versions, saw no change, and refused to refresh
  the cache even when content moved. They now match `package.json` (a
  `plugin.test.ts` guard fails on drift), so the built-in updater refreshes on
  every release.
- **Documented updating an existing project**: `./scripts/lk --warm` (the
  canonical "pull the latest kit" step), `lakebase-update-agents`,
  `lakebase-update-commands`, and `claude plugin update`, in the README and the
  `/consort:start` resume path.
- The abort message for a role whose artifact failed its contract no longer
  says "returned nothing" when the artifact is present but non-conformant.
- **Tests own their database state (no shared-state contamination).** The
  test-strategist now scopes each test's seed and assertion to its own rows (or
  asserts a delta) instead of an absolute whole-table aggregate, so a story's
  tests no longer flake once another story's rows share the table. As a safety
  net, the deploy-verify contamination self-heal (classify by isolation re-run,
  Navigator assess, Driver scope, one honest re-verify) now also covers the
  feature-ship deploy, not just the per-story deploy.
- **The planning lane records the committed feature's size on a re-plan sprint.**
  A per-sprint `estimate-committed` turn sizes the committed feature and
  re-syncs the sprint backlog, so `backlog.json` carries per-sprint sizing even
  when the sprint re-plans rather than proposing fresh.
- **The green-failure assess turn is decisive when the failure is already
  localized.** When a deterministic advisory has pre-localized the superseded
  tests, the Navigator's assess prompt tells it to trust that and flag in one
  call rather than re-scan the whole tree, closing a long assess spin.

## [0.3.5] - 2026-07-31

### Changed

- **A service no longer implies a database.** `service_backed` used to force a
  schema: a `service_backed` feature with zero tables or zero
  `persistence_invariants[]` hard-failed the design gate, so a compute /
  transform / proxy / external-API-aggregator service (real business logic, no
  persistence) could not pass. `persistence_invariants[]` is now the single
  source of truth for "this feature has a database": declaring `>=1` routes the
  feature through the DBA + DB-integration tests; declaring none marks it a
  non-persisting service (the DBA turn is skipped, `db-design.json` is optional,
  no persistence coverage is required). `checkDbDesign` and
  `checkPersistenceCoverage` now key off the invariants, not `service_backed`.
  The safety net against under-declaring a feature that really persists moves
  into `checkServiceBackedDeclaration`: persistence evidence (an `Infra`-layer
  AC, or a migration/schema/storage NFR) while `persistence_invariants` is empty
  still hard-blocks the gate. Layering enforcement is unchanged (every
  `service_backed` feature still declares boundary/service/repository). Agent
  prose (`dba.md`, `architect-reviewer.md`, `test-strategist.md`), the
  architecture schema, and the DBA task hint were realigned, with a regression
  guard in `sftdd-agent-defs.test.ts`.

## [0.3.4] - 2026-07-31

### Fixed

- **DBA design gate was unsatisfiable for any feature with persistence
  invariants.** The `dba.md` prose told the DBA to write `realizes_invariants[]`
  entries "mapped to the physical construct that enforces it", which led every
  model to emit objects (`{invariant_id, realized_by}`), but the schema, the
  conformance gate, and the recorded corpus all require a **flat array of bare
  invariant-id strings**. The two disagreed, so the DBA looped until the drive
  aborted with a PROTOCOL VIOLATION. Aligned the prose (and the orchestrator's
  DBA task hint + remediation) to the schema: `realizes_invariants[]` is a flat
  string array (the "which construct realizes it" rationale lives in
  `db-design.md`), `unique_constraints` is an array of column-name arrays, and
  `column.default` is a string SQL expression. Added a regression guard
  (`sftdd-agent-defs.test.ts`) pinning the DBA prose to the schema.
- **Misleading abort message.** When a role's expected artifact was present but
  failed schema validation, the drive aborted saying it "returned nothing (the
  expected artifact is absent / null / empty)". It now says the artifact "did
  not satisfy its contract (absent, empty, OR present-but-nonconformant)" and
  appends the remediation, so a shape mismatch is not misreported as a missing
  file.

## [0.3.3] - 2026-07-30

### Changed

- **Repin `@databricks-solutions/lakebase-scm-utils` to `v0.1.0-beta.11`.** It
  fixes two first-run create findings at the source: `lakebase-create-project`
  now accepts a pre-existing EMPTY target directory on the `--no-github` path
  (only a non-empty dir is refused), and `--no-github` with `--tiers 2`/`3` is
  rejected up front (before any provisioning) instead of provisioning tier 1 and
  skipping the extra tiers with a post-hoc warning.
- **`/consort:start` interview + first-project walkthrough reconciled to that
  behavior.** The project-name guidance now says an empty (or absent) directory
  is fine on `--no-github` and a non-empty one is refused; the tiers guidance
  says `--no-github` + `--tiers 2`/`3` is refused up front (pair `--no-github`
  with `--tiers 1`).

### Fixed

- **`--agent-model` help role list corrected.** It listed `release-engineer`
  (which is deterministic, not a tunable agent) and omitted `dba`. The accepted
  roles are `spec-author, architect-reviewer, dba, test-strategist, ux-designer,
  navigator, driver, product-owner`.

## [0.3.2] - 2026-07-30

### Added

- **Environment doctor gate on project creation.** `lakebase-create-project`
  (and `/consort:start`'s create path) now runs the doctor before any
  provisioning and refuses to start when a hard cold-start check fails (a missing
  tool, or a workspace without Lakebase), printing the fix. Closes the gap where
  a good diagnostic existed but nothing on the create path ran it, so a bad
  environment first surfaced as a failure partway through provisioning a repo and
  a database. `--skip-doctor` bypasses; the JDK check blocks only java/kotlin.
- **One-line bootstrap (`bootstrap.sh`).** `curl … | bash` detects each required
  tool (Node 20+, npm, Python 3.10+, JDK 17+, `gh`, Databricks CLI), offers to
  install or upgrade what's missing, then runs the environment doctor.
- **First-project walkthrough** under `examples/first-project/`: a copy-ready,
  from-zero StockFlow example (intake + feature-proposals + feature-requests +
  the narrated `/plan → /design → /build → /deploy` walkthrough).

### Changed

- Repin `@databricks-solutions/lakebase-scm-utils` to `v0.1.0-beta.10` (the
  extended doctor: cold-start prerequisites + a `lakebase-enabled` workspace
  probe).
- README "Get started" leads with the bootstrap + doctor step 0 and folds the
  prerequisite list into a `<details>` block.
- Docs de-jargoned (dropped grandiose framing and meta-narration) and internal
  design notes relocated under `docs/design/` so `docs/` reads as user space.

## [0.3.1] - 2026-07-27

### Changed

- Repinned the substrate dependency `@databricks-solutions/lakebase-scm-utils` to
  `v0.1.0-beta.9`, which ships the React client scaffold's `.gitignore` via an npm-safe
  `.gitignore.base` (npm strips a literal `.gitignore` from a packed tarball). Without it a
  scaffolded project committed `client/node_modules/`, whose Vite/Vitest cache kept the
  tree perpetually dirty and made `scm-prepare-pr` refuse to open the promote PR.

### Fixed

- **Scaffold the kit's own `.claude` assets.** A newly created project received only the
  substrate's skill, so it had no `.claude/agents/` and the driver's `claude --agent
  <role>` spawns resolved nothing (the design lane halted at the first agent turn). The
  substrate must not name the kit, so the kit's setup hook now lays down its own role
  agents, skills (consort + the engineering canon), and workflow commands, deduped
  against the substrate's.
- **Sprint-mode feature claim.** The whole-sprint driver claimed a feature through a
  hardcoded kit-dist path to `scm-claim-feature.cli.js`, a substrate bin that moved to
  `@databricks-solutions/lakebase-scm-utils`, so it crashed with `MODULE_NOT_FOUND`. It
  now claims through the project's `lk` shim (`lakebase-scm-claim-feature-branch`),
  matching per-feature mode.
- **Coupled reflection defects now co-heal.** A pre-build reflection that flagged both a
  spec-level and a test-list defect could not self-heal: the revise re-ran only the
  routed role and burned independent per-smell budgets, so the sibling defect re-fired
  and hard-halted the run. A reflection revise now re-runs the whole design lane for the
  story (staling the architect's product and briefing both the architect and the test
  strategist), co-heals every open reflect smell for the story, and is budgeted
  per-story (one re-design, then the human gate), matching the documented intent.
- **Test Strategist migration coverage.** For a data-carrying migration (additive column,
  expand/contract, backfill) with a declared data-durability NFR, the Test Strategist now
  emits a data-preservation fitness test (seed rows, run the migration, assert they
  survive) alongside the reversibility round-trip; covering only reversibility is a
  `reflect-testlist-defect`.
- **Transient agent failures no longer hard-halt the drive.** A single transient API or
  network blip (connection closed mid-response, overloaded, rate-limited, 5xx) used to
  kill a whole run, since the driver aborted on any nonzero `claude` exit. It now retries
  the turn on a bounded budget with exponential backoff, in the same session. An auth
  failure is deliberately not treated as transient (it needs a human `/login`), so it
  still surfaces instead of retrying futilely.
- **Test Strategist self-check enforces reverse AC coverage.** The role's self-check
  verified each test item maps to a real AC but not that every AC carries a test, so an
  uncovered AC (often a client-presentation AC) slipped through to the reflection gate as
  a `reflect-testlist-defect`. The self-check now hard-fails on any AC with no covering
  test, so the gap is fixed within the Test Strategist's own turn instead of downstream.
- **Test Strategist self-check rejects a mislabelled fitness item.** A `kind:"fitness"`
  item carrying a Gherkin `.feature` `scenario_file` (mutually exclusive per canon) now
  fails the self-check in-turn, rather than reaching the reflection gate as a
  `reflect-testlist-defect`.
- **NFR coverage is per-feature-relevant, not per-feature-mandatory.** The conformance
  gate required every feature's architecture to cover every project-wide Required NFR, so a
  feature that touches no code a given NFR governs hard-halted the promote gate even when a
  sibling feature already realized it. A Required NFR is now satisfied when the feature
  covers it, a sibling feature covers it, or the feature explicitly declares it out of scope
  (`nfr_out_of_scope`).
- **Refactor-verify failures route to a bounded supersession assess.** A REFACTOR-phase
  verify failure hard-halted to the human gate, unlike the structurally identical GREEN and
  deploy-verify failures, which route to a bounded Navigator supersession assess. That
  stranded a legitimate supersession (a later story's refactor retires a field a prior
  story's test still asserts). The first refactor-verify failure now routes to a Navigator
  assess (flag the superseded prior tests, then the Driver permissively refactors only
  those, then one honest re-verify), one-shot bounded; a genuine regression or a repeat
  failure still takes the terminal human gate. The honest re-verify gates every round, so
  it never green-washes.
- **Reflection revise budget is now progress-based.** The reflection critic surfaces
  test-list defects one at a time, but the prior budget allowed only one re-design, so a
  story with more than one latent defect hard-halted after the first heal. A reflect
  revise is now allowed while under a cap and the prior revise actually changed the
  test-list (fingerprinted at revise time); a no-change re-emit (a stuck author) or the
  cap still halts, so the loop converges instead of stalling a headless run.

### Changed

- **Renamed to Consort.** The package is now `@databricks-solutions/consort` and the
  GitHub repo is `databricks-solutions/consort` (the old URL redirects). The framework
  skill `consort-workflows` is now `consort`, with a `/consort:*` plugin command
  namespace and a Consort MCP identity. Consort is positioned as a Spec-First
  Branched-Database TDD agent framework built on governance by construction. Internal `sftdd` module names, the `consort-*` bin names, and the
  scaffolded `.sftdd/` runtime dir are intentionally unchanged for back-compat with
  already-scaffolded projects.
- Repinned the substrate dependency `@databricks-solutions/lakebase-scm-utils` to
  `v0.1.0-beta.6` (apply-tier subcommand for 2-tier/3-tier merge migrations + the lk
  non-prefixed kit-bin routing fix), then to the scm-utils commit carrying the consort
  scaffolder.

### Added

- **DBA design-lane role (the ninth role).** A `dba` agent runs between the architect
  reviewer and the test strategist: it consumes `architecture.json` and produces a
  feature-scoped `db-design.json` (physical tables/DDL + per-story schema-change plan)
  that realizes the architect's persistence invariants (the architect keeps ownership of
  the invariants; the DBA realizes, never re-authors). The spec gate hard-blocks a
  service-backed feature whose `db-design.json` is missing or leaves any declared
  invariant unrealized.

### Removed

- Purged the dead per-language app-scaffold template trees under `templates/project/`
  (client/python/java/kotlin/spring, nodejs except its `.gitignore.extra`, and the dead
  `common/` playwright/e2e fixtures) that the scm-utils extraction orphaned; scaffolding
  runs off scm-utils's own bundled templates. The live `common/**` BDD fixtures are kept.

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
- **Documentation brought current with the shipped code (FEIP-8085).** A four-agent audit corrected two classes of staleness: completed items still labeled proposal/future (eight `docs/refactor/*` proposals whose work shipped, five scaffolded command docs calling the shipped `lakebase-update-commands` bin "future", the SCM SKILL's shipped "future work" and stale `alpha.45` stamps), and instruction drift from the code. The largest drift fixes are in the `consort-workflows` skill (read by agents at runtime): the experiment APIs are now documented story-scoped (a `storyId` threaded through the primitives + the `experiments/<feature>/<story>/<slug>/` path), the 5th `deploy` gate is in every gate list, and the model-resolution source, roles table, entry points, `feature-status-schema` example, and `CONFIG` `clientFramework` row are corrected. SCM/root docs dropped a phantom `lakebase-get-connection --write-env` flag, fixed `create-tier` -> `create-paired-tier` in the root README, `migrate-live*` -> `schema-migrate-live*` in CONTRIBUTING, and added the `.lakebase/kit-ref.local` run pin to the capture runbook's kit-ref resolution order.

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

- **A re-driven story now re-runs RED/GREEN instead of reusing its stale (false-GREEN) build (FEIP-8052, Finding 27).** `discard` / `pipeline revise` / `set --status building` reset the pipeline status but left the per-story cycle records under `.sftdd/cycles/` intact. The drive derives "build already GREEN" (`codeWritten` → `storyTestProgress.allGreen`) from those stale `green_at` files, so a story sent back to be rebuilt skipped the RED/GREEN cycle and jumped straight to deploy, re-failing the same deploy-verify in a loop; recovery required hand-deleting kit-internal cycle records + the paired Lakebase experiment branch. Root cause: split-brain, `resetStoryBuildState` (the exact clear-cycles primitive) existed but was wired into only the `consort-experiment discard --revise` door. Now both revise doors (`applyReviseSelfHeal` + the plain reset) call it, so the operator `pipeline revise` and the driver's auto revise-route re-drive from a clean slate.

### Added

- **`consort-pipeline rebuild-story` (Finding 27).** The sanctioned "re-drive this story from a clean slate" op, replacing the `rm -rf .sftdd/cycles/...` recovery dance. It clears the build cycles + test-list, BOTH HIL escalation sources (escalation files and blocking smells, the dual-source rule), marks the experiment for a clean re-fork, and puts the story back on the single build lane (refuses when the lane is busy with a different story).
- **`consort-experiment cut --reset-stale-branch` (Finding 27).** Drops a pre-existing paired branch of the same deterministic name before forking, so a re-cut after a discarded experiment re-forks clean off feature HEAD instead of reusing the branch that still carries the discarded build's schema (mirroring the ci-pr `--reset-stale-branch` precedent). The drive auto-passes it on a re-cut after a discarded experiment. The drop-then-fork ordering is hermetically tested via an injected paired-branch ops seam; the live DROP + re-fork against a real Lakebase branch is validated by a live drive.

## [0.3.0-beta.31] - 2026-07-16

### Fixed

- **The build's honest-GREEN verify now runs the client (Vitest) suite, not just the backend (FEIP-8051, Finding 26).** The build lane could mark a story GREEN while the client Vitest suite failed deterministically; only the later deploy feature-verify caught it, a violation of the core TDD guarantee. Root cause: the build honest-GREEN runs the Python backend via the `SFTDD_PYTEST_MARKER` two-pass, and `run-tests.sh`'s marked branch exited BEFORE its client Vitest block, so the client suite never ran under build GREEN (the deploy gate runs `run-tests.sh` unmarked, reaches the client block, and failed, exposing the drift). Python + client scaffolds only. Now `run-tests.sh` gains `SFTDD_CLIENT_ONLY=1` (skip the backend, run only the client Vitest block), and `ensureDeployedAndVerify` runs one client-only pass after the two marked backend passes (when a `client/` workspace exists), gating GREEN on its captured exit code, so build honest-GREEN gates on the SAME client tests the deploy gate runs. The marked passes stay backend-only (no double-run, migration isolation intact).
- **The scaffold's client API layer teaches the RFC 9457 Problem Details field-error pattern (Finding 26, secondary).** `client/src/api/client.ts` previously surfaced a validation `detail` only when it was a string, so an object-shaped `detail: { field, message }` refusal was dropped and thrown as a generic error, never reaching a form's `field-<field>-error` seam. It now parses both shapes via `_problemDetail`, carries the field on `ApiError`, and adds a `postJson` mutation helper that throws it, so the driver has a reference for the object-detail + field-seam pattern.

## [0.3.0-beta.30] - 2026-07-16

Handover findings batch (FEIP-8050): six field findings from a stockflow tier-2 run. Cross-cutting theme: a branch's DB is addressed by its `{instance, branch}` DSN, never `LAKEBASE_BRANCH_ID` / ambient `LAKEBASE_HOST`.

### Fixed

- **`lakebase-feature-status` no longer shows a shipped feature's deploy/promote as `open` (Finding 13).** It dumped the raw `gates.json` approval bit, so a feature the drive had already deployed + merged disagreed with `consort-next` (which reconciles from `deploy-evidence.json` + the SCM workflow-state). feature-status now consumes the SAME reconciliation (`readDriveContext`) via a new `progression` snapshot field and renders `done (deployed)` / `done (merged)`. The CLI gains `--project-dir` to reach `.lakebase/`.
- **CI workflows follow `.lakebase/kit-ref` instead of a baked version pin (Finding 24).** Scaffolded `pr.yml` / `merge.yml` hardcoded the scaffold-time kit version at every kit call site, so bumping `.lakebase/kit-ref` (which the runtime substrate follows) never reached CI, every run executed the stale kit. Both workflows now resolve `KIT_REF` from `.lakebase/kit-ref` (fallback = the scaffold version) and use `#"${KIT_REF}"` at all call sites. `lakebase-scm-doctor` gains a `ci-workflow-kit-pin` warning that flags workflows still carrying the literal pin.
- **The `/design` reflect gate and `pipeline revise` now converge instead of looping (Findings 22 + 23).** The operator-facing `consort-pipeline revise` was hollow: it reset the story but never cleared the blocking smell (so the next drive re-raised it at action 000) and never re-briefed the test-strategist (so the regenerated test block re-omitted the requested coverage, forever). `revise` now runs the same self-heal the driver's auto-route uses: it resolves the smell, writes a coverage-forcing hand-back brief so the test-strategist MUST add the named test, and spends the one-revise budget so a re-fire hard-halts to the human. `discard` clears a discarded story's blocking smell; a new `resolve-smell` subcommand replaces hand-editing `smells.json`.
- **The promote local-migrate fallback verifies the target before reporting in-sync (Finding 25).** It reported "git and Lakebase schema are in sync" purely from the apply exit code, a lie when the apply no-ops against the wrong branch or applies partially. `applyAndVerifyTierMigration` now reads the TARGET branch's status back (pending == 0) after applying; when it is not verified at head it reports `migrate-unconfirmed`, which BLOCKS workflow completion instead of printing a false in-sync.
- **Shared tier reconcile + `ci-pr` reset (Finding 21).** Two gaps beyond the beta.27/.28 feature-branch recovery:
  - CI reused `ci-pr-<N>` across runs, so a branch first cut while its source tier was polluted rode that pollution through even after the tier was reconciled. `lakebase-ci-resolve-branch --reset-on-db-ahead` (wired in `pr.yml`) probes a reused, source-verified `ci-pr` for db-ahead-of-code and re-forks it from the now-clean source.
  - There was no path to reconcile a shared TIER branch (you cannot delete + recreate staging/prod). New `lakebase-reconcile-tier` reconciles a tier whose DB is ahead of code: it refuses on a healthy tier, drops the named orphan tables (identifier-safe), and stamps the branch to the code head. Backed by a new `stampSchemaMigration` primitive + an Alembic adapter `stamp` (`alembic stamp --purge`, which clears a phantom `alembic_version`).

  The live-DB halves (Finding 25's target verify, Finding 21's tier stamp + table drop, and the `ci-pr` reset) are validated by a live drive; their decision + orchestration logic is hermetically tested via injected seams.

## [0.3.0-beta.29] - 2026-07-16

### Fixed

- **The pre-push hook now provisions a DURABLE CI credential instead of a ~1h OAuth token (FEIP-8020).** CI reruns and the downstream (staging) migrate authenticate with `DATABRICKS_TOKEN` from GitHub secrets, but `pre-push.sh` synced a short-lived (~1h) OAuth session token (`databricks auth token`) frozen at push time, so a rerun or migrate firing more than an hour after the push failed auth (partial promotion). The `create-token-and-sync-secrets.sh` script (mints a 90-day PAT, OAuth fallback only where PATs are disabled) already shipped but nothing invoked it. `pre-push.sh` now delegates to it, wrapped so a mint/sync failure WARNS rather than blocking the push. A 90-day token re-minted on every push outlives any realistic rerun / migrate window. (The full OAuth service-principal M2M – client-credentials, no long-lived secret at rest – remains a documented future hardening.)

## [0.3.0-beta.28] - 2026-07-16

### Fixed

- **A feature claim refuses (and can reset) a paired branch whose DB is ahead of code (FEIP-8039 recover).** Completes the beta.27 fix (which prevented a build from migrating a tier + added a `db-ahead-of-code` doctor check). Feature Lakebase branches are non-expiring, so a re-claim REUSES an existing branch as-is; if an earlier aborted build migrated it and a `git reset` removed the migration file, the reused branch carries a phantom alembic revision + orphan table and later fails "Can't locate revision". Now:
  - `lakebase-scm-claim-feature-branch` runs a live DB-ahead-of-code probe on the cut/reused branch and **refuses** (`db-ahead-of-code`) rather than silently adopting a polluted branch; `--reset-stale-branch` drops it and re-forks clean from the tier instead.
  - `lakebase-scm-doctor --fix db-ahead-of-code` resets an already-claimed stuck project (delegates to abandon: deletes the polluted branch + resets state to `scaffold-complete`), so a re-claim re-forks clean.
  - New `branchRevisionOrphan` probe wraps the beta.27 detectors. The live probe + branch delete are validated by a smoke; the refuse/reset/fix decision logic is hermetically tested.

## [0.3.0-beta.27] - 2026-07-16

### Fixed

- **Design subagents no longer strand artifacts at a malformed project root, and a stray tree self-heals (FEIP-8038).** The story-scoped design roles (spec-author draft, architect-reviewer) were handed RELATIVE artifact paths, so (per FEIP-8006, the Write tool needs an absolute path) each resolved the project root itself and sometimes malformed it – the parent workspace dir and the project dir joined with a hyphen instead of a slash – writing every artifact outside the real project; the out-of-root guard then bailed and the "re-run" remedy looped forever. Two parts: (a) every design directive now names the ABSOLUTE artifact root for its write targets, so no role resolves the root itself; (b) the out-of-root guard now relocates a stray `.sftdd`/`.tdd` tree from the one known malformed sibling (`<parent>-<project>`) back into the real root and re-checks, so the run self-heals instead of deadlocking (and names the sibling in the error otherwise). Bounded to that sibling pattern, no filesystem scan.
- **A build/experiment migration refuses a protected-tier target, and scm-doctor detects a DB ahead of code (FEIP-8039).** An aborted build ran `alembic upgrade` against its paired Lakebase branch; a later `git reset --hard` rolled back only git, and because feature branches are non-expiring and `createBranch` is idempotent-on-existing, the re-cut feature reused that same stale branch, so its DB carried a phantom `alembic_version` + an orphan table and accept/deploy/promote failed "Can't locate revision". `applySchemaMigrations` now refuses a protected-tier target branch (main/master/staging/dev + configured tiers) before any DB work; the promote path (`scm-merge` local fallback) opts in via `allowTier`, since it migrates the parent tier by design. New `lakebase-scm-doctor` check `db-ahead-of-code` flags a paired branch whose applied revision has no local migration file. (The recover – resetting the polluted branch so the next claim re-forks clean – lands separately with a live smoke.)

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
    breakdown or a clean slate. New `consort-pipeline reset-breakdown`.
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
  - **Foreign-claim refusal.** `consort-drive --feature <F>` now refuses
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
  `consort-next`, stop for the human ONLY at a HITL gate or a blocker,
  present the decision (option titles + `hil_prompt`) not the CLIs run, report
  outcomes not process, show working software at the acceptance + deploy gates;
  verbose/eval narration is explicit opt-in (`LAKEBASE_SFTDD_VERBOSE=1`), off by
  default. Pairs with FEIP-8017.

### Fixed

- **The Tier-1 sprint drive no longer re-enters shipped features or leaks the
  coarse feature phase across features (FEIP-8022).** Two coupled defects: (1)
  the coarse `phase` in `.sftdd/workflow-state.json` is per-PROJECT and was
  honored for any feature, so a prior feature's phase leaked into the next
  (`consort-next --feature F2` reported F2 at "deploy" with only a
  feature-request). Now the phase is stamped with its owning feature and honored
  only for that feature (planning is sprint-global + exempt); an un-owned/foreign
  phase falls back to "feature" so the drive AND `consort-next` re-derive
  from the feature's own artifacts. (2) the sprint loop re-claimed + re-drove a
  completed feature; it now SKIPS a backlog feature whose own workflow derives to
  `done`. A feature shipped fully out-of-band (promotion merged outside the drive)
  is recovered by the forthcoming reconcile (FEIP-8018).

## [0.3.0-beta.23] - 2026-07-15

### Fixed

- **The surfaced promote-gate approval command now includes the required
  `--promote-ref` (FEIP-8019).** At the promote gate, both the drive's stop
  message and `consort-next` printed `consort-approve-gate
  --feature <F> --gate promote --approver <you>` with no `--promote-ref`. The
  promote gate requires a non-empty `promote_ref`; running the surfaced command
  returned "skipped promote (no promote_ref supplied)", a silent no-op, and the
  drive re-surfaced the same gate. The drive's own internal approval already
  supplied it (`cfg.featureBranch ?? feature`); only the human-facing command
  omitted it. The single structured `gateEnactCommand` map now emits the promote
  enact with `--promote-ref <feature-branch>` (read from the SCM workflow state),
  and both `approveHint` (the drive hint) and `consort-next` project from
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

- **`consort-next`: an authoritative, strictly read-only "what do I do
  next?" surface (FEIP-8017).** The deterministic drive knows exactly where the
  workflow is and what it would do next, but only WHILE it runs; every time it
  stops (a HITL gate, a raised escalation, feature-complete, an error, a killed
  run) an orchestrating agent otherwise reverse-engineers the next move from
  source and drifts into freeform (improvised CLIs, manual git, manual state
  edits). `consort-next (--feature <F> | --sprint <S>) [--json]` answers,
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

- **`consort-feature-status` now reflects per-story-driven completion
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
  (FEIP-8013).** The drive's `accept` was two commands (`consort-experiment
  merge` + `consort-pipeline accept`); the git-merge lived only in the
  experiment CLI and `pipeline accept` recorded state. Interactive, the gate stops
  before the accept effect, so a human running the hinted `pipeline accept` recorded
  `done` but never merged, and the accepted story's code stayed on the experiment
  branch (the next story then forked from a feature branch missing it). Now
  running `consort-pipeline accept` LANDS the code: it RESOLVES the merge
  args (experiment slug + branches from the persisted experiment record; instance
  from `--instance` else scm-state) and DELEGATES to `consort-experiment
  merge`, the single CLI that owns the git-merge (+ migrations + teardown) and
  records acceptance. `pipeline accept` itself never touches the merge substrate
  in-process, it routes through that CLI (as does the drive's single `accept`
  effect). The merge is idempotent: a re-run whose experiment is already merged
  skips the merge and just ensures the acceptance state. Cut and merge agree by
  construction (accept reads the branches `cut` persisted).

## [0.3.0-beta.20] - 2026-07-15

### Fixed

- **`consort-approve-gate` is now the one human door for the per-story spec
  gate too (FEIP-8008).** At a per-story spec gate the drive printed a generic hint
  (`consort-approve-gate --feature <id> [--gate <name>]`), but that records
  the FEATURE-level `gates.json` gate, not the PER-STORY gate the design lane blocks
  on (managed by `pipeline.json`, approved by `consort-pipeline approve-gate
  --story`). Following it recorded the wrong gate, exited 0, and the drive never
  advanced. `consort-approve-gate` now accepts `--feature <id> --story <s>`
  and routes the per-story gate through a shared helper (`approveStoryGateFromDisk`)
  that `consort-pipeline approve-gate` also uses, so both write identical
  state. The drive's `GATE` message now prints the EXACT command per gate kind:
  per-story spec → `--feature --story`, plan → `--sprint`, deploy/promote →
  `--feature --gate <name>`, PO acceptance → `consort-pipeline accept`.

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

- **`consort-approve-gate` – a human-facing gate-approval CLI (FEIP-8005).**
  The interactive plan gate (and per-feature HITL gates) await a human's approval,
  but the only CLI that RECORDED an approval was `consort-human-proxy`,
  which is explicitly labeled "NOT for production use" and defaults the approver
  to "human-proxy". A real Product Owner approving a real gate had to reach for a
  not-for-production tool. The new `consort-approve-gate` is the production
  counterpart: it REQUIRES an explicit `--approver` (no silent default identity,
  the deciding human names themselves) and reuses the SAME approval substrate
  (`approveSprintPlanGate` for the sprint plan gate; `drainGatesAsHumanProxy`,
  which assembles each open gate's artifact hashes and calls `approveGate`, for a
  feature's gates), so the recorded approval is byte-for-byte what the workflow
  expects. Usage: `consort-approve-gate --sprint <s> --approver <you>` (plan
  gate) or `--feature <id> --approver <you> [--gate <name>]` (a feature's gates).
  The tool records ATTRIBUTION; the decision must be the approver's. The `/plan`
  doc and the driver's `GATE` message now point humans at it; the Human Proxy
  remains the headless / smoke path.

## [0.3.0-beta.17] - 2026-07-15

### Added

- **`consort-sync-backlog` – the human door to commit an interactive
  sprint backlog (FEIP-8002).** Interactive sprint planning deadlocked at
  `author-requests`: `backlog.json` (from which `requestsAuthored` is derived) is
  written only by the `author-requests` effect (`supply-requests` + `sync-backlog`),
  which the interactive driver stops BEFORE performing; `supply-requests` reads
  sprint membership only from the proxy env channel; and there was no standalone
  sync-backlog CLI. So a human-in-the-loop Product Owner could author
  `feature-request.md` files but never commit a backlog or reach the plan gate.
  The new `consort-sync-backlog --sprint <s> [--features F1,F2]` declares
  this sprint's membership to `sprints/<s>/requested.json` (the SAME one file the
  Human Proxy writes, via new shared `readRequested`/`writeRequested` helpers – one
  membership source, no contradictory door) and projects `backlog.json` from the
  requested features that have a `feature-request.md`. The interactive loop is now:
  driver pauses at `author-requests` -> PO authors requests + runs `sync-backlog` ->
  re-run advances to the (interactive) plan gate. The `author-requests` PAUSE
  message names the CLI; `/plan` documents the step. Headless (Human Proxy) is
  unchanged – its `supply-requests` performs the same projection automatically.

## [0.3.0-beta.16] - 2026-07-15

### Fixed

- **Interactive `--plan-only` no longer misreports a PO pause as an approved plan
  (FEIP-8001).** In interactive mode (the default), `consort-drive --sprint
  <s> --plan-only` correctly stops after the Architect's estimate at the Product
  Owner's `author-requests` (the human must write the feature-request(s)). But
  that stop is a human-INPUT action, not an approval gate, and the completion
  handlers only inspected the approval-gate stop – so the run printed
  `planning complete (plan gate approved)` and exited 0 despite producing nothing
  (no `backlog.json` / `gates.json` / `feature-request.md`, workflow-state still
  at `discovery`). A caller would advance on an empty backlog. The human-input
  stop is now carried distinctly (`pendingInput`): `runSprint` halts on it instead
  of falling through to an empty backlog, and the CLI reports a clear
  `PAUSED – the PO must author feature-request(s), then re-run. Nothing was
  approved or produced` and exits NON-ZERO in the `--plan-only`, sprint, and
  `--feature` bound paths (the postcondition – an approved plan – is not met). A
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
  its reply, write no file, then on a re-dispatch claim it "already exists" – the
  handoff guard then aborted the run on the empty artifact. The directive is now
  explicit (WRITE `planning/feature-proposals.md`, author it fresh), and in
  capture/replay (recorded feature-requests present) the propose step is
  DETERMINISTIC: a new `consort-human-proxy supply-proposals` projects a
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
  e2e harnesses – the `client/` Playwright suite and the backend's
  server-rendered Python `tests/e2e` live_server – both binding the backend
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
- **Durable per-turn timing.** `consort-timing` now rolls up the driver's
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

- **`migration-app-coupling` smell + `consort-migration-clean` gate.** A
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
  call 404'd – Create PR and self-hosted runner setup both failed with "Not
  Found". The normalizer now extracts owner/repo after any host (SCP, `ssh://`,
  `https://`, with or without a user) and re-homes it on github.com.

### Added

- **`getActionsEnabled(ownerRepo)`** – reports whether GitHub Actions is enabled
  for a repo (returns `undefined` when undeterminable, so a missing token never
  false-alarms). Used by the new scm-doctor check + the extension's Health Check.
- **scm-doctor `github-actions-disabled` finding** – when Actions is off (commonly
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
  orchestrator (`consort-drive`) auto-migrates a legacy `.tdd` to `.sftdd` on
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
  `LAKEBASE_SFTDD_*`, matching the `consort-workflows` skill, the `scripts/sftdd/`
  dir, and the `consort-*` bins. Both are dual-read: `loadTddConfig` prefers
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
  `consort-workflows` naming. Existing `.tdd` projects keep working (dual-read)
  and are auto-migrated on the next orchestrated run, so no manual action is required.
  The `tdd-paths.ts` module was renamed to `sftdd-paths.ts`.
- **Spec Driven Development (SDD) framing.** `consort-workflows` docs now name
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
`npx github:databricks-solutions/consort#v0.3.0-beta.1`.

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
- **imports-clean gate** (`consort-imports-clean`): the app entry must import
  without an optional build artifact (e.g. `client/dist`) present, catching
  import-time coupling before deploy. New `import-time-build-coupling` bad smell
  plus a dev/prod-parity rule in the `software-design-principles` canon.
- **Claude Code plugin.** The kit installs as a plugin: `claude plugin
  marketplace add databricks-solutions/consort` then `claude plugin
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
  (`consort-timing`), a leaner pre-digested REVIEW rubric, a fresh-per-story
  build session, a low-effort REVIEW turn, and reduced inter-phase shell overhead.
- **Kit CLIs resolve through a project's `scripts/lk`** (ref-keyed cache or
  `LAKEBASE_KIT_DIR`) instead of per-call `npx` git resolution.
- The orchestrator is a **deterministic state-machine driver**
  (`consort-drive`), not an LLM agent.

## [0.3.0-beta.0] - 2026-06-05

First beta on the 0.3.0 line, graduating from the alpha series. Consume via
`npx github:databricks-solutions/consort#v0.3.0-beta.0`.

### Added

- **Artifact-conformance gate.** Per-artifact format registry: JSON
  artifacts are validated against their schema and narrative markdown against its
  required sections. The mock HITL approver hard-blocks a gate whose artifact
  exists but is malformed, rather than approving it.
- New schemas shipped in `dist`: `agent-log-event`, `architecture`,
  `design-guide`, `plan`. Shared schema loader removes duplicated validation
  wiring.
- `consort-gate-conformance` CLI to scan a feature's artifacts for
  conformance.
- **Structured agent logging.** JSON-lines events (role, timestamp, level,
  event) written to `.tdd/agent-log.jsonl`, with the `consort-log` CLI.
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

[0.3.0-beta.1]: https://github.com/databricks-solutions/consort/releases/tag/v0.3.0-beta.1
[0.3.0-beta.0]: https://github.com/databricks-solutions/consort/releases/tag/v0.3.0-beta.0
