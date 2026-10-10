---
author: Product Owner
---

# Design brief (StockFlow)

The PO's design intent for the StockFlow UI, the UX Designer's intake.
Recorded ahead of time so the Human Proxy can supply it in a headless
run (the same brief a human would author at the `/design` UX
interview). The UI is small (a home stock-by-location view, a SKU
detail page, an adjustment / receipt / pick form, a search), and this
brief is deliberately small.

## UI delivery

StockFlow ships as a single-page application, not server-rendered
pages. The client is a React + TypeScript app under `client/` (Vite),
talking to the backend over a JSON API; the design tokens below live in
`client/src/styles/` and are consumed as `var(--token)`. Screens are
client-side routed (home, SKU detail, the forms) with no full-page
reloads, and every state (empty, loading, success, validation error)
is a component state with a stable `data-testid` seam. The framework
choice itself is the Architect's to record (`renders_via`); this brief
states the product intent: a React SPA client plus a JSON API backend,
each tested on its own side.

## References

The design language is teased from these references; the UX Designer
extracts tokens from them and cites which decision came from which.

- **Databricks-brand default** (`client/src/styles/STYLE_GUIDE.md` and
  `theme.css`): take BRAND and COLOR from here. DM Sans typography,
  navy-900 (`#1B3139`) text, warm-oat (`#F9F7F4`) page background,
  white cards, Databricks brand red (`#FF3621`) for primary actions
  only.
- **A clean warehouse / inventory dashboard** (e.g. Cin7, Fishbowl,
  Linnworks card-and-table view): take LAYOUT and INFORMATION DENSITY
  from here. A calm, scannable table of stock-by-location on the home
  page, generous whitespace, numeric columns right-aligned with
  tabular figures, and a single narrow column for the detail page and
  the form.

## Design tokens (emit the full system)

Emit the complete Databricks token system into `design-guide.json` and
`theme.css`, not a reduced subset. The UX Designer should produce these
families (values from the Databricks-brand reference):

- **Navy ramp (7 steps), not a single text color:** 900 `#1B3139`
  (text, navbar), 700 `#1B5162` (secondary headings), 500 `#618794`
  (tertiary text + icons), 400 `#90A5B1` (placeholder / disabled), 300
  `#C4CCD6` (borders), 200 `#E5EAF1` (input borders, row separators),
  100 `#EDF2F8` (row hover, filter panels).
- **Backgrounds:** white `#FFFFFF` (cards), warm `#F9F7F4` (page), cool
  `#F0F2F5` (table header, filter panels).
- **Semantic with light pairs:** success `#2E844A`, warning `#FFAB00`,
  info `#0176D3`, error `#FF3621`, each with a translucent `-light`
  background for pill fills and alert tints.
- **Radius:** none `0px` (the primary button, a Databricks signature),
  sm `4`, md `8`, lg `12`, xl `15`, pill. **Shadows (navy-tinted,
  never black):** sm, md, a layered lg, and a navbar-specific shadow.
  **Transitions:** fast `0.15s ease`, base `0.2s ease`.
- **Layout + breakpoints:** content max-width `960px`, navbar height
  `64px`; breakpoints mobile `480` / tablet `768` / desktop `1024`;
  minimum tap target `44x44px`.
- **Type scale xs..xxl** (10 / 13 / 15 / 16 / 20 / 24 / 29px), DM Sans
  for body + headings, DM Mono with tabular figures for every numeric
  cell.

## Brand constraints

- Use the Databricks brand red for the primary action / active state
  only (Receive, Pick, Save, the active link). Keep the stock table
  itself calm and high-contrast so quantities and SKUs are easy to
  scan.
- System / UI font stack from `theme.css` (DM Sans). No custom web
  font beyond what is loaded there.
- Cards are white on the warm-oat background with a soft navy-tinted
  shadow and a gentle radius. The primary button is solid brand-red
  with sharp (0px) corners. Keep these consistent across home, detail,
  and form.

## Interaction and feedback

- Every state is shown explicitly: an empty stock location shows an
  explicit empty state ("No stock at this location, receive an inbound
  shipment"), never a blank page; a SKU with no batches or serial
  detail shows a clear "not tracked", never a blank region.
- Forms never fail silently: a successful save lands on a confirmation
  view (or an inline green flash for an adjustment), and a validation
  problem (e.g. a pick that would overcommit, an unknown SKU) is shown
  inline next to the field that caused it, naming the field.
- Barcode scans are the primary input on the warehouse floor. A scan
  succeeds with a green flash and the stock row updating in place; a
  scan that fails (unknown barcode, locked SKU) flashes the scan zone
  red and shows a persistent toast.
- The home grid and the detail page are read-mostly; the
  no-silent-failure principle applies to receipt, pick, adjustment,
  and cycle-count forms.

## Feedback matrix (no silent failures, no unacknowledged success)

Specify the success and failure behavior per action, so the UI never
leaves a result unacknowledged:

| Action | Success | Failure |
|---|---|---|
| Form submit | navigate to a confirmation (navigation IS feedback) | inline alert + field-named messages |
| Barcode scan | row updates in place + green scan-zone flash | red scan-zone flash + persistent toast |
| Inline mutation (adjust, status) | auto-dismiss success toast (3s) | persistent error toast |
| Delete / remove | success toast + optimistic update | persistent toast + local revert |
| Page load | n/a | inline alert replaces the content area |
| Button action | disabled + spinner while in flight | re-enabled + error shown |

Every error is routed through a `describeError()` that maps status codes
to actionable text and includes the status code. Optimistic updates
revert on failure. Feedback never shifts the page layout (toasts are
fixed-position; inline alerts are for page-load and validation only).

## Accessibility

- Form inputs have visible, persistent labels (not placeholder-only).
- Tap targets on the tablet UI are at least 44x44 px.
- Quantity cells and stock-level pills use both shape and text, not
  color alone, to communicate state. An "out of stock" cell reads
  "out" AND uses the error color; a "low" cell reads "low" AND uses
  the warning color.
- Every action is keyboard-reachable and readable at 200% zoom (the
  warehouse-floor tablet defaults to large text).
- Numeric quantities use tabular figures so columns of numbers align
  visually.

## Component vocabulary

The UI is built from a small, consistent set of named components, so
every screen looks like the same product. The UX Designer records these
in `design-guide.json` `components` (each with the CSS class the pages
apply), and every feature page composes them rather than hand-rolling
markup:

- **Navbar** – navy top bar (64px) with a 2px brand-red bottom border,
  the app icon + "StockFlow" title on the left, nav links on the right.
- **Page** – warm-oat background, a centered ~960px content column, a
  `page__header` with the page title (the app icon next to the name).
- **Card** – white surface, soft navy-tinted shadow, gentle radius, with
  a subtle hover lift (shadow deepens, lifts a couple px); the stock
  table and detail panels live in cards.
- **Buttons** – primary (solid brand-red, sharp 0px corners), secondary
  (outlined navy-200), ghost (text-only), plus danger, danger-outline,
  and a small (`--sm`) size. Corners stay sharp on the primary everywhere.
- **Form inputs** – persistent visible labels, an info-color focus ring,
  and an explicit error state (error border + error-light fill); a
  validation problem shows inline next to the field, naming it.
- **Stock table** – cool uppercase header row; quantity cells
  right-aligned in the mono/tabular figure font.
- **Status (stock-state) pills** – in-stock / low / out / on-order /
  quarantined, each a pill whose meaning is carried by BOTH text and
  color (never color alone).
- **Empty state** – an icon + a teaching heading + copy + a CTA (e.g.
  "No stock at this location, receive an inbound shipment").
- **Toasts** – fixed top-right; a success toast auto-dismisses, an
  error toast persists; feedback never shifts the page layout.

## Iconography and app identity

- **App icon.** StockFlow has a brand icon (a warehouse mark) shown
  next to the title, plus a favicon for the browser tab. The asset ships
  **alongside this brief**, in `assets/warehouse.png` (the same folder as
  `design-brief.md` once staged, i.e. `design/assets/warehouse.png`, NOT
  under `intake/`). The build MUST copy it to
  `client/src/assets/warehouse.png`, render it in the navbar next to the
  "StockFlow" title, and set it as the browser-tab favicon. Wiring the
  warehouse icon in is required, not optional: a shell that ships without
  the icon actually rendering (navbar image + favicon), or with a
  placeholder, has not met the brand requirement. Every screen should
  feel like one branded product.
- **Icon set.** Use a single line-style icon set consistently (e.g.
  inbound/outbound, scan, warehouse, stock-level states); do not mix
  icon styles.
- **Name + tagline.** The product is "StockFlow": warehouse operations,
  batched and barcoded, on one Postgres. Empty states and headings use
  this plain, guiding voice.
