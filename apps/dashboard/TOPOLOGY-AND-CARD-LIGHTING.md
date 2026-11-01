# Dashboard Topology & Card Lighting — Design Guide

How the Consort dashboard models the workflow and decides which **cards (lane steps)** light, in
which colour, at a given playhead. Written to stop the whack-a-mole: every lighting decision should
flow through **one** model (the `WORKFLOW` topology + the event fold), never a grafted special case.

Source of truth: `lib/topology.ts` (model + fold), `app/LaneGraph.tsx` (render), `app/board-parts.tsx`
(event-ticker colour). Line refs are against kit `0.4.33`.

---

## 1. The core principle

There is exactly **one** authority for node/step state: the `WORKFLOW` topology folded over the
agent-log event stream. Every surface — the lifecycle spine, the per-lane cards, the shading, the
event ticker role colour — derives from the **same** fold so they cannot disagree (`topology.ts:1267`).

A card lights because an **event mapped to its step**. The mapping is a pure function,
`laneStepForEvent(e)` (`topology.ts:920`). Nothing should light a card by any other path.

**Invariant:** attribution is uniform — an event maps to a step through the declarative matcher
grammar (`StepMatch`). Any place that routes an event to a lane/step by hand, bypassing a step's own
`match`, is a smell (see §9 — the `test.result` special case is the live example).

---

## 2. Data model (`topology.ts:17-95`)

- **Lifecycle node** `{ id, label, roles[], type: "phase" | "gate" }` — the spine (§3).
- **Lane** `{ title, steps: LaneStep[], edges, backEdges }`. Four lanes: `plan | design | build | deploy`
  (`LaneId`, `LANE_IDS` = plan→design→build→deploy — this order is the first-match priority in the fold).
- **LaneStep (a "card")** `{ id, role, label, sub, gate?, branch?, escalation?, outerLoop?, match }`.
  - `role: Role | null` — the owning agent; **`null` for human gates/verify** (no single owner).
  - `gate?` — a checkpoint, not agent work. `branch?` — a fail/side path. `escalation?` — a terminal
    raise-to-HIL. `outerLoop?` — a story-less step (per-feature/sprint, not per-story).
  - `match: StepMatch | null` — **`null` = never lit from an event** (human-decided gates glow from
    gate focus, §7, not from the fold).
- **StepMatch grammar** (`topology.ts:35-62`, semantics documented inline at `812-830`):

  | field | meaning |
  |---|---|
  | `event` | exact event-name equality, **decided alone** (ignores role) |
  | `eventAny` | event-name ∈ set, **decided alone** |
  | `eventPrefix` | event-name `startsWith`; if the step also has role/phase it's **OR**'d, else name-alone |
  | `role` | `e.role` must equal (the written role field) |
  | `phase` / `phaseAny` / `phaseNot` | from `metadata.phase`; a **missing** phase does not exclude |
  | `buildMode` / `buildModeAny` / `buildModeNot` | from `metadata.buildMode`; `buildMode`/`Any` = in-set **OR** `phase===phase` fallback |
  | `messageIncludes` / `messageNotIncludes` | AND-constraint on `e.message` (promote sub-steps share a phase, told apart by narration) |

  `event`/`eventAny`/`eventPrefix` are **name-decided** (role-blind, on purpose — the deploy lane's
  deterministic steps light off orchestrator event names). Everything else is role/phase/buildMode.

---

## 3. The lifecycle spine (`topology.ts:280-322`)

```
intake → intakegate → plan → plangate → design → specgate → build
      → acceptancegate → deploy → deploygate → promote → promgate → shipped → (back to plan)
```
Phase nodes carry role dots; gate nodes are HITL diamonds. `shipped → plan` closes the sprint loop.
Lane status (§7) is read from **this spine**, never from a lane's lit-step count.

---

## 4. The lanes and their cards

Each card's `match` is the ONLY thing that lights it from an event. Role in parentheses; `∅` = `match:null`.

### Plan (`324-424`) — sprint planning (steps are `outerLoop`, story-less)
`p-intake`(PO: role+`eventPrefix:intake`+phase intake) · `p-ux-establish`(ux: phase establish) ·
`p-intake-gate`(∅) · `p-propose`(spec-author: phase propose) · `p-size`(architect: phase estimate*) ·
`p-backlog-gate`(∅) · `p-req`(PO: phase author-requests/feature) · `p-gate`(∅)

### Design (`426-516`) — spec-first, per story
`d-breakdown`(spec-author: phase breakdown, `outerLoop`) · `d-spec`(spec-author: `phaseNot` propose/
estimate/author-requests/breakdown) · `d-ux-ia`(ux: phase ia) · `d-arch`(architect: `phaseNot` estimate) ·
`d-dba`(dba) · `d-ts`(test-strategist) · `d-nav`(navigator: `buildModeAny` reflect/reconcile) · `d-gate`(∅) ·
`d-hil`(∅, escalation)

### Build (`518-619`) — honest-GREEN TDD cycle
`b-red`(navigator: phase red, `buildModeNot` reflect/review/assess/…) · **`b-green`**(driver:
`buildModeNot` refactor/repair/refactor-superseded/refactor-deploy/green-superseded) · `b-review`(navigator:
`buildModeAny` review/assess/assess-refactor) · `b-refactor`(driver: refactor) · `b-repair`(driver: repair,
branch) · `b-perm`(driver: green-superseded/refactor-superseded, branch) · `b-hil`(∅, escalation) ·
`b-accept`(∅, acceptance gate)

> `b-green` matches **any driver event** whose buildMode isn't excluded — this is why the `test.result`
> special case (§9) dumps deploy-verify greens here.

### Deploy (`637-738`) — combined DEPLOY / PROMOTE (deterministic; release-engineer)
Deploy section: `dp-deploy`(RE: **`event:deploy.start`**) · `dp-verify`(RE: **`event:deploy.verified`**) ·
`dp-gate`(∅). Promote section: `dp-pr`(RE: phase promote, msg∌wait-ci/merge) · `dp-ci`(RE: promote,
msg∋wait-ci) · `dp-promgate`(∅) · `dp-merge`(RE: promote, msg∋merge). Self-heal (only on verify fail):
**`dp-assess`** label *"Assess-deploy"* (navigator: `buildMode assess-deploy`, branch) · **`dp-refactor`**
label *"Scope-deploy"* (driver: `buildMode refactor-deploy`, branch) · `dp-hil`/`dp-promote-hil`(∅, escalation).

> `dp-verify` lights off the **`deploy.verified`** event, not off the per-test suite run. `dp-assess`/
> `dp-refactor` (the "assess-deploy / scope-deploy" boxes) are the verify-fail self-heal arm — on a clean
> verify they correctly stay dark.

---

## 5. Event → card: `laneStepForEvent(e)` (`topology.ts:920-948`)

Three stages, first hit wins:

1. **`test.result` special case (`927-931`)** — ⚠️ *the smell, §9*: `status green|refactored → build/b-green`,
   `red → build/b-red`, **unconditionally, ignoring `role`**. Runs before everything.
2. **PASS 1 — exact event (`932-940`)**: a step whose `match.event`/`eventAny` equals `e.event` wins,
   across all lanes (exact name is more specific than a role match). This is how `deploy.start → dp-deploy`,
   `deploy.verified → dp-verify`.
3. **PASS 2 — grammar (`941-946`)**: first step (lanes in `LANE_IDS` order) where `matchesStep(s.match, e)`
   is true — the eventPrefix/role/phase/buildMode grammar (`matchesStep`, `831-887`).

`phaseOf`/`buildModeOf` read `metadata.phase`/`metadata.buildMode` (`800-810`). `withCarried` (`1114`)
back-fills phase/buildMode onto phase-less events (artifacts, `reasoning`) so they still map.

---

## 6. Owning role: `roleForEvent(e)` (`topology.ts:956-960`)

```
roleForEvent(e) = WORKFLOW.lanes[laneStepForEvent(e).lane].steps[…].role
```
**The owning role is the matched STEP's role, NOT `e.role`.** Consequence: because the special case
forces every `test.result` onto `b-green`, `roleForEvent(any test.result) === "driver"` regardless of
what role was written. (This is why editing the written role in the log does not move the card — §9.)

---

## 7. How cards light (state computation)

- **`laneProgress(events, upTo, feature)` (`1170-1230`)** folds the stream and returns:
  - `done[lane]` — set of step ids reached (monotonic within the fold); `last[lane]`.
  - **`current`** — the step the **playhead** (last folded event) lights, EXCEPT: `gate.surfaced`/
    `gate.approved` are not work, and **HITL gate steps are excluded** (`HITL_GATE_STEP_IDS` = gate steps
    with `role===null`). An automated verify (`dp-verify`, gate-ish but role=release-engineer) **does**
    stay `current` (`1205-1207`).
  - **`currentGate`** — the gate step the playhead is parked at: from a `gate.surfaced/approved/rejected`
    naming a gate, or a work event mapping to a HITL gate step. Glows the parked card.
- **`reachedThisPass(events, upTo, feature)` (`1274-1288`)** — pass-scoped reach: same fold, but when a
  lane's **first step re-enters** (the `b-refactor→b-red` loop, or a new story's red) it **clears that
  lane's accumulated steps** and starts the pass fresh. This is the single source for node-state across
  reveal, cards, and shading.
- **`passedNodes` (`1133`)** — lifecycle nodes reached (phase→node, plus `intake.supplied`).
- **Scope by `feature`** — multi-feature runs must pass `feature`, else a later sprint inherits the prior
  one's spine.

### In the card renderer (`LaneGraph.tsx:135-200`)
- **`lightable`** = steps with `match !== null` AND not a human gate (`!(gate && role===null)`). The
  automated verify is lightable; human gates are not counted.
- **`reached`** = lightable ∩ `done`. A card renders lit when its id ∈ the reached set.
- **`active`** (lane owns the focus) = `current` is in this lane **or** parked at a gate whose step is in
  this lane; the highlight takes the current actor's role colour.
- **Lane STATUS is read from the LIFECYCLE, never the lit-step count** (`155-188`): a lane can finish
  without lighting every step (`b-perm` only on supersession) — so `complete = !active && !inOwnNode &&
  movedOn`, where `movedOn` is "a later lifecycle node has been passed." Do **not** reintroduce a
  "complete when every step lit" rule; it was measured and refuted.

---

## 8. Event-ticker colour (`board-parts.tsx:96-110`)

`EVENT_LEGEND` colours **state-transition event kinds by name**: `gate*` (gate), `escalation*`,
`deploy*`/`verify*` → release-engineer colour (its own events are stamped `release-engineer`). Warn/error
levels keep their level colour so a failure never reads green. This is a ticker-only colour; it does not
light cards (cards come from the fold, §7).

---

## 9. The architectural smell (root of the whack-a-mole)

**`laneStepForEvent`'s `test.result` special case (`topology.ts:927-931`) is the one lighting rule that
bypasses the matcher grammar.** It routes **every** `test.result` to the build lane by `status` alone,
**ignoring `role`/`phase`**:

```ts
if (e.event === "test.result") {
  if (status === "green" || "refactored") return { lane: "build", step: "b-green" };
  if (status === "red")                   return { lane: "build", step: "b-red" };
}
```

Symptom: the **deploy-verify** step re-runs the suite (as the release-engineer), emitting `test.result`
greens → this special case forces them onto `b-green` → the build-lane **driver-green** card lights during
deploy ("deploy → driver-green"). The writer compounds it: `consort-capture.ts` stamps `role:"driver"` on
every `test.result` (phase-blind reporter). But even fixing the writer does **nothing** here, because this
special case never consults `role` — and partial writer-only edits make surfaces **disagree** (the fold
forces `b-green`/driver while raw-`e.role` surfaces show the edited role → cards *bounce*).

**Why it's a smell, not a config bug:** every other card is attributed by its own declarative `match`
through PASS 1/PASS 2. This one event type is special-cased out of that grammar. That is exactly the
"graft code on" pattern — a second, hidden routing authority that the lane definitions can't see or
override.

### The principled fix (make `test.result` obey the grammar)

`test.result` should be attributed by its **producer**, like everything else — the build-cycle driver's
greens → `b-green`/`b-red`; the release-engineer's deploy-verify greens → the deploy lane's verify
(`dp-verify`). Two coherent ways, in order of cleanliness:

1. **Delete the special case; let the grammar route it.** Give `b-green`/`b-red` a `match` that also keys
   on `event:"test.result"` + status **gated by `role`/`phase`** (build-lane roles only), and let the
   deploy lane's verify own release-engineer `test.result`. Requires the **writer** (`consort-capture.ts`)
   to stamp the true producer `role` (+ `phase`) instead of a constant `"driver"` — the capture reporter
   must learn its context (passed by the invoker; `deploy.ts` already knows it's the release-engineer).
2. **If the special case must stay, branch it on the producer** (role/phase, or the presence of a build
   `cycle_id` — build-cycle greens carry one, deploy-verify greens don't): release-engineer / no-cycle →
   `dp-verify`; else → `b-green`/`b-red`. Still requires the writer to carry the distinguishing signal.

### Resolution (shipped)

The special case now **defers to the turn** instead of overriding it — the status→`b-green`/`b-red`
shortcut fires **only for the BASE cycle** (`buildMode` absent / `green` / `red`). In any VARIANT build
turn (`repair`/`review`/`refactor`/`assess`/…) a `test.result` is that turn's own re-verification, so it
falls through to the PASS-2 grammar and maps to the turn's step by `role` + carried `buildMode`
(`b-repair`, …). Plus the release-engineer deploy-verify re-run routes to `dp-verify` up front
(writer stamps the true producer via `testRunnerRole`). This kills two flips with one rule:
- **deploy → driver-green** (the release-engineer greens no longer land on `b-green`), and
- **driver-repair ↔ driver-green** (a repair turn's `running`/`green` results no longer yank the locus
  to `b-green` and back) — and the same for every other variant turn, by construction.

This is consistent with the card-lighting invariant (`CARD-LIGHTING-DESIGN.md`): **the locus is the
current turn's step**, carried as the turn identity (`role` + `phase` + `buildMode`) from `phase.start`;
no single event's own type/status re-derives it. The status shortcut is no longer a hidden second
routing authority — it is scoped to the one case it is actually for (the base RED/GREEN cycle).

**Do not "fix" it by special-casing further in the reader** (e.g. "ignore `test.result` named X") — that
adds a third routing authority and deepens the smell. The fix is to route `test.result` through the one
grammar, driven by a correctly-stamped producer at the write site.

---

## 10. Invariants to preserve (so changes stay principled)

1. **One fold, one authority.** Node/step state comes only from `laneStepForEvent` folded over the stream
   (`reachedThisPass`/`laneProgress`). No surface computes lit-state independently.
2. **Attribution is declarative.** An event lights a step only via that step's `match`. No role-blind
   cross-lane hard-routes. (§9 is the one to retire.)
3. **Owning role = the step's role**, not `e.role` (`roleForEvent`). Keep these reconciled: if the writer
   stamps a role, a step matcher must honour it, or the two disagree and cards bounce.
4. **Human gates don't light from events** (`match:null`); their glow is the parked-gate focus. Automated
   verify (`dp-verify`) is real work and lights as `current`.
5. **Lane completion is lifecycle-driven**, never lit-step-count-driven.
6. **Scope by `feature`** on multi-feature runs.
7. **Writer and reader are two halves of one contract.** A per-test event must carry enough context
   (producer role/phase, ideally `cycle_id`) for the grammar to place it without a special case.
