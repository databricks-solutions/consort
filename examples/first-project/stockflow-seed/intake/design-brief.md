# StockFlow — Design brief

StockFlow is warehouse operations, batched and barcoded, on one Postgres. The UI
is a single-page web app the warehouse-floor tablet loads once. The experience
must be calm and scannable for the read-mostly home and detail views, and
loud-on-feedback for the write and scan flows — the operator never has to wonder
whether a scan or a save landed.

## References

- **Reference 1 — Databricks brand / design system**
  (https://www.databricks.com, https://brand.databricks.com). **Take BRAND and
  COLOR.** DM Sans typography, navy-900 (`#1B3139`) text, warm-oat (`#F9F7F4`)
  page background, white cards, Databricks brand red (`#FF3621`) for primary
  actions only. The sharp-cornered primary CTA is a Databricks brand signature.
- **Reference 2 — a clean warehouse / inventory dashboard** (e.g. Cin7
  https://www.cin7.com, Fishbowl https://www.fishbowlinventory.com, Linnworks
  https://www.linnworks.com — the card-and-table view). **Take LAYOUT and
  INFORMATION DENSITY.** A calm, scannable stock-by-location table on the home
  page, generous whitespace, numeric columns right-aligned with tabular figures,
  and a single narrow column for the detail page and the form.
- **Reference 3** — no specific requirement; the two lenses above are sufficient.

## Brand constraints

- **Color.** Navy `#1B3139` text, warm-oat `#F9F7F4` page surface, white cards,
  brand red `#FF3621` for the primary action / accent only (Receive, Pick, Save,
  the active link). Keep the stock table itself calm and high-contrast so
  quantities and SKUs are easy to scan.
- **Semantic.** `#2E844A` success, `#FFAB00` warning, `#0176D3` info, brand red
  for error. Meaning is always carried by text as well — never color alone.
- **Typography.** DM Sans for UI, DM Mono for code/numerics. No custom web font
  beyond what the theme loads.
- **Spacing.** A 4px base grid (`--space-1` .. `--space-12`).
- **Radius.** Soft containers (`--radius-lg` cards), sharp primary CTA
  (`border-radius: 0`, a Databricks brand signature). Cards are white on the
  warm-oat background with a soft navy-tinted shadow and a gentle radius; the
  primary button is solid brand-red with sharp (0px) corners. Keep these
  consistent across home, detail, and form.

## Materialized token theme to leverage

```css
:root {
  --font-sans: 'DM Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --font-mono: 'DM Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  --text-xs: 10px;
  --text-sm: 13px;
  --text-base: 15px;
  --text-md: 16px;
  --text-lg: 20px;
  --text-xl: 24px;
  --text-xxl: 29px;
  --line-height-body: 1.5;
  --line-height-heading: 1.25;
  --line-height-tight: 1.1;
  --font-weight-regular: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;
  --font-weight-bold: 700;
  --color-brand: #FF3621;
  --color-brand-hover: #EB1600;
  --color-brand-light: rgba(255,54,33,0.08);
  --color-navy-900: #1B3139;
  --color-navy-700: #1B5162;
  --color-navy-500: #618794;
  --color-navy-400: #90A5B1;
  --color-navy-300: #C4CCD6;
  --color-navy-200: #E5EAF1;
  --color-navy-100: #EDF2F8;
  --color-success: #2E844A;
  --color-success-light: rgba(46,132,74,0.10);
  --color-warning: #FFAB00;
  --color-warning-light: rgba(255,171,0,0.12);
  --color-info: #0176D3;
  --color-info-light: rgba(1,118,211,0.10);
  --color-error: #FF3621;
  --color-error-light: rgba(255,54,33,0.08);
  --color-card: #FFFFFF;
  --color-page: #F9F7F4;
  --color-cool: #F0F2F5;
  --color-text: #1B3139;
  --color-text-secondary: #1B5162;
  --color-text-tertiary: #618794;
  --color-text-disabled: #90A5B1;
  --color-text-inverse: #FFFFFF;
  --space-0: 0px;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --content-max-width: 960px;
  --narrow-max-width: 560px;
  --navbar-height: 64px;
  --tap-target: 44px;
  --border-width: 1px;
  --border-accent: 2px;
  --focus-ring: 2px;
  --lift: -2px;
  --icon-sm: 16px;
  --icon-md: 24px;
  --icon-brand: 32px;
  --icon-empty: 48px;
  --radius-none: 0px;
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 15px;
  --radius-pill: 999px;
  --shadow-sm: 0 2px 8px rgba(27,49,57,0.06);
  --shadow-md: 0 4px 16px rgba(27,49,57,0.08);
  --shadow-lg: 0 2px 4px rgba(27,49,57,0.04), 0 8px 24px rgba(27,49,57,0.10), 0 16px 48px rgba(27,49,57,0.08);
  --shadow-navbar: 0 2px 12px rgba(27,49,57,0.24);
  --mobile: 480px;
  --tablet: 768px;
  --desktop: 1024px;
  --transition-fast: 0.15s ease;
  --transition-base: 0.2s ease;
  --toast-dismiss: 3s;
}
```

## Interaction constraints

- **Every state is shown explicitly.** An empty stock location shows an explicit
  empty state ("No stock at this location — receive an inbound shipment"), never a
  blank page; a SKU with no batches or serial detail shows a clear "not tracked",
  never a blank region.
- **Forms never fail silently.** A successful save lands on a confirmation view
  (or an inline green flash for an adjustment); a validation problem (a pick that
  would overcommit, an unknown SKU) is shown inline next to the field that caused
  it, naming the field.
- **Barcode scans are the primary input on the warehouse floor.** A scan succeeds
  with a green flash and the stock row updating in place; a scan that fails
  (unknown barcode, locked SKU) flashes the scan zone red and shows a persistent
  toast.
- The home grid and the detail page are read-mostly; the no-silent-failure
  principle applies to the receipt, pick, adjustment, and cycle-count forms.
- **Feedback never shifts the page layout:** toasts are fixed-position; inline
  alerts are reserved for page-load and validation. Optimistic updates revert on
  failure.

## Accessibility constraints

- Touch targets sized for warehouse-floor tablet use (`--tap-target: 44px`
  minimum).
- Meaning is always carried by text as well as color — never color alone (status
  pills, success/warning/error states).
- Form inputs have persistent visible labels, never placeholder-only, with an
  info-color focus ring (`--focus-ring`) and an explicit error state.
- High-contrast calm table so quantities and SKUs stay legible on the floor
  tablet.

## Feedback matrix (no silent failures, no unacknowledged success)

| Action | Success | Failure |
|---|---|---|
| Form submit | navigate to a confirmation view (navigation IS the feedback) | inline alert + a field-named error |
| Barcode scan | row updates in place + green scan-zone flash | red scan-zone flash + persistent error toast |
| Inline mutation (adjust, status change) | auto-dismiss success toast (~3s) | persistent error toast |
| Delete / remove | success toast + optimistic update | persistent toast + local revert |
| Page load | n/a | inline alert replaces the content area |
| Button action | disabled + spinner while in flight | re-enabled + error shown |

Every error is routed through a single `describeError()` helper that maps status
codes to actionable text and includes the status code. Optimistic updates revert
on failure. Feedback never shifts the page layout: toasts are fixed-position;
inline alerts are reserved for page-load and validation.

## Component vocabulary (emit the full set, named in `design-guide.json` `components`)

The UI is built from a small, consistent set of named components so every screen
looks like the same product. Every feature page composes these rather than
hand-rolling markup.

- **Navbar** — navy top bar (64px) with a 2px brand-red bottom border; the app
  icon + "StockFlow" title on the left, nav links on the right, active link in
  brand red.
- **Page** — warm-oat background, a centered ~960px content column, a
  `page__header` with the page title (app icon next to the name); a narrow
  (560px) variant for the detail page and forms.
- **Card** — white surface, soft navy-tinted shadow, gentle radius, with a subtle
  hover lift (shadow deepens, lifts a couple px); the stock table and detail
  panels live in cards.
- **Buttons** — primary (solid brand-red, sharp corners), secondary (outlined
  navy-200), ghost (text-only), plus danger, danger-outline, and a small
  (`--sm`) size. Corners stay sharp on the primary everywhere; minimum 44px tap
  target.
- **Form inputs** — persistent visible labels (never placeholder-only), an
  info-color focus ring, and an explicit error state (error border + error-light
  fill); a validation problem shows inline next to the field, naming it.
- **Stock table** — cool uppercase header row; quantity cells right-aligned in
  the mono/tabular figure font; an in-place row flash on update.
- **Status (stock-state) pills** — in-stock / low / out / on-order / quarantined
  / not-tracked, each a pill whose meaning is carried by BOTH text and color
  (never color alone). The refactor adds a **new-to-verify** pill (new Batch and
  Serial columns) and a **to-be-retired** pill (the combined tracking-code
  column).
- **Empty state** — an icon + a teaching heading + copy + a CTA (e.g. "No stock
  at this location — receive an inbound shipment"; "No stock matches that SKU or
  location").
- **Toasts** — fixed top-right; a success toast auto-dismisses (~3s), an error
  toast persists; feedback never shifts the page layout.

## App icon + identity

- **App icon (required, not optional).** StockFlow has a brand icon — a warehouse
  mark — shown next to the title, plus a favicon for the browser tab. The asset
  ships with this brief, staged at `.consort/design/assets/warehouse.png`. Wiring
  the warehouse icon in is a brand requirement: a shell that ships without the
  icon actually rendering (navbar image + favicon), or with a placeholder, has NOT
  met it. The UX Designer declares where the asset installs in `design-guide.json`
  `app_icon` (`source` = `.consort/design/assets/warehouse.png`, `install_to` =
  `client/public/warehouse.png`), and the design-apply step installs it and wires
  the favicon (`index.html <link rel="icon">`) + the navbar brand image. The
  design system owns the install path. Do NOT fall back to the scaffold
  `favicon.svg`.
- **Icon set.** Use a single line-style icon set consistently (inbound / outbound,
  scan, warehouse, search, and the stock-level states); do not mix icon styles.
- **Name + tagline.** The product is "StockFlow" — warehouse operations, batched
  and barcoded, on one Postgres. Empty states and headings use this plain, guiding
  voice.
