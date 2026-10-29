---
author: Product Owner
feature: F1-stock-visibility
sprint: 1
---

# File a stock record and see it by SKU and location

## Why

Before we can receive, pick, count, or adjust anything, the team needs the one
foundational answer: what do we have, in what quantity, at which location, right
now. This is the first job StockFlow exists to do, and it is the schema and the
app shell every later feature writes into. It also establishes the StockFlow
brand and the single-page experience the warehouse-floor tablet lives in.

## What I want

- A form to file a stock record: SKU, location, quantity, and the combined
  tracking code that encodes location, batch, and serial together.
- Every SKU at a location is uniquely addressable — no two records may share the
  same `(sku, location)` pair `R3`.
- A home view with a calm, scannable stock-by-location table, and a SKU detail
  view for a single record.
- A row whose optional detail (par level, batch, serial) is missing still renders
  cleanly, showing an explicit "not tracked" per field, judged independently, and
  an empty location shows an explicit empty state rather than a blank page `R9`.
- Clear, field-named validation when the form is submitted incomplete or invalid,
  shown inline next to the offending field, never a generic "bad request" `R7`.
- Delivered as a single-page React + TypeScript app the tablet loads once and
  navigates without full-page reloads `R5`.
- The write and read paths are proven by integration tests running against the
  paired Lakebase branch, not a mock `R4`.

## What I see when it's done

I fill in a SKU, a location, a quantity, and a tracking code, submit the form,
and watch the new row appear in the home stock-by-location table. I click into
that row and see the SKU detail view, with any untracked optional field showing
"not tracked". If I leave a required field blank, the form tells me exactly which
field is wrong, inline. An empty home view shows a teaching empty state.

## Not in this feature

- Adjusting, receiving, picking, or counting stock — those are F2 through F5.
- Searching or filtering the table — that is F9.
- Splitting the combined tracking code into batch and serial columns — that is
  the F6 refactor.

## Builds on

Nothing — this is the foundation. It establishes the schema, the `(sku, location)`
key, the combined tracking code, the SPA shell, the StockFlow brand, and the
real-branch integration-test baseline that every later feature composes on.
