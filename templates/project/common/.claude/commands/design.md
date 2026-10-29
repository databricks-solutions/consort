# /design : feature design pipeline

Drives a feature from idea to spec to architect review to test list. This wraps the canonical consort design phases as a single one-shot you can invoke from Claude Code in a Lakebase-paired project.

## Operating contract (drive, do not narrate)

Follow `@consort/references/orchestrator-contract.md`: drive to completion via `consort-next` (enact its `primary_action`, then continue), and stop for the human ONLY at a HITL gate or a blocker. Present the decision (the `next` option titles + their `hil_prompt`s), not the CLIs you ran; report outcomes, not per-command play-by-play. Verbose step narration is opt-in (`LAKEBASE_CONSORT_VERBOSE_AGENT=1`), off by default.

## Usage

```
/design <feature-id> [--reviewer @user] [--test-strategist @user]
```

If `.consort/` does not exist in the project root, this command hard-fails with a setup hint instead of lazy-initializing: the TDD workflow has invariants (`.consort/` shape, `selection-log.md`) a lazy bootstrap cannot reconstruct. Run the project's TDD adoption bin first, or `lakebase-create-project` when starting fresh.

## Step 0 (cannot skip, owned by the drive): the paired branch

The design lane runs ONLY on this feature's claimed paired branch, and that claim-and-checkout is the **drive's own un-skippable first step** — not a gesture the agent performs. On every entry `consort-drive`'s Step 0:

- ensures the feature is claimed through the SCM workflow (`lakebase-scm-claim-feature-branch` — the ONLY supported branch-creation path: it precondition-gates on `.lakebase/workflow-state.json` being at `scaffold-complete` or `merged`, resolves the tier parent, creates the paired Lakebase + git + .env via `createFeaturePairedBranch` with a 30-day TTL, and writes the `feature-claimed` state), **and**
- checks the working tree out onto that branch.

It is idempotent and holds **no matter how the lane is entered** — `/design`, `/sprint`, or a raw `consort-drive --only design`. That is the point: there is exactly **one door**, so a design run can never land its corpus on the tier parent (e.g. `staging`) because the lane was entered off-branch.

Because the drive owns this, **the agent does NOT claim the branch or run `git checkout` itself.** Shelling out to `git checkout -b`, or running the claim CLI as a separate pre-step, is a contract violation — it re-creates the second door this step exists to remove. If the drive cannot claim or check out the paired branch it refuses loud (exit 2) and names the fix; surface that to the user rather than working around it. If `.lakebase/workflow-state.json` is missing entirely, the project was never scaffolded — run `lakebase-create-project` first.

Projects may still add project-specific gestures (claim a JIRA epic, post to Slack) by appending to `.claude/commands/design.pre-hook.md`; that hook extends the drive's Step 0, it never re-implements the claim or checkout.

## Step 0.5 (cannot skip): HIL intake, a hard precondition

The design phases READ the HIL's intent from intake artifacts (`product-overview.md`, `nfrs.md`, the feature's `feature-request.md`, and `design-brief.md` for UI projects). These are not gate deliverables, they are PRECONDITIONS: `/design` MUST NOT enter phase 1 until they exist and conform. `product-overview.md` and `nfrs.md` are PROJECT-level (`.consort/`), living, and refined across features; `feature-request.md` is per-feature; `design-brief.md` is project-level under `.consort/design/`.

The per-feature `feature-request.md` is NOT authored here. It is the Product Owner's prioritized ask, authored upstream by `/plan` (sprint planning, where the Spec Author proposes the feature breakdown and the PO authors the requests for the sprint). `/design <feature-id>` only REQUIRES that feature's request to already exist and conform; if it is missing, run `/plan` first. The project-level intake (`product-overview.md` / `nfrs.md` / `design-brief.md`) is facilitated below by whoever reaches it first, `/plan` or `/design`.

**The orchestrator owns facilitating intake from the human.** Before phase 1, for each required artifact that is absent or non-conformant, the orchestrator obtains it:

- **Interactive (a human is present):** run the intake interview, draft the artifact, and present it for the HIL to review and edit. The interviews:
  1. **Product -> `.consort/product-overview.md`** (Product Owner): what the product is + who uses it; what users need to accomplish; first usable version vs later; how it grows; non-goals; what they want to see after each sprint. Open-ended product intent, no implementation detail.
  2. **NFR -> `.consort/nfrs.md`** (the Architect's intake): walk the NFR categories (performance, scalability, security, observability, operability, resilience); for each the HIL gives a hard requirement, a preference, "N/A", or "out of bounds". Write `## Required` (each item a stable `R<n>` id) / `## Preferences` / `## Out of bounds`. Every `## Required` item must later be covered by the Architect via `architecture.json` `brief_ref`.
  3. **UX -> `.consort/design/design-brief.md`** (UI projects only; skip for API / CLI / Infra): name 1-3 reference websites and, for each, what to take (brand, color, layout, tone); plus brand constraints, interaction/feedback expectations, accessibility targets. Write the required `## References` section.
- **Headless (`LAKEBASE_CONSORT_HUMAN_PROXY=1`):** there is no human to interview, so the orchestrator has the **Human Proxy supply** each missing artifact from the pre-recorded answers directory `$LAKEBASE_CONSORT_RECORDED_INTAKE_DIR` (validate-then-place; refuses a missing/non-conformant recording):

  ```bash
  ./scripts/lk consort-human-proxy supply \
    --from "$LAKEBASE_CONSORT_RECORDED_INTAKE_DIR/nfrs.md" --to ".consort/nfrs.md" --artifact nfrs.md
  ```

**UI projects:** whether this is a UI project is the persisted setting `project.uiTrack` in `consort-config.json` (set once at create via `--ui-track`, the single source). For UI projects, also facilitate `design-brief.md` (interview track 3, or Human Proxy supply headless); the precondition below reads `uiTrack` and requires the brief on its own, and the UX Designer phase then runs. For API / CLI / Infra projects (`uiTrack` false), the UX track is skipped entirely. Do NOT gate this on an env var; the config is the one way in.

**Then enforce the precondition (the hard gate):**

```bash
./scripts/lk consort-intake --feature "<feature-id>"
```

`consort-intake` exits non-zero (5) if any required intake artifact is missing or non-conformant, naming each. If it fails, **REFUSE to proceed to phase 1** and report what intake is missing. Do not work around it: the precondition is what makes intake un-skippable in both real and headless runs, exactly as Step 0's claim is un-skippable.

## How it runs: the deterministic driver

After Step 0 + Step 0.5, `/design` delegates the design lane to the deterministic
orchestrator driver. The driver sequences the per-story design pipeline and
spawns each role agent itself, run it bounded to `design`, with interactive
gates so YOU answer each per-story spec gate (headless: the Human Proxy answers):

```bash
GATES=interactive; [ "${LAKEBASE_CONSORT_HUMAN_PROXY:-}" = "1" ] && GATES=proxy
./scripts/lk \
  consort-drive --feature "<feature-id>" --only design --gates "$GATES" --project-dir "$PWD"
```

The driver:
- **Breaks the feature into stories** (Spec Author), then STREAMS each story
  through its design lane one at a time, never batching: Spec Author (ACs) ->
  Architect Reviewer (AC layers + every `## Required` NFR from `nfrs.md` carried
  into `architecture.json` via `brief_ref`) -> Test Strategist (ordered test
  list) -> that story's **per-story spec gate**. UX Designer runs between Spec
  Author and Architect for UI projects.
- **Routes deterministically** (routing is code, not an LLM orchestrator): it spawns each role as a
  subagent (`claude -p --agent <role>`, at the resolved per-role model via
  `consort-agent-model`) and emits the phase/handoff log to
  `.consort/agent-log.jsonl` as code. Tail it: `consort-log --read --feature <id> --min-level info`.
- `--only design` STOPS when every story's spec gate is approved, without
  building. The roles are `@consort/agents/{spec-author,ux-designer,architect-reviewer,test-strategist}`.

**Gates.** Interactive: at each per-story spec gate the driver stops and prints a
`GATE` marker with the pending action and the EXACT command to clear it. Surface
that story's spec to the human; on their approval record it with the human-facing
approver, naming the story (`consort-approve-gate --feature <id> --story <s>
--approver <human>`), then re-run the command to resume past it. (That is the one
human door; it routes to the same per-story pipeline gate the headless Human Proxy
approves. `--feature <id> --gate <name>` is for a feature-level gate, NOT a
per-story spec stop.) Headless
(`--gates proxy`, `LAKEBASE_CONSORT_HUMAN_PROXY=1`): the Human Proxy validates each
gate's artifacts EXIST + carry their EXPECTED ELEMENTS and approves only then. A
gate is never skipped; a missing/non-conformant artifact hard-blocks either way.

## Next

When design completes (every story's spec gate approved), the driver reports the
bounded completion. Suggest the next step to the human: **`/build <feature-id>`**
to build the designed stories. `/design` does not build, that is `/build`.

## Project post-hook

If `.claude/commands/design.post-hook.md` exists in this project, it runs after phase 3. Common uses: notify a Slack channel, assign reviewers, link the spec into a tracking doc.

The post-hook is owned by the project, not the kit: this command file only consults it when present. Author the markdown file freely; one post-hook per command (no chains in v1).

## Kit version

Pinned to: `${KIT_VERSION_AT_SCAFFOLD}`

Bumping the kit may shift agent prompts. The `lakebase-update-commands` bin re-pulls canonical templates while preserving the post-hook file above.
