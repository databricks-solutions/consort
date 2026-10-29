---
author: Product Owner
feature: F2-stock-adjustment
sprint: 2
---

# Correct a stock level, audited and never negative

## Why

Shelves and the system drift apart. The inventory manager needs to correct a
level for a SKU at a location and trust that the correction is recorded, that it
can never drive the quantity below zero, and that the affected row moves in place
so the floor sees the new number immediately. This is the reconcile job in its
simplest form.

## What I want

- Adjust the stock level for a given SKU at a given location.
- The level can never go below zero; an adjustment that would make it negative is
  rejected at write time, never stored as a negative `R2`.
- Every adjustment records an unmodifiable timestamp and actor that cannot be
  edited after the fact and stays queryable later `R1`.
- The affected row updates in place with an optimistic update reconciled against
  the server response, rather than re-rendering the page `R5`.
- A rejected adjustment names the offending field inline — for example "quantity
  would go below zero" — never a generic error `R7`.

## What I see when it's done

I adjust a row inline, see a green-flash success, and watch that one row settle
to the new quantity without the page reloading. If my adjustment would take the
level negative, I get an inline, field-named rejection right where I typed it, and
the stored quantity is unchanged. The adjustment is on the audit record with who
and when.

## Not in this feature

- Receiving, picking, or counting stock — those are F3, F4, and F5.
- Scan-driven adjustment on the tablet — that is F8.

## Builds on

F1-stock-visibility — the stock record, the `(sku, location)` key, and the home
table whose row this adjusts in place.
