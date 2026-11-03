# State ↔ Card map — the dashboard lighting invariant

**Invariant (the whole point of this doc):** *every observable state maps to exactly one lit card, and
every lit card maps back to a backing state.* A card that glows with no consistent backing state is a
bug; a state that lights the wrong card (or none) is a bug. This document enumerates every observable
input, the derivation chain, and the card each lights — in both directions — so a lighting defect can
be traced to the exact state that is wrong.

It was written diagnosing the **promote-gate-flashes-on-a-complete-run** defect (see §6), which is
precisely an invariant violation: a lit card with no valid backing state.

---

## 1. Observable inputs (the ONLY sources on disk)

| # | Input | Provides | Read by |
|---|---|---|---|
| I1 | `.consort/agent-log.jsonl` | the event stream: `phase.start/end`, `handoff`, `gate.surfaced/approved`, `experiment.cut/accepted`, `reasoning`, `turn.usage`, `test.result`, `deploy.*`, `escalation` | the whole fold (topology, agents, frontier gate, focus, `gatesFromLog`) |
| I2 | `.consort/next.json` | drive stop-state: `awaiting_human`, `state.open_gates`, `state.blockers`, `primary_action`, `state.coarse/derived_phase`, `feature` | `focusOf` fallback, blockers, phase |
| I3 | `.consort/features/<F>/gates.json` | **authoritative per-gate status**: `spec/plan/test_list/promote/deploy` → `open`/`approved` + history | feature-status CLI → `status.gates` → `snapshotGates` |
| I4 | `.consort/features/<F>/pipeline.json` | `build_active`, `build_queue`, stories | story/lane scoping |
| I5 | `.consort/drive.pid` (JSON `{pid}`) | **drive liveness** — `process.kill(pid,0)` → `driveAlive` (STOP = drive-pid-gone) | `restingAtGate` |
| I6 | Claude transcripts mtime (`~/.claude/projects/-<slug>/*.jsonl`) | `sessionAgeMs` → `sessionActive` per agent | agent-bubble liveness |

> **Two of these describe GATE STATUS and can disagree: I1 (the log's `gate.approved`) and I3
> (`gates.json`).** That disagreement is the defect in §6.

---

## 2. Derivation pipeline (input → derived state)

| Derived | Formula / source | Inputs |
|---|---|---|
| `agents`, `runEnded` | `reduceAgents(slice)` — `runEnded=true` on `phase.end`/`workflow` (`derive.ts:590`) | I1 |
| `topology` (`activeNode`, `laneCurrent`, `laneGate`, `laneLast`, `passed`, `reachedThisPass`) | `deriveTopology(slice)` — phase-walk; trailing `phase.end` ends the walk → `activeNode=null` on a complete run | I1 |
| `frontierGate {gate, approved}` | log-scan: most-recent `gate.surfaced`, approved if a later `gate.approved`/(acceptance: `experiment.accepted`) (`reducer.ts`) | **I1** |
| `driveAlive` | `drive.pid` names a live process (`consort.ts` `driveIsAlive`) | I5 |
| `snapshotGates` | `status.gates` → `[{name,status}]` (`reducer.ts:423`) | **I3** |
| `gates` (`state.gates`) | at the live edge: **`snapshotGates`** (I3); scrubbed/divergent-pin: `gatesFromLog(slice)` (I1) (`reducer.ts:430-435`) | I3 (live) / I1 (scrubbed) |
| `restingAtGate` | `atLive && frontierGate!=null && !driveAlive && !agents.working` (`reducer.ts`) | I1, I5 |
| `focus` (`focusOf`) | `escalation > step(laneCurrent/carry) > gate(frontierGate, status from frontierGate.approved) > idle` (`reducer.ts:76-88`) | I1, I5 |
| `approvedGates` | `new Set(state.gates.filter(status==='approved').name)` (`card-state.ts:151`) | **I3 (live)** |
| `currentLocus` | `liveStep > pendingGateStep(focus.kind==='gate') > escalation > furthest(reachedThisPass ∪ approvedGates)` (`card-state.ts:95-122`) | I1, I3 |
| `locusFocus` | `currentLocus` re-expressed; **gate status = `approvedGates.has(gate) ? 'approved' : 'surfaced'`** (`card-state.ts:130-139`) | I1, **I3** |

> **Note the split brain:** `focus` (reducer) takes a gate's approved-ness from the **log** (I1,
> `frontierGate.approved`); `locusFocus` (card-state) takes it from **`approvedGates` = gates.json**
> (I3). When I1 and I3 disagree, `focus` and `locusFocus` disagree.

---

## 3. The single-glow model (CARD-LIGHTING-DESIGN.md)

Exactly ONE card glows = `currentLocus`: **running step > parked/approved gate > furthest-reached
milestone**. Everything else renders `base`. `locusFocus` re-expresses that one locus so every surface
(workflow-graph node, lane card, transport, agent bubble) reads the SAME key. "Lit" means that one
locus; "pulse" means it is *active/awaiting*, not merely *done*.

---

## 4. Every lit-card surface ↔ its backing state

| Lit surface | Lights / pulses WHEN (state) | Backing input | File |
|---|---|---|---|
| **Workflow-graph phase node** (Intake…Deploy…Promote) active+pulse | `node.id === spineActiveNode` (= `activeNode`, or `shipped` while merging/issue) | I1 (topology) | `WorkflowGraph.tsx:115,173` |
| **Workflow-graph gate diamond** active+pulse | `node === awaitedGateNode` — `locusFocus.kind==='gate' && status==='surfaced'` | I1+**I3** (via `locusFocus`) | `WorkflowGraph.tsx:76` |
| **Workflow-graph "Shipped"** lit STEADY (no pulse) | `shipDone` = `liveStep===null && focus not surfaced-gate/escalation && passed.has('promote') && !loopedBack` | I1, I2 | `WorkflowGraph.tsx:104` |
| **Workflow-graph node** "reached" (muted, static) | `passed.has(node.id)` | I1 (topology) | `WorkflowGraph.tsx:187` |
| **Orchestrator card** flashing (red/purple/slate) | `issue=focus.kind==='escalation'` / `waiting=focus.kind==='gate' && status==='surfaced'` / `running=focus.kind==='step'` | I1, I5 | `OrchestratorLane.tsx:67-89` |
| **Orchestrator gate bubbles** | per-gate `storyGateStatus` (log) | I1 | `OrchestratorLane.tsx:88` |
| **Transport readout** RUNNING/WAITING/PARKED/RAISED/REVIEWING | `focus` + `driveAlive` + playhead | I1, I5 | `Transport.tsx` |
| **Lane step card** glow | `currentLocus.step` in that lane | I1, I3 | `LaneGraph.tsx` |
| **Agent bubble** working/waiting/issue/idle | `reduceAgents` + `sessionActive` | I1, I6 | `derive.ts` |

Round-trip check: a diamond that pulses ⇒ `locusFocus` says a gate is `surfaced` ⇒ `approvedGates`
(I3) lacks that gate AND it is the furthest locus. If the gate was in fact approved, **I3 is wrong**.

---

## 5. Gate status has THREE representations (the hazard)

| Source | For promote on the complete sprint-2 run | Used by |
|---|---|---|
| **I1 log** — `gate.approved promote` fired | **approved** | `frontierGate` → `focus` (reducer) |
| **I3 gates.json** — `promote: {status:"open", history:[]}` | **open** | `snapshotGates` → `state.gates` → `approvedGates` → `locusFocus` |
| **I2 next.json** — `open_gates: []`, `awaiting_human:false` | not parked | `focusOf` fallback |

They are supposed to agree. For `deploy` they do (gates.json `deploy: approved`). For **promote** they
do not: the log says approved, gates.json says open.

---

## 6. DEFECT — promote gate flashes on a COMPLETE run (invariant violation)

**Symptom:** F1 sprint-2 is finished (merged, `phase.end`/END workflow, drive gone). The promote gate
diamond pulses as if awaiting a decision. It should read reached/static; "Shipped" should be the quiet
terminal locus.

**Trace (lit card → backing state → the wrong state):**
1. Diamond pulses ⇐ `awaitedGateNode === promote` ⇐ `locusFocus = {gate:'promote', status:'surfaced'}`.
2. `status:'surfaced'` ⇐ `approvedGates` lacks `promote` ⇐ `state.gates` (= `snapshotGates` at live edge) has `promote:open` ⇐ **`gates.json.promote.status === "open"`** (I3).
3. But the run DID approve promote — **I1 has `gate.approved promote`** (and `focus` (reducer) correctly = `gate/promote/approved`). So the lit card maps back to a state (I3) that is **stale/wrong**; the correct state (I1) says the opposite. Invariant violated.

**Root cause (kit, not dashboard):** nothing persists `promote: approved` to `gates.json`.
- `approveGate` (`consort/gates/approve-gate.ts:66-68`) defers promote: *"promoteExperiment already writes its own promote entry."*
- `promoteExperiment` (`consort/experiment/promote-experiment.ts`) writes winner/loser outcomes, `feature.status="ready-for-review"`, and archives — but **does not write the `gates.json` promote record.**
- No `approveGate({gate:"promote"})` call exists anywhere in the kit.
- Result: `gate.approved promote` is emitted to the **log only**; `gates.json.promote` stays `open` with empty history forever. `deploy` (which DOES call `approveGate`) persists correctly — hence the asymmetry.

**Why the dashboard-only guard I tried first is insufficient (and should be reverted):** gating
`awaitedGateNode` on `status==='surfaced'` does nothing here, because `locusFocus` *derives* that status
from the stale `approvedGates` (I3) → it still reports `surfaced`. The split-brain (I1 vs I3) must be
healed at the source.

**Fix options, in order of correctness:**
1. **(root, kit)** Persist the promote approval to `gates.json` — have the promote approval path call
   `approveGate({gate:"promote", …})` (or have `promoteExperiment` write the promote gate record), exactly
   as `deploy` does. Then I3 agrees with I1, `approvedGates` includes promote, `locusFocus` = `approved`,
   the diamond reads reached, and Shipped is the quiet terminal locus. One source of truth restored.
2. **(dashboard reconciliation, defensive)** `approvedGates` / `locusFocus` should treat a gate as
   approved when **either** I3 **or** the log (I1 `gate.approved`) says so — so a stale snapshot can
   never relight a gate the log has approved. This also fixes `spec` (approved per-story in the log,
   `open` in the feature-level gates.json). Belongs with, not instead of, fix 1.

---

## 7. Kit-emission gaps (TRACKED) — a card needs a state the kit does not emit/persist

Rule: **if a card must light but no observable state backs it, the kit is missing an emission/persist —
track it here and fix it at the source.** Each row: the card that needs it, the state that should back
it, what the kit does today, and the fix.

### G1 — promote approval is logged but NOT persisted to `gates.json`
- **Card that needs it:** promote diamond must read *reached/approved* (static) on a shipped run; Shipped
  must be the quiet terminal locus.
- **State that should back it:** `gates.json.promote.status === "approved"` → `approvedGates` ∋ promote →
  `locusFocus` = approved.
- **Today:** `gate.approved promote` is emitted to the **log only** (I1). Nothing writes the `gates.json`
  promote record — `approveGate` defers it to `promoteExperiment` (`approve-gate.ts:66-68`), but
  `promoteExperiment` never writes it, and no `approveGate({gate:"promote"})` call exists. `gates.json.promote`
  stays `{status:"open", history:[]}` forever. (`deploy` persists correctly via `approveGate`.)
- **Kit fix (plan):** persist the promote approval to `gates.json` on approval — call
  `approveGate({featureId, gate:"promote", approver, artifactInputs:{promote_ref}, hitlApproved:true})` in the
  promote-approval effect (`orchestrator-effects.ts` `approve-promote-gate`, ~line 2338), OR write the record
  inside `promoteExperiment`. Mirror `deploy`. → I1 and I3 agree → the flash cannot recur.
- **Dashboard companion (defensive, not instead of):** `approvedGates`/`locusFocus` should union the log's
  `gate.approved` (I1) with `gates.json` (I3), so a stale snapshot can never relight a log-approved gate.
  This also fixes `spec` (approved per-story in the log, `open` in the feature-level `gates.json`).

### G2 — release-engineer's promote work is emitted as `reasoning [orchestrator]`, not as RE
- **Card that needs it:** the **Promote** lane + the **release-engineer** dot must light as having done the
  promote work (and read *reached* when done).
- **State that should back it:** promote-phase work events (`prepare-pr`/`wait-ci`/`merge`) attributable to
  `role: "release-engineer"`, `phase: "promote"`, closed by a `phase.end [release-engineer] promote`.
- **Today:** only `phase.start [release-engineer] promote` is RE-attributed; `prepare-pr`/`wait-ci`/`merge`
  are orchestrator effects emitted as `reasoning [orchestrator]` (`orchestrator-effects.ts:2306-2348`); the
  phase closes with `phase.end [orchestrator] END workflow` — no `phase.end [release-engineer] promote`. The
  topology therefore cannot attribute promote to the release-engineer.
- **Kit fix (plan):** decide ownership (the `phase.start [release-engineer] promote` says RE owns the phase),
  then make the emission consistent with it — emit the promote ladder steps carrying
  `role:"release-engineer", phase:"promote"` (even though the orchestrator executes them, they are the RE's
  phase of work), and emit a `phase.end [release-engineer] promote` before the workflow END. Then the Promote
  lane + RE dot light from RE's own events, live AND in rewind.

> **Status:** both tracked; neither applied yet (map-first, per the "do not one-off this" directive). The
> exploratory dashboard-only `awaitedGateNode` guard is to be reverted; the real fix is G1 (+ its dashboard
> companion) and G2, as one coherent change.
