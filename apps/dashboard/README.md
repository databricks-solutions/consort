# Consort · Agent Mission Control

A local dashboard that turns a Consort session into a watchable process. It runs in two modes
over one UI:

- **Live** — watch a **running** Consort build: one bubble per agent persona (working / on-deck /
  flagging / waiting-on-you / idle), a one-line "what it's doing right now", handback routing
  (issue → the agent that must fix it), % complete, and an optional per-agent cost panel.
- **Replay** — scrub a **finished, recorded** run: play/pause/step over the whole event log, with
  the lifecycle topology graph, per-lane sub-workflows, per-turn transcripts, and the code each
  turn produced.

It is a **pure read-only observer**. It watches a project's `.consort/` state (live) or a recorded
corpus (replay); it never writes to a project and cannot affect a run.

## Requirements

- Node 20+ (the Consort toolchain already needs this)
- **Live mode:** a scaffolded Consort project on the **same machine** (this reads local files)
- **Replay mode:** a recorded corpus directory (see [Replay mode](#replay-mode))

## Install

```bash
cd consort-dashboard
npm install
```

## Live mode

Point the dashboard at a scaffolded Consort project, then start it. Run it in a second terminal
beside your `/design` or `/build` session.

```bash
CONSORT_PROJECT_DIR=/absolute/path/to/your/stockflow npm run dev
# open http://localhost:3000
```

Set a custom port with `PORT`:

```bash
CONSORT_PROJECT_DIR=/absolute/path/to/your/stockflow PORT=3737 npm run dev
```

Or use the helper (it warns if the target has no `.consort/`):

```bash
./run.sh /absolute/path/to/your/stockflow          # defaults to port 3000
PORT=3737 ./run.sh /absolute/path/to/your/stockflow # custom port
THEME=dark ./run.sh /absolute/path/to/your/stockflow # boot in dark mode
```

If `CONSORT_PROJECT_DIR` is unset it falls back to the current working directory, so you can `cd`
into a scaffolded Consort project and run the dashboard from there.

### Dark mode

The board ships light by default and has a dark theme built from the palette of Kevin's original
dashboard (warm near-black surfaces, tan text, the c1–c10 role hues). Two ways to choose:

- **In-app toggle** — the ☀️/🌙 button in the header. The choice is remembered per browser
  (`localStorage`), so it survives reloads and restarts.
- **Launch default** — `THEME=dark ./run.sh …` (or `?theme=dark` on the URL) boots the board dark,
  useful for a pinned demo/projector. A stored toggle choice overrides the launch default.

Theming is a single `data-theme` flip on `<html>` over CSS custom properties (generated from
`lib/theme.ts`), so switching is instant and there is no flash of the wrong theme on load. We do
**not** follow the OS `prefers-color-scheme` — dark is always an explicit choice.

### What live mode reads (the integration surface)

Consort already emits everything this needs — **no hook or kit change required**:

| Source | Used for |
|---|---|
| `.consort/agent-log.jsonl` (append-only JSONL event bus) | live per-agent state, "what it's doing", per-turn cost, the event ticker, the topology graph |
| `./scripts/lk lakebase-feature-status <feature> --json` (the project's `lk` wrapper) | test counts, richer story statuses, gate detail |
| `.consort/next.json` | blockers, waiting-on-human (open gates), resolver hints |

Consort v0.3.7 renamed the artifact root `.sftdd/` → `.consort/`. The dashboard resolves
`.consort/` first and falls back to the legacy `.sftdd/`/`.tdd/` roots, so it watches both
pre- and post-rename projects unchanged.

**The log is the source of truth.** It is append-only and cannot lie about the past; `next.json`
and the status CLI describe *now* and go stale — even at the live edge. The dashboard reconciles
their signals against the log and only ever lets a snapshot *advance* a story, never rewind one.
After that reconciliation the snapshot sources are trusted for exactly three things: **test
counts, richer story statuses, and gate detail.**

## Replay mode

Point the dashboard at a recorded corpus directory. A corpus is a finished run's
`turns/index.json` + `turns/<n>-<role>/{turn.json,transcript.md,files/**}` +
`recorded-artifacts/**` + `agent-log.jsonl` (+ `provenance.json`).

```bash
CONSORT_CORPUS_DIR=/absolute/path/to/corpus npm run dev
# open http://localhost:3000
```

The reference corpus ships with the Consort plugin. If you have the marketplace checkout, it is at
(v0.3.7 relocated it here from the old `examples/sftdd-scenarios/`):

```
~/.claude/plugins/marketplaces/databricks-solutions/examples/replay/corpora/stockflow-rerecord/
```

(This is a two-sprint run — F1-stock-visibility then F6-split-tracking-code — which is why the
header shows a **feature switcher**.)

For the **correspondence** view (the HIL↔orchestrator conversation folded into the event stream),
point at a corpus that ships `correspondence.jsonl` alongside its `agent-log.jsonl` — the
`stockflow-full` corpus carries both:

```
~/.claude/plugins/marketplaces/databricks-solutions/examples/replay/corpora/stockflow-full/
```

A corpus with no `correspondence.jsonl` (like `stockflow-rerecord`) simply shows no correspondence
rows; everything else works unchanged.

### Mode selection

Mode is chosen from which env var is set:

| Env | Result |
|---|---|
| `CONSORT_PROJECT_DIR` only | **live** |
| `CONSORT_CORPUS_DIR` only | **replay** |
| both set | header shows a **live / replay switch**; **live is the default** |
| neither, but a corpus is present | falls back to the corpus |

You can also deep-link a mode with `?mode=replay` (or `?mode=live`) on the page URL, so a replay
board is linkable and screenshottable.

A configured-but-unreadable corpus is reported with the specific defect (missing dir / missing
log / missing index) rather than silently dropping the mode switch.

## Capability matrix

The two modes are not a hard fork — one UI drives off declared **capabilities**, so a panel
degrades instead of disappearing.

| Capability | Live | Replay |
|---|---|---|
| Timeline (fold events) | ✅ tail | ✅ full + scrub |
| Transport (scrub / play) | ⚠️ over history-so-far; no seek past now | ✅ |
| Liveness banners (waiting / escalation) | ✅ | ❌ (meaningless) |
| Feature % / story / gate detail | ✅ (`lk` CLI + log) | ✅ (recorded snapshots + log) |
| Artifact **paths** | ✅ | ✅ |
| Artifact **content** | ⚠️ at HEAD only | ✅ per-turn snapshot |
| Transcripts | ❌ | ✅ |
| Planning / backlog | ✅ (live `.consort/`) | ✅ (recorded) |
| Step outputs (per-lifecycle-step deliverables) | ⚠️ (planned; HEAD reads) | ✅ (`recorded-artifacts/`) |
| Correspondence (HIL↔orchestrator, folded into the timeline) | ❌ | ✅ (when the corpus ships `correspondence.jsonl`) |
| Test-count time-travel | ❌ (log carries too few `test_id`s; the bar hides when scrubbed) | ✅ (per-turn `test-list.json` snapshots) |

**Drill-down differs by mode.** Clicking a recorded turn (replay) opens the transcript, produced
files and per-turn file content. In live mode there are no transcripts, so the panel shows an
`artifact.written` path read at the project's current HEAD, labelled "content at HEAD ·
transcripts are replay-only".

## Step outputs

Every lifecycle node on the graph is clickable when it maps to deliverables (`STEP_OUTPUTS` in
`lib/topology.ts`); clicking opens a drill-down of what that step produced — plan's
proposals/estimates, design's guide + per-feature spec/db-design/architecture, the build cycle
files, deploy evidence, gate records. Read from `recorded-artifacts/` in replay and served over
`/api/step-outputs`, scoped to the board's current feature. Nodes with no durable output (e.g.
`shipped`) are not clickable.

## Correspondence

Consort records `correspondence.jsonl` — the HIL↔orchestrator conversation (kickoff, intake,
per-action progress, gate approvals), each exchange carrying pre-rendered markdown and an
`outcome`. Where `agent-log.jsonl` is the machine event bus, this is the *conversation*. The event
ticker **folds the two streams into one chronological timeline**: correspondence rows render with a
purple accent, a direction glyph (`→you` / `you→`), the exchange kind, and a completion badge
(**✓ done** for a validated action, **✓ approved** for a gate). Because a `progress` row fires at
action completion — and its `ordinal` is 1:1 with the log's turn ordinals — it is the
authoritative "this action finished" signal the agent-log's turn-boundary logging can lag on;
clicking a correspondence row that names a turn opens that turn's drill-down. The stream is
filtered to the playhead, so scrubbing rewinds the conversation too.

## How agent state is derived (live)

| Bubble | Signal |
|---|---|
| **working** | role has an open turn (`phase.start` not yet closed) |
| **on-deck** | role is the target of the last `handoff` but hasn't started |
| **issue** | role emitted `smell.flagged`/`concern.flagged`/… or a `next.json` blocker routes to it |
| **waiting** | a real HITL gate is open (unresolved `gate.surfaced` in the log / `next.json.open_gates`) |
| **idle** | none of the above |

The dashboard surfaces two live "the run is paused on you" banners, both sourced from Consort's
own `.consort` files: a **gate** banner (a HITL design gate) and an **escalation** banner (a role
kicked a problem up to you — e.g. a GREEN verify failed). A third pause kind, Claude Code
**permission** prompts, is implemented but currently disabled
(`ENABLE_PERMISSION_BANNER = false` in `lib/consort.ts`) — transcript-based detection proved too
flaky to ship. The gate and escalation banners stay on and reliable.

## Event stream

The ticker under the board renders the event log **oldest-first, newest at the bottom** — it grows
downward like a terminal and auto-scrolls to follow the live edge. Scroll up to read history and it
holds position; return to the bottom and it resumes following.

The header carries a **connection indicator**: `live` when polling is healthy, `reconnecting` when a
request fails, and `no update · Ns` once the poll has been quiet for more than a few seconds. The
last state matters on long live runs — a slow or hung `/api/state` (e.g. the `lk` status shell-out)
can no longer silently wedge the poll loop; requests time out, back off, and the badge shows the
board has gone stale instead of looking frozen-but-live.

## Cost panel

Toggle in the header: **show / hidden**. Hiding it drops both the per-bubble costs and the overall
cost bar. Costs come from each `turn.usage` event's `cost_usd`, summed per agent.

## Time travel

Scrubbing the transport re-folds the event log up to that point. Everything the log can support
is reconstructed at the scrubbed position — agents, costs, gates, stories, blockers, feature,
lane. The **one** thing that can't rewind in live mode is test *counts* (the log records only the
`test_id`s that had a `cycle.*` event), so the test bar hides rather than showing a misleading
current number. Replay rewinds counts too, from the corpus's per-turn `test-list.json` snapshots.

The transport's "follow live" (`at === null`) is deliberately distinct from being pinned at the
last event: stepping off the end resumes following instead of freezing one event back.

## Development

```bash
npm run test        # vitest (single run)
npm run test:watch  # vitest (watch)
npm run build       # next build — catches route-type errors tsc and vitest don't
```

Bugs on this project have consistently been found by **running the app**, not by the test suite —
drive `/api/state?at=<n>` at several playheads and look at the real output.

## Stack

Next.js 15 (App Router) + React 19 + TypeScript, plain inline-CSS styling with a token layer in
`lib/theme.ts`. The event-log reducer (`lib/reducer.ts` + `lib/derive.ts`) is a pure fold shared
by both modes; sources live behind a `DashboardSource` interface (`lib/source.ts`,
`lib/sources/{live,replay}.ts`).

## Roadmap

Not yet shipped: a **static single-file export** (`npm run export`) reproducing a shareable,
offline replay artifact from the merged UI. See `../.tmp/dashboard-merge-plan.md` for the full
plan and history.
