---
author: Product Owner
feature: F5-cycle-count
sprint: 2
---

# Count a shelf, see the variance, then reconcile

## Why

The inventory manager periodically counts what is physically on a shelf and needs
to see how that count differs from what the system holds before deciding to
correct it. The variance is what drives the reconcile decision, and the reconcile
itself must land as an audited adjustment.

## What I want

- Enter a physical count for a SKU at a location.
- Show the variance between the entered count and what the system currently holds,
  so the manager can see the difference before acting.
- Reconcile the system to the count, producing an audited adjustment with an
  unmodifiable timestamp and actor `R1`.
- Clear, field-named validation on the count entry, shown inline, never a generic
  error `R7`.

## What I see when it's done

I enter a count for a SKU at a location and immediately see the variance against
the system figure. I reconcile, and watch the row settle to the counted quantity,
with the reconcile recorded as an audited adjustment. An invalid count entry is
rejected inline next to the field.

## Not in this feature

- Receiving or picking stock — F3 and F4.
- Scan-driven counting on the tablet — that is F8.
- Scheduled or assignment-driven counting programs — out of scope for V1.

## Builds on

F1-stock-visibility — the stock record this counts against. Produces an audited
adjustment in the spirit of F2's audit guarantee (R1).
