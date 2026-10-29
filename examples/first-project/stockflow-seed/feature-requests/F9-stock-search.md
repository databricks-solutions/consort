---
author: Product Owner
feature: F9-stock-search
sprint: 2
---

# Find stock by SKU and location from the home view

## Why

As the stock table grows, scanning it by eye stops working. Findability is a
stated V1 need, not a nice-to-have: the operator and the inventory manager need to
narrow the home stock-by-location table to the SKU or location they care about,
and to be told clearly when nothing matches rather than staring at a blank page.

## What I want

- A read-only search/filter on the home view that narrows the stock-by-location
  table by SKU and location `R10`.
- No new write path — it reuses the existing F1 records.
- A no-match result shows an explicit empty state, "No stock matches that SKU or
  location", never a blank page `R9`.

## What I see when it's done

I type a SKU or a location on the home view and watch the stock table narrow to
the matching rows as I go. When nothing matches, I see the explicit no-match empty
state rather than an empty page. Nothing I type changes any stored record.

## Not in this feature

- Any new write path — this is strictly read-only over existing records.
- Advanced query, saved filters, or reporting — out of scope for V1.

## Builds on

F1-stock-visibility — the home stock-by-location table and the records this
searches over.
