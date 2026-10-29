---
author: Product Owner
feature: F4-outbound-pick
sprint: 2
---

# Pick stock for an order without overcommitting

## Why

Picking is where StockFlow earns trust. When a customer order draws stock down,
the operator must never be allowed to promise more than is actually on the shelf.
A pick that would overcommit has to be refused at the moment it is attempted, with
a message that says exactly what is available.

## What I want

- Draw stock down for a SKU at a location for a customer order.
- A pick that would take the level below what is actually available is rejected at
  write time — never a stored negative, never a silently allowed
  double-allocation against the same stock `R2`.
- A rejected pick names the shortfall inline — for example "only 3 available at
  A-12" — never a generic error `R7`.

## What I see when it's done

I submit a pick for a quantity that is on the shelf and land on a confirmation
view with the stock drawn down. I submit a pick for more than is there and get an
inline, field-named rejection telling me exactly how much is available at that
location, with the stored quantity untouched.

## Not in this feature

- Receiving or counting stock — F3 and F5.
- Scan-driven pick on the tablet — that is F8.
- Order management, allocation across multiple locations, carrier/label/shipping
  integration — out of scope per the product overview.

## Builds on

F1-stock-visibility — the stock record and quantity this draws down. Shares the
no-overcommit guarantee (R2) with F2.
