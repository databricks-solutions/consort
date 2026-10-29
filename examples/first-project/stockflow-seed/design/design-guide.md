# StockFlow Design Guide

Provenance: authored from `design-brief.md`; the brief's materialized token theme stays authoritative where it conflicts with what was observed.

### Browse evidence
- browsed:https://www.databricks.com - fetched raw markup/CSS: `#1b3139` (27x), `#f9f7f4` (11x), `#ff3621` (28x), `#eeede9` (4x), `DM Sans` (17x). Took: navy text, warm-oat page, brand red accent, DM Sans. (A summarizing fetch reported `#EE3D2C` for the logo accent; not adopted - the brand `#FF3621` in the page CSS and the brief win.)
- browsed:https://brand.databricks.com - raw markup contains `DM Sans`, `#1B3139`, `#F9F7F4`. Took: typography and palette confirmation. The prose guidance (palette tables, button rules) did not render in the fetch.
- browsed:https://www.cin7.com - marketing page only: horizontal top nav (Products/Solutions/Features/Resources/Company), feature areas grouped as cards, no `<table>` or dashboard UI in markup. Took: card grouping and a top-nav shell as layout cues only.
- browse-gap:https://www.linnworks.com - fetched, but content was marketing copy and nav only; no product UI to take density from.
- browse-gap:https://www.fishbowlinventory.com - not fetched.
- browse-gap: no reference exposed a real stock-by-location table. Table density (right-aligned mono numerics, cool uppercase header, single narrow detail/form column) comes from the brief, not from observation.

## Design Philosophy
- Calm and scannable for read-mostly home and detail views; loud on feedback for write and scan flows. The operator never wonders whether a scan or save landed.
- Meaning is always text plus color, never color alone.
- Brand red is for primary actions and the active link only.
- Feedback never shifts layout: toasts are fixed; inline alerts are for page-load and validation only.
- Voice: plain and guiding. "Tracking code" is the term for the combined code.

## UI Framework and Templating
React + TypeScript SPA; components compose the named classes below, no hand-assembled HTML strings. Stable seams: `data-testid` on pages, tables, rows, pills, stage label, overlay, toasts, scan zone, and form fields; ARIA roles (`alert`, `status`, `aria-current`). Rendering lives in the client boundary layer.

## Typography
DM Sans for UI, DM Mono for codes and numerics (tabular-nums). Scale 10/13/15/16/20/24/29px; weights 400/500/600/700; line heights 1.5 body, 1.25 heading, 1.1 tight.

## Color Palette
- Brand: red `#FF3621` (hover `#EB1600`), navy 900 `#1B3139` through navy 100 `#EDF2F8`.
- Semantic: success `#2E844A`, warning `#FFAB00`, info `#0176D3`, error `#FF3621`, each with a light fill.
- Surface: page warm-oat `#F9F7F4`, card white, cool `#F0F2F5`.
- Text: navy-900, with secondary, tertiary, disabled and inverse tones.

## Spacing
4px grid, `--space-1` to `--space-12`. Content column 960px, narrow 560px, navbar 64px, tap target 44px minimum.

## Components
| Component | Class | Rules |
|---|---|---|
| Navbar | `navbar` | navy, 64px, 2px brand-red bottom border; icon + "StockFlow" left, links right, active link red |
| Page | `page`, `page--narrow` | warm-oat, 960px column; narrow for detail and forms |
| Card | `card` | white, radius-lg, shadow-sm, hover lift 2px |
| Buttons | `btn` + `--primary/--secondary/--ghost/--danger/--danger-outline/--sm` | primary sharp 0 radius; 44px min |
| Form input | `field`, `field__label`, `field__input`, `field--error`, `field__error` | persistent labels, info focus ring, inline named error |
| Alert | `alert` | page-load and validation only |
| Stock table | `stock-table` | cool uppercase header, right-aligned mono numerics, row flash |
| Stock-state pills | `pill--in-stock/low/out/on-order/quarantined/not-tracked` | text + color + border style |
| New-to-verify pill | `pill pill--new-to-verify` | F6, on Batch and Serial columns |
| To-be-retired pill | `pill pill--to-be-retired` | F6, on the combined tracking-code column; removed in F10 |
| Stage label | `stage-label` | F6/F10, beside home title: "Today" or "Transition - to verify" |
| Migration overlay | `migration-overlay` | F6, full-screen scrim + spinner + step text while a migration runs; clears on finish |
| Empty state | `empty-state` | icon + heading + copy + CTA |
| Scan zone | `scan-zone--success/--error` | green/red flash |
| Toast | `toast--success/--error` | fixed top-right; success auto-dismisses ~3s, error persists |

## Iconography
One line-style icon set (inbound, outbound, scan, warehouse, search, stock states). App icon: the warehouse mark, staged at `.consort/design/assets/warehouse.png`, installed to `client/public/warehouse.png`, used as the favicon (`<link rel="icon">`) and navbar brand image. No scaffold `favicon.svg` fallback.

## User Feedback Principles
No silent failures, no unacknowledged success. Matrix: form submit -> confirmation view / inline field-named error; scan -> in-place row update + green flash / red flash + persistent toast; inline mutation -> 3s success toast / persistent error toast; delete -> toast + optimistic update / persistent toast + revert; page load failure -> inline alert replaces content; button action -> disabled + spinner / re-enabled + error. All errors go through `describeError()` with the status code.

## Adherence contract
At the E2E (Playwright) layer: `:root` tokens equal `design-guide.json`; no hardcoded hex/px; declared seams render; every action has feedback; every page is routed; every page uses the component classes.
