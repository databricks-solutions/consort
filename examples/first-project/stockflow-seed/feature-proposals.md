# StockFlow — Feature proposals

The complete backlog the product-overview roadmap and NFRs justify. Sprint
numbers are fixed by the roadmap in `product-overview.md`; ids and ordering are
taken from that roadmap. The UI track is ON (StockFlow is a React + TypeScript
single-page app per R5), so every candidate is framed as a user-facing increment
and flagged where it needs an E2E (UI) story. This is the Product Owner's input:
the PO authors each `feature-request.md` and sets final priority.

## F1-stock-visibility

- **Ask:** Record and view stock by SKU and location — file a stock record
  (SKU, location, quantity, combined tracking code) and see it in the home
  stock-by-location table and the SKU detail view.
- **Rationale:** The foundation job "know what we have, in what quantity, at
  which location" (overview jobs; V1 bullet 1). Establishes the SPA shell and
  StockFlow brand that every later feature composes, the `(sku, location)`
  unique key (R3), the combined tracking code, graceful adaptive rendering for
  optional/empty detail (R9), and the real-branch integration-test baseline
  (R4). Writes the schema everything else builds on.
- **Size:** L
- **Priority:** P0 (must-have foundation)
- **Sprint:** 1
- **Needs E2E (UI) story:** yes — file via a form and watch the row appear in
  the home table (R5, R7 field-named validation).

## F2-stock-adjustment

- **Ask:** Correct a stock level for a SKU at a location, audited and never
  negative, with the affected row updating in place.
- **Rationale:** V1 bullet 1 ("adjust the stock level") and the inventory
  manager's reconcile job. Enforces R2 (never negative) and R1 (immutable
  timestamp + actor audit on every adjustment). R5 in-place optimistic row
  update; R7 field-named validation.
- **Size:** M
- **Priority:** P0
- **Sprint:** 2
- **Needs E2E (UI) story:** yes — inline adjust, green-flash success, in-place
  row update, inline field-named rejection when it would go negative.

## F3-inbound-receipt

- **Ask:** Receive a known supplier's delivery of a known quantity to a chosen
  location, raising stock there.
- **Rationale:** Overview job "receive inbound goods and put them somewhere
  recoverable" (V1 bullet 3). Uses the location-reuse preference (offer existing
  locations without blocking a new one) and R7 validation. Additive write path
  over the F1 schema (R8).
- **Size:** M
- **Priority:** P1
- **Sprint:** 2
- **Needs E2E (UI) story:** yes — receipt form submit landing on a confirmation
  view, stock raised at the chosen location.

## F4-outbound-pick

- **Ask:** Draw stock down for a customer order without overcommitting beyond
  what is actually on the shelf.
- **Rationale:** Overview job "pick goods off the shelf without overcommitting"
  (V1 bullet 4). The core R2 guarantee — a pick that would overcommit is
  rejected at write time, never a stored negative. R7 names the shortfall ("only
  3 available at A-12").
- **Size:** M
- **Priority:** P1
- **Sprint:** 2
- **Needs E2E (UI) story:** yes — pick form submit, confirmation on success,
  inline field-named rejection on overcommit.

## F5-cycle-count

- **Ask:** Count what is physically on a shelf, show the variance against what
  the system holds, then reconcile the system to the count.
- **Rationale:** Overview job "count what is on the shelf and reconcile"
  (inventory manager). Reconcile produces an audited adjustment (R1); variance
  display drives the reconcile decision. R7 validation on the count entry.
- **Size:** M
- **Priority:** P1
- **Sprint:** 2
- **Needs E2E (UI) story:** yes — enter a count, see the variance, reconcile and
  watch the row settle.

## F6-split-tracking-code

- **Ask:** Expand + verify increment of the tracking-code refactor — add new
  batch and serial columns and backfill them from the combined tracking code by
  delimiter, **leaving the combined tracking code in place**; surface an
  integrity-probe count of nonconforming rows for PO sign-off. Tracking code is
  retained (this is NOT the drop).
- **Rationale:** The showcase live-data schema refactor (overview roadmap F6),
  demoed after sprint 1. Proves R1 (no data loss across migration), R8 (additive
  expand, reads keep working), and R4 (parent-aware schema diff on the paired
  Lakebase branch showing batch + serial added, combined code still present).
  Backfill parses by `-` delimiter (segment 2 batch, segment 3 serial), never
  fixed-width; nonconforming codes leave batch/serial NULL, never guessed or
  dropped. `location` stays canonical and is not recreated from the code (R3).
  Accepted end state is the expanded schema, deliberately not a drop.
- **Size:** XL
- **Priority:** P1 (showcase refactor; prerequisite for F10)
- **Sprint:** 2
- **Needs E2E (UI) story:** yes — UI-visible stepwise walk (reset → expand +
  backfill → verify) with new-to-verify and to-be-retired pills, in-app
  nonconforming-row count for sign-off, stage labels, and a migration overlay
  that clears per step; home table and SKU detail render from the live schema.

## F9-stock-search

- **Ask:** Find stock by SKU and location from the home view — a read-only
  search/filter that narrows the stock-by-location table, with an explicit
  no-match empty state.
- **Rationale:** R10 findability (a stated V1 need, not a nice-to-have) and the
  overview's explicit "Planning proposes every feature here — including search."
  Read-only, reusing existing F1 records with no new write path; no-match shows
  "No stock matches that SKU or location", never a blank page (R9).
- **Size:** S
- **Priority:** P1
- **Sprint:** 2
- **Needs E2E (UI) story:** yes — type a SKU/location, watch the table narrow,
  see the no-match empty state.

## F7-multi-warehouse

- **Ask:** Operate several warehouses from one deployment, each stock figure
  scoped to its warehouse, with existing records preserved under a default
  warehouse.
- **Rationale:** Overview job "operate across multiple warehouses without each
  one needing its own copy." R1/R8 — existing records survive the migration,
  backfilled under a default warehouse; additive scoping so reads keep working.
- **Size:** L
- **Priority:** P2
- **Sprint:** 3
- **Needs E2E (UI) story:** yes — select/scope a warehouse and see stock figures
  scoped to it, with legacy records under the default warehouse.

## F8-barcode-scan

- **Ask:** Scan-driven receive / pick / adjust / count on the floor tablet, with
  immediate in-place feedback.
- **Rationale:** Overview delivery promise and the sign-off bar ("scan a real
  barcode and see the stock level in real time"). R6 immediate scan response
  (~200ms perceived); the scan feedback pattern — green scan-zone flash + in-place
  row update on success, red flash + persistent toast on failure (design brief
  feedback matrix). Builds on F2/F3/F4/F5 write paths.
- **Size:** L
- **Priority:** P2
- **Sprint:** 3
- **Needs E2E (UI) story:** yes — scan drives a receive/pick/adjust/count with
  the row updating in place and scan-zone feedback.

## F10-retire-tracking-code

- **Ask:** Retire + contract increment — **drop the combined tracking-code
  column entirely** so the record carries batch and serial only, and update the
  home table and SKU detail to show batch/serial only ("not tracked" per empty
  field). The drop migration is a reversible, proven round-trip.
- **Rationale:** The second increment of the refactor (overview roadmap F10),
  taken only after stakeholders are comfortable the split worked. The one
  deliberate exception to additive-only migrations (R8): a reversible drop whose
  down path reconstructs the combined code from canonical location + split-out
  batch + serial, re-applying up drops it again. Accepted end state is the
  up-migrated schema with the combined code dropped. Proof is the parent-aware
  schema diff showing the combined tracking code removed alongside batch + serial
  present, on the paired Lakebase branch (R4). **Gated on F6 being deployed and
  signed off first.**
- **Size:** L
- **Priority:** P2
- **Sprint:** 3
- **Needs E2E (UI) story:** yes — home table and SKU detail render batch/serial
  only, the combined-code column gone, "not tracked" per empty field.
- **Dependency:** gated on **F6-split-tracking-code** (expand + verify) being
  deployed and signed off; F6 and F10 are deliberately distinct increments.
