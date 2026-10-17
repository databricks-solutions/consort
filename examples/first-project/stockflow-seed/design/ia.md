# StockFlow Information Architecture

## Screens
| Screen | Route | Purpose | Stories | Key seams |
|---|---|---|---|---|
| Home: stock by location | `/` | warehouse picker (F7) + `stock-table` of SKU x location with qty + status badge; scan zone | F1, F7, F8 | `stock-table`, `stock-row-<sku>-<loc>`, `stock-empty`, `stock-loading`, `stock-error`, `warehouse-select`, `scan-zone`, `scan-input` |
| SKU detail | `/sku/:sku` | narrow page: per-location qty, batch/serial (tracking code parts, F6) or "Not tracked" | F1, F6 | `sku-detail`, `sku-locations`, `sku-tracking`, `sku-not-tracked`, `sku-error` |
| Adjust stock | `/adjust` (prefill `?sku=&location=`) | set/adjust qty for one SKU at one location | F2 | `adjust-form`, `field-sku`, `field-location`, `field-quantity`, `form-error`, `adjust-success` |
| Receive | `/receive` | inbound receipt: supplier, SKU, qty, location | F3 | `receive-form`, `field-supplier`, `form-error`, `receive-confirmation` |
| Pick | `/pick` | outbound pick for an order; refuses overcommit | F4 | `pick-form`, `field-order`, `field-quantity-error`, `pick-confirmation` |
| Cycle count | `/count` | count a location, show the variance, reconcile | F5 | `count-form`, `count-variance`, `count-confirmation` |
| Search | `/search?q=` | find SKUs or tracking codes | F9 | `search-input`, `search-results`, `search-empty` |
| About | `/about` | product tagline | — | `about-page` |

Global seams: `navbar`, `toast-region`, `toast-success`, `toast-error`.

## Controls
Each interactive control declares its TYPE, its OPTION SOURCE, and the states a user must be able to reach THROUGH the control — so the surface is usable by construction and an e2e drives the real control, never a URL/query-param bypass. A named-but-unusable control (e.g. a native `<datalist>` whose options are only the filtered rows and whose empty option cannot be selected) is an IA defect.
| Control | Screen | Type | Option source | Reachable states |
|---|---|---|---|---|
| `warehouse-select` | Home `/` | accessible combobox (listbox popup anchored under the input, keyboard-navigable) | ALL distinct locations (not only those currently holding stock), plus an "All locations" option | pick a location with stock → table; pick an EMPTY location → `stock-empty` reachable through the control; clear → all locations |
| `search-input` | Search `/search` | text search box | free-text, server-queried | results; no match → `search-empty` |

## Navigation
- **Navbar** (`App.tsx`):
  - brand (icon + "StockFlow") links to `/`
  - links: Stock `/`, Receive `/receive`, Pick `/pick`, Adjust `/adjust`, Count `/count`, Search `/search`, About `/about`
  - the active link is brand red
- **Contextual links:**
  - a stock row or a search result opens `/sku/:sku`
  - the SKU detail page has Adjust / Receive / Pick buttons that open the form prefilled
  - the empty-state CTA opens `/receive`
  - a confirmation view links back to `/sku/:sku` and `/`
- **Routing:** every screen above is a `<Route>` in `App.tsx`. Unknown routes show an inline not-found alert with a link home.

## User flows
1. **See stock (F1/F7):** open `/` → pick a warehouse → the table shows qty + status pill. Empty location → empty state → CTA to Receive.
2. **Drill down (F1/F6):** click a row → `/sku/:sku` → see locations and tracking detail, or "Not tracked".
3. **Adjust (F2):** detail → Adjust → submit. Success: green toast + the row updates. Invalid input: inline field error.
4. **Receive (F3):** `/receive` → supplier, SKU, qty, location → confirmation view. Unknown SKU: inline field error.
5. **Pick (F4):** `/pick` → order, SKU, qty, location → confirmation. Overcommit: inline error on the quantity field, stating what is available.
6. **Cycle count (F5):** `/count` → enter the counted qty → variance shown → reconcile → confirmation.
7. **Scan (F8):** focus the scan zone on `/` → scan. Success: green flash + row flash + qty update. Unknown barcode or locked SKU: red flash + persistent error toast.
8. **Search (F9):** `/search` → type → results. No match: empty state.
