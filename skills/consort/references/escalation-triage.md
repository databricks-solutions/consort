# Escalation & revision triage — pick the PROPORTIONATE remediation

When the drive BLOCKS (an escalation / a smell / an uncovered invariant), do NOT reach for a full
re-author. There is a ladder from least to most destructive; match the escalation's `source` + the
story's STATE to exactly ONE rung. `consort-next --feature <F>` names the source and the story; this
guide turns that into the right command. **Reopen/revise are a last resort — prefer the scoped path.**

## 1. The three questions that pick the rung

1. **What is the `source`?** (from the escalation / `consort-next`): `driver-green`, `spec-defect`,
   `deploy-verify`, `smell`/reflect finding, an uncovered persistence invariant (a `PIx` coverage gap),
   `auth-expired`. **An uncovered `PIx` does NOT always arrive as an escalation** — it also surfaces as a
   between-feature / feature-complete **`consort-gate-conformance` halt** (`exited 1`, "N of M artifact(s)
   non-conformant … persistence_invariant(s) with no covering test-list item"). Same coverage gap, same rung
   below — `consort-next` may still read the feature as `done`/deploy-ready because the conformance guard is a
   sprint-level check it does not surface, so treat the conformance-halt message itself as the trigger.
2. **Is the story ACCEPTED or still pre-acceptance (building/designing)?** This decides
   `repair` (accepted, no teardown) vs `reopen-story` (pre-accept — the test-list is frozen in-build, so
   changing coverage REQUIRES reopening to `designing`).
3. **Is it a CODE regression, a COVERAGE gap (a missing test/tag), or a DESIGN defect?** Code → the
   driver fixes it (often automatically). Coverage → retag/author one test. Design → go back to the
   owning role, NOT the code.

## 2. The ladder (least → most destructive)

| `source` / symptom | Story state | Nature | Do THIS (exact) | Touches |
|---|---|---|---|---|
| `driver-green` GREEN-verify fail, driver-fixable | building | code | **automatic** — drive routes a bounded Driver `repair` turn (`buildMode:repair`). No human. | the code, one AC |
| `driver-green`, prior tests obsoleted by this AC | building | supersession | **automatic** — Driver `green-superseded` re-greens. | re-green, labeled |
| `driver-green`, CONFIRMED regression, no fix directive | building | code needs human/design | fix the root cause, then `consort-resolve-escalation --id <id> --resolution "<what you fixed>"`, resume | — |
| uncovered persistence invariant `PIx` — ANY type (`transactional`/atomicity, `unique`, `check`, `migration_reversible`, …) | **ACCEPTED** / built (`done`) | coverage gap | `consort-pipeline repair --feature <F> --story <S> --gap uncovered-invariant --invariant <PIx> --approver <you> [--retag <testId>]` then `consort-pipeline complete-repair --feature <F> --story <S>` | **retags** an existing covering test when one exists, **else AUTHORS a new one** via the same roles (test-strategist adds the item → navigator RED test → driver GREEN); NO teardown, acceptance + experiment PRESERVED. (A `transactional`/atomicity PI with no existing rollback test is the author-new case — do NOT reach for `--only design`, which no-ops on the frozen gate; see rule 3.) |
| uncovered persistence invariant `PIx` | building / pre-accept | coverage gap | `consort-reopen-story --feature <F> --story <S> --from test-strategist` → tear down the flagged experiment → `consort-resolve-escalation …` → resume. The Test Strategist **retags** the existing round-trip test (authors only if none). | test-list + Navigator tests; keeps ACs/architecture/schema |
| `spec-defect` (the failing test/NFR is itself wrong) | building | design | `consort-reopen-story --feature <F> --story <S> --from <specDefectFromRole>` (the role the Navigator named) → resume | that role's artifact + everything downstream; keeps earlier artifacts |
| reflect / `smell` finding (revisable, not terminal) | designing/build | design nuance | **automatic** — drive `revise-route` re-runs ONE gate at the owning author | one gate |
| `deploy-verify` assess failure | deploy | code/env | **automatic** — Navigator `assess-deploy` → Driver `refactor-deploy`; if terminal, fix + `consort-resolve-escalation …` | — |
| CONFIRMED design-root defect (the spec/ACs are wrong at the root) | any | design | `consort-pipeline revise --feature <F> --story <S> --approver <you>` — FULL teardown + re-author. **Last resort.** | discards the experiment, reopens to `designing` |

## 3. Golden rules

1. **PROPORTIONATE reopen — from the LOWEST role that owns the defect.** `consort-reopen-story --from
   <role>` reverts that role's artifact + everything DOWNSTREAM, nothing above it. Pick the latest role
   that owns the problem:
   - `--from test-strategist` → re-author the **test-list only** (keeps ACs, architecture, schema, UX) — the most surgical.
   - `--from dba` → schema / db-design + test-list down.
   - `--from architect-reviewer` → architecture + down.
   - `--from ux-designer` → IA / design-guide + down.
   - `--from spec-author` → spec / ACs + everything down (closest to a whole re-author — use only when the SPEC is wrong).
   - no `--from` → full redesign (re-dispatches the Spec Author). Avoid unless the defect is at the root.
   Valid roles = `DESIGN_LANE_ORDER`.
2. **`migration_reversible` / round-trip invariant (`PIx`) — retag IF a correct test exists, else author the RIGHT SHAPE.**
   - **Retag first** when a round-trip test already exercises **THAT migration's** reversibility but is
     missing the `invariant_id` tag (`repair --retag <id>`, or on a pre-accept reopen the Test Strategist
     tags it). Do NOT retag onto a round-trip for a *different* migration (e.g. tagging a `stock_records`
     CREATE round-trip onto a PI about the `stock_adjustments` additive migration = a false green).
   - **If no correct test exists, AUTHOR it in the right shape — there are TWO**, and the recurring bug is
     authoring the wrong one (the role then re-authors identically and the loop can't self-correct):
     - **(A) OWN-TABLE** (the invariant's table IS created/altered by this feature): round-trip asserting
       **SCHEMA-RECREATION** (the downgrade drops the table; "rows survive" is UNSATISFIABLE — never author it).
     - **(B) PRE-EXISTING-TABLE SURVIVAL** (the table is NOT in this feature's `schema_changes` — a later
       ADDITIVE migration must not disturb a prior table): **downgrade FIRST** to the additive migration's
       `down_revision` → seed → `upgrade head` → assert unchanged → downgrade → assert still present.
       **Never** author (B) forward-only ("seed rows, then `upgrade head`") — the harness is at HEAD, so there
       is no "before" to seed into; it is unsatisfiable and dead-locks into HIL. (Canon: `navigator.md` case A/B.)
   - A forward-only or wrong-shape attempt trips the honest-GREEN **#199 `reversible-invariant-round-trip`**
     verify at build — a role that can't self-correct across two reopens is authoring shape (B) forward-only;
     the fix is the downgrade-first recipe above, not another reopen.
   - **A `transactional`/atomicity PI (e.g. "row-update + audit-insert commit together; if either fails neither
     persists") is NOT a migration round-trip** — its covering test FORCES a mid-transaction failure (e.g. patch
     the commit to raise) and asserts BOTH writes rolled back (neither row persists). The F2 `T19
     test_adjust_rolls_back_when_transaction_fails` is the template; author that shape, not a downgrade/upgrade.
3. **ACCEPTED vs PRE-ACCEPT decides `repair` vs `reopen`.** `repair` (surgical, no teardown, acceptance
   preserved) is ONLY valid once the story is accepted. Pre-accept, the test-list is frozen in-build, so
   changing coverage requires `reopen-story --from <role>` (reset to `designing`). **Do NOT reach for
   `consort-drive --only design` (or any design-reopen) to amend a built/accepted feature's test-list — it
   NO-OPS** ("design already complete, nothing to do") because the test_list gate is already approved/frozen;
   it will never re-invoke the Test Strategist. And there is no separate `reopen`/`refine`/`gate-revoke` bin to
   hunt for: the post-accept amend path IS `consort-pipeline repair --gap uncovered-invariant` (accepted) and
   the pre-accept one is `consort-reopen-story --from test-strategist`. Nothing else, and never hand-edit the
   frozen `test-list.json`.
4. **NEVER hand-edit `.consort/escalations/` or `smells.json`** to move forward — it desyncs on-disk
   state. Clear via `consort-resolve-escalation --id <id> --resolution "<what you fixed>"` (clears the
   escalation AND any blocking smell, keeps the audit trail).
5. **After a reopen, the stale experiment branch** (git + paired Lakebase) is flagged — tear it down,
   then resume (`consort-drive --sprint <s> --gates proxy` for hands-off, or `--feature <F>`).

## 4. The shape of a correct remediation (worked example: uncovered PI, pre-accept)

> F2/S1 blocked: Test Strategist couldn't cover `PI9` (a migration round-trip) → test-authoring escalation.
1. `consort-reopen-story --feature F2 --story S1 --from test-strategist` — reverts only the test-list +
   Navigator tests; keeps ACs/architecture/schema; resets S1 to `designing`.
2. Tear down the flagged stale experiment branch (git + paired Lakebase).
3. `consort-resolve-escalation --id <id> --resolution "reopened test-list to cover PI9 (retag round-trip)"`.
4. Resume: `consort-drive --sprint sprint-2 --gates proxy`. On re-author the Test Strategist **retags**
   the existing round-trip test for `PI9` (NOT a new one — rule 2); the spec gate re-surfaces; the sprint
   continues hands-off.

See also: [[workflow-state-machine.md]] (phases + gates), [[orchestrator-contract.md]] (what the
deterministic orchestrator emits), [[test-strategy.md]] (invariant coverage + round-trip tests).
