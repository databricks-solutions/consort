# StockFlow Design Guide

Source of truth for tokens: `design-guide.json` (rendered to `client/src/styles/theme.css` by `consort-apply-design-theme`); component classes in `client/src/styles/global.css`.

Provenance: brand, color, type, radius, shadow and motion come from the Databricks-brand default (`client/src/styles/STYLE_GUIDE.md` + `theme.css`). Layout and density (calm card-and-table view, a constrained content column, right-aligned tabular numbers) were observed on cin7.com. Fishbowl and Linnworks were only named as alternate examples and were not opened (browse-gap logged).

## Design Philosophy
- Calm and easy to scan: the stock table is high-contrast and quiet. Brand red is used only for the primary action or active state (Receive, Pick, Save, active link).
- Every state is explicit: empty, loading, success, error and "not tracked". Never a blank region.
- Built for the warehouse floor: tablet first, 44x44px tap targets, readable at 200% zoom, scan-first input.
- Plain, guiding voice: "StockFlow: warehouse operations, batched and barcoded, on one Postgres."

## UI Framework and Templating
- React + TypeScript SPA (Vite) under `client/`, client-side routed, talking to a JSON API. The Architect records `renders_via`.
- No hand-assembled HTML. Pages compose the component classes below.
- Style only through `var(--token)`. No hardcoded hex or px values in components.
- Every state (empty, loading, success, validation error) is a component state with a stable `data-testid`; also use roles (`alert`, `status`, labelled inputs).

## Typography
- Fonts: DM Sans for body and headings. DM Mono with `tabular-nums` for every numeric cell.
- Scale (`--text-*`): xs 10, sm 13, base 15, md 16, lg 20, xl 24, xxl 29px.
- Line heights: body 1.5, heading 1.25, tight 1.1.
- Weights: 400, 500, 600, 700.

## Color Palette
- **Brand:** `--color-brand` #FF3621, `--color-brand-hover` #EB1600, `--color-brand-light`.
- **Navy ramp:**
  - 900 #1B3139: text, navbar
  - 700 #1B5162: secondary headings
  - 500 #618794: tertiary text, icons
  - 400 #90A5B1: placeholder, disabled
  - 300 #C4CCD6: borders
  - 200 #E5EAF1: input borders, row separators
  - 100 #EDF2F8: row hover, filter panels
- **Semantic** (each has a `-light` translucent fill): success #2E844A, warning #FFAB00, info #0176D3, error #FF3621.
- **Surface:** card #FFFFFF, page (warm oat) #F9F7F4, cool #F0F2F5 (table header, filter panels).
- **Text aliases:** `--color-text`, `-secondary`, `-tertiary`, `-disabled`, `-inverse`.

## Spacing
- Spacing scale `--space-0..12`: 0/4/8/12/16/20/24/32/40/48px.
- Layout:
  - content max-width 960px; narrow column 560px (detail + forms)
  - navbar 64px
  - tap target 44px
  - borders 1px, accent border 2px, focus ring 2px
  - icons 16/24/32 (brand)/48 (empty state)
- Radius: none 0 (primary button), sm 4, md 8, lg 12, xl 15, pill.
- Shadows (navy-tinted, never black): sm, md, layered lg, navbar.
- Motion: fast 0.15s, base 0.2s; toast auto-dismiss after 3s.
- Breakpoints: mobile 480, tablet 768, desktop 1024.

## Components
| Component | Class | Rules |
|---|---|---|
| Navbar | `navbar` | navy-900, 64px, 2px brand-red bottom border, `--shadow-navbar`; `navbar__brand` (`navbar__icon` + "StockFlow") on the left, `navbar__links` on the right, `navbar__link--active` in brand red |
| App icon | `navbar__icon` / `page__icon` | the warehouse mark, `--icon-brand` |
| Favicon | `favicon` | `/warehouse.png` |
| Page | `page`, `page--narrow` | warm oat, centered 960px; `page__header` + `page__icon` + `page__title` + `page__subtitle` |
| Card | `card` | white, radius-lg, shadow-sm; on hover lifts 2px with shadow-md; `card__title` |
| Button | `btn` | `--primary` (brand red, 0px corners everywhere), `--secondary` (navy-200 outline), `--ghost`, `--danger`, `--danger-outline`, `--sm`; disabled + `btn__spinner` while in flight |
| Form | `form` | stacked fields, `form__actions` |
| Field | `field` | persistent `field__label`, `field__input`, info focus ring; `field--error` = error border + error-light fill; `field__error` names the field; `field__hint` |
| Stock table | `stock-table` | cool uppercase header; `stock-table__num` right-aligned in mono tabular figures; `stock-table__row--flash` for in-place updates |
| Status pill | `badge` | `--in-stock` (success, "In stock"), `--low` (warning, "Low"), `--out` (error, "Out"), `--on-order` (info, "On order"), `--quarantined` (navy-500, "Quarantined"). Text is always shown, never color alone |
| Empty state | `empty-state` | `__icon` + `__title` + `__copy` + CTA, e.g. "No stock at this location, receive an inbound shipment" |
| Not tracked | `not-tracked` | explicit "Not tracked" for batch/serial detail |
| Toast | `toast` in `toast-region` | fixed top-right, `aria-live`; `--success` auto-dismisses after 3s; `--error` persists until closed with `toast__close` |
| Alert | `alert` | `--error` / `--success`, `role=alert`; only for page-load failures and validation |
| Confirmation | `confirmation` | post-submit view, `confirmation__icon` |
| Scan zone | `scan-zone` | `--success` green flash, `--error` red flash (plus a persistent toast) |
| Search | `search` | labelled `search__input`, `search__results` |
| Spinner | `spinner` | loading state |
| Icon | `icon` | `--sm`, `--md`; one line-style set |

## Iconography
- **App icon:** `warehouse.png`, staged at `.consort/design/assets/warehouse.png` and installed to `client/public/warehouse.png`. It is used as the navbar brand image, next to page titles, and as the browser-tab favicon (`index.html` `<link rel="icon">`). A placeholder does not count.
- **Icon set:** one line-style set, never mixed styles. Icons needed: inbound, outbound, scan, warehouse, search, and the stock states (in-stock, low, out, on-order, quarantined).

## User Feedback Principles
No silent failures and no unacknowledged success.

| Action | Success | Failure |
|---|---|---|
| Form submit | navigate to `confirmation` | `alert--error` + field-named `field__error` |
| Barcode scan | row updates in place + `scan-zone--success` | `scan-zone--error` + persistent `toast--error` |
| Inline mutation | `toast--success` (3s) | persistent `toast--error` |
| Delete/remove | success toast + optimistic update | persistent toast + revert |
| Page load | n/a | inline `alert--error` replaces the content |
| Button | disabled + spinner | re-enabled + error shown |

- Every error goes through `describeError()`, which gives actionable text and includes the status code.
- Feedback never shifts the layout.

**Adherence contract (E2E / Playwright):** `assertDesignAdherence` (`:root` vs this guide), `checkHardcodedValues`, `checkRequiredSeams` (the `ia.md` testids), `checkFeedbackPresent`, `checkRouteReachability`, `checkTokenConsumption`.
