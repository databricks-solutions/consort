---
author: Product Owner
feature: F7-multi-warehouse
sprint: 3
---

# Operate several warehouses from one deployment

## Why

The operation runs more than one warehouse, and I do not want each one standing up
its own copy of StockFlow. Each stock figure needs to be scoped to its warehouse,
and the records we already have must survive the change — preserved under a default
warehouse — so nothing we built in earlier sprints is lost.

## What I want

- Operate several warehouses from one deployment, with each stock figure scoped to
  its warehouse.
- Existing records survive the migration, backfilled under a default warehouse, so
  no data created before this change is lost `R1`.
- The scoping is additive so reads keep working during rollout — adding the
  warehouse dimension never breaks an existing page `R8`.

## What I see when it's done

I select or scope to a warehouse and see the stock figures for just that
warehouse. The records that existed before this feature are all present under the
default warehouse. Reads keep working through the rollout.

## Not in this feature

- Multi-tenant isolation across customer companies — one tenant per deployment,
  out of scope per the product overview.
- Transfers of stock between warehouses — not in this increment.

## Builds on

F1-stock-visibility — the stock schema this scopes. Shares the data-survival and
additive-migration guarantees (R1, R8) with the F6 refactor.
