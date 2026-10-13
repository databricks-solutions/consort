---
name: consort
description: "Consort, a spec-first, test-driven agent framework for building transactional applications on Lakebase-paired projects: a deterministic orchestrator drives role agents through a spec-first design lane (Spec Driven Development) and a Test Driven Development build lane (RED-GREEN-REFACTOR) that runs against a live copy-on-write branch of a real, governed Lakebase database (Databricks' serverless Postgres/OLTP database, not the Delta Lakehouse), composed with paired-branch primitives (cheap experiments, parent-aware schema diff, real per-branch databases). The controls are code the agent cannot edit: gates fail closed, tests are immutable within a unit of work, and a green result is a real test run against real data. Spec-first means the spec is drafted, reviewed, and frozen at gates before any build cycle runs; the spec, the architecture, and the database all evolve increment over increment. Use when planning a new feature, running design-spec gates, running TDD cycles, comparing parallel experiments, or detecting build bad smells. Imports software-design-principles canon. Builds on lakebase-scm-workflows."
user-invocable: true
---

# Consort – agent contract

Agent-facing contract: hard rules, phase flow, agent prompt index, and concrete code patterns for the kit's orchestration primitives.

For the human-facing overview (lexicon, roles narrative, how-to-use prompts, project entry points) see [`README.md`](README.md).

## Hard rules

The contract every agent (Navigator, Driver, Orchestrator) and every human collaborator must honor.

1. Tests are immutable until the test list itself is renegotiated through the PO. Never delete or weaken a test to make it pass.
2. "Minimal code" means minimal *honest* code that satisfies the current test list, not just the current test. Use the test list as your horizon.
3. After every GREEN, ask: "would a fresh reader infer the right concept from this API now?" If no, request REFACTOR before the next test.
4. Test at the outermost public boundary that maps to the AC. Inner-loop unit tests are reserved for pure logic that can't be exercised through the outer boundary.
5. A correct refactor should not change the outer-boundary tests. A refactor that requires editing tests is suspect.
6. Never make a private method public to test it.
7. Test count is a lagging indicator. The leading indicator is "how cheap is the next test?" Rising cost = design problem.
8. Spike code is throwaway. Promote nothing from a spike branch into a TDD branch except notes.
9. Experiments are scoped to a story (the branch forks from feature HEAD). N=1 is one experiment per story (iterative refinement, no promote/synthesize ceremony); N>=2 races competing strategies for that story. The PO accepts a story's experiment by **merge** (git-merge + run its migrations against the feature branch DB), or discards/revises it.

See [`agents/navigator.md`](agents/navigator.md) and [`agents/driver.md`](agents/driver.md) for per-role specializations.

## Phases and gates

Consort is **spec-first and test-driven**: it composes two disciplines back to back. The **design lane is spec-driven** – spec drafting, architectural review, test-list construction, all driven by `/design` – and the **build lane is test-driven** – the RED → GREEN → REVIEW → REFACTOR cycles driven by `/build`. Spec-first means the design lane freezes the spec at the `spec` + `test_list` gates; the build lane only starts once they are approved, so the build always runs against a reviewed spec.

**Iterative and evolutionary.** The freeze is per increment, not forever. Across increments, all three dimensions evolve and are never treated as static: the **spec and features** are living – each sprint the PO re-plans, folding in what the last working software revealed; the **architecture** evolves under fitness functions (`@architectural-design-principles/evolutionary-architecture.md`); and the **database** evolves by migration on the paired branch, diffed against its parent (`@architectural-design-principles/evolutionary-database-design.md`). The rule is: spec-first within an increment, evolutionary across increments.

Gates are keyed (not numbered): `spec` / `plan` / `test_list` / `promote` / `deploy`. The SDD lane runs PER STORY (it streams), and experiments + plans are per-story.

| Step (per story unless noted) | Output | HITL gate |
|---|---|---|
| Spec drafting | `feature-spec.{md,json}` (feature) + per-story `story.{md,json}` + `acs/<AC>.{md,json}` | **`spec` gate** |
| Architectural review | `layer` + `architectural_notes` on each AC; `architecture.{md,json}` (holds the NFRs) | folds into the `spec` gate |
| Test-list construction | per-story `test-list-per-story.json` (scoped from the feature `test-list.{md,json}`) | **`test_list` gate** |
| Build (per AC) | cut a per-story experiment; RED -> GREEN -> REVIEW -> REFACTOR cycles producing tests + code | Continuous: smells; per story: **accept (merge) / discard / revise** |
| Deploy | working software on the experiment branch (reachable + verify) | **`deploy` gate** |

Sprint planning has its own **`plan` gate**. For N>=2 experiments within a story, the menu-pick promote/synthesize decision is recorded under `synthesis/<F>/`. Refuse to transition if prior-step artifacts are missing or invalid.

### Enhancement review (placeholder, TODO)

Enhancements are decided iteratively. After a feature ships, new work is proposed and prioritized with the Product Owner during sprint planning (`/plan`) - the same gate that commits any sprint - so the loop keeps returning to the PO for the next increment.

**TODO (not yet implemented):** add a review role that inspects the **running, deployed software** (post-`deploy`) and recommends concrete enhancements back to the PO as candidate features for the next `/plan`. This mirrors the existing review lens (the Architect Reviewer / Navigator review the spec and code) but aimed at observed runtime behavior rather than source. To flesh out: the trigger point (post-`deploy`), the inputs (the reachable endpoint + `feature-status`), the output (enhancement candidates feeding `planning/feature-proposals.md`), and the PO hand-off. Until this lands, enhancements are surfaced manually at sprint planning.

The phases + gates above are the PER-FEATURE pipeline that `/design` (phases 0 to 2 + gates 1 to 4) and `/build` (phase 4) run. They sit inside a larger orchestrated loop:

## Orchestrated commands (the dev loop)

Every command is a thin invocation of the deterministic orchestrator driver (`consort-drive`), scoped to a phase range. The driver sequences the work and spawns each role as a subagent (`claude -p --agent <role>`); routing is code, not an LLM. Gates always pause for a human decision: `--gates interactive` (the default for the live slash commands) stops at each gate so the human answers; `--gates proxy` (headless / CI) has the Human Proxy answer.

```
Tier 1:  /sprint  = plan ─> [PLAN GATE] ─> per feature: /design ─> /build ─> /deploy
            ▲                                                                   │
            └──────────────────── working software feeds back ─────────────────┘
Tier 2:  /plan  /design  /build  /deploy   (run ONE phase, then stop + suggest next)
         /spike                            (throwaway exploration, outside the loop)
```

- **`/sprint [name]`** (Tier 1, the top-level orchestrator): runs the whole sprint as one continuous flow, plan to the plan gate, then claim + drive each backlog feature `design` -> `build` -> `deploy`. Re-invoked per cycle; resumable (halts at the next HITL gate for the human, continues on re-run). `consort-drive --sprint <name>`.
- **`/plan [name]`** (Tier 2, sprint planning, ABOVE the per-feature loop): the **Spec Author** proposes the candidate breakdown (`.consort/planning/feature-proposals.md`); the **Architect** t-shirt-sizes the candidates (`.consort/planning/estimates.json`, XS/S/M/L/XL); the **Product Owner** commits the backlog by authoring a `feature-request.md` per feature that fits sprint capacity; the deterministic `sync-backlog` step projects `.consort/sprints/<name>/backlog.json` (committed ids + sizes); the **sprint plan gate** is the HITL checkpoint. Stops there (does not flow into design). Requires project intake (`product-overview.md` + `nfrs.md`, +`design-brief.md` for UI) as a precondition. `--sprint <name> --plan-only`.
- **`/design <feature-id>`**: the **SDD (Spec Driven Development)** lane. Claims the paired branch (Step 0), enforces the feature's `feature-request.md` + project intake (Step 0.5, a precondition, NOT a gate), then drives the per-story design lane (Spec Author -> Architect Reviewer -> DBA -> Test Strategist) to the spec + test_list gates, producing the executable spec. The DBA turns the architect's logical persistence contract into a physical schema (`db-design.json`). `--only design`.
- **`/build <feature-id>`**: the **TDD (Test Driven Development)** lane. RED -> GREEN -> REVIEW -> REFACTOR cycles + per-story acceptance against the frozen spec, to ready-for-review (requires the SDD lane done). `--only build`.
- **`/deploy <feature-id> [--target local] [--story <s>]`**: deploys the merged feature (or one story's branch) + verifies reachable + feature-verify; the **deploy gate** is the working-software review the PO signs off (the local target is the only one implemented; remote release is the scaffolded `merge.yml`). `--only deploy`. For a hands-on review the human can run `./scripts/run-dev.sh` to serve the app locally (migrates + hot-reload) and open it in a browser.
- **`/spike <slug> [--for <feature>]`**: throwaway exploration on its own paired branch, OUTSIDE the workflow (no gates). Notes carry forward into a feature's design-spec gate; code is never promoted. `consort-spike`.

The same orchestrated path runs for real and headless; headless, the Human Proxy stands in for the human at every supply + gate (below).

## Headless / Human Proxy mode

By default every gate is HITL (the workflow halts for the Product Owner). When `LAKEBASE_CONSORT_HUMAN_PROXY=1` (set by CI and the smoke), the approver role is **performed by** the `human-proxy` identity, a diligent stand-in, not a rubber stamp. For the artifact gates (`spec`/`plan`/`test_list`/`promote`), it approves a `gates.json` gate and emits `gate.approved` only when both hold (the `deploy` gate is certified differently, see the `/deploy` bullet below):
- **Given the artifacts:** the gate's expected artifacts EXIST (a missing one is refused).
- **Format-conformant:** each validates against its declared format (JSON against its schema; narrative MD against its required sections, see `references/spec-format.md` + `consort-gate-conformance`). A malformed artifact, or one missing a required section, is refused.

So the producing role's job here is to HAND the approver complete, conformant artifacts, recording its recommended resolutions (decisions, NFR acceptances, orderings) INSIDE them rather than leaving open questions for a human reply. A gate advances because real well-formed work was verified, never because it was skipped; a missing/malformed artifact hard-blocks in CI exactly as for a human.

Beyond the gates, the Human Proxy stands in wherever the path needs human input (`consort-human-proxy` has two subcommands, `supply` and `approve`; both validate-then-place, neither fabricates or skips):
- **Project intake** (precondition of `/plan` + `/design`): `supply`s `product-overview.md` / `nfrs.md` / `design-brief.md` from `$LAKEBASE_CONSORT_RECORDED_INTAKE_DIR`; `consort-intake` then passes because they're present + conformant.
- **`/plan` backlog:** the Architect sizes the candidates live; the Proxy `supply`s the recorded `feature-request.md` files (the PO's groomed sprint). `sync-backlog` projects `backlog.json` (committed ids + sizes).
- **`/deploy` gate:** confirms the app came up reachable AND the verify passed, then records `gate.approved`; never approves a non-reachable or failed-verify deploy.

Check the mode with `[ "$LAKEBASE_CONSORT_HUMAN_PROXY" = "1" ]`. Absent/unset = normal HITL.

**Running commands headless.** A role turn runs with artifact edits auto-accepted and a fixed Bash allow-list: the kit CLIs (`./scripts/lk …`), `npm …`, `uv run …`, `npx playwright …`, and `cd …`. Make every artifact edit with the file-edit tool (auto-accepted), and run each kit command — your self-check included — as its own command so it matches a granted prefix. The permission matcher evaluates a compound (`a && b`) by every segment and grants it only when all of them are granted, so a kit command keeps its grant when it stands alone.

## Configuration (one source of truth per setting)

Every knob has exactly ONE home; see [`CONFIG.md`](CONFIG.md) for the full table + writers. In brief:

- **Project settings** (what the project IS: `uiTrack`, `gates`, `deployTarget`, the per-role model matrix, build cadence) live only in `.lakebase/consort-config.json`, resolved **file -> code default** by `resolveConsortSettings`. There is no env or flag override at read time. The writers are create-project (create-time, e.g. `--ui-track`) and the drive's write-through flags (`--gates` / `--deploy-target` / `--no-sizing`), which persist INTO the file before it is read.
- **`uiTrack` is the single door for the UX lane.** It drives BOTH the UX Designer (design-guide / `ia.md` / adherence gate) AND the e2e harness (create-project derives e2e from it, and refuses a UI project without it). A UI project can never run with the UX lane off.
- **Run-mode knobs** (record/replay, headless, debug, e.g. `LAKEBASE_CONSORT_AUTO_CONTINUE`, `_TRACE`, `_RECORD_DIR`) are per-invocation `LAKEBASE_CONSORT_*` env vars, read via `consortEnv` (canonical prefix; the legacy `LAKEBASE_CONSORT_*` / `LAKEBASE_CONSORT_*` prefixes are still honored). They are NOT project settings and never belong in `consort-config.json`. (`LAKEBASE_CONSORT_HUMAN_PROXY`, the headless-approver switch, is a raw-shell-checked var the command templates read directly, not a `consortEnv` knob.)
- **Capture-time conditions** live in a scenario's `scenario.json` and are funneled into create-project flags by `capture-scenario.sh`; they never reach the drive directly.

## Agent roles (the per-role agent runtime)

Each role is a separate agent definition under [`agents/`](agents/) with frontmatter (`name`, a `description` that is the auto-selection criteria, least-privilege `tools`, a strongly-recommended `model`, `memory: project`, `color`) and a body that is its system prompt. The roles communicate only through the artifacts on disk, the artifact is the inter-agent API.

- [`agents/product-owner.md`](agents/product-owner.md) – the PO's facilitator: runs the intake interviews + drafts `product-overview.md` / `nfrs.md` / `design-brief.md`, authors the sprint's `feature-request.md` files at `/plan`, and is the approver at every HITL gate. Headless, the Human Proxy plays the PO.
- [`agents/spec-author.md`](agents/spec-author.md) – the Spec Author (BA). At `/plan`, proposes the feature breakdown from `product-overview.md` + `nfrs.md` (`feature-proposals.md`, the PO's input). At `/design` phase 0, turns one feature's `feature-request.md` into the structured draft spec (`feature-spec.{md,json}` + stories + ACs).
- [`agents/ux-designer.md`](agents/ux-designer.md) – between phase 0 and 1, **UI projects only**: owns `design-guide.{md,json}` + `ia.md` and the UX adherence gate. Skipped for API/CLI/Infra-only features.
- [`agents/architect-reviewer.md`](agents/architect-reviewer.md) – phase 1, populates `layer` and `architectural_notes`, covers every `nfrs.md` Required item via `architecture.json` `brief_ref`, imports `software-design-principles`.
- [`agents/test-strategist.md`](agents/test-strategist.md) – phase 2, builds the Beck-style ordered test list.
- [`agents/navigator.md`](agents/navigator.md) – phase 4 PLAN + RED + REVIEW.
- [`agents/driver.md`](agents/driver.md) – phase 4 GREEN + REFACTOR.
- **Deploy + promote are deterministic (no agent).** The orchestrator itself runs `consort-deploy` (deploy the increment, poll reachable, run the feature verify) and `lakebase-scm-merge` (promote via PR + CI + merge), surfacing the deploy and promote gates to the PO. These phases log under the `release-engineer` label but spawn no LLM agent.
The **orchestrator** is the deterministic driver (`consort-drive`), **not an LLM agent**: it routes over `workflow-state.json`, hands each phase to the right role agent above, carries artifacts forward, and surfaces every gate to the PO. It writes no spec/code/test/deploy.

**How the orchestrator runs them.** The role defs are scaffolded into the project's `.claude/agents/` (so Claude Code can discover + spawn them; the skill copy is the source). The driver computes the next action as a pure function of the recorded state, then spawns the role for that phase via `claude -p --agent <role>`. Routing is code, not a model: there is no LLM orchestrator session. Before spawning a role, the driver resolves the model from the project's `.lakebase/consort-config.json` via `resolveConsortSettings` (`roles.<role>.model`, the single source of truth for project settings). Resolution is `consort-config.json role model ?? legacy .lakebase/agent-config.json (override ?? recommended) ?? built-in recommended ?? inherit`: `agent-config.json` is honored only as a fallback for projects scaffolded before `consort-config.json`. The HIL sets per-project models at `lakebase-create-project`; each role's recommended model lives in its definition's `model:` (mirrored in `RECOMMENDED_MODELS`).

## References

- [`references/spec-format.md`](references/spec-format.md) – full `.consort/` directory layout + markdown ↔ JSON contract.
- [`references/orchestrator-contract.md`](references/orchestrator-contract.md) – how the agent DRIVING `/sprint` `/design` `/build` `/deploy` must behave: drive to completion via `consort-next`, surface only HITL gates + blockers, report outcomes (not process), verbose/eval narration opt-in. The orchestrator's counterpart to `agent-operating-rules.md`; the command templates load it.
- [`references/next-schema.md`](references/next-schema.md) – the `consort-next` / `.consort/next.json` "what next" surface the orchestrator contract drives on.
- [`references/agent-logging.md`](references/agent-logging.md) – structured agent log format + per-role emit points. Every role emits what it is doing via `consort-log` (debug = reasoning, info = outputs) to the centralized `.consort/agent-log.jsonl`.
- `consort/config/schemas/` – JSON Schemas validated by `spec-sync.ts`.
- [`../software-design-principles/SKILL.md`](../software-design-principles/SKILL.md) – engineering canon (SOLID, DRY, clean code, layered architecture, cross-cutting concerns, NFRs). Required reading for Architect Reviewer and Navigator.

## tag → runner map

Every AC declares a `layer` ("API" / "E2E" / "Infra" in `ac.schema.json`). The Driver dispatches to the runner that matches the current cycle's layer, not a single uniform `npm test`. The kit enforces this: `markGreen` refuses to advance a layer-tagged cycle until `recordRunnerOutcome` has logged at least one run for the matching tag.

A test-list item's `kind` refines this: a **`kind:"client"`** item (a UI-presentation AC the architecture routes to the SPA's own harness) runs through the CLIENT toolchain regardless of layer – `npm --prefix client test` (Vitest component test) or `npm --prefix client run test:e2e` (Playwright spec), authored under `client/tests/`. `behavior`/`fitness` items run through the layer runner below.

| AC.layer | tag | Default runner | Notes |
|---|---|---|---|
| `API` | `api` | `npm test` (Node), `./mvnw test` (Java/Kotlin), `uv run pytest` (Python) | The project's primary test runner. Driver runs it as-is. |
| `E2E` | `e2e` | `npm run test:e2e` (Node, alias for `playwright test`) or `uv run --extra dev pytest tests/e2e` (Python, pytest-playwright) | Wired by `lakebase-create-project --enable-e2e` (ships the Node `playwright.config.ts` + smoke for Node, the `tests/e2e/conftest.py` `live_server` fixture for Python). Driver exports `BASE_URL` at the paired-branch app endpoint before invoking; `scripts/run-tests.sh` runs whichever matches the project. A missing `tests/e2e/conftest.py` is a `scaffold-defect` to surface, never author it in the build. |
| `Infra` | `infra` | `npm run test:infra` (alias for `lakebase-infra-runner`) | Wired by `lakebase-create-project --enable-infra`. Ships three kit-side checks: migrations-clean, schema-diff-computable, connection-reachable. JUnit XML output via `--junit-output` matches vitest's reporter shape. When no runner is wired, the Driver flags the cycle and surfaces to PO; do not silent-skip. |

Each cycle records its runner outcome via `recordRunnerOutcome({ scope, cycleId, experimentSlug, layer, passed })`. The kit uses these counts for `outcomes.by_tag`, the `e2e-row-perma-red` smell detector, and the design-spec gate guard.

```ts
import { recordRunnerOutcome, markGreen } from "consort/pipeline/run-cycle";

// Run the runner mapped to the current cycle's layer, then:
recordRunnerOutcome({ scope, cycleId: c1.cycle_id, experimentSlug: "checkout", passed: true });

// markGreen now sees at least one run for the layer's tag and allows the cycle to advance.
markGreen(scope, c1.cycle_id, "added POST handler + repository write");
```

## Operations

Concrete invocations of the kit's orchestration primitives.

### Design-spec gate (phase 3)

```ts
import { analyzeForGate, recordPlan, writePlan } from "consort/gates/design-spec-gate";
import { canCutAnotherExperiment } from "consort/session/budget";
import { attachSpikeInputs } from "consort/experiment/spike-carryforward";

const analysis = analyzeForGate(".consort", "F1", "S1");
// analysis.opinion_gaps[]            – items the analyzer flagged as opinion gaps
// analysis.proposed_plan              – { mode: "N=1" | "N>=2", N, strategies[], budget, rationale }
// analysis.proposed_plan.budget.per_experiment
//                                     – default cap { max_cycles: 30, max_wall_clock_minutes: 60 }
//                                       the orchestrator can override before writePlan
// analysis.proposed_plan.spike_inputs – auto-populated from `.consort/spikes/<slug>/notes.md`
//                                       entries tagged with `for_feature: F1` (frontmatter
//                                       or body line). Surface to PO at Gate 4; pass the
//                                       kept slugs to attachSpikeInputs.

// Surface to PO. On Gate 4 approval, persist:
recordPlan(".consort", analysis.proposed_plan, "kevin@example.com");
writePlan(".consort", analysis.proposed_plan);
attachSpikeInputs({ consortDir: ".consort", featureId: "F1", slugs: ["explore-cart-storage"] });

// Before cutting any experiment, check the budget:
const ok = canCutAnotherExperiment(".consort", "F1");
if (!ok.ok) throw new Error(`budget: ${ok.reason}`);
```

### Experiment (phase 4)

```ts
import { cutExperiment, listExperiments, readOutcomes, writeOutcomes, deleteExperiment }
  from "consort/experiment/experiment";

// N=1 – one experiment for story S1, forked from the feature branch.
const exp = await cutExperiment({
  instance: "proj-checkout",
  consortDir: ".consort",
  featureId: "F1",
  storyId: "S1-submit",
  experimentSlug: "s1-submit",
  branch: "exp/F1/S1-submit",
  parentBranch: "feature/F1",       // forks from feature HEAD, not staging
});
// exp.dir === ".consort/experiments/F1/S1-submit/s1-submit"
// Writes branch.txt, notes.md, outcomes.json (status: "running"), timeline.json.

writeOutcomes(".consort", "F1", "S1-submit", "s1-submit", { status: "succeeded", tests_passed: 2 });

// Teardown is HITL-gated. deleteBranchToo defaults to false – record survives.
// (The consort-experiment CLI's merge/discard drive this for the PO.)
await deleteExperiment({
  instance: "proj-checkout",
  consortDir: ".consort",
  featureId: "F1",
  storyId: "S1-submit",
  experimentSlug: "s1-submit",
  deleteBranchToo: false,
});
```

### Spike (outside the main loop)

```ts
import { cutSpike, listSpikes, deleteSpike }
  from "consort/experiment/spike";
import { collectSpikeInputs, attachSpikeInputs }
  from "consort/experiment/spike-carryforward";

await cutSpike({
  instance: "proj-checkout",
  consortDir: ".consort",
  spikeSlug: "explore-cart-storage",
  branch: "spike-explore-cart-storage",
  parentBranch: "staging",
  // Tag the notes so future design-spec gates pick it up:
  notes: "---\nfor_feature: F1-checkout\n---\n\n# explore-cart-storage\n\nTried postgres arrays. Worked.\n",
});

// Notes captured, branch deleted by default (throwaway).
await deleteSpike({
  instance: "proj-checkout",
  consortDir: ".consort",
  spikeSlug: "explore-cart-storage",
});
// Notes preserved at .consort/spikes/explore-cart-storage/notes.md.

// When the related feature shows up at the design-spec gate, surface
// the spike's learning to the PO:
const inputs = collectSpikeInputs({ consortDir: ".consort", featureId: "F1-checkout" });
// inputs[].slug, .notes_path, .preview (capped at ~200 chars), .matched_marker
// Accepts YAML frontmatter (for_feature / feature_id / feature) and body lines
// (`For feature:`, `feature:`, `feature_id:`, `for_feature:`, tolerant of
// markdown bold like `**For feature:**`). Feature id is matched verbatim, no
// prefix match.

// On PO approval, persist the kept slugs onto plan.json:
attachSpikeInputs({ consortDir: ".consort", featureId: "F1-checkout", slugs: ["explore-cart-storage"] });
```

### Cycle (RED → GREEN → REFACTOR)

```ts
import { beginCycle, markGreen, markRefactored, flagSmells, listCycles, openBranchDsn }
  from "consort/pipeline/run-cycle";

const scope = {
  consortDir: ".consort",
  feature_id: "F1",
  story_id: "S1",
  ac_id: "AC1",
  experiment_slug: "checkout",
  branch_id: "checkout",
};

// Open a DSN against the experiment's branch DB (no mocks).
const dsn = await openBranchDsn({ instance: "proj-checkout", branch_id: "checkout" });

// RED – Navigator writes a failing test, persists the cycle artifact.
const c1 = beginCycle({
  ...scope,
  test_id: "T1",
  test_description: "POST /orders returns 201 on valid cart",
  navigator_plan: "force the public boundary to accept a Cart payload",
});

// GREEN – Driver returns and Navigator reviews.
markGreen(scope, c1.cycle_id, "added POST handler + repository write");

// Optional REFACTOR – Navigator requests, Driver applies, no outer-boundary test changes.
markRefactored(scope, c1.cycle_id, "extracted CartRepository");

// Navigator-flagged smells (Hard Rule 1, 4 violations).
flagSmells(scope, c1.cycle_id, ["test-deletion-attempt"]);
```

### Smells (after every cycle)

```ts
import { runDetectorsForScope, writeSmellsLog, readSmellsLog, SMELL_CATALOG }
  from "consort/smells/smells";

const hits = runDetectorsForScope(".consort", scope);
if (hits.length) {
  writeSmellsLog(".consort", hits);
  // Surface each hit + the SMELL_CATALOG remediation to the PO.
  // Never auto-apply remediations.
}
```

### Per-experiment cap (every cycle, N≥2)

```ts
import { checkPerExperimentCap, recordExperimentCap, clearExperimentCap }
  from "consort/experiment/experiment-cap";
import { readPlan } from "consort/gates/design-spec-gate";

// Each cycle, after recording the runner outcome and before queuing
// the next one, ask the kit if this experiment is over its cap.
const plan = readPlan(".consort", "F1", "S1");
const check = checkPerExperimentCap({
  consortDir: ".consort",
  featureId: "F1",
  experimentSlug: "exp-postgres-arrays",
  cap: plan?.budget.per_experiment,
  cycleCount: listCycles(scope).length,
  // now: optional override for the BDD harness.
});
if (check.capped) {
  recordExperimentCap({
    consortDir: ".consort",
    featureId: "F1",
    experimentSlug: "exp-postgres-arrays",
    hit: check.hit!,
  });
  // outcomes.json now carries { capped: { reason, at_cycle, cap_value, at_minutes? } }.
  // Surface to PO with the three reply options:
  //   extend         – raise the cap on plan.json and call clearExperimentCap()
  //   abandon        – archiveExperiment + let siblings continue
  //   continue-suite – leave capped on disk, decide at end-of-race
}

// On the PO's "extend" reply, raise the cap and clear the capped record:
clearExperimentCap({
  consortDir: ".consort",
  featureId: "F1",
  experimentSlug: "exp-postgres-arrays",
});
```

The default cap (30 cycles, 60 minutes wall-clock) is seeded by `analyzeForGate`. Cycle cap is evaluated before wall-clock cap so a cycle-bound experiment that is also slow returns the `max_cycles` reason deterministically.

### Compare (N≥2 convergence)

```ts
import { compareExperiments }
  from "consort/reports/compare-experiments";
import { renderComparisonReport, writeComparisonReport }
  from "consort/reports/comparison-report";

const report = compareExperiments(".consort", "F1", "S1");
// report.rows[].signal       – "winning" | "stalled" | "abandoned" | "running"
//                              | "capped" | "unknown"
// report.rows[].capped       – populated when a per-experiment cap fired:
//                              { reason: "max_cycles" | "max_wall_clock_minutes",
//                                at_cycle, cap_value, at_minutes? }
// report.recommendation      – "promote" | "synthesize" | "continue" | "abandon-all"
// report.rationale           – short explanation surfaced to the PO

// Render to markdown and persist next to the feature so the PO reads one
// file end-to-end (the HITL decision block lists any capped experiments
// with the extend / abandon / continue-suite reply options inline).
const md = renderComparisonReport(report);
writeComparisonReport({ consortDir: ".consort", featureId: "F1", report });
```

### Promote (N≥2, single winner)

```ts
import { promoteExperiment }
  from "consort/experiment/promote-experiment";

// Refuses to run without hitlApproved: true (PO gate enforced at the function boundary).
const result = promoteExperiment({
  consortDir: ".consort",
  featureId: "F1",
  storyId: "S1",
  winnerSlug: "exp-postgres-arrays",
  hitlApproved: true,
  approverEmail: "kevin@example.com",
});
// Winner outcome: status "succeeded". Losers: outcome "abandoned", dirs moved to _archive/.
// feature-spec.json transitions to "ready-for-review". Appends to selection-log.md.
```

### Synthesize (N≥2, menu-pick)

```ts
import { synthesizeExperiments }
  from "consort/orchestrator/status/synthesis";

// Refuses to run without hitlApproved: true.
const result = await synthesizeExperiments({
  instance: "proj-checkout",
  consortDir: ".consort",
  featureId: "F1",
  storyId: "S1",
  picks: [
    { source_slug: "exp-postgres-arrays", capability: "storage schema" },
    { source_slug: "exp-json-blob",       capability: "API surface" },
  ],
  synthesizedSlug: "exp-synth",
  branch: "checkout-synth",
  parentBranch: "staging",
  hitlApproved: true,
  approverEmail: "kevin@example.com",
});
// Writes synthesis/<F>/synthesis-<date>.md decision record + synthesized-spec/ subtree.
// Cuts the synthesized branch. Appends to selection-log.md.
```

### Spec sync (drift detection)

```ts
import { validateSpec, readFeature, writeFeature, readWorkflowState, writeWorkflowState }
  from "consort/intake/spec-sync";

const drift = validateSpec(".consort");
// drift[].kind – "schema" | "pair-missing" | "narrative-empty" | "id-mismatch"
// Warn-only; do not auto-correct narrative drift.
```

### Test list transformation

```ts
import { readMasterTestList, writeMasterTestList, viewByAc, viewsForAllAcs, writePerAcViews }
  from "consort/test-list/test-list";

const list = readMasterTestList(".consort", "F1");
writePerAcViews(".consort", "F1", list);
// Emits .consort/features/<F>/stories/<S>/test-list-per-ac.json under each story dir.
```

### Gates state machine (structured HITL approvals)

`.consort/features/<F>/gates.json` is the kit's authoritative gate state. `selection-log.md` stays as the human-readable narrative-of-record; the kit dual-writes it at every state change. **Agents read `gates.json`; humans read the log.** Never regex-scan the log for state.

Named gates: `spec` / `plan` / `test_list` / `promote` / `deploy`. Statuses: `open` / `approved` / `superseded` / `withdrawn`. Each gate's record carries the approver, timestamp, captured artifact hashes (sha256 of normalized content), and a `history[]` log of every action.

```ts
import {
  readGates,
  writeGates,
  defaultGatesState,
} from "consort/gates/gates";
import { approveGate } from "consort/gates/approve-gate";
import { verifyGateIntegrity } from "consort/gates/verify-gate-integrity";
import { withdrawGate } from "consort/gates/withdraw-gate";

// Read current state (returns default-open shape when gates.json absent).
const state = readGates("F1", { consortDir: ".consort" });

// Approve a gate (HITL-gated at the function boundary).
approveGate({
  featureId: "F1",
  gate: "spec",
  approver: "po@example.com",
  hitlApproved: true,
  artifactInputs: { "feature-spec.md": specContent, "feature-spec.json": featureJsonContent },
  consortDir: ".consort",
});

// Verify integrity: did the artifact change since approval?
const v = verifyGateIntegrity({
  featureId: "F1",
  gate: "spec",
  currentInputs: { "feature-spec.md": currentSpec, "feature-spec.json": currentFeatureJson },
  consortDir: ".consort",
});
// v.status: "ok" | "drift" | "gate-not-approved"
// Hash normalization survives CRLF/LF + trailing-whitespace + blank-line edits;
// semantic edits flip the verdict to "drift".

// Withdraw with cascade: spec withdraw -> plan + test_list also withdrawn.
withdrawGate({
  featureId: "F1",
  gate: "spec",
  approver: "po@example.com",
  reason: "scope rewrite",
  consortDir: ".consort",
});
```

**Per-gate artifact scope (convention enforced at the orchestrator call site, not in the kit primitives):**

| Gate | artifactInputs keys |
|---|---|
| `spec` | `feature-spec.md`, `feature-spec.json` |
| `plan` | `plan.json` |
| `test_list` | `test-list.json` |
| `promote` | `promote_ref` (synthesized string: `<winner-slug>:<branch_id>`) |
| `deploy` | certified from deploy-evidence (reachable + verify), not a hashed artifactInputs set |

**Concurrent-safe:** `approveGate` and `withdrawGate` serialize through a `.gates.lock` file (`fs.openSync` with `wx` flag). Two callers cannot lose either approval. Override: `HUSKY=0` not applicable here; the lock is mandatory.

#### Brownfield adoption

For features that pre-date the gates state machine (approvals only in `selection-log.md`):

```ts
import { migrateGatesFromSelectionLog } from "consort/gates/migrate-gates";

migrateGatesFromSelectionLog({
  featureId: "F1",
  consortDir: ".consort",
  // Optional: pass current artifact content so the synthesized state has
  // hashes that future verifyGateIntegrity() calls can match against.
  currentInputsByGate: {
    spec: { "feature-spec.md": readFileSync("...feature-spec.md", "utf8"), "feature-spec.json": readFileSync("...feature-spec.json", "utf8") },
    plan: { "plan.json": readFileSync("...plan.json", "utf8") },
    test_list: { "test-list.json": readFileSync("...test-list.json", "utf8") },
  },
});
// History entries flagged migrated: true so auditors can tell synthesized
// entries apart from native ones. Refuses if gates.json already exists
// unless force: true.
```

#### Feature-status integration

`feature-status` surfaces the compact gates view via the `gates` field of `FeatureStatusSnapshot`. See [`references/feature-status-schema.md`](references/feature-status-schema.md). For full state including history + artifact_hashes, call `readGates()` directly.

## Flow patterns

End-to-end orchestrator patterns the deterministic driver runs in response to `/design` and `/build`. Each flow is what the driver assembles from the primitives above; the human-facing prompts that trigger each flow live in [`README.md`](README.md).

### Author + validate spec (response to `/design`)

```ts
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { validateSpec } from "consort/intake/spec-sync";

const tdd = ".consort";
const fdir = join(tdd, "features", "F1-checkout");
const sdir = join(fdir, "stories", "S1-place-order");
mkdirSync(join(sdir, "acs"), { recursive: true });

writeFileSync(join(fdir, "feature-spec.json"), JSON.stringify({
  id: "F1", name: "Checkout flow", status: "draft", tdd_mode: "N=1", stories: ["S1"],
}));
writeFileSync(join(fdir, "feature-spec.md"), "# Checkout flow\n\nDesign intent.\n");

writeFileSync(join(sdir, "story.json"), JSON.stringify({
  id: "S1", asA: "shopper", iWantTo: "place an order",
  soThat: "I receive the goods", feature_id: "F1",
}));
writeFileSync(join(sdir, "story.md"), "# Place order\n\nNarrative.\n");

writeFileSync(join(sdir, "acs", "AC1.json"), JSON.stringify({
  id: "AC1", layer: "API", given: "valid cart", when: "POST /orders",
  then: "201 with order id", status: "draft", story_id: "S1",
}));
writeFileSync(join(sdir, "acs", "AC1.md"), "# AC1\n\nAC narrative.\n");

const drift = validateSpec(tdd);
if (drift.length) console.warn(drift);
```

### N=1 cycle end-to-end (response to `/build`, simple case)

```ts
import { writeMasterTestList } from "consort/test-list/test-list";
import { analyzeForGate, writePlan, recordPlan } from "consort/gates/design-spec-gate";
import { cutExperiment, writeOutcomes } from "consort/experiment/experiment";
import { beginCycle, markGreen } from "consort/pipeline/run-cycle";
import { runDetectorsForScope, writeSmellsLog } from "consort/smells/smells";

const tdd = ".consort"; const featureId = "F1"; const storyId = "S1-submit";

writeMasterTestList(tdd, { feature_id: featureId, ordered_for: "design-momentum", items: [
  { id: "T1", description: "POST /orders returns 201 on valid cart", ac_id: "AC1", status: "pending" },
  { id: "T2", description: "POST /orders rejects empty cart with 400", ac_id: "AC1", status: "pending" },
]});

const analysis = analyzeForGate(tdd, featureId, storyId);   // scoped to the story -> { mode: "N=1", N: 1, ... }
recordPlan(tdd, analysis.proposed_plan, "kevin@example.com");
writePlan(tdd, analysis.proposed_plan);

const exp = await cutExperiment({
  instance: "proj-checkout", consortDir: tdd,
  featureId, storyId, experimentSlug: "s1-submit", branch: "exp/F1/S1-submit", parentBranch: "feature/F1",
});

const scope = { consortDir: tdd, feature_id: featureId, story_id: storyId, ac_id: "AC1",
                experiment_slug: exp.experiment_slug, branch_id: exp.branch_id };

const c1 = beginCycle({ ...scope, test_id: "T1",
  test_description: "POST /orders returns 201 on valid cart",
  navigator_plan: "force the public boundary to accept a Cart payload" });
markGreen(scope, c1.cycle_id, "added POST handler + repository write");

const hits = runDetectorsForScope(tdd, scope);
if (hits.length) writeSmellsLog(tdd, hits);

writeOutcomes(tdd, featureId, storyId, exp.experiment_slug, { status: "succeeded", tests_passed: 2 });
```

### N≥2 race + promote/synthesize

```ts
import { cutExperiment, writeOutcomes } from "consort/experiment/experiment";
import { compareExperiments } from "consort/reports/compare-experiments";
import { promoteExperiment } from "consort/experiment/promote-experiment";
import { synthesizeExperiments } from "consort/orchestrator/status/synthesis";

const tdd = ".consort"; const featureId = "F1"; const storyId = "S1";

await cutExperiment({ instance: "proj-checkout", consortDir: tdd, featureId, storyId,
  experimentSlug: "exp-postgres-arrays", branch: "checkout-pg-arrays", parentBranch: "staging" });
await cutExperiment({ instance: "proj-checkout", consortDir: tdd, featureId, storyId,
  experimentSlug: "exp-json-blob", branch: "checkout-json-blob", parentBranch: "staging" });

// ... cycles run on each branch via beginCycle/markGreen ...

writeOutcomes(tdd, featureId, storyId, "exp-postgres-arrays", { status: "succeeded", tests_passed: 5 });
writeOutcomes(tdd, featureId, storyId, "exp-json-blob",       { status: "succeeded", tests_passed: 5 });

const report = compareExperiments(tdd, featureId, storyId);

if (report.recommendation === "promote") {
  const winner = report.rows.find((r) => r.signal === "winning")!;
  promoteExperiment({ consortDir: tdd, featureId, storyId, winnerSlug: winner.experiment_slug,
                      hitlApproved: true, approverEmail: "kevin@example.com" });
} else if (report.recommendation === "synthesize") {
  await synthesizeExperiments({
    instance: "proj-checkout", consortDir: tdd, featureId, storyId,
    picks: [
      { source_slug: "exp-postgres-arrays", capability: "storage schema" },
      { source_slug: "exp-json-blob",       capability: "API surface" },
    ],
    synthesizedSlug: "exp-synth", branch: "checkout-synth",
    hitlApproved: true, approverEmail: "kevin@example.com",
  });
}
```

## Adapters

Bundled: `markdown.ts` (no-op default – the spec IS the tracking), `jira.ts` (stub). Project skills wire in the adapter they want via `.consort/adapters/<name>.json` config.

The `SpecAdapter` interface extends `SyncEventHooks` – implementations may opt into `onPhaseTransition`, `onCycleComplete`, `onSmellDetected` hooks for status-mirroring to external trackers. Adapter failures must degrade gracefully – the on-disk spec is the source of truth.

## CLI bins

For non-agent invocation (debugging, CI introspection):

| Command | Purpose |
|---|---|
| `lakebase-feature-status <featureId> [--tdd <dir>] [--json]` | One-screen snapshot of a feature's TDD workflow state. Use `--json` for machine-readable payload. |
| `consort-next (--feature <F> \| --sprint <S>) [--json]` | The authoritative, strictly read-only "what do I do next?" surface, computed from the same engine the drive runs on: the reconciled state, the decision menu (the real HIL choices, each with its correct enact command + a prompt to pose), and any blockers. The drive also auto-emits it to `.consort/next.json` on every stop, so an orchestrating agent's contract is "on any stop, read next.json and present its options" instead of improvising. See [`references/next-schema.md`](references/next-schema.md). |
| `node dist/bin/consort/spec-sync.cli.js <consortDir>` | Walk the `.consort/` tree and print drift reports. Exits 0 even when reports exist (warn-only). |
| `node dist/bin/consort/test-list.cli.js <consortDir> <featureId> [storyId]` | Regenerate per-AC views from the feature-level master test list. With a `storyId`, instead write that story's scoped per-story test list (`stories/<story>/test-list-per-story.json`), the streaming build lane's per-story input. |
