# Consort Dashboard — Component & Data Scoping Spec (as-built)

> Authoritative inventory of the dashboard as it exists today: every component, its
> purpose, what it shows, how it shows it, when it updates, where its data comes from,
> and the actions it offers (with each action's source and outcome). This is the
> **requirements baseline** — the agreed description we must have *before* any redesign.
> Nothing here proposes a change; §8 only names the defects this baseline exposes.

---

## 0. Architecture in one picture

```
on-disk sources                 server (Next.js route handlers)        client (React)
───────────────                 ──────────────────────────────        ──────────────
.consort/agent-log.jsonl ─┐
next.json                 │     /api/state ── source.getState() ──┐   usePolledState(2s)
feature-status CLI        ├──►  (fold events+snapshot → State)    ├─► DashboardState ─► components
drive.pid                 │     /api/activity-timeline            │   timeline poll (2s)
.handback/*.md            │     /api/story-tests, story-tables    │   /api/* fetch-on-open
test-run.jsonl            │     /api/project-branch, planning      │
agent-live.log            │     /api/turn, artifact, step-outputs  │   scrub (at / lineAt)
turns/ corpus (replay) ───┘     /api/driver-activity, test-run-live┘   pin (feature filter)
```

- **Source abstraction** (`lib/source.ts`): `LiveSource` (watches `.consort/`, shells the
  feature-status CLI, reads HEAD) vs `ReplaySource` (reads a finished `turns/` corpus; can
  rewind snapshots). Both implement `DashboardSource`; `foldSource()` is the one merge point.
- **The fold** (`lib/reducer.ts::fold`): pure `(events, snapshot, upTo, pinnedFeature) → DashboardState`.
  Reconstructs gates/stories/blockers from the log prefix when scrubbed; reconciles the
  snapshot against the log at the live edge.
- **Two independent playheads**: `at` (event index, drives the fold; `null` = follow live) and
  `lineAt` (agent-log line index, drives the per-turn step replay only). **Pin** (`pinnedFeature`)
  is a *filter*, never a seek.

---

## 1. THE governing principle (currently unwritten — this is the gap)

Every value on the board is exactly one of two kinds. **The redesign's first requirement is
that every field, label, and panel declare which kind it is, and that a kind-2 surface never
silently shows a kind-1 value.**

- **Kind 1 — LIVE / current-run-&-branch facts.** Only meaningful for the feature the drive is
  on *right now*, against the branch checked out *right now*:
  `feature` (when `driveAlive`), `gates`/`phase`/`progress.testByStatus` (snapshot at live edge),
  the lakebase-branch chip (`/api/project-branch` ← `.env LAKEBASE_BRANCH_ID`),
  live per-test pass/fail (`/api/story-tests` at HEAD, `/api/test-run-live`, `test.result` fold),
  `drive.pid` liveness, `agent-live.log`.
- **Kind 2 — PER-FEATURE/STORY DURABLE facts.** Reconstructable from the log/artifacts for *any*
  feature, past or present: `agents`, `designPhases`, topology/nodes/edges, and — when scrubbed —
  `gates`/`stories`/`blockers` (`gatesFromLog`/`storiesFromLog`/`blockersFromLog`).

**The defect class** (§8) is every place a Kind-2 view (a pinned/scrubbed/past feature or story)
is rendered with a Kind-1 value attributed to it *by id*.

---

## 2. On-disk data sources (what the dashboard reads)

| Source | Provides | Freshness / cache | Kind |
|---|---|---|---|
| `.consort/agent-log.jsonl` | the event stream (turns, gates, test.results, phases) | parsed cache keyed on (size, mtime) | 1+2 (durable facts + live edge) |
| `next.json` | active feature, gates, blockers, derived_phase, options, primary_action | re-read per request | 1 (describes NOW; written by drive on a STOP) |
| feature-status CLI (`lk lakebase-feature-status`) | per-feature test counts, story/gate status | shell-out, stale-while-revalidate 30s | 1 (runs against current checkout) |
| `drive.pid` | `{pid, started_at}` → liveness via `process.kill(pid,0)` | re-read per request | 1 |
| `.consort/features/<F>/.handback/*.md` | open-blocker resolver routing | re-read per request | 2 |
| `.consort/features/<F>/stories/<S>/test-list-per-story.json` | authored tests + live status | re-read per request, HEAD | 1 (status) + 2 (list) |
| `.consort/test-run.jsonl` | live per-test results (reporter-appended) | re-read + reduce per request | 1 |
| `.consort/agent-live.log` | current-turn tool/reasoning sidecar | tail per request | 1 (live only) |
| `.env`, `.lakebase/workflow-state.json` | lakebase branch id + console uid | re-read; CLI uid cached | 1 (current branch) |
| `table-snapshots.jsonl`, `test-interactions.jsonl`, `db-design.json` | per-test table captures | re-read + filter per request | 1/2 (captured rows, scoped by test+feature+story) |
| planning: `feature-proposals.md`, `estimates.json`, `sprints/*/backlog.json`+`gates.json` | backlog/sizing/plan-gate | re-read per request | 2 (static, run-start) |
| `turns/` corpus, `recorded-artifacts/`, `correspondence.jsonl` (replay) | transcripts, per-turn snapshots, HIL beats | corpus, can rewind | 2 (historical) |

---

## 3. API routes (server) — purpose · shape · how · cost/scope · side-effect · triggered-by

All routes are `dynamic="force-dynamic"`, `revalidate=0` (never HTTP-cached). **All eleven are
pure read-only observers** — the dashboard has NO mutation surface and NO "run tests" / "deploy"
trigger anywhere. Every write originates from the drive (agent-log, next.json, drive.pid, turns
corpus), the test reporters (test-run.jsonl, table-snapshots.jsonl), or an external CLI
(`lk feature-status`, `databricks …`, all read-only). `/api/test-run-live` *reports* results a
reporter already wrote; it does not execute tests. This is a load-bearing requirement: the board
observes, it never acts.

- **`/api/state`** — the folded board. `?at=<n>` (event index), `?feature=<id>` (filter),
  `?mode=`. Re-folds the whole log every request; live mode also shells the feature-status CLI
  (30s SWR). **Scope:** live mode always reflects the *current* feature/branch — a `?feature=F1`
  with an old `?at=` still returns F1's *current* gates/%; only replay rewinds the snapshot.
  Triggered by: `usePolledState` (2s).
- **`/api/activity-timeline`** — flattened per-turn lines + turns for the line scrubber/replay.
  Walks the full turn corpus + event log. Requires `transcripts` capability (replay, or live with
  companion `CONSORT_RECORD_DIR`). Triggered by: page timeline poll (2s).
- **`/api/story-tests`** `?feature=&story=` — authored test list + status from
  `test-list-per-story.json`. **Live reads HEAD** (current branch). Triggered by: opening a story
  (StoryTestsLightbox).
- **`/api/story-tables`** `?feature=&story=&testId=&at=<ts>` — per-test table captures, filtered by
  test+feature+story and `at` timestamp. Triggered by: selecting a test in the dock table.
- **`/api/project-branch`** — `{branch, consoleUrl}` from `.env LAKEBASE_BRANCH_ID` +
  `workflow-state.json`; shells `databricks postgres get-project` (cached). **Always the CURRENT
  branch; not feature-scoped.** Triggered by: StoryTestsLightbox branch chip (polls 2s at live edge).
- **`/api/driver-activity`** — live current-turn tail from `agent-live.log`. Live-only.
- **`/api/test-run-live`** — reduced latest status per test from `test-run.jsonl`. Live-only.
  **(Read-only — it reports results a reporter wrote; it does not itself run tests.)**
- **`/api/planning`** — proposals/estimates/sprint-backlog/plan-gate. Static; no time-travel.
  Triggered by: BacklogPanel (once per mode).
- **`/api/step-outputs`** `?node=&feature=&path=` — a lifecycle step's deliverables / one file.
  Triggered by: WorkflowGraph node drill-down.
- **`/api/artifact`** `?path=` — one file at HEAD (live only; replay 409s → uses /api/turn).
  Triggered by: event-ticker `artifact.written` row click.
- **`/api/turn/[ord]`** `?file=` — a recorded turn's metadata/transcript/one snapshot file.
  Replay-gated. Triggered by: event-ticker turn row click / lane-step drill-down.

---

## 4. Client state & polling

- **`usePolledState(at, mode, feature, intervalMs=2000)`** — fetches `/api/state`; re-fires
  immediately on any of `[intervalMs, at, mode, feature]`; exponential backoff (ceil 8s);
  20s request timeout (> the 15s CLI worst case); keeps polling while scrubbed to keep
  `totalEventCount` fresh. **No `visibilitychange`/focus handling** — polls at full rate when the
  tab is hidden (this is the perf complaint; §8.3).
- **`page.tsx` state machine** — `at` (event playhead; `null`=live), `lineAt` (line playhead),
  `pinned` (feature filter), `openStory`, `selectedTestId`, `drilldown` (`turn|step|artifact`),
  `logOpen`/`backlogOpen`, `dockHeight`, `granularity` (events|lines), play/speed. Capability
  gates: `canDrillDown`/`canShowBacklog`/`canOpenArtifact`/`canShowStepOutputs`.
- **`useTheme` / `active-color` / `layout.tsx`** — theme (query>localStorage>env, no-flash
  script); `activeColorForFocus(focus)` is the single highlight-colour deriver (escalation-red /
  gate-purple / role colour / orchestrator-slate).

---

## 5. UI components — purpose · shows · how · updated-when · source · ACTIONS(trigger→source→outcome)

### page.tsx (root)
- **Purpose/Shows/How/Updated/Source:** orchestrates the whole board; header (project, feature,
  phase, event-source badge, feed health, usage toggle, theme), orchestrator card + vitals,
  per-agent contribution bar, WorkflowGraph + LaneGraphs, ActivityDock, Transport, side panes,
  test rail. All from `DashboardState` (`/api/state` 2s) + `timeline` (`/api/activity-timeline` 2s).
- **Actions:** pin feature (`FeatureStatusSection` → `setPinned` → re-scope filter, re-fetch
  `/api/state?feature=`); open story (→ `openStory`, mounts StoryTestsLightbox → `/api/story-tests`);
  scrub (`Transport`/slider → `at`/`lineAt` → re-fold / timeline reveal; closes turn/artifact
  drill-downs, preserves step); click event/turn/artifact/node (→ `drilldown` → `/api/turn|artifact|step-outputs`);
  toggle panes/usage/theme/granularity/play/speed (client state only).

### WorkflowGraph.tsx
- Lifecycle spine (intake→…→shipped) + gate diamonds; active/reached/unreached styling from
  `state.topology.{activeNode,passedNodes}`, `state.gates`, `locusFocus`. **Action:** click a node
  → `onSelectNode` → step-outputs drill-down (`/api/step-outputs?node=`), gated on `canShowStepOutputs`.

### LaneGraph.tsx
- Per-lane step cards/edges/gates; **one** card glows via `deriveCardStates` (`lib/card-state.ts`);
  metrics from `state.laneStepMeta[step]`, elapsed from `state.agents[].turnStartTs`. **Action:**
  click a step card → open that step's latest turn (`latestTurnOrdinalForStep`, scoped step+story)
  → `/api/turn`; collapse chevron (local).

### OrchestratorLane.tsx
- Orchestrator status (issue/waiting/coordinating/idle) from `state.focus`; dispatch action +
  active story + gate bubble row (`storyGateStatus(recentEvents, story)`) + top blocker. No actions
  (display). **Flag:** gate bubbles are scoped to the *parked gate's* story, which can lag the
  active story — intentional, labelled.

### board-parts.tsx — DriftBanner · EventTicker · SidePane
- **DriftBanner:** corpus pairing health from `state.source.correlation` (replay). **EventTicker:**
  merged events (`recentEvents`) + correspondence beats, newest-at-bottom, turn ordinals aligned
  positionally. **Action:** click a turn/artifact row → `onOpenTurn`/`onOpenArtifact` drill-down
  (capability-gated, mutually exclusive). **SidePane:** collapsible container; **Action:** toggle open.

### Transport.tsx
- Playback bar: ⏮|◀ ▶/❚❚ ▶|⏭, slider, position/clock/state-badge (REVIEWING>RAISED>WAITING>RUNNING>PARKED),
  granularity + speed. **Actions:** play/pause/step/jump/scrub → `onChange(at)`/`onLineChange(lineAt)`;
  granularity → events|lines; speed → playback rate. All client; `at=null` means "follow live".

### ActivityDock.tsx
- Bottom dock: EventTicker (pane) | AgentLogReplay | optional StoryTables, resizable. **Actions:**
  top-edge drag → `dockHeight`; gutter drag → region `weights`; collapse (all client).

### AgentLogReplay.tsx
- The one turn active at `lineAt`: role/ordinal + its tool/reasoning/test/event lines up to the
  playhead, from `timeline.turns`/`timeline.lines`. No actions (display); auto-scrolls to current.

### DrilldownPanel.tsx (right drawer / bottom sheet)
- One shell for `turn|role|step|artifact` targets: transcript + artifacts + code tree/file viewer.
  Fetches `/api/turn|artifact|step-outputs` in `useEffect` on target change; `reveal`
  (full|prompt-only|none) gates body by frontier vs playhead. **Actions:** select a file (→ fetch
  that file); close. No polling.

### StoryTestsLightbox.tsx  ← the F5/S2 defect lives here
- **Shows:** authored test bubbles (status-coloured), `{passing}/{total} ({pct}%)` + legend, the
  **lakebase-branch chip + console link**, scrubbed-note. **How/Source:** list from `/api/story-tests?feature=&story=`
  (once); per-test status from `testTailForStory(timeline.lines, lineAt, feature, story)` folded by
  `${feature}|${story}|${testId}` (correctly scoped by id); **branch chip from `/api/project-branch`
  = the CURRENT branch**, polled 2s **only at live edge** (frozen, not cleared, when scrubbed).
  **Actions:** open/close; hover a bubble (detail card); select a test (→ dock StoryTables →
  `/api/story-tables`); click the branch link (→ Lakebase console). **Flag (primary):** for a past
  feature/story this shows the CURRENT branch + whatever the current run's suite is doing to those
  test ids — misattributing live execution to a shipped story.

### FeatureStatusSection.tsx (left pane)
- Features where `done||active`, grouped, with story rows. **Actions:** pin/unpin a feature
  (→ `onPin` → page `pinned` filter); open a story (→ `onOpenStory`); "↩ follow" unpin.

### BacklogPanel.tsx (left pane)
- Proposals/sizes/commitments/plan-gate from `/api/planning` (once per mode). Static; does not
  rewind with the transport. No row actions beyond tooltips.

### ResizableSplit.tsx / layout.tsx — primitives (resize drag; theme tokens/no-flash). 

---

## 6. Data-layer modules (lib/) — one-liners

- **consort.ts** — all live I/O (`readEvents` mtime-cached, `readSnapshot`, `readFeatureStatus` 30s
  SWR, `driveIsAlive`, HEAD readers).
- **reducer.ts::fold** — the pure fold → `DashboardState` (agents→feature→gates→blockers→stories→
  test-fold→designPhases→topology→focus→lane→laneStepMeta).
- **derive.ts** — pure log derivations (`reduceAgents`/`runEnded`, `computeStories`/`storiesFromLog`,
  `gatesFromLog`, `blockersFromLog`, `featuresFromLog`, `featureIdOf` — *skips `test.result`+`reasoning`*).
- **topology.ts** — `WORKFLOW` (nodes/lanes/gates/edges), `passedNodes`, `laneProgress`,
  `reachedThisPass`, `laneStepForEvent`, `laneStepMeta`.
- **card-state.ts** — `currentLocus`/`locusFocus`/`deriveCardStates`: the ONE glowing card.
- **gates.ts** — single gate registry (key↔laneStep↔node↔role).
- **source.ts** + **sources/{live,replay}.ts** — the mode boundary; `foldSource`.
- **planning.ts / activity.ts / correlate.ts / correspondence.ts / story-scope.ts** — planning
  parse / tool-marker render / log↔corpus pairing + drift / HIL beats / per-test table scoping.
- **types.ts** — `DashboardState` (field dictionary in §7).

---

## 7. `DashboardState` field dictionary (field · meaning · source · Kind)

| Field | Meaning | Source | Kind |
|---|---|---|---|
| `feature` | active feature at playhead | log `featureIdOf` (driveAlive) + `next.json` fallback | 1 |
| `features[]` | switcher list (window touched) | `featuresFromLog` | 2 |
| `pinnedFeature` | filter divergent from playhead | fold arg | — (view) |
| `phase` / `lane` | design/build/complete emphasis | `derived_phase` (live) / `laneFromPlayhead` (scrubbed) | 1 / 2 |
| `agents[]` | 10 roles: status/cost/turns/issues | `reduceAgents` | 2 |
| `gates[]` | gate statuses | snapshot (live) / `gatesFromLog` (scrubbed) | 1 / 2 |
| `blockers[]` | open escalations + resolver | `.handback` + `blockersFromLog` | 1 / 2 |
| `progress.*` | test totals/%/by-status, stories done | feature-status CLI (live) / log | 1 (counts) |
| `progress.testsHistorical/Unavailable` | can-rewind / CLI-gave-none flags | derived | — |
| `stories[]` | per-story lifecycle + testItems | `computeStories` / `storiesFromLog` | 1 / 2 |
| `designPhases[]` | propose→…→reflect | log | 2 |
| `orchestratorActivity` | latest narration | log | 1 |
| `laneStepMeta{}` | per-step model/effort/cost/turns | log | 2 |
| `pendingGate` | frontier gate awaiting approval | `findPendingGate` + reconcile | 1 |
| `focus` | the ONE locus (step/gate/escalation/idle) | `focusOf` | 1 |
| `topology.*` | passed/active nodes, lane steps/current/gate | log | 2 |
| `recentEvents[]` | newest 40 ≤ playhead | log slice | 2 |
| `atLive`/`atEventIndex`/`totalEventCount` | playhead vs edge | fold args | — |
| `source` | mode/capabilities/correlation/correspondence/fidelity | /api/state | — |

---

## 8. Defects this baseline exposes (the whack-a-mole roots — all one class)

1. **Active-feature flip (fixed-but-symptomatic).** `featureFromLog` picked the newest event's
   `feature_id`, but `test.result` events carry the *test's owning* feature; a merged-suite run on
   the current branch made the board flip to an earlier feature. Patched by skipping `test.result`/
   `reasoning` in `featureIdOf`/`featureFromLog`. **Root:** a Kind-1 view (active feature) read from
   id-stamped Kind-2 events.
2. **StoryTestsLightbox mislabel (open; the F5/S2 report).** A past story's panel shows the CURRENT
   `lakebase branch` (`/api/project-branch`) and the CURRENT run's execution of its test ids
   (`/api/story-tests` HEAD + `test-run.jsonl`). Correct historical test counts aren't derivable
   (log carries only test ids with `cycle.*` events), so the panel should show the story's *shipped*
   outcome and omit/mark the live branch — not current-run data under a past header.
3. **No visibility pause (perf).** `usePolledState` + the timeline poll run at full rate when the
   tab is hidden; on refocus the first render waits on a cold full fold. Mitigated for cost by the
   `readEvents` mtime cache; the client-side pause-on-hidden is still missing.
4. **Phase "complete" at feature boundaries.** `runEnded` fires per-feature (`phase.end`/`workflow`);
   in a sprint it must be gated on `!driveAlive` so a mid-sprint boundary isn't shown as run-complete.
5. **Snapshot-vs-scrub honesty.** `next.json` + feature-status describe NOW and can't rewind; scrubbed
   views reconstruct from the log and hide non-derivable test counts. This is correct *by design* and
   is the model the rest of the board should follow consistently.

**Common cause:** there is no explicit, enforced contract that a surface bound to a *viewed*
feature/story (Kind 2) must never render a *live current-run/branch* value (Kind 1) attributed to it.

---

## 9. Questions the requirements must answer before redesign

1. When the viewed feature ≠ the live feature (pin or scrub), what does each live-only surface show?
   (branch chip, test pass/fail, %, phase, orchestrator status) — show the viewed feature's durable
   shipped state, omit, or explicitly label "live (feature X)"?
2. Is "test pass/fail for a shipped story" even a dashboard concern, or only "shipped: yes/no"?
3. Should `test.result`/`test-run.jsonl`/`story-tests` carry run+branch context so a result is
   attributable to the run that produced it (not just the feature|story id)?
4. One playhead or two (`at` vs `lineAt`) — is the split still warranted?
5. Pause polling on `document.hidden`; is a push/SSE feed warranted over 2s polling at this log size?
