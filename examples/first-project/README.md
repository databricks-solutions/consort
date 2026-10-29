# Your first Consort project: a walkthrough

This is a from-zero walkthrough of a single Consort session: the exact commands
you issue, and what to expect after each one. It uses **StockFlow** as the
worked example. On your first run Consort **offers to stand this example up for
you** — it stages all the seed files into a new project automatically — so you
can drive a real product end to end instead of writing intake from a blank page.

> **One hard prerequisite.** Consort builds against a real Lakebase database on
> every cycle. There is no mock or demo mode. Before you start, you need the
> Databricks CLI authenticated to a workspace with **Lakebase enabled**, plus
> Node 20+, Python 3.10+, `gh`, and JDK 17+. Step 0 below installs and verifies
> these for you; if you are not sure the environment is ready, that is exactly
> what to run first.

## The app you're building: StockFlow

**Warehouse stock management for mid-market operations.** A warehouse has
outgrown its spreadsheets and needs a simple WMS, but an enterprise one is
overkill. StockFlow is a custom-built app for the **people on the floor** (scan
in, shelve, pick, count, ship), the **inventory manager** reconciling against
the shelf, and the **operations lead** who needs to know whether today's orders
will ship.

What it does, in the order the team builds it:

- know what you have, in what quantity, at which location;
- adjust a level when the shelf and the system disagree, receive inbound stock,
  and pick for customer orders without overcommitting;
- count and reconcile the system against the shelf, and find stock by SKU and
  location;
- and, once it's in use, operate across multiple warehouses and drive the floor
  by barcode scan.

**How it's built:** FastAPI, SQLAlchemy, Alembic on the server; React,
TypeScript, Vite on the client; all on Lakebase. Test-driven throughout, with
integration tests against real paired Lakebase branches, not mocks.

**Where the story goes.** V1 ships as a runnable app the team can actually use.
Then a real problem surfaces: V1 packs location, batch, and serial into one
combined tracking code, so you cannot query by batch or trace a serial without
parsing a string. The fix is a **database refactor on live data** — and because
it is risky, it is done as a safe **expand → contract** pair:

- `F6-split-tracking-code` **expands**: add the real batch + serial columns,
  backfill every existing row, and verify — while *keeping* the old combined
  column, so nothing that reads it breaks. This half ships and is signed off on
  its own.
- `F10-retire-tracking-code` **contracts**: only once F6 is deployed and proven,
  **drop** the now-redundant combined column.

This is the payoff of building on Lakebase: before touching production, you
branch the production database, develop and verify each migration step by step
on the branch with a parent-aware schema diff, confirm the backfill is clean and
nothing is missing, and only then promote — with zero risk to production.
Stepping through that live, on a production-like branch, is the demo StockFlow
exists to tell.

## The shape of a session

Consort drives one loop and pauses at every gate:

```
/consort:start  ->  create (or resume) a Lakebase-paired project
      |
   /plan         ->  turn the product overview into this sprint's feature requests   [plan gate]
      |
   /design <F>   ->  spec + architecture + DBA schema plan + ordered test list       [design gate]
      |
   /build  <F>   ->  TDD cycles: each writes a failing test, greens it, refactors
      |
   /deploy <F>   ->  ship the increment and see it run                    [deploy + promote gates]
```

You type the commands. The deterministic orchestrator (`consort-drive`)
spawns the role agents and stops at each gate. **Nothing advances past a gate
without you.** A whole sprint can also run in one shot with `/sprint <name>`,
which walks the same path and pauses at the same gates.

---

## Step 0: install Consort and set up your environment

Consort provisions a real Lakebase database, so the tools and a Lakebase-enabled
workspace have to be in place first. One command detects what's missing, offers
to install it, **installs the Claude Code plugin**, pre-downloads the Consort
toolkit, and runs the environment doctor:

```bash
bash <(curl -sL https://tinyurl.com/consort-bootstrap)
```

Fix anything it flags red before continuing. (You do not strictly have to run
this yourself — Step 1's create runs the same doctor as a gate — but doing it now
means you hit any environment problem here rather than at provisioning time, and
it installs the plugin so `/consort:start` is available.)

## Step 1: launch in an empty folder and take the StockFlow offer

```bash
/consort:start
```

Because there is no `.consort/` directory here, `/consort:start` takes the
**create** path. On your **first ever run** it opens with a choice: create your
**own** project, or **run the bundled StockFlow example**. Pick the example.

For the example, most create settings are fixed (language `python`, UI track on
— StockFlow is a React SPA — E2E on, model profile **Default**), so it asks only
a few free-text things:

| Prompt | For StockFlow, answer |
|---|---|
| Project name (kebab-case) | `stockflow` (becomes the Lakebase id + dir name) |
| Parent directory | default (the parent of your cwd, else `~/code`) |
| Databricks host | your Lakebase-enabled workspace |
| GitHub owner, or `--no-github` | your org/username → tiers `2` (prod + staging); `--no-github` → tiers `1` (prod only) |

> **Tiers 2/3 need a GitHub repo.** Cutting a long-running tier (staging, dev)
> pushes its git side to `origin`, so it needs a remote; `--no-github` is refused
> with `--tiers 2`/`3`. Use a GitHub owner for the tier-2 this walkthrough uses,
> or pair `--no-github` with tier 1.

Create first runs the environment doctor as a gate, then provisions a git repo, a
**paired Lakebase database** (the tiers you chose), and the role agents plus
`/plan /design /build /deploy /sprint /spike` commands scaffolded into the
project. **Then it stages the StockFlow example into the new project for you** —
you do not copy anything by hand. Staging (`lakebase-stage-first-project`) drops
in:

- the three intake docs — `.consort/product-overview.md`, `.consort/nfrs.md`,
  `.consort/design/design-brief.md` (+ the brand icon);
- the **pre-authored UX design system** — `design/design-guide.{json,md}` and the
  `ia.md` skeleton into `.consort/design/`, and the materialized
  `client-styles/{theme,global}.css` into `client/src/styles/` (so the design
  lane skips the UX establish turn and goes straight to per-story refinement);
- one **`feature-request.md` per feature** (F1–F10) under
  `.consort/features/<id>/`;

and commits them to the base branch so your first `/design` forks a clean tree.

**Expect** a `Next:` hint telling you to enter the new project:

```bash
cd <parent-dir>/stockflow
```

> **Building your own app instead?** The three intake docs
> (`product-overview.md`, `nfrs.md`, and — for a UI product — `design-brief.md`)
> are the only things you write by hand before the workflow takes over;
> everything downstream (proposals, specs, schema, tests, code) derives from
> them. The StockFlow offer simply hands you a complete, real worked example of
> those files instead of a blank page — read `stockflow-seed/intake/` to see the
> shape.

## Step 2: plan the first sprint

Back in the project, re-run `/consort:start` (it now finds `.consort/` and
**resumes**, with a short situation report), then plan:

```bash
/consort:start
/plan
```

Here is the loop `/plan` runs, and your part in it:

1. **The Spec Author proposes a sprint.** Reading your staged `product-overview.md`
   and `nfrs.md` (and reusing the staged feature ids), it proposes which features
   the *next sprint* should take — each a one-line ask with a rationale and a
   rough priority. These are recommendations, the input to your decision, not a
   commitment. (`stockflow-seed/feature-proposals.md` is a reference copy of what
   that proposal looks like for the full backlog.)
2. **The Architect t-shirt-sizes the candidates**, so you can pick a backlog that
   fits sprint capacity.
3. **You commit the sprint at the backlog gate.** You pick which proposed features
   enter the sprint; the metered Product Owner turn then writes a `feature-request.md`
   per committed feature (StockFlow's are pre-staged, so they're already there —
   `/design` reads them read-only and never overwrites them).
4. **The plan gate locks the backlog.** You approve it, and planning is done.

For StockFlow's first sprint, committing just `F1-stock-visibility` is a good
scope. See [The StockFlow backlog](#the-stockflow-backlog) for the full F1–F10
set and which sprint each lands in.

## Step 3: design the feature

```bash
/design F1-stock-visibility
```

**Expect** the design lane to run in order: the Spec Author writes the feature
spec (stories + acceptance criteria), the Architect records the architecture and
persistence invariants, the DBA turns those into a physical schema plan
(`db-design.json`), and the Test Strategist produces the ordered test list. It
claims the paired Lakebase branch as its first step, then stops at the **design
gate**, where you review and approve the frozen spec.

## Step 4: build it

```bash
/build F1-stock-visibility
```

**Expect** TDD cycles against a live Lakebase branch: each cycle writes a
**failing** test, makes it pass, then refactors. This is where the application
code and Alembic migrations get written. The cycles stream by; the loop ends when
every story is built and accepted.

## Step 5: deploy and see it work

```bash
/deploy F1-stock-visibility --target local
```

**Expect** the increment to come up so you can use it (StockFlow's stock-by-
location table), then a pause at the **deploy gate** and, when promoting to the
parent tier, the **promote gate** (the migration to staging). This is the
"working software" checkpoint the Product Owner reviews before deciding what the
next sprint should be.

## After the first feature

- Run `/plan` again for the next sprint. The Product Owner folds in what the
  working software just revealed. Sprint 2 fills out the V1 loop (adjust,
  receive, pick, count, search) and includes `F6-split-tracking-code` — the
  **expand** half of the live-data schema refactor the StockFlow story is built
  around. It runs against a branch of the production database, so you develop the
  migration, backfill every existing row, and verify the schema and data change
  step by step with a parent-aware schema diff, all with zero risk to production
  before you promote. The **contract** half, `F10-retire-tracking-code`, comes in
  sprint 3 — only after F6 is deployed and signed off.
- Or drive the whole sprint in one command with `/sprint <name>`, which runs
  plan then per-feature design/build/deploy and pauses at the same gates.
- Need to probe an unknown before committing to a design? `/spike <slug>` runs a
  throwaway experiment on its own branch, outside the loop.

---

## The StockFlow backlog

`/plan` turns a product overview into a committed sprint backlog, through two
roles:

- **The Spec Author proposes.** It recommends which features the next sprint
  should take — the *input* to your call, not a commitment. It regenerates this
  during `/plan`; the seed ships a reference copy at
  [`stockflow-seed/feature-proposals.md`](stockflow-seed/feature-proposals.md)
  (a single file covering the full F1–F10 backlog) so you can see the shape.
- **The Product Owner commits.** At the backlog gate you pick the sprint's
  features, and a `feature-request.md` is authored per committed feature — the
  open-ended ask in the PO's own voice. This is what `/design` reads and never
  overwrites. StockFlow ships one per feature at
  [`stockflow-seed/feature-requests/`](stockflow-seed/feature-requests) (F1–F10),
  pre-staged into the project at create.

### Feature-requests: what, when, and how you write them

**What a feature-request is for.** It is the durable, authoritative statement of
*what you want built and why*, in your own words. Everything the design lane
produces for a feature — the spec, the acceptance criteria, the architecture, the
schema plan, the test list — traces back to its request, and `/design` treats the
request as read-only.

**When you submit one.** At the `/plan` gate, and only for the features you are
committing to the upcoming sprint — not the whole roadmap up front. After the
increment ships, `/plan` runs again and you commit the next sprint's requests,
folding in what the working software taught you. (For this seeded example all ten
are pre-staged so you can read them; a real project authors them a sprint at a
time.)

**How you write one.** A feature-request is deliberately unstructured: a single
H1 title and a plain-English body in your voice. A good one tends to:

1. **Open with the need and the why** — one or two sentences on what the team
   needs and what it unblocks (not how to build it).
2. **List the concrete behavior** as bullets: what the user can do, the rules
   that must hold (validation, invariants, what is rejected), and the visible
   states (empty, success, error). Name the NFRs it must honor.
3. **State the scope boundary** — what is in this increment and what is deferred,
   so the design lane does not over-build.
4. **Note what it builds on** — the features or records it depends on.

Write behavior and constraints, not implementation: say "a pick that would
overcommit is rejected at write time," not "add a CHECK constraint." The files in
`feature-requests/` are worked examples of this shape; `F1-stock-visibility.md`
is the simplest to model yours on, and `F6-split-tracking-code.md` /
`F10-retire-tracking-code.md` show the expand/contract halves of a live-data
schema refactor.

### The full backlog

The Spec Author's *suggested* sprint is its proposal, not a commitment — the PO
decides what each sprint actually takes. Sprint numbers follow the roadmap in
`product-overview.md`:

| Feature | The ask | Sprint |
|---|---|---|
| `F1-stock-visibility` | record + view stock by SKU and location | 1 |
| `F2-stock-adjustment` | adjust a stock level, audited, never negative | 2 |
| `F3-inbound-receipt` | record an inbound receipt from a supplier | 2 |
| `F4-outbound-pick` | pick for an order without overcommitting | 2 |
| `F5-cycle-count` | count a shelf and reconcile against the system | 2 |
| `F6-split-tracking-code` | **expand**: add batch + serial columns, backfill + verify, keep the old combined column | 2 |
| `F9-stock-search` | search stock by SKU and location | 2 |
| `F7-multi-warehouse` | operate across multiple warehouses | 3 |
| `F8-barcode-scan` | barcode-driven receive / pick / adjust / count | 3 |
| `F10-retire-tracking-code` | **contract**: drop the combined tracking-code column (gated on F6) | 3 |

`F1` alone is a good first sprint. Sprint 2 completes the V1 "see, adjust,
receive, pick, count, and find" loop plus the F6 expand-refactor; sprint 3 is the
scale-out work (multi-warehouse, barcode) and the F10 contract that retires the
old column. (The ids are not contiguous by sprint; they are the roadmap order.)

---

## What is in this directory

```
first-project/
  README.md                       <- this walkthrough
  stockflow-seed/                 <- the StockFlow example the first-run offer stages for you
    intake/                       <- the 3 project-level intake docs
      product-overview.md         <-   -> .consort/product-overview.md
      nfrs.md                     <-   -> .consort/nfrs.md
      design-brief.md             <-   -> .consort/design/design-brief.md (UI only)
      assets/warehouse.png        <-   the brand icon, staged alongside the brief
    design/                       <- the pre-authored UX design system (-> .consort/design/)
      design-guide.json           <-   the style system (skips the UX establish turn)
      design-guide.md
      ia.md                       <-   the information-architecture skeleton
    client-styles/                <- the materialized design system (-> client/src/styles/)
      theme.css
      global.css
    feature-requests/             <- one open-ended ask per feature (F1-F10), staged at create
      F1-stock-visibility.md          ... read F1 first; it is the simplest ...
      F10-retire-tracking-code.md
    feature-proposals.md          <- reference only: what the Spec Author's /plan proposal looks like
```

The seed is StockFlow's reference backlog — the full F1–F10 feature set the
`product-overview.md` roadmap justifies — authored in the Product Owner's voice.
`feature-proposals.md` is reference material (the first-project offer does not
stage it; the Spec Author regenerates proposals during `/plan`); everything else
is staged into the new project and committed when you take the offer.
