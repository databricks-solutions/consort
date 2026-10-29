# StockFlow — warehouse operations, batched and barcoded, on one Postgres

## What StockFlow is

StockFlow is a warehouse-management application for a mid-market warehouse
operation that has outgrown a shared spreadsheet but for whom an enterprise WMS
is overpriced and overwrought. It is the calm middle ground: enough structure to
trust what is on the shelf, without the slotting, labor, and forecasting weight
of a Manhattan or Blue Yonder.

## Who uses it

- **Warehouse-floor operators** — the people who scan goods in, put them on
  shelves, pick them off shelves, count them, and ship them. They work on a
  rugged tablet, often one-handed with a barcode scanner.
- **The inventory manager** — reconciles what the system says against what the
  shelves actually hold.
- **The operations lead** — needs to know whether today's orders are going to
  ship.

## The jobs StockFlow exists to do

- Know what we have, in what quantity, at which physical location, at any point
  in time.
- Receive inbound goods from a supplier and put them somewhere recoverable.
- Pick goods off the shelf for a customer order without overcommitting what is
  actually there.
- Count what is on the shelf and reconcile that count with what the system says.
- Operate across multiple warehouses without each one needing its own copy of
  the system.

## How we deliver

StockFlow is a modern single-page web application — a React + TypeScript client
the warehouse-floor tablet loads once and navigates without page reloads, backed
by a JSON API. The operator experience (scan, adjust, and watch the stock row
move in place) is a rich client-side interaction, not server-rendered
form-submit round-trips.

## The first usable version

V1 is the simplest thing that lets the team see and adjust stock at one
warehouse:

- File, retrieve, and adjust the stock level of one SKU at one location.
- Hold stock for the same SKU at multiple locations within one warehouse.
- Record inbound receipts: a known supplier delivers a known quantity, and stock
  goes up at a chosen location.
- Record outbound picks: a customer order draws stock down, with the system
  refusing to overcommit what is actually there.
- Each unit is identified by a single **tracking code** that encodes location,
  batch, and serial together. The team is fine with this for V1; a later
  iteration revisits whether those fields should be split apart.

## Feature roadmap (standing product intent)

This is a committed, ordered view of the features that realize the jobs above.
Planning proposes every feature here — including search. Sprint numbers are
fixed by this roadmap.

1. **F1 — Stock visibility (sprint 1).** Record and view stock by SKU and
   location; the foundation everything else writes into. Establishes the SPA
   shell and the StockFlow brand. Introduces the combined tracking code.
2. **F2 — Stock adjustment (sprint 2).** Correct a level, audited and never
   negative.
3. **F3 — Inbound receipt (sprint 2).** Receive a known supplier's delivery to a
   chosen location.
4. **F4 — Outbound pick (sprint 2).** Draw stock down for an order without
   overcommitting.
5. **F5 — Cycle count + reconcile (sprint 2).** Count a shelf, show the variance
   against the system, then reconcile.
6. **F6 — Split tracking code, expand + verify, tracking code retained (sprint
   2).** The showcase live-data schema refactor, demoed after sprint 1, and the
   **first of two increments**: add new batch + serial columns and backfill them
   from the combined tracking code, **while leaving the combined tracking code in
   place**. This increment deploys and demos on its own so stakeholders can
   verify in real use that the split populated correctly and lost nothing —
   retiring the old column is a separate later feature (F10), not part of this
   one. The mechanics that matter:
   - The backfill parses **by delimiter** — split the combined code on `-`;
     segment 2 is the batch, segment 3 is the serial — **not** by fixed width.
     Codes are variable-width and not uniform; some have no batch or serial
     segment.
   - `location` stays canonical and unchanged (it is already its own column, part
     of the `(sku, location)` key). The split extracts **only** batch and serial
     — it does **not** recreate a location column from the code.
   - No silent data loss: codes that do not parse leave batch and serial NULL
     (never guessed, never dropped), and an **integrity probe surfaces the count
     of nonconforming rows** for Product Owner review and sign-off before the
     increment is accepted.
   - The accepted end state is the **expanded** schema — the combined tracking
     code AND the new batch + serial columns live, backfilled, and verified. It
     is deliberately NOT a drop; the old column is retained on purpose so the
     split can be proven in real use before anything destructive happens. The
     add + backfill is additive so reads keep working throughout.
   - Proof is the parent-aware schema diff (batch + serial **added**, the
     combined tracking code still present) plus the integrity-probe warning
     count, run against the paired Lakebase branch.
   - It is a **UI-visible** refactor walked step by step on an isolated branch
     (never touching staging/production): the home table and SKU detail render
     from the live schema, the new Batch and Serial columns carry a
     **new-to-verify** pill, the combined tracking-code column carries a
     **to-be-retired** pill, the integrity-probe nonconforming-row count is shown
     **in the app** for sign-off, each screen carries a stage label (today /
     transition-to-verify), and a running migration shows an overlay that clears
     when the step finishes. The stepwise walk (reset → expand + backfill →
     verify) pauses between steps so each change is observable, with a "before"
     seed that includes nonconforming codes so the probe count is visibly
     non-zero.
7. **F9 — Stock search (sprint 2).** Find stock by SKU and location from the home
   view; read-only, reusing existing records with no new write path.
8. **F7 — Multi-warehouse (sprint 3).** Operate several warehouses from one
   deployment, each stock figure scoped to its warehouse, existing records
   preserved under a default warehouse.
9. **F8 — Barcode scan (sprint 3).** Scan-driven receive / pick / adjust / count
   on the floor tablet, with immediate in-place feedback.
10. **F10 — Retire the combined tracking code, contract (sprint 3).** The
    **second increment** of the refactor, taken only **after stakeholders are
    comfortable** the split (F6) worked and lost nothing: **drop the combined
    tracking-code column entirely** so the stock record carries batch and serial
    only, and update the home table and SKU detail to show batch/serial only (the
    combined-code column disappears, "not tracked" per field where empty). The
    drop migration is **reversible as a proven round-trip** — the down path
    reconstructs a combined code from the canonical location plus the split-out
    batch and serial, and re-applying up drops it again. The accepted end state
    is the up-migrated schema with the combined code dropped, never left on the
    down migration. Proof is the parent-aware schema diff showing the combined
    tracking code **removed** alongside batch + serial present, on the paired
    Lakebase branch. **Gated on F6 being deployed and signed off first.**

## How the product grows

The Product Owner revisits and extends this overview between iterations once each
increment is in real use. Each sprint lands as working, demonstrable software
that the Product Owner reviews to decide what the next sprint should be; that
review folds the sprint's learning into the next plan. Likely later directions
beyond this roadmap stay open to revision.

## What you see after each sprint

Working software I can actually use — not designs, stubs, or partial scaffolding.
Every iteration lands as something runnable and demonstrable before the next one
starts. A warehouse operator should be able to scan a real barcode and see the
stock level in real time before I sign off.

## Explicitly out of scope

- Not a production-grade WMS — no slotting optimization, labor management, yard
  management, or advanced forecasting.
- No carrier-rate shopping, no label printing, no shipping integration beyond a
  manual tracking-number field.
- No native mobile app — the operator uses a browser on a rugged tablet or a
  barcode scanner with a browser.
- No accounting integration, no general-ledger postings, no invoicing.
- No multi-tenant isolation across customer companies. One tenant per deployment.
