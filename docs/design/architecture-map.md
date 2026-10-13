# Consort Architecture Map

> A wholesale engineering view of the codebase: what every directory owns, how the
> deterministic orchestrator operates end to end, and — the reason this exists —
> where a single fact still has more than one owner. The starting point for deciding
> where single gates should live.
>
> **Repo:** `databricks-solutions/consort` · **Version:** v0.3.65 ·
> **Core:** 590 files / ~19 subsystems · **Doors:** 47 CLIs + 25 MCP tools ·
> **Method:** six read-only subsystem audits + a measured import graph.

The repo has ~17 focused notes under `docs/design/refactor/`, each explaining one
change. None describes the whole. This map is that missing overview; the per-refactor
notes are its footnotes (listed at the end).

---

## 1. What consort is

Consort is a **deterministic orchestrator** for spec-first, test-driven development on
live Lakebase branches. A pure state machine (`consort-drive`) sequences eight stateless
LLM role agents through a **design lane** (spec → architecture → schema → test-list) and a
**build lane** (RED → GREEN → review → refactor), running every build cycle against a real
copy-on-write branch of a Postgres database. Human-in-the-loop gates fail closed.

The orchestrator is *not* an LLM. It reads state from disk, computes the single next
action, dispatches one role or opens one gate, records the turn, and writes a snapshot —
then loops. Role agents never call each other; every handoff is through files under
`.consort/`.

---

## 2. The layer model (measured)

Layering here isn't asserted — it's measured. Counting import edges between `consort/`
subdirectories gives each an **in-degree** (how many modules depend on it). High = foundational.

| Subsystem      | In-degree | |
|----------------|----------:|---|
| **config**     | 99 | the floor — everything reaches into it |
| orchestrator   | 36 | the brain / hub |
| logging        | 23 | |
| gates          | 23 | |
| pipeline       | 20 | |
| smells         | 18 | |
| experiment     | 17 | |
| architecture   | 10 | |
| test-list      | 6 | |
| session        | 6 | |
| setup          | 4 | |
| lakebase       | 4 | |
| intake         | 2 | |
| deploy         | 2 | |
| telemetry      | 1 | leaf |

Conceptual bands, foundation upward:

- **Foundation** — `config`: the `.consort` layout, path resolution, per-step agent config, schemas.
- **Engine & lanes** — `orchestrator` (brain), `gates` (HITL + conformance), `pipeline` (build-lane state machine).
- **Domain services** — `experiment`, `test-list`, `smells`, `architecture`, `intake` (the artifact lifecycle).
- **Substrate & I/O** — `lakebase`, `deploy`, `setup`, `session` (Postgres, git, the world).
- **Observability** — `logging`, `telemetry`, `reports` (always-on, fire-and-forget, never in the critical path).

> **First coupling signal.** `orchestrator ↔ gates` is bidirectional (orchestrator→gates 11
> edges, gates→orchestrator 4), as are `orchestrator↔session` and `orchestrator↔telemetry`.
> Bidirectional coupling between the engine and its gate layer is exactly the "which one owns
> this?" ambiguity that makes a single gate-home hard to point at. First candidate to untangle.

---

## 3. Directory reference

### Engine & control

| Directory | Owns | Key contents | How it's used |
|---|---|---|---|
| `consort/config` | The single source for the `.consort` layout and all project settings. | `consort-paths.ts` (resolveConsortDir, ARTIFACT_ROOT), `step-key.ts`, `project-settings.ts`, `schemas/` | Imported by nearly everything (in-degree 99). All path + config reads route here. |
| `consort/orchestrator` | The deterministic brain: derive state, choose the next action, dispatch roles, run the loop. | `drive/` (nextTransition, run-loop), `state/` (derive, probe), `status/next.ts`, `turns/` (7-phase executor), `validators/conformance` | Backs `consort-drive`, `consort-next`. The hub. |
| `consort/gates` | HITL gate state, approval/withdrawal, artifact conformance, escalation channel, handoff expectations. | `gates.ts`, `approve-gate.ts`, `gate-conformance-guard.ts`, `escalation.ts`, `orchestrator-expect.ts` | Advance-gate phase; backs `consort-approve-gate`, `-withdraw-gate`, `-resolve-escalation`. |
| `consort/pipeline` | The build-lane state machine: `pipeline.json`, RED/GREEN cycle records, design fingerprint. | `story-pipeline.ts`, `cycle-record.ts`, `design-fingerprint.ts` | Read/written by the orchestrator to sequence every story's build. |

### Artifact lifecycle

| Directory | Owns | Key contents | How it's used |
|---|---|---|---|
| `consort/intake` | Spec/story intake and the heal-then-check narrative reconcile. | `spec-sync.ts` (normalizeStoryJson, narrative parse) | Design-time breakdown hook + gate-time reconcile; backs `consort-intake`. |
| `consort/experiment` | Cut / promote / discard per-story experiments (paired git + Lakebase branch). | cut with env-sync + git-ancestor + stale-branch guards | Build lane forks a fresh branch per story; backs `consort-experiment`. |
| `consort/test-list` | The test-list model and per-AC ordering. | test-list schema + item model | Test Strategist output; backs `consort-test-list`. |
| `consort/smells` | The bad-smell catalog + classification into blocking escalations; ephemeral-verify. | smell classifiers, `ephemeral-verify.ts` | Raised during build/review; feeds the escalation channel. |

### Substrate & delivery

| Directory | Owns | Key contents | How it's used |
|---|---|---|---|
| `consort/lakebase` | Kit lifecycle (upgrade: quiesce → dual-pin → refresh → rollback), adoption, doctor gate, surface refresh. | `upgrade.ts`, `kit-ref-pin.ts`, `create-doctor-gate.ts` | Backs project create/adopt + `consort-upgrade`. |
| `consort/deploy` | Deploy-target resolve, reachability probe, feature-verify with ephemeral-branch isolation, deploy evidence. | `deploy.ts` (ensureDeployedAndVerify) | Per-story + feature deploy gate; backs `consort-deploy`. |
| `consort/architecture` | Standing project canon + the deterministic cleaners (no LLM). | `layering-clean`, `contract-clean`, `imports-clean`, `design-adherence`, `migration-app-clean` | Backs the `*-clean` validator CLIs; gates design-complete + deploy. |
| `consort/setup` · `session` · `update` | Scaffold hooks; session/resume state; surface refresh on version bump. | create hooks, session readers, update-agents/-commands | Create-time + resume + kit-upgrade paths. |

### Observability & tuning (off the critical path)

| Directory | Owns | Key contents | How it's used |
|---|---|---|---|
| `consort/telemetry` *(operational)* | Privacy-safe spans on a frozen allowlist, fire-and-forget detached sender. | `spans.ts`, `allowlist.ts`, `emitter.ts` | Backs `consort-telemetry`/`-send`. Ingest is a separate repo. |
| `consort/logging` *(operational)* | Closed-vocabulary `agent-log.jsonl` + the universal turn-recorder (one recorder feeds live drive and replay). | `agent-log.ts`, `agent-log-events.ts`, `turn-recorder.ts` | Every drive event + replayable corpus. |
| `consort/reports` | Post-mortem analysis: per-turn timing, tool-call breakdown, run comparison. | `timing-report.ts`, `drive-log-report.ts`, `comparison-report.ts` | Off-path; run after a drive completes. |
| `consort/optimize` | The champion-walk tuning harness (per-handoff lever sweep). | `optimize-harness.ts`, candidates, live/apply | Separate CLI lane; backs `consort-optimize`/`-apply`. |
| `consort/evaluation` | Fixed-Opus semantic judge + pinned reference corpus (~370 files). | `semantic-gate.ts`, `reference-assets/stockflow/` | Off-path; gates regression + optimization candidates. |

### Surfaces — the doors in

| Directory | Owns | Key contents | How it's used |
|---|---|---|---|
| `bin/` | ~47 CLIs (`consort-*` + `lakebase-*` + legacy aliases) — the invocation surface. | drive, next, approve-gate, deploy, experiment, readers + validators | Should be thin wrappers over `consort/`; several are fat (see §6). |
| `apps/mcp-server` | 25 MCP tools (branch / PR / migration / diagnostics) over stdio — same functions as the CLIs. | `index.ts`, `tools.ts` | Consumed by Claude Desktop, Cursor, Codex, and the VS Code extension. |
| `commands/` | The `/consort:start` entry: telemetry gate → detect → resume/create → detached drive + poll-once relay. | `start.md` | The human's front door; documents the relay + per-story cadence rules. |
| `skills/` | The agent canon: 8 role prompts + orchestrator/test references + cross-project design principles. | `consort/agents/*.md`, `software-/architectural-/ui-ux-design-principles` | Loaded when the drive spawns a role; the prose rulebook. |
| `templates/` | The scaffolded project surface: `.consort` bootstrap, `.claude/`, scripts, CI, app skeleton. | `consort-bootstrap/`, `project/{common,python,nodejs,java}`, `scripts/lk` shim | Copied by `lakebase-create-project`; `{{PLACEHOLDER}}` substitution at create time. |

### Supporting

| Directory | Owns / holds | How it's used |
|---|---|---|
| `docs/` | Per-refactor design notes, plans, runbooks, logo. | Reference; no wholesale overview until this map. |
| `tests/` | ~267 Vitest files: `bdd/`, optimization, live, integration, mcp. | Enforces allowlist reachability, gate semantics, artifact fidelity, executor equivalence. The push gate. |
| `scripts/` | Build/release + live-test drivers + role tuning sweeps + skill sync. | CI + operator tooling. |
| `traffic/` · `dist/` | GitHub traffic CSVs; committed build output. | Adoption reporting; `git add -f dist` at each release. |

---

## 4. How it operates

**One tick of the drive loop.** The next action is *derived fresh every iteration* from
on-disk state — there is no persisted next-action pointer, so the same state always yields
the same action.

```
Read state ──▶ deriveDriveState ──▶ nextTransition ──▶ act ──▶ record ──▶ write next.json
(pipeline.json   (pure projection)   (one action,       (dispatch   (turn +      (awaiting_human?)
 + artifacts)                         deterministic)     role /      telemetry,
                                                         open gate / fire-and-forget)
                                                         escalate)
        ▲                                                                              │
        └──────────────── loop while next.json.awaiting_human === false ◀─────────────┘
```

If `awaiting_human === true`, the drive stops and surfaces the decision to the human.

### The control signals

- **One pause signal.** `next.json :: awaiting_human` is the sole "the machine needs a
  person" flag — never reverse-engineered from open gates or action kind (a planning backlog
  pause has neither).
- **Escalations pre-empt.** An unresolved blocking problem (11 smell classes + deploy-verify
  failure) emits `raise-to-hil` and halts before anything else.
- **Gates pause, then resume.** The five HITL gates — `spec`, `plan`, `test_list`, `promote`,
  `deploy` — pause at approval and auto-resume once approved. State lives in `gates.json`
  (atomic) + a human-readable `selection-log.md`.

### The per-story cadence

A feature isn't built then shipped — each story runs the full loop on its own experiment
branch, and only accepted stories merge up.

```
Design ─▶ Spec gate ─▶ RED→GREEN ─▶ Review+refactor ─▶ Deploy-verify ─▶ Accept gate
(spec/arch/    (PO approves   (on experiment  (navigator ↔     (ephemeral      (merge into
 schema/tests)  structure)     branch)         driver)          child branch)   feature)
```

Repeat for each story; **feature-level promote happens only after all stories are accepted.**
A mid-feature `/deploy` is a per-story acceptance, not a ship.

---

## 5. Single doors that already exist

The discipline is real in the load-bearing places. These facts already have exactly one
owner — the model to extend, not fix.

| Fact | Single owner |
|---|---|
| The `.consort` layout & all paths | `config/consort-paths.ts` · resolveConsortDir |
| The next action | `orchestrator` · nextTransition(state), derived fresh |
| "Needs a human" signal | `next.json :: awaiting_human` |
| Build-lane state | `pipeline.json` |
| Gate state (+ audit narrative) | `gates.json` + `selection-log.md`, atomic |
| Pending escalation (the reader) | `gates/escalation.js` · firstPendingEscalation |
| Per-step model / effort | step-manifest `agentOptions` (winners written back here) |
| Telemetry schema | `telemetry/allowlist.ts` — frozen, reachability-guarded |
| Log / turn vocabulary | `agent-log-events.ts` (closed) + one turn-recorder |
| The quality bar | `evaluation` · fixed Opus semantic judge |

---

## 6. Where a fact still has more than one owner

The payload for the gate-placement work. Severity: **honor-only** = no code enforces it;
**scattered** = enforced but in several places; **coupling** = structural.

### Rules that live only in agent prose (honor-only)

Stated in role prompts; caught by an advisory reflect-pass at best; no gate hard-blocks them.
An agent that forgets, or a hand-edited artifact, passes.

- **AC independence** — owner: `spec-author.md` prose. The spec gate checks the `independence`
  field is *present*, not that the ACs are logically independent.
- **Cross-story AC contradiction** — owner: `navigator.md` REFLECT via
  `consort-cross-story-context`; advisory, routes a revise, no hard stop.
- **Field-contract gap** (a NOT-NULL persistence field with no user-facing submit AC) —
  owner: `navigator.md` REFLECT; advisory; nothing scans architecture × test-list.
- **Never weaken an AC · never mock the DB · never delete a test** — owners: `navigator.md`,
  `driver.md`, `product-owner.md`, `test-strategy.md`. No gate re-reads the Gate-1 `then` for
  drift; no linter catches a mocked DB or a deleted test.

### Canon duplicated across skill files (scattered)

- **The layering rule** is restated in `architectural-design-principles`,
  `architect-reviewer.md`, `driver.md`, `test-strategy.md`, and `test_layering.py`.
  **Home →** one authoritative reference; every agent and the fitness test cite it. (Same
  pattern for config-in-env and no-mock-DB.)

### Resolution & enforcement scattered in code (scattered)

- **Workspace context (host / profile / instance / database)** — split across scm-utils
  helpers, `provisioning/credentials.ts`, and `deploy.ts` reading `.env` directly. No single
  consort-side resolver threads all four. **Home →** one `resolveWorkspaceContext(projectDir)`.
- **Model / effort config** — read from `consort-config.json` and legacy `agent-config.json`;
  unified only inside `project-settings.modelFor()`. **Home →** retire the legacy file;
  step-manifest `agentOptions` is the sole home.
- **story.json conformance** — enforced in `spec-sync`, `artifact-conformance`,
  `story-pipeline`, and `gates/` (4 sites). **Home →** one heal-then-check gate (the recent
  `gate-conformance` move is the pattern; make it the only site).
- **Test-list item status** — lives in `test-list.json`, cycle records, and per-story views.
  Cycle records are the truth, but not the single read. **Home →** cycle records own it; views derive.
- **Artifact validation** — 11+ entry points: `response-formatter` (agent-side precheck) and
  `gate-conformance` (orch-side gate) validate overlapping artifacts with no documented
  division of labor, plus 9 `*-clean` validators. **Home →** declare the precheck→gate
  hierarchy; the gate is the authority.

### Structural coupling & fat wrappers (coupling)

- **orchestrator ↔ gates (and ↔ session, ↔ telemetry)** — bidirectional imports blur which
  layer owns the gate decision. **Fix →** one direction: gates depend on shared workflow
  vocabulary (in `config`), not on the engine.
- **Business logic in the bin layer** — `drive.cli.ts` is 1462 lines; ~26 of 47 CLIs lack the
  `isCliEntry` guard, so logic can't be imported or tested. **Fix →** extract `runXxxCli` pure
  functions to the service layer; keep bins thin.

---

## 7. Toward single gates

The organizing principle, and the one to hold the mapping work to: **one fact = one owner =
one door.** A recovery path or invariant that even its author must re-read to follow is too
complex — fix by subtraction, by finding the existing common path, not by adding another
latch. This table is the starting point, not the plan.

| Scattered fact | Proposed single home |
|---|---|
| Design-rule invariants (AC independence, cross-story contradiction, field-contract gap, no-weaken, no-mock, no-delete) | Hard-blocking checks in the conformance/gate layer (`gates` + `architecture` cleaners); prose *cites* the code, doesn't restate it. |
| Engineering canon (layering, config-in-env, no-mock) | One authoritative reference in `skills/architectural-design-principles`; agents + fitness tests cite it. |
| Workspace context | One `resolveWorkspaceContext(projectDir) → {host, profile, instance, database}`. |
| Model / effort | Step-manifest `agentOptions` only; retire `agent-config.json`. |
| story.json conformance | One heal-then-check gate. |
| Artifact validation | Documented precheck → gate hierarchy; gate is authority. |
| CLI wrappers | Pure `runXxxCli` in service layer; bins thin + `isCliEntry`-guarded. |
| Engine ↔ gate coupling | Extract shared workflow vocabulary to `config`; make the dependency one-directional. |

> **Next step.** This map is the substrate for the mapping pass — walking each candidate home
> above, confirming the single owner, and sequencing the moves. The honor-only rules are the
> highest-value conversions: they're the invariants the system currently trusts an agent to
> remember.

---

## Method & provenance

Six parallel read-only subsystem audits (orchestrator, artifact lifecycle,
gates/config/deploy/substrate, CLI surface, agent canon, observability) plus a measured
import graph of `consort/**`. Read-only — no source changed. Compiled against
`databricks-solutions/consort` at v0.3.65.

Existing per-refactor design notes this map sits above: `orchestrator-deterministic-driver.md`,
`per-story-pipeline.md`, `per-story-experiments.md`, `executor-unification-a-full.md`,
`per-role-agent-runtime.md`, `tier-hierarchy-and-handoff-contracts.md`,
`ac-independence-and-revise-routing.md`, `layered-build-fitness-bdd-enforcement.md`,
`architect-canon.md`, `hil-intake-interview.md`, `channel-model-live-proof.md`,
`scm-workflow-state.md`.
