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
| `currentLocus` | the **§8 decision table** (authoritative): `liveStep` → non-approved-gate focus / scrubbed `parkedGateStep` → escalation → (`complete && atLive` ⇒ none) → furthest(`reachedThisPass ∪ approvedGates`) (`card-state.ts`) | I1, I3 |
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

> **Status:** G1-companion (log∪gates.json reconciliation), G2 (RE-attributed promote ladder +
> `phase.end [release-engineer] promote` + per-sub-step span-close), and the lit-card decision table
> (§8) all SHIPPED in **consort 0.4.40**. G1-root (persist promote to `gates.json`) still tracked.

---

## 8. TRUTH TABLE — EVERY card ↔ the exact state that lights it (both directions)

There are **36 cards** across the four lanes. Each is one of three kinds, lit by a DIFFERENT mechanism:
- **ROLE STEP** — lit by a `phase.start` (or named event) carrying a specific `role` + `phase`/`buildMode`.
- **GATE (purple diamond)** — lit by its own gate KEY's `gate.surfaced`/`gate.approved` (via `GATE_KEY_BY_STEP`, `gates.ts`). **7 of them, each a different key.**
- **HIL (red terminal)** — lit by `escalation.raised`, routed to ONE lane's box by `escalationStepId(source, activeNode)` (`reducer.ts`). **4 of them, each a different origin.**

Columns: **Lights WHEN** = the variable/event condition (card→state). **Emitted by / Emitted?** = the kit emission that produces that condition, verified in source (state→card). When several cards match at once, §8R picks the ONE that glows.

### 8R. Resolver — which ONE card wins (`currentLocus`, ordered; FIRST match wins)
| # | Rule | Condition (FoldView vars) | Lights |
|---|---|---|---|
| 1 | **RUNNING STEP wins always** | `liveStep` present (= `topology.laneCurrent.step`) | `liveStep` — even when phase reads `complete` (re-driven promote) |
| 2 | **Live / surfaced GATE** | `liveStep` null, `focus.kind='gate'`, `focus.status ≠ 'approved'` | that gate |
| 3 | **Scrubbed gate.surfaced frame** | `liveStep` null, not (2), `!atLive`, `parkedGateStep` set | `parkedGateStep` |
| 4 | **ESCALATION park** | `liveStep` null, no gate above, `focus.kind='escalation'` | `focus.step` (the HIL) |
| 5 | **SHIPPED terminal** | none of 1–4, `complete && atLive` | **NOTHING** (Shipped rests) |
| 6 | **Furthest reached** (idle/between-turns/scrubbed history) | otherwise | furthest of `reachedThisPass ∪ approvedGates`, else nothing |
> ONE-DOORWAY invariant: `liveStep` IS the server's `laneCurrent.step`; Rule 1 lights it unconditionally, so server and client never disagree for a running step. `complete` is a COARSE derived flag (true whenever all stories are done — so it reads `complete` even mid-re-driven-promote); it may ONLY suppress in Rule 5, never ahead of live work. The bug this fixed: the complete-guard sat ahead of Rule 1 → blanked an actively-running `dp-ci`.

### 8A. PLAN lane
| Card | Lights WHEN | Emitted by | Emitted? |
|---|---|---|---|
| `p-intake` Product owner | `[product-owner]` `phase=intake` (or seed `intake.supplied`) | invoke-role PO `mode=intake` → `phase.start` (orch-logging) / seed | ✓ |
| `p-ux-establish` UX designer | `[ux-designer]` `phase=establish` | invoke-role ux-designer `mode=establish` | ✓ |
| `p-intake-gate` **Intake gate** | gate key `intake` surfaced/approved | `approve-intake-gate` → surfaced+approved | ✓ |
| `p-propose` Spec author | `[spec-author]` `phase=propose` | invoke-role spec-author `mode=propose` | ✓ |
| `p-size` Architect | `[architect-reviewer]` `phase∈{estimate,estimate-committed}` | invoke-role architect `mode=estimate`; `estimate-committed` (architect-estimator manifest) | ✓ |
| `p-backlog-gate` **Backlog gate** (lane-only, no spine node) | gate key `backlog` | `approve-backlog-gate` → surfaced+approved | ✓ |
| `p-req` Product owner | `[product-owner]` `phase∈{author-requests,feature}` | invoke-role PO `mode=author-requests` | ✓ |
| `p-gate` **Plan gate** | gate key `plan` | `approve-plan-gate` → surfaced+approved | ✓ |

### 8B. DESIGN lane
| Card | Lights WHEN | Emitted by | Emitted? |
|---|---|---|---|
| `d-breakdown` Spec author | `[spec-author]` `phase=breakdown` | invoke-role spec-author `mode=breakdown` | ✓ |
| `d-spec` Spec author | `[spec-author]` `phase∉{propose,estimate,author-requests,breakdown}` (=design) | invoke-role spec-author (design) | ✓ |
| `d-ux-ia` UX designer | `[ux-designer]` `phase=ia` | invoke-role ux-designer `mode=ia` | ✓ |
| `d-arch` Architect | `[architect-reviewer]` `phase≠estimate` (=design) | invoke-role architect (design) | ✓ |
| `d-dba` DBA | any `[dba]` turn | invoke-role dba | ✓ |
| `d-ts` Test strategist | any `[test-strategist]` turn | invoke-role test-strategist | ✓ |
| `d-nav` Navigator | `[navigator]` `buildMode/phase∈{reflect,reconcile}` | invoke-role navigator `mode=reflect`/`reconcile` | ✓ |
| `d-gate` **Spec gate** | gate key `spec` | `surface-gate`→surfaced; `approve-gate`→approved | ✓ |
| `d-hil` **Raise to HIL** | `escalation.raised` → `activeNode=design` (design-reflect smell) | `raise-to-hil` / drive catch | ✓ |

### 8C. BUILD lane
| Card | Lights WHEN | Emitted by | Emitted? |
|---|---|---|---|
| `b-red` Navigator | `[navigator]` `phase=red`, `buildMode∉{reflect,review,assess,assess-refactor,assess-deploy}` | invoke-role navigator (red) | ✓ |
| `b-green` Driver | `[driver]` `buildMode∉{refactor,repair,refactor-superseded,refactor-deploy,green-superseded}` | invoke-role driver (green) | ✓ |
| `b-review` Navigator | `[navigator]` `buildMode∈{review,assess,assess-refactor}` | invoke-role navigator `mode=review`/`assess` | ✓ |
| `b-refactor` Driver | `[driver]` `buildMode=refactor` | invoke-role driver `buildMode=refactor` | ✓ |
| `b-repair` Driver | `[driver]` `buildMode=repair` | invoke-role driver `buildMode=repair` | ✓ |
| `b-perm` Driver | `[driver]` `buildMode∈{green-superseded,refactor-superseded}` | invoke-role driver (supersession) | ✓ |
| `b-accept` **Acceptance gate** | gate key `acceptance` | `await-acceptance`→surfaced; `experiment.accepted`/`gate.approved acceptance` (mergeAndAcceptStory) | ✓ |
| `b-hil` **Raise to HIL** | `escalation.raised` source∈{driver-green,driver-refactor,spec-defect,auth-expired,verify.failed} OR `activeNode=build` | `raise-to-hil` / drive catch | ✓ |

### 8D. DEPLOY lane
| Card | Lights WHEN | Emitted by | Emitted? |
|---|---|---|---|
| `dp-deploy` Deploy | event `deploy.start` | `consort-deploy` CLI (deploy effect) | ✓ |
| `dp-verify` Verify | event `deploy.verified` (also `verify.passed` / `test.result [release-engineer]` via `roleForEvent`) | `consort-deploy` verify | ✓ |
| `dp-gate` **deploy gate** | gate key `deploy` | `approve-deploy-gate` → surfaced+approved | ✓ |
| `dp-pr` Prepare PR | `phase=promote`, msg∌`wait-ci`/`merge`, `event≠phase.end` | `phase.start [RE] promote` + `reasoning [RE] prepare-pr` (+span-close) | ✓ (0.4.40) |
| `dp-ci` Wait CI | `phase=promote`, msg∋`wait-ci` | `reasoning [RE] wait-ci` (+ `… complete`) | ✓ (0.4.40) |
| `dp-promgate` **promote gate** | gate key `promote` | `approve-promote-gate` → surfaced+approved (LOG) | ⚠ **G1**: logged, NOT persisted to `gates.json`; dashboard unions the LOG (reconciliation, 0.4.40) so it lights. Root fix still open. |
| `dp-merge` Merge | `phase=promote`, msg∋`merge` | `reasoning [RE] merge` (+ `… complete`) | ✓ (0.4.40) |
| `dp-assess` Assess-deploy | `[navigator]` `buildMode=assess-deploy` | invoke-role navigator `buildMode=assess-deploy` (deploy-verify-heal) | ✓ |
| `dp-refactor` Scope-deploy | `[driver]` `buildMode=refactor-deploy` | invoke-role driver `buildMode=refactor-deploy` | ✓ |
| `dp-hil` **Raise to HIL** | `escalation.raised` source=`deploy-verify` OR `activeNode=deploy` | `raise-to-hil` / drive catch (deploy-verify) | ✓ |
| `dp-promote-hil` **Raise to HIL** | `escalation.raised` `activeNode=promote` (SCM failure: prepare-pr/wait-ci/merge) OR laneCurrent=deploy in promote | drive top-level catch (SCM `CliEffectError` → resumable escalation) | ✓ |

### 8E. The 7 GATES at a glance (purple) — `gates.ts` is the single source
| key | lane card | spine node | surfaced+approved emitted by |
|---|---|---|---|
| intake | `p-intake-gate` | intakegate | `approve-intake-gate` ✓ |
| backlog | `p-backlog-gate` | — (lane-only) | `approve-backlog-gate` ✓ |
| plan | `p-gate` | plangate | `approve-plan-gate` ✓ |
| spec | `d-gate` | specgate | `surface-gate` + `approve-gate` ✓ |
| acceptance | `b-accept` | acceptancegate | `await-acceptance` + `experiment.accepted` ✓ |
| deploy | `dp-gate` | deploygate | `approve-deploy-gate` ✓ |
| promote | `dp-promgate` | promgate | `approve-promote-gate` ✓ LOG (⚠ G1 not persisted; dashboard log-union) |

### 8F. The 4 HIL cards at a glance (red) — routed by `escalationStepId(source, activeNode)`
| card | routed WHEN | origin |
|---|---|---|
| `d-hil` | `activeNode=design` | a design-reflect smell escalation |
| `b-hil` | source∈{driver-green,driver-refactor,spec-defect,auth-expired,verify.failed} OR `activeNode=build` | build-cycle GREEN-verify / spec-defect / auth |
| `dp-hil` | source=`deploy-verify` OR `activeNode=deploy` | deploy-verify assess failure |
| `dp-promote-hil` | `activeNode=promote` (or laneCurrent=deploy in promote) | SCM ladder failure (PR/CI/merge) |

> Every row's trigger token was grep-verified as emitted in `consort/orchestrator` + `consort/logging`
> (counts > 0 for every `phase`/`buildMode`; `deploy.*`/`verify.*` by the deploy CLI; gates by the
> `approve-*`/`surface-gate`/`await-acceptance` cases; escalations by `raise-to-hil` + the drive catch).
> The ONLY state-not-emitted gap is **G1** (promote → `gates.json`), covered at the dashboard by the log∪snapshot union until the kit persists it.
