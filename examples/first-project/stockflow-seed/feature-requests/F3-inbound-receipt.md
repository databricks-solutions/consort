---
author: Product Owner
feature: F3-inbound-receipt
sprint: 2
---

# Receive a supplier delivery to a chosen location

## Why

Goods arrive, and the floor operator needs to put them somewhere recoverable with
the stock going up where they placed it. This is the inbound half of the warehouse
day: a known supplier delivers a known quantity, and the operator records it
against a location.

## What I want

- Receive a delivery: a known supplier, a known quantity, and a chosen location,
  raising stock at that location.
- When entering the location, offer locations already on record so the operator
  can reuse one without retyping, while never blocking a brand-new location.
- The receipt is an additive write over the existing stock schema — it never
  breaks the home table or SKU detail that already read from it `R8`.
- Clear, field-named validation shown inline when an entry is invalid, never a
  generic error `R7`.

## What I see when it's done

I fill in a supplier, a quantity, and a location — picking an existing location or
typing a new one — submit the receipt, and land on a confirmation view. Stock at
the chosen location has gone up by what I received. An invalid entry is rejected
inline next to the field that caused it.

## Not in this feature

- Picking stock back out — that is F4.
- Counting and reconciling — that is F5.
- Scan-driven receive on the tablet — that is F8.
- Supplier master-data management, purchase orders, carrier/label/shipping
  integration — out of scope per the product overview.

## Builds on

F1-stock-visibility — the stock schema and location model this writes into.
