# Your first Consort project: a walkthrough

This is a from-zero walkthrough of a single Consort session: the exact commands
you issue, and what to expect after each one. It uses **StockFlow** as the
worked example, and it ships the seed files so you can copy ours and launch your
own first project instead of writing intake from a blank page.

> **One hard prerequisite.** Consort builds against a real Lakebase database on
> every cycle. There is no mock or demo mode. Before you start, you need the
> Databricks CLI authenticated to a workspace with **Lakebase enabled**, plus
> Node 20+, Python 3.10+, `gh`, and JDK 17+. Step 0 below sets these up for you
> and verifies the workspace; if you are not sure the environment is ready, that
> is exactly what to run first.

## The app you're building: StockFlow

**Warehouse stock management for mid-market operations.** A warehouse has
outgrown its spreadsheets and needs a simple WMS, but an enterprise one is
overkill. StockFlow is a custom-built app for the **people on the floor** (scan
in, shelve, pick, count, ship), the **inventory manager** reconciling against
the shelf, and the **operations lead** who needs to know whether today's orders
will ship.

What it does, in the order the team builds it:

- know what you have, in what quantity, at which location;
- record inbound inventory to a chosen location, and adjust a level when the
  shelf and the system disagree;
- pick for customer orders without overcommitting;
- count and reconcile the system against the shelf;
- and, once it's in use, operate across multiple warehouses from one deployment.

**How it's built:** FastAPI, SQLAlchemy, Alembic on the server; React,
TypeScript, Vite on the client; all on Lakebase. Test-driven throughout, with
integration tests against real paired Lakebase branches, not mocks.

**Where the story goes.** V1 ships as a runnable app the team can actually use.
Then a real problem surfaces: V1 packs location, batch, and serial into one
column, so you cannot query by batch or trace a serial without parsing a string.
The fix is a **database refactor on live data**, splitting that column into real
fields, backfilling every existing row, verifying, then dropping the old column,
all as schema migrations. This is the payoff of building on Lakebase: before
touching production, you branch the production database, develop and verify the
migration step by step on the branch, confirm the backfill is clean and nothing
is missing, and only then apply it to production with confidence. That refactor
is feature `F6-split-tracking-code` below, and stepping through it live on a
production-like branch, with zero risk to production, is the demo StockFlow
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

## Step 0: set up your environment

Consort provisions a real Lakebase database, so the tools and a Lakebase-enabled
workspace have to be in place first. One command detects what's missing, offers
to install it, and runs the environment doctor:

```bash
bash <(curl -sL https://tinyurl.com/consort-bootstrap)
```

Fix anything it flags red before continuing. (You do not strictly have to run
this yourself, Step 2's create runs the same doctor as a gate, but doing it now
means you hit any environment problem here rather than at provisioning time.)

## Step 1: install the plugin

```bash
claude plugin marketplace add databricks-solutions/consort
claude plugin install consort@databricks-solutions
```

## Step 2: launch, in an empty folder

```bash
/consort:start
```

Because there is no `.consort/` directory here, `/consort:start` takes the
**create** path. It interviews you for a handful of choices (accept the defaults
when unsure):

| Prompt | For StockFlow, answer |
|---|---|
| Project name (kebab-case) | `stockflow` (on `--no-github`, create makes the directory or reuses an empty one; it refuses a non-empty one) |
| Parent directory | default (`~/code` or the parent of your cwd) |
| Databricks host | your Lakebase-enabled workspace |
| GitHub owner | your org or username (needed for tiers 2/3, see below) |
| Tiers | `2` (prod + staging) |
| Language | `python` |
| E2E / Infra | default (on) |
| Model profile | **Default** (recommended) |

Two constraints worth knowing before you answer:

- **Tiers 2 and 3 need a GitHub repo.** Cutting a long-running tier (staging, dev) pushes its git side to `origin`, so it needs a remote. Passing `--no-github` with `--tiers 2` or `3` is refused up front (before anything is provisioned) with that reason. Pair `--no-github` with `--tiers 1`; use a GitHub owner (as above) for the `2` this walkthrough uses.
- **On the `--no-github` path, the target directory must be empty (or absent).** The creator makes the project directory itself, or reuses a pre-existing empty one; it refuses a directory that already has contents (to avoid clobbering an unrelated project). Letting it create `stockflow/` is simplest.

It then prints the exact `lakebase-create-project` command it is about to run.
**Create first runs the environment doctor as a gate**, if a hard prerequisite
is missing (a tool, or a workspace without Lakebase), it stops here with the fix
before touching anything. Once the gate passes, it provisions three things: a
git repo, a **paired Lakebase database** (the tiers you chose), and the role
agents plus `/plan /design /build /deploy /sprint /spike` commands scaffolded
into the project.

**Expect** a `Next:` hint telling you to enter the new project:

```bash
cd <parent-dir>/stockflow
```

## Step 3: give the project its intent (3 starting artifacts)

Everything Consort does flows from what you tell it the product is. That intent
lives in **three project-level artifacts**, and they are the only things you
write by hand before the workflow takes over:

1. **`product-overview.md`** – who the product is for, what they need, and what
   V1 is. This is the primary seed the Spec Author reads.
2. **`nfrs.md`** – the non-functional requirements (data survives migrations, no
   overcommit, tests hit a real branch, and so on).
3. **`design-brief.md`** – the UX intent and design language. **Optional: only
   for projects with a UI.** A headless service or API skips this one; StockFlow
   has a UI, so it has one.

Create scaffolds only a placeholder `product-overview.md`, so seed all three from
StockFlow's (copy ours to start from a real example instead of a blank page):

```bash
SEED=<consort>/examples/first-project/stockflow-seed/intake
cp "$SEED/product-overview.md" .consort/product-overview.md   # overwrites the placeholder
cp "$SEED/nfrs.md"             .consort/nfrs.md
mkdir -p .consort/design
cp "$SEED/design-brief.md"     .consort/design/design-brief.md   # skip if no UI
```

When you build your own app, these three files are what you edit. Everything
downstream – the proposals, the specs, the schema, the tests, the code – derives
from them.

## Step 4: plan the first sprint (proposals in, requests out)

Back in the project, re-run `/consort:start` (it now finds `.consort/` and
**resumes**, giving you a short situation report), then plan:

```bash
/consort:start
/plan
```

Here is the loop `/plan` runs, and your part in it:

1. **The Spec Author recommends feature proposals.** Reading your
   `product-overview.md` and `nfrs.md`, it proposes a breakdown of candidate
   features for the *next sprint only* (not the whole roadmap): each a one-line
   ask with a rationale, a size, and a priority. These are recommendations, the
   input to your decision, not a commitment. StockFlow's look like the files in
   [`stockflow-seed/feature-proposals/`](stockflow-seed/feature-proposals).
2. **You review them and turn them into feature requests.** As the Product Owner,
   you decide which candidates go into the sprint and author a
   `feature-request.md` for each one you commit, the open-ended ask in your own
   voice. **You create each request from its proposal:** keep, drop, reword, and
   reprioritize. This is the human decision the workflow pauses for.
3. **The orchestrator pauses at the plan gate.** You approve the backlog you just
   authored, and planning is done.

To make this concrete, this example ships **all nine of StockFlow's proposals
already turned into requests** in
[`stockflow-seed/feature-requests/`](stockflow-seed/feature-requests). Use them
as your worked example of the turnaround: read a proposal, then read the request
it became. For StockFlow's first sprint, committing just `F1-stock-visibility` is
a good scope, so drop that one request in and approve the gate.

See [The StockFlow backlog](#the-stockflow-backlog) at the end for the full
proposal-to-request mapping and which features shipped in which sprint.

## Step 5: design the feature

```bash
/design F1-stock-visibility
```

**Expect** the design lane to run in order: Spec Author writes the feature spec
(stories + acceptance criteria), the Architect records the architecture and
persistence invariants, the DBA turns those into a physical schema plan
(`db-design.json`), and the Test Strategist produces the ordered test list. It
claims the paired Lakebase branch as its first step. It stops at the **design
gate**, where you review and approve the frozen spec: the stories, the schema
plan, and the test list.

## Step 6: build it

```bash
/build F1-stock-visibility
```

**Expect** TDD cycles against a live Lakebase branch: each cycle writes a
**failing** test, makes it pass, then refactors. This is where the actual
application code and Alembic migrations get written. You will see the cycles
stream by; the loop ends when every story is built and accepted.

## Step 7: deploy and see it work

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
  working software just revealed. This is when you bring in
  `F6-split-tracking-code`: the database refactor on live data the StockFlow
  story is built around. It runs against a branch of the production database, so
  you develop the migration, backfill every existing row, and verify the schema
  and data change step by step with a parent-aware schema diff, all with zero
  risk to production before you promote.
- Or drive the whole sprint in one command with `/sprint <name>`, which runs
  plan then per-feature design/build/deploy and pauses at the same gates.
- Need to probe an unknown before committing to a design? `/spike <slug>` runs a
  throwaway experiment on its own branch, outside the loop.

---

## The StockFlow backlog

`/plan` produces two artifacts, from two different roles, and the seed ships both
so you can see how one becomes the other:

- **`feature-proposals/`** – what the **Spec Author** proposes. One short file per
  candidate feature: the one-line ask, the rationale tying it to the overview or
  an NFR, a t-shirt size, a priority, a target sprint, and a status. Proposals
  are the *input* to the Product Owner's call, not a commitment.
- **`feature-requests/`** – what the **Product Owner** commits. One file per
  feature the PO decides to build, the open-ended ask in the PO's own voice. This
  is what `/design` reads and never overwrites.

### Feature-requests: what, when, and how you write them

**What a feature-request is for.** It is the durable, authoritative statement of
*what you want built and why*, in your own words. It is the one artifact you
author by hand in the build loop (the intake docs seed the whole project; a
feature-request scopes one increment). Everything the design lane produces for a
feature, the spec, the acceptance criteria, the architecture, the schema plan,
the test list, traces back to its request, and `/design` treats the request as
read-only: it reads your intent and never edits it.

**When you submit one.** At the `/plan` gate, and only for the features you are
committing to the upcoming sprint. The flow is: the Spec Author proposes
candidates (`feature-proposals/`); you review them; for each one you decide to
build, you write a `feature-request.md` into
`.consort/features/<feature-id>/feature-request.md`; then you approve the plan
gate. You do not write requests for the whole roadmap up front, only for the
sprint in front of you. After the increment ships, `/plan` runs again and you
author the next sprint's requests, folding in what the working software taught
you.

**How you write one.** A feature-request is deliberately unstructured: a single
H1 title and a plain-English body in your voice. There is no rigid schema, but a
good one tends to:

1. **Open with the need and the why**, one or two sentences on what the team
   needs and what it unblocks (not how to build it).
2. **List the concrete behavior** as bullets: what the user can do, the rules
   that must hold (validation, invariants, what is rejected), and the visible
   states (empty, success, error). Name the NFRs it must honor.
3. **State the scope boundary**, what is explicitly in this increment and what is
   deferred, so the design lane does not over-build.
4. **Note what it builds on**, the features or records it depends on.

Write behavior and constraints, not implementation: say "a pick that would
overcommit is rejected at write time," not "add a CHECK constraint." The
architecture and schema are the Architect's and DBA's to decide from your intent.
The files in `feature-requests/` here are worked examples of this shape;
`F1-stock-visibility.md` is the simplest to model yours on, and
`F6-split-tracking-code.md` shows a request for a schema refactor.

Here every proposal has a matching request so the set is complete. A real project
is not like that at any one moment: the PO authors a request *only* for the
features a sprint commits, and folds what each shipped increment reveals into the
next `/plan`. The suggested sprint is the Spec Author's proposal, not a
commitment; the PO decides what each sprint actually takes:

| Feature | The ask | Suggested sprint |
|---|---|---|
| `F1-stock-visibility` | record + view stock by SKU and location | 1 |
| `F2-stock-adjustment` | adjust a stock level, audited, never negative | 2 |
| `F3-inbound-receipt` | record an inbound receipt from a supplier | 2 |
| `F4-outbound-pick` | pick for an order without overcommitting | 2 |
| `F5-cycle-count` | count a shelf and reconcile against the system | 2 |
| `F6-split-tracking-code` | split the combined tracking code into batch + serial columns (refactor a schema while preserving data) | 2 |
| `F7-multi-warehouse` | operate across multiple warehouses | 3 |
| `F8-barcode-scan` | barcode-driven receive, pick, adjust | 3 |
| `F9-stock-search` | search stock by SKU and location | 2 |

`F1` alone is a good first sprint. F2 through F5 (plus F9 search) complete the V1
"see, adjust, move, reconcile, and find" loop; F6 is the reversible
schema-refactor that demonstrates what happens when you need to refactor a
database schema while preserving data; F7 and F8 are the sprint-3 scale-out
work. (The ids are not contiguous by sprint; they are the order the Spec Author
proposed them.)

---

## What is in this directory

```
first-project/
  README.md                       <- this walkthrough
  stockflow-seed/
    intake/                       <- the 3 project-level intake docs you seed
      product-overview.md         <-   copy to .consort/product-overview.md
      nfrs.md                     <-   copy to .consort/nfrs.md
      design-brief.md             <-   copy to .consort/design/design-brief.md (UI only)
    feature-proposals/            <- what the Spec Author proposes (F1-F9)
      F1-stock-visibility.md          ... one per candidate feature ...
      F9-stock-search.md
    feature-requests/             <- what the PO commits (one per proposal here)
      F1-stock-visibility.md          ... paste at the /plan gate ...
      F9-stock-search.md
```

The three intake docs are byte-identical to the kit's canonical scenario at
[`examples/replay/corpora/stockflow/intake/`](../replay/corpora/stockflow/intake),
so copying them reproduces the same StockFlow product the reference corpus was
recorded against, so that consort itself can be tested and guarded against
regressions. The proposals and requests are the StockFlow reference
backlog: F1–F4 and F6 are the feature-requests exactly as they were authored in
the reference project; F5 and F7–F9 were proposed but not yet authored there, so
their requests are written here in the same PO voice to complete the set.
