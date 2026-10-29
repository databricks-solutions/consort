---
author: Product Owner
feature: F8-barcode-scan
sprint: 3
---

# Scan-driven receive, pick, adjust, and count on the floor tablet

## Why

This is the delivery promise and my sign-off bar: a warehouse operator should be
able to scan a real barcode and see the stock level move in real time. On the
floor the operator works one-handed with a scanner, so scanning — not typing — is
the primary input, and the feedback has to be immediate and unmistakable.

## What I want

- Scan-driven receive, pick, adjust, and count on the floor tablet, driving the
  write paths built in F2 through F5.
- Scan interactions feel immediate — perceived response under ~200ms from the scan
  event to the UI update `R6`.
- On a successful scan, the stock row updates in place with a green scan-zone
  flash, rather than re-rendering the page `R5`.
- On a failed scan (unknown barcode, locked SKU), the scan zone flashes red and a
  persistent error toast is shown.

## What I see when it's done

I scan a barcode on the tablet to drive a receive, pick, adjust, or count. On
success the scan zone flashes green and the affected row updates in place, fast
enough to feel instant. On a bad scan the scan zone flashes red and a persistent
toast tells me what went wrong. I can scan a real barcode and watch the stock
level change in real time.

## Not in this feature

- A native mobile app — the operator uses a browser on a rugged tablet or a
  scanner with a browser, per the product overview.
- New write behavior beyond what F2 through F5 already enforce — this drives those
  paths by scan.

## Builds on

F2-stock-adjustment, F3-inbound-receipt, F4-outbound-pick, and F5-cycle-count —
the write paths this scan input drives, with the in-place row update from F2/F5.
