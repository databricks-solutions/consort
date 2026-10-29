# StockFlow Information Architecture

## Screens
| Screen | Route | Purpose | Key seams |
|---|---|---|---|
| Home: stock by location | `/` | Calm stock-by-location table (SKU, location, quantity, state pill, tracking code / batch / serial), with the search surface above it | `home-title`, `stage-label`, `search-input`, `stock-table`, `stock-row`, `integrity-count`, `migration-overlay` |
| SKU detail | `/sku/:sku` | Narrow single-column view of one SKU: stock per location, tracking code / batch / serial, "not tracked" where empty | `sku-detail`, `stage-label`, `stock-state-pill` |
| Receive | `/receive` | Inbound receipt form (supplier, SKU, quantity, location) | `receive-form`, field errors |
| Pick | `/pick` | Outbound pick form; refuses overcommit inline | `pick-form` |
| Adjust | `/adjust` | Level correction, never negative; inline green flash | `adjust-form` |
| Count | `/count` | Cycle count with variance, then reconcile | `count-form` |
| Confirmation | `/confirmation/:id` | Landing view after a successful form submit (navigation is the feedback) | `confirmation` |

Forms and detail use the `page--narrow` variant; home uses the 960px page.

## Navigation
Navbar on every screen: brand (warehouse icon + "StockFlow") links to `/`. Links: Stock (`/`), Receive (`/receive`), Pick (`/pick`), Adjust (`/adjust`), Count (`/count`). Active link in brand red. Home rows link to `/sku/:sku`. Empty-state CTAs link to `/receive`. Every route is declared in `App.tsx` `<Routes>` and reachable from the navbar or a row link. The search lives on home (F9, read-only), not a separate route; an empty result shows the empty state "No stock matches that SKU or location".

## F6 / F10 surfacing
- Stage label sits beside the home title and the detail title. F6 states: "Today" (before) and "Transition - to verify" (after expand + backfill). F10 shows the contracted end state with no combined-code column.
- F6 home and detail: Batch and Serial columns carry the new-to-verify pill; the combined tracking-code column carries the to-be-retired pill. NULL batch/serial shows the "not tracked" pill, never blank.
- The integrity-probe nonconforming-row count is shown in the app on home (and detail where relevant) for PO sign-off.
- The migration overlay covers the screen while a stepwise step (reset, expand + backfill, verify) runs and clears when it finishes.
- F10: the combined tracking-code column and its pill disappear; Batch and Serial show without the new-to-verify pill once signed off, "not tracked" where empty.

## User flows
1. View stock: open `/`, scan the table, search by SKU or location, open a SKU detail.
2. Receive: `/receive`, submit, land on confirmation; invalid SKU shows an inline field-named error.
3. Pick: `/pick`, submit; an overcommit shows an inline quantity error.
4. Adjust: `/adjust`, submit, inline green flash and success toast.
5. Count: `/count`, enter counted quantity, see variance, reconcile.
6. Scan (F8): scan a barcode on any write form; success flashes the zone green and the row updates in place, failure flashes red with a persistent toast.
7. F6 demo walk: reset, expand + backfill (overlay), verify (stage label, pills, probe count) on the isolated branch.
