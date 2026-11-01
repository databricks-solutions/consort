# Card Lighting — Design

How the dashboard decides the visual state of every lane-step **card**. Supersedes the brittle,
patched-over lighting logic that lived inline in `LaneGraph.tsx`. Read with
[`TOPOLOGY-AND-CARD-LIGHTING.md`](TOPOLOGY-AND-CARD-LIGHTING.md) (the topology + fold) — this doc is
the **render-state** layer on top of it.

## The problem this replaces

Lighting was decided inline in the renderer from ad-hoc booleans:

```ts
const active  = s.id === currentStep || parkedGate || parkedEsc;
const reached = done.has(s.id) || active;
opacity: reached ? 1 : 0.28,            // only TWO visual states
```

Three structural faults, each the root of a separate bug we kept patching:
1. **Two states only** (`lit` vs `faint`). "Completed" and "live" collapse to the same `opacity: 1`,
   so a finished upstream lane glows identically to live work (the design **Navigator-reflect** box lit
   during a deploy-verify playhead).
2. **Logic in the renderer.** "Is this lane active / complete / behind the playhead" was recomputed
   inline per lane (`LANE_NODE`, `movedOn`, `complete`) and again in the dot strip — multiple places,
   drifting. Not SRP.
3. **No named model.** There was no enumeration of "the states a card can be in," so every new case was
   a new boolean grafted onto the opacity expression. Not OCP.

## The design

**One pure function is the single source of truth for card state; the renderer is a dumb map of
state → style.** (`lib/card-state.ts`, with `lib/card-state.test.ts`.)

```
fold state ──▶ deriveCardStates(FoldView) ──▶ Map<stepId, CardState> ──▶ STATE_STYLE[state] ──▶ pixels
              (SRP: all "which state" logic)                            (renderer: all "how it looks")
```

- **SRP** — every "which state" decision lives in `deriveCardStates`; every "how it looks" decision
  lives in one `STATE_STYLE` table in the render layer. Neither leaks into the other.
- **OCP** — a new lane extends `WORKFLOW`/`LANE_NODE` (data); a new visual meaning extends the
  `CardState` enum + one `STATE_STYLE` row. No edits to the lighting branches.
- **DIP** — `LaneGraph` depends on the `CardState` abstraction, not on `reachedThisPass`/`focus`
  internals. Swap the fold and the renderer is unaffected as long as it yields a `FoldView`.
- **SSOT/DRY** — `LANE_NODE` (lane ↔ lifecycle spine) and `STEP_LANE` live once, derived from
  `WORKFLOW`; the renderer imports them instead of keeping copies.
- **Testable in isolation** — `deriveCardStates` is pure and total (no React, no `DashboardState`), so
  the lighting rules are unit-tested directly, including regression cases.

### The state model — BINARY

There is no "dim" and no "faint", no done-live/done-past/upcoming/not-taken gradation. There are two
treatments: **exactly ONE card glows** (the current locus — the playhead), and **every other card is
`base`** — one uniform, un-dimmed neutral. That is the whole model.

| CardState | meaning | style |
|---|---|---|
| `current-step` | the step the running agent is ON | glows in its role colour |
| `current-gate` | the gate the playhead sits on (parked / just-reached) | glows gate-purple |
| `current-escalation` | the raise-to-HIL terminal the run is parked on | glows critical-red |
| `base` | **every other card** | one uniform neutral — never dimmed, never a second glow |

Having multiple non-current display modes (dim vs faint vs done vs upcoming) was the root of every
lighting bug: a completed upstream box glowing like live work, two gates lit at once, the last role
step glowing instead of the gate the run reached. Collapsing to one glow + one base removes the entire
class.

### The current locus — the one glow (`currentLocus`)

Precedence (first match wins):

1. **A genuinely RUNNING step** (`liveStep` = `topology.laneCurrent?.step` = `laneProgress.current`).
   Wins over any earlier-reached gate — the back-edge case: a new build loop at `b-red` glows `b-red`,
   not the already-approved acceptance gate. `liveStep` is deliberately NOT `focus`: `focus`'s carry can
   hold a stale pre-gate step, so using it made the UX-designer box glow instead of the intake gate.
2. **A gate the playhead sits on** (`pendingGateStep`) or an **escalation** the run is parked on.
3. **Between turns / idle:** the FURTHEST-along point reached this pass — a role step, or an APPROVED
   gate. After a gate approval that is the gate (it outranks the pre-gate role step), so the locus sits
   on the gate, not the last role turn before it.

**`liveStep` is the current TURN's step — attributed by turn, not by individual event.** A turn is
`(role, phase, buildMode)`, bounded by `phase.start`; the fold carries that whole identity forward
(`eventsWithFeature` → `withCarried`), so EVERY event inside a turn maps to the turn's step. This is why
a reconciled/back-filled `artifact.written` that names another role in its provenance (a ux/architect
artifact re-stated "present on disk" during a spec-author breakdown turn) stays on the breakdown step
instead of hijacking the glow onto `d-ux-ia`/`d-arch`. One rule — the locus is the turn — not a
per-event-type special case. (The historical `done`/reached set stays per-event + feature-scoped; it is
NOT a card light, only history + the step-3 fallback, so it does not carry the turn role.)

**`pendingGateStep` — one gate concept, two fold signals:** *live park* (`focus.kind === "gate"`, the
run stopped there now) or *scrub replay* (`!atLive` and `parkedGateStep`/`laneGate` names the gate step,
replaying its `gate.surfaced` frame). At the live edge a gate counts ONLY when parked, never from
`parkedGateStep` alone — a live run streaming *past* a just-surfaced gate (the reconcile turn) keeps the
glow on the running step, not the gate.

### Inputs (`FoldView`) — all already produced by the reducer

`focus` (step | gate | escalation | idle), `liveStep` (the genuinely running step), `reachedThisPass`,
`approvedGates` (gate keys with an approved record), `atLive`, and `parkedGateStep` (= topology
`laneGate`). Nothing else. The
deriver takes no `DashboardState` and no React, which is what keeps it pure and unit-testable.

## Renderer contract (the wiring)

`LaneGraph` becomes a consumer:

1. Call `deriveCardStates(foldView)` **once** per render (or read it off `DashboardState`, computed in
   the reducer alongside `reachedThisPass`).
2. Map each card's `CardState` to a style — BINARY. The **dot strip**: `base` → one uniform opacity
   (`BASE_OPACITY`), any `current-*` → full opacity + flash, coloured by kind (role / gate-purple /
   critical). The **box** (`LaneSvg`/`StepBox`) maps through the one `CARD_TO_STEP_STATE` table; `base`
   is the neutral box (no dimming), `current-*` glows. Both read the SAME `CardState`, so a card can't
   light one way in the strip and another in the graph.
3. No lighting logic in the renderer: no `reached ? 1 : 0.28`, no done-past dimming, no
   `gate`/`laneGate`/`state.gates` branch. `stepState` is a pure lookup. All of it is deriver INPUTS.

## EVERY highlight reads the one locus (not `state.focus`)

The glowing card is not the only highlight: the **active lane panel** (its accent border + header tint)
and the **lifecycle spine node** (WorkflowGraph) also light. All three MUST read the SAME locus, or a
card can glow in one lane while the outline lights another (observed: at a deploy-verify frame the glow
was Verify/deploy, yet the lane outline lit *build* and the spine *deploy* node went navigator-red).

The culprit was `state.focus`: its between-turns carry can lag onto a stale step (e.g. a `b-review`
carry while the run is actually deploy-verifying). The card glow dodged this by computing the locus; the
panel and the spine still read raw `state.focus`.

The fix: **one locus, exposed once, read by all three.**
- `foldViewOf(state)` builds the `FoldView` in ONE place (so the card graph and the spine fold identically).
- `currentLocus(view)` is the single locus; `locusFocus(view)` re-expresses it as a `Focus`.
- The card glow uses `deriveCardStates`; the **lane panel** (`active` + `activeColorForFocus`) and the
  **spine** (`activeColor`, `awaitedGateNode`) read `locusFocus(foldViewOf(state))` — NOT `state.focus`.

`state.focus` is still read for exactly one thing: the run's **HITL status** (is it parked at a gate /
escalated / idle), e.g. the spine's `shipDone` park-guard. That is a different question from "which card
is the locus" — status vs. highlight — and `state.focus.kind` is reliable for it (only the stale *step*
was not). The spine's "actively merging" reads `liveStep` (the running step) so a finished run — whose
furthest-reached locus is still `dp-merge` — reads **done**, not merging.

## What it fixes / hardens

- The upstream-box-glowing bug (Navigator-reflect during deploy; UX-designer at the intake gate) is
  gone by construction: only the current locus glows, everything else is `base`.
- "Two gates lit at once" is impossible — there is only ever ONE glow.
- The glow lands on the gate the run reached, not the last role step before it (`liveStep` vs stale
  `focus` carry; furthest-reached milestone between turns).
- One place to reason about lighting; the renderer can't invent lit-state.

## Status

- ✅ `lib/card-state.ts` — the deriver (pure, total): `currentLocus` picks the ONE glow
  (running step > parked gate/escalation > furthest-reached milestone); everything else `base`.
- ✅ `lib/card-state.test.ts` — 8 tests: running step glows (upstream boxes base), intake gate glows
  not the UX designer between turns, scrub-replay gate glow, running-step-wins-over-approved-gate
  back-edge, live reconcile keeps glow on the running step (gate base), parked gate, escalation, and
  "exactly one card glows, never two" asserted in every case.
- ✅ Wiring — `LaneGraph` (dot strip + `LaneSvg`/`StepBox`) consumes `deriveCardStates`; the dim/faint
  gradations, `done-past` box dimming, and `gateTintFor` are deleted. `BASE_OPACITY` is the single
  non-current level. Snapshots refreshed; verified against the live run at the real frames.
