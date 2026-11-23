# Intake Answers

## Domain and name

- **Product name:** StockFlow
- **What it is + who uses it (1–2 sentences):** A warehouse-management application for a mid-market warehouse operation that has outgrown spreadsheets / a shared Excel file but for whom an enterprise WMS is overpriced and overwrought. Users: the warehouse-floor people who scan goods in, put them on shelves, pick them off shelves, count them, and ship them; the inventory manager who reconciles what the system says against what the shelves actually hold; and the operations lead who needs to know whether today's orders are going to ship.

## Product overview

- **Core jobs the users need to accomplish:**
  - Know what they have, in what quantity, at which physical location, at any point in time.
  - Receive inbound goods from a supplier and put them somewhere recoverable.
  - Pick goods off the shelf for a customer order without overcommitting what is actually there.
  - Count what is on the shelf, and reconcile that count with what the system says is here.
  - Operate across multiple warehouses without each one needing its own copy of the system.
- **First usable version vs. what comes later:** V1 (the first runnable increment that goes into use) is the simplest thing that lets the team see and adjust stock at one warehouse:
  - File, retrieve, and adjust the stock level of one SKU at one location.
  - Hold stock for the same SKU at multiple locations within one warehouse.
  - Record inbound receipts: a known supplier delivers a known quantity, and stock goes up at a chosen location.
  - Record outbound picks: a customer order draws stock down at a chosen location, with the system refusing to overcommit what is actually there.
  - Each unit is identified by a single tracking code that encodes location, batch, and serial together. The team is fine with this for V1; later iterations will revisit whether those fields should be split apart.
  - Everything beyond V1 is open.
  - Delivery mechanism: StockFlow is a modern single-page web application — a React TypeScript client the warehouse-floor tablet loads once and navigates without page reloads, backed by a JSON API. The operator experience (scan, adjust, and watch the stock row move in place) is a rich client-side interaction, not server-rendered form-submit round-trips.
- **Expected growth over the next few iterations:** The Product Owner expects to revisit and extend this overview between iterations once V1 is in real use. Likely later directions remain open to revision once V1 is in real use.
- **Planned feature roadmap (standing product intent — carry into `product-overview.md`):** Beyond the open-ended "likely later directions," the Product Owner has a committed, ordered view of the features that realize the jobs above. This roadmap is standing product intent, so the intake step must reflect it in `product-overview.md` as a roadmap section (not leave it only in the "Feature requests (backlog intake)" guidance below), and planning must propose every feature in it — **including search** — as a committed sprint-1/sprint-2/sprint-3 baseline set, not an open "someday" direction:
  - **Stock visibility** — record and view stock by SKU and location; the foundation everything else writes into (sprint 1).
  - **Stock adjustment** — correct a level, audited and never negative (sprint 2).
  - **Inbound receipt** — receive a known supplier's delivery to a chosen location (sprint 2).
  - **Outbound pick** — draw stock down for an order without overcommitting (sprint 2).
  - **Cycle count + reconcile** — count a shelf, show the variance against the system, then reconcile (sprint 2).
  - **Split tracking code (expand + verify)** — the showcase live-data schema refactor demoed after sprint 1, delivered as the **first of two increments**: add new batch + serial columns and backfill them from the combined code, **while leaving the combined code in place**. This increment deploys and demos on its own, so stakeholders can verify in real use that the split populated correctly and lost nothing — **retiring the old column is a separate later feature**, not part of this sprint-2 increment, not an open "someday" direction (sprint 2). The mechanics matter and must survive into the request, so carry them into `product-overview.md`'s roadmap entry too:
    - The backfill parses by delimiter — split the combined code on `-`; segment 2 is the batch, segment 3 is the serial — **not** by fixed width. Codes are variable-width and not uniform; some have no batch or serial segment.
    - `location` stays canonical and unchanged (it is already its own column, part of the `(sku, location)` key). The split extracts **only** batch and serial — do **not** recreate a location column from the code.
    - No silent data loss: codes that do not parse leave batch and serial NULL (never guessed, never dropped), and an **integrity probe surfaces the count of nonconforming rows** for the Product Owner to review and sign off before this increment is accepted.
    - The accepted end state of this increment is the **expanded** schema — the combined code AND the new batch + serial columns live, backfilled and verified. It is deliberately NOT a drop; the old column is retained on purpose so the split can be proven in real use before anything destructive happens. The add + backfill is additive so reads keep working throughout (R8).
    - Proof is the parent-aware schema diff (batch + serial **added**, the combined code still present) plus the integrity-probe warning count, run against the paired Lakebase branch (R1, R3, R4).
    - This is a **UI-visible** refactor, and that visibility is part of the feature: the ordinary home table and SKU detail render correctly driven by the live schema (combined code → combined + batch/serial once backfilled), with the new Batch and Serial columns marked with a **new-to-verify** pill and the combined tracking-code column marked with a **to-be-retired** pill so the audience sees exactly what was added and what will be eliminated; the integrity-probe nonconforming-row count is shown **in the app** for sign-off. (The paused, step-by-step *visual walkthrough* of the migration — stage labels and a migration overlay replayed on an isolated branch — is a separate throwaway demo, F11, not part of this shipped increment.)
  - **Retire the combined tracking code (contract)** — the **second increment** of the refactor, taken only **after stakeholders are comfortable** the split above worked and lost nothing: **drop the combined tracking-code column entirely** so the stock record carries batch and serial only, and update the home table and SKU detail to show batch/serial only (the combined-code column disappears, "not tracked" per field where empty). The drop migration is **reversible as a proven round-trip** (the down path reconstructs a combined code from the canonical location plus the split-out batch and serial; re-applying up drops it again), and the accepted end state is the up-migrated schema with the combined code dropped — never left on the down migration. Proof is the parent-aware schema diff showing the combined code **removed** alongside batch + serial present, on the paired Lakebase branch (R1, R3, R4, R8, R9). Gated on the expand feature being deployed and signed off (sprint 3).
  - **Stock search** — find stock by SKU and location from the home view; read-only, reusing existing records with no new write path (sprint 2).
  - **Multi-warehouse** — operate several warehouses from one deployment, each stock figure scoped to its warehouse, existing records preserved under a default warehouse (sprint 3).
  - **Barcode scan** — scan-driven receive / pick / adjust / count on the floor tablet, with immediate in-place feedback (sprint 3).
- **Explicit non-goals / out of scope:**
  - Not a production-grade WMS — no slotting optimization, labor management, yard management, or advanced forecasting (the Manhattan / Blue Yonder feature set).
  - No carrier-rate shopping, no label printing, no shipping integration beyond a manual tracking-number field.
  - No native mobile app — the operator uses a browser on a rugged tablet or a barcode scanner with a browser.
  - No accounting integration, no general-ledger postings, no invoicing.
  - No multi-tenant isolation across customer companies. One tenant per deployment.
- **What you want to see after each sprint (delivery expectations):** Working software I can actually use — not designs, stubs, or partial scaffolding. Every iteration must land as something runnable and demonstrable before the next one starts; that working increment is what I review to decide what the next sprint should be. A warehouse operator should be able to scan a real barcode and see the stock level in real time before I sign off.

## Non-functional requirements

### Required (hard-block if uncovered)

- **R1:** Existing stock data survives every schema migration with no loss. Each iteration's additive model change preserves the inventory records created before, and every inventory adjustment keeps an unmodifiable timestamp and actor.
- **R2:** Stock levels never go below zero, and never overcommit beyond available quantity. A pick that would overcommit is rejected at write time (never a stored negative, never a silently-allowed double-allocation).
- **R3:** Every SKU at every location is uniquely addressable by `(sku, location)` and no two records share that pair. A collision is resolved at write time (never two stored duplicates, never an error page).
- **R4:** Integration tests run against the paired Lakebase branch, not a mock or in-memory substitute. The CI workflow refuses to merge a PR whose integration tests do not run against a real branch.
- **R5:** The UI is a single-page web application. The warehouse-floor tablet loads the app once and navigates client-side (home, SKU detail, the receipt / pick / adjustment forms) with no full-page reloads; a stock adjustment updates the affected row in place (optimistic update, reconciled against the server response) rather than re-rendering the page. The client is a React + TypeScript application under `client/`, and the backend is a JSON API (the boundary layer returns data, not server-rendered HTML). The client ships its own component tests; the API is covered by the branch integration tests in R4.

### By category

- **Performance (latency / throughput targets):** Barcode-scan interactions feel immediate — perceived response under ~200ms from scan event to UI update.
- **Scalability (data + concurrency growth):** No specific target for V1. Explicitly out of bounds: no caching layer, no multi-region concerns, no real-time multi-operator conflict resolution beyond the simple no-overcommit rule (R2).
- **Security (authn/authz, data sensitivity, audit):** No authentication, authorization, or per-tenant ownership for V1. Audit: every inventory adjustment keeps an unmodifiable timestamp and actor (R1).
- **Observability (what must be logged / measurable):** Each inventory adjustment records an immutable timestamp + actor (R1). Validation messages are clear and specific, naming the offending field (not just "bad request").
- **Operability (deploy, config, runbook expectations):** Migrations are additive where possible — reads keep working during rollout; a new column or table never breaks an existing page. Environment constraint (below) governs the DB connection.
- **Resilience (failure modes that must degrade gracefully):** The no-overcommit guard never double-allocates or stores a negative (R2); `(sku, location)` collisions resolve at write time, never an error page (R3). A stock-level row missing optional detail still renders cleanly — par level, batch, serial default to empty and show an explicit "not tracked", never a null crash or a blank region.
- **Findability (usability):** As the stock table grows, stock must be findable by SKU and location from the home view — a read-only search/filter that narrows the stock-by-location table, with an explicit no-match empty state ("No stock matches that SKU or location"), never a blank page. This is a stated V1 need, not a nice-to-have, and must appear in `nfrs.md`.
- **Anything the architect should explicitly NOT pursue:**
  - No authentication, authorization, or per-tenant ownership for V1.
  - No caching layer or multi-region concerns.
  - No real-time multi-operator conflict resolution beyond the simple no-overcommit rule.
  - **Environment constraint:** The app connects to the substrate-provisioned `databricks_postgres` database via the `DATABASE_URL` the post-checkout hook writes from the paired Lakebase branch. Do NOT rename the database or set `DB_NAME` / `PGDATABASE` to an app-specific name, and do not make the database name a requirement or NFR: the branch provisions only `databricks_postgres` (a migration creates tables, not databases), so an app pointed at any other name cannot connect. Leave the scaffold's connection defaults alone; the schema lives in `databricks_postgres` on the paired branch.

## Design brief (UI track only)

- **Reference site 1 — URL + what to take from it:** The **Databricks brand / design system** (https://www.databricks.com, https://brand.databricks.com) — take **BRAND and COLOR** from here. DM Sans typography, navy-900 (`#1B3139`) text, warm-oat (`#F9F7F4`) page background, white cards, Databricks brand red (`#FF3621`) for primary actions only.
- **Reference site 2 — URL + what to take from it:** A clean **warehouse / inventory dashboard** (e.g. Cin7 https://www.cin7.com, Fishbowl https://www.fishbowlinventory.com, Linnworks https://www.linnworks.com — the card-and-table view) — take **LAYOUT + INFORMATION DENSITY** from here. A calm, scannable table of stock-by-location on the home page, generous whitespace, numeric columns right-aligned with tabular figures, and a single narrow column for the detail page and the form.
- **Reference site 3 — URL + what to take from it:** No specific requirement (the two lenses above are sufficient).
- **Brand constraints (colors, logo, typography, app icon):**
  - **Color:** navy `#1B3139` text, warm-oat `#F9F7F4` page surface, white cards, brand red `#FF3621` for the primary action / accent only (Receive, Pick, Save, the active link). Keep the stock table itself calm and high-contrast so quantities and SKUs are easy to scan.
  - **Semantic:** `#2E844A` success, `#FFAB00` warning, `#0176D3` info, brand red for error. Meaning is always carried by text as well, never color alone.
  - **Typography:** DM Sans for UI, DM Mono for code/numerics. No custom web font beyond what the theme loads.
  - **Spacing:** a 4px base grid (`--space-1` .. `--space-12`).
  - **Radius:** soft containers (`--radius-lg` cards), sharp primary CTA (`border-radius: 0`, a Databricks brand signature). Cards are white on the warm-oat background with a soft navy-tinted shadow and a gentle radius; the primary button is solid brand-red with sharp (0px) corners. Keep these consistent across home, detail, and form.
  - App icon: warehouse-themed (use the scaffold default / staged warehouse icon).
  - **Materialized token theme to leverage:**
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
- **Interaction / accessibility constraints:**
  - Every state is shown explicitly: an empty stock location shows an explicit empty state ("No stock at this location — receive an inbound shipment"), never a blank page; a SKU with no batches or serial detail shows a clear "not tracked", never a blank region.
  - Forms never fail silently: a successful save lands on a confirmation view (or an inline green flash for an adjustment); a validation problem (a pick that would overcommit, an unknown SKU) is shown inline next to the field that caused it, naming the field.
  - Barcode scans are the primary input on the warehouse floor. A scan succeeds with a green flash and the stock row updating in place; a scan that fails (unknown barcode, locked SKU) flashes the scan zone red and shows a persistent toast.
  - The home grid and the detail page are read-mostly; the no-silent-failure principle applies to the receipt, pick, adjustment, and cycle-count forms.
  - Touch targets sized for warehouse-floor tablet use (`--tap-target: 44px`).
- **Feedback matrix (no silent failures, no unacknowledged success):** specify the success and failure behavior per action, so the UI never leaves a result unacknowledged:

  | Action | Success | Failure |
  |---|---|---|
  | Form submit | navigate to a confirmation view (navigation IS the feedback) | inline alert + a field-named error |
  | Barcode scan | row updates in place + green scan-zone flash | red scan-zone flash + persistent error toast |
  | Inline mutation (adjust, status change) | auto-dismiss success toast (~3s) | persistent error toast |
  | Delete / remove | success toast + optimistic update | persistent toast + local revert |
  | Page load | n/a | inline alert replaces the content area |
  | Button action | disabled + spinner while in flight | re-enabled + error shown |

  Every error is routed through a single `describeError()` helper that maps status codes to actionable text and includes the status code. Optimistic updates revert on failure. Feedback never shifts the page layout: toasts are fixed-position; inline alerts are reserved for page-load and validation.
- **Component vocabulary (emit the full set, named in `design-guide.json` `components`):** the UI is built from a small, consistent set of named components so every screen looks like the same product. Every feature page composes these rather than hand-rolling markup:
  - **Navbar** — navy top bar (64px) with a 2px brand-red bottom border; the app icon + "StockFlow" title on the left, nav links on the right, active link in brand red.
  - **Page** — warm-oat background, a centered ~960px content column, a `page__header` with the page title (app icon next to the name); a narrow (560px) variant for the detail page and forms.
  - **Card** — white surface, soft navy-tinted shadow, gentle radius, with a subtle hover lift (shadow deepens, lifts a couple px); the stock table and detail panels live in cards.
  - **Buttons** — primary (solid brand-red, sharp corners), secondary (outlined navy-200), ghost (text-only), plus danger, danger-outline, and a small (`--sm`) size. Corners stay sharp on the primary everywhere; minimum 44px tap target.
  - **Form inputs** — persistent visible labels (never placeholder-only), an info-color focus ring, and an explicit error state (error border + error-light fill); a validation problem shows inline next to the field, naming it.
  - **Stock table** — cool uppercase header, quantity cells right-aligned in the mono/tabular figure font; an in-place row flash on update.
  - **Status (stock-state) pills** — in-stock / low / out / on-order / quarantined / not-tracked, each a pill whose meaning is carried by BOTH text and color (never color alone).
  - **Empty state** — an icon + a teaching heading + copy + a CTA (e.g. "No stock at this location — receive an inbound shipment").
  - **Toasts** — fixed top-right; a success toast auto-dismisses, an error toast persists; feedback never shifts the page layout.
  - *The following are the refactor-and-demo components. The design system owns them as first-class vocabulary and MUST emit them in `design-guide.json` `components` — even though the F11 walkthrough that showcases them is a throwaway demo. Do NOT drop them as "not acceptance criteria"; F6 and F10 (shipped features) also use the stage label and the pills.*
  - **Refactor pills (distinct components, NOT status-pill variants)** — a **new-to-verify** pill (info-blue, reading "New – verify") on the Batch and Serial columns during the F6 split, and a **to-be-retired** pill (dashed neutral, reading "To be retired") on the combined tracking-code column (present from F6, removed after F10). Name each as its own component in `design-guide.json`, separate from the stock-state pills above.
  - **Stage label** — a small uppercase chip beside the home `page__title` reading the current refactor stage ("Today" / "Transition – to verify" / "Final version after the refactor"); meaning carried by the text, never color alone. Used by F6, F10, and the F11 walkthrough.
  - **Migration overlay** — a fixed full-screen navy scrim with a spinner and step text (`role="status"`, `aria-live="polite"`), shown while a migration step runs and cleared when it finishes; never shifts layout. Used by F6 and the F11 walkthrough.
  - **Feedback matrix** — emit the action→success/failure contract from the matrix above as its own named `design-guide.json` component (one entry capturing every row), so the feedback rules are a first-class, machine-readable part of the design system.
- **Iconography + identity:**
  - **App icon (required, not optional):** StockFlow has a brand icon — a warehouse mark — shown next to the title, plus a favicon for the browser tab. The asset ships **with this brief**, staged at `.consort/design/assets/warehouse.png`. Wiring the warehouse icon in is a brand requirement: a shell that ships without the icon actually rendering (navbar image + favicon), or with a placeholder, has NOT met it. The UX Designer declares where it installs in `design-guide.json` `app_icon` (`source` = `.consort/design/assets/warehouse.png`, `install_to` = `client/public/warehouse.png`), and the design-apply step installs it and wires the favicon (`index.html <link rel="icon">`) + the navbar brand image. The design system owns the install path. Do NOT fall back to the scaffold `favicon.svg`.
  - **Icon set:** use a single line-style icon set consistently (e.g. inbound / outbound, scan, warehouse, search, and the stock-level states); do not mix icon styles.
  - **Name + tagline:** the product is "StockFlow" — warehouse operations, batched and barcoded, on one Postgres. Empty states and headings use this plain, guiding voice.

## Feature requests (backlog intake)

This section is intake guidance, not the requests themselves. At `/plan`, the
Product Owner re-creates one `.consort/features/<feature-id>/feature-request.md`
per feature below. **The intake step must not treat this as "guidance only" and
drop it:** it must reflect this backlog as the roadmap in `product-overview.md`
and the findability/search need in `nfrs.md`, so the whole set — including
`F9-stock-search` and the two-part live-data refactor (`F6-split-tracking-code-expand`
expand/verify, then `F10-retire-tracking-code` contract) — survives
synthesis through to `/plan`. Each request is the Product Owner's open-ended,
plain-English ask: **a single behavior-focused H1 plus a free-form first-person
body — no YAML frontmatter and no mandated section set** (the kit defines a
feature-request as "H1 + body, no rigid structure by design"; the structure and
section names are the PO's choice). The ONE hard rule: **preserve the inline
`R<n>` NFR references** on the bullets they govern — carry across each `R<n>` tag
that the feature's bullets below already specifies, as a backticked tag at the end
of the bullet (e.g. `` `R3` ``); do NOT paraphrase a requirement and drop its tag.
The `R<n>` ids are defined in `.consort/nfrs.md` and are referenced only where the
NFR genuinely applies. The free-form exemplar at the end of this section
illustrates the PO voice and the R-ref discipline — match that discipline, not its
exact sections. The sprint numbers come from the
backlog table: F1 is sprint 1; F2, F3, F4, F5, F6, and F9 are sprint 2; F7, F8,
F10, and F11 are sprint 3. F10-retire-tracking-code is the contract half of the
tracking-code refactor and is gated on F6 (the split) being deployed and signed
off first.

### F1-stock-visibility

- **Frontmatter hint:** `author: Product Owner`, `feature: F1-stock-visibility`,
  `sprint: 1`.
- **Title (H1):** Record and view stock by SKU and location.
- **Why:** The team can't trust what they have or where it is. Until we can file
  a SKU's stock at a physical location and read it back, nothing else in the
  warehouse works. This is the foundation the receipts, picks, counts, and search
  all write into.
- **What I want:**
  - An operator files the stock level of one SKU at one physical location in our
    one warehouse, and retrieves it later.
  - When entering a location, the operator is offered locations already on record
    to reuse without retyping, while a brand-new location is never blocked. How
    that's presented is the designer's call.
  - A SKU can hold stock at more than one location; each `(sku, location)` pair is
    its own uniquely addressable record. Two records never share that pair — a
    collision is resolved at write time, never a stored duplicate, never an error
    page (R3).
  - Each unit carries a single combined tracking code that encodes location,
    batch, and serial together. We store and show that combined code now and are
    fine with one code for V1.
  - The home screen is a calm, scannable stock-by-location table (SKU, location,
    quantity right-aligned, tracking code), built as a single-page app the tablet
    loads once and navigates without full-page reloads (R5).
  - Cells render adaptively: a value, or an explicit "not tracked" when optional
    detail (par level) is absent, never a blank region or a null crash (R9). An
    empty location shows an explicit "No stock at this location" state, never a
    blank page.
  - A SKU detail view shows that SKU across its locations, including its tracking
    code, with the same adaptive "not tracked" behavior (R9).
  - Recording and reading stock is clear and specific: a bad input gets a message
    that names the offending field, never a generic "bad request" (R7).
  - The stock data recorded here survives every later schema change with no loss;
    later model changes are additive so these records stay valid and readable
    (R1, R8).
  - This feature establishes the app shell carrying the StockFlow brand: a navbar
    with the warehouse app icon next to the title, plus a browser-tab favicon. The
    shell is not done until the warehouse icon actually renders (real navbar image
    + favicon, not a placeholder).
- **What I see when it's done:** A working single-page app on the floor tablet. I
  file a SKU's stock at a location, see it on the calm stock-by-location home
  table and on the SKU detail view across several locations, with the combined
  tracking code and an explicit "not tracked" wherever a field is absent. The
  warehouse icon renders in the navbar and the browser tab.
- **Not in this feature:** Adjusting quantities (F2), inbound receipts (F3),
  outbound picks (F4), cycle counting (F5), splitting the tracking code (F6),
  multi-warehouse (F7), barcode-driven flows (F8), search (F9), and
  authentication. This is read-and-record only.
- **Open for confirmation:** Whether a quantity-0 record still counts as holding
  stock in the list and detail views is not settled. Flag it for my review; do not
  assume an answer.
- **Builds on:** Nothing — this is the base every other feature writes into.

### F2-stock-adjustment

- **Frontmatter hint:** `author: Product Owner`, `feature: F2-stock-adjustment`,
  `sprint: 2`.
- **Title (H1):** Adjust the stock level of a SKU at a location.
- **Why:** When the count on the shelf doesn't match what the system says, the
  team needs to correct it. This is the write path that makes the inventory
  trustworthy.
- **What I want:**
  - The operator adjusts the stock level of one SKU at one location to a corrected
    value (or by a delta), and watches the affected row change in place with no
    page reload (R5).
  - Stock can never go below zero. An adjustment that would drive it negative is
    rejected at write time, never stored as a negative (R2).
  - Every adjustment keeps an unmodifiable record of when it happened and who made
    it, never editable after the fact and queryable later (R1).
  - The adjustment form has visible, persistent labels. A successful save lands on
    a confirmation (or a green inline flash); a rejected adjustment is shown inline
    next to the field that caused it, naming the field — for example "quantity
    would go below zero", never a generic "bad request" (R7).
- **What I see when it's done:** I adjust a stock level on the tablet, watch the
  row update in place, and see a rejected adjustment explained inline next to the
  field. Every change leaves an audit entry I can look up.
- **Not in this feature:** Inbound receipts (F3), outbound picks (F4), cycle
  counting (F5), and barcode input (F8) — those are their own features.
- **Builds on:** F1-stock-visibility (the stock records this writes to).

### F3-inbound-receipt

- **Frontmatter hint:** `author: Product Owner`, `feature: F3-inbound-receipt`,
  `sprint: 2`.
- **Title (H1):** Record an inbound receipt from a supplier.
- **Why:** The team needs to receive inbound goods: a known supplier delivers a
  known quantity, and stock goes up at a chosen location. This is the first inbound
  workflow.
- **What I want:**
  - The operator records a receipt — a supplier, a SKU, a quantity, and the
    location it lands at — and recording it increases the stock level at that
    `(sku, location)` record (R3).
  - The receipt form is a single-page interaction with visible, persistent labels
    that lands on a confirmation when saved (R5). A problem (unknown SKU, missing
    supplier, non-positive quantity) is shown inline next to the offending field,
    naming it (R7).
  - The stock increase keeps the same audit expectations as adjustments: when it
    happened and who recorded it, unmodifiable after the fact (R1).
  - The schema change that adds receipts is additive: existing stock records from
    F1 and F2 keep working and old reads do not break (R8).
- **What I see when it's done:** I record a supplier receipt on the tablet, watch
  the stock at the chosen location go up, land on a confirmation, and see the
  existing stock pages still working unchanged.
- **Not in this feature:** Outbound picks (F4), cycle counting (F5), multi-supplier
  purchase orders, carrier/label/shipping integration, and barcode input (F8).
- **Builds on:** F1-stock-visibility (stock records); shares the audit and
  validation conventions established by F2-stock-adjustment.

### F4-outbound-pick

- **Frontmatter hint:** `author: Product Owner`, `feature: F4-outbound-pick`,
  `sprint: 2`.
- **Title (H1):** Pick stock for a customer order.
- **Why:** The team needs to pick goods off the shelf for a customer order,
  drawing stock down at a location, without ever promising more than is actually
  there. This closes the basic in-and-out loop for the warehouse.
- **What I want:**
  - The operator records an outbound pick — a SKU, a quantity, and the location it
    comes from — and recording it decreases the stock level at that location,
    updating the row in place (R5).
  - A pick can never overcommit. If the requested quantity exceeds what is
    available at that location, the pick is rejected at write time, never stored as
    a negative balance and never allowed as a silent double-allocation against the
    same stock (R2).
  - The pick form has visible, persistent labels and lands on a confirmation when
    saved. A rejected pick (over-available, unknown SKU, non-positive quantity) is
    shown inline next to the offending field, naming it — for example "only 3
    available at A-12" (R7).
  - Each pick keeps an unmodifiable record of when it happened and who made it,
    consistent with adjustments and receipts (R1).
  - The schema change that adds picks is additive and does not break existing
    stock reads (R8).
- **What I see when it's done:** I pick stock for an order on the tablet, watch the
  level draw down, and see an over-available pick refused inline, naming the field
  with the real quantity available.
- **Not in this feature:** Order management or allocation across multiple
  locations, backorders, cycle counting (F5), and barcode input (F8).
- **Builds on:** F1-stock-visibility (stock records); shares the audit and
  validation conventions of F2-stock-adjustment and F3-inbound-receipt.

### F5-cycle-count

- **Frontmatter hint:** `author: Product Owner`, `feature: F5-cycle-count`,
  `sprint: 2`.
- **Title (H1):** Count a shelf and reconcile against the system.
- **Why:** The shelf and the record drift apart, and the team needs to bring them
  back together without editing quantities blind. Counting and reconciliation is a
  stated V1 need.
- **What I want:**
  - The operator records a cycle count — a counted on-hand quantity for an existing
    `(sku, location)` record — captured as the number actually seen on the shelf.
  - The variance shows in place: the counted quantity next to the system quantity
    and the difference, so the gap is visible before anything is changed, reusing
    the stock row and the in-place update behavior from F1 and F2 (R5).
  - Reconciling applies the counted quantity as the new on-hand value. It never
    drives the stored quantity below zero; a reconciliation to a negative value is
    rejected at write time and shown inline, naming the field (R2, R7).
  - A count that matches the system (zero variance) is still a valid, recordable
    event: the operator confirms the shelf is correct without changing the quantity.
  - Every count and reconciliation keeps an unmodifiable record of the counted
    value, the resulting adjustment, when it happened, and who made it. The count
    is distinct from a bare F2 adjustment — it records what was physically observed
    (R1).
- **What I see when it's done:** I record a counted quantity for a stock row, see
  the variance against the system in place, reconcile it, and find both the count
  and the resulting adjustment in the audit trail.
- **Not in this feature:** A full location-sweep count sheet and barcode-scanned
  counting come later (F8). Scope is single-record counts, keyed entry only.
- **Builds on:** F1-stock-visibility (the stock record) and F2-stock-adjustment
  (the audited, never-negative write path).

### F6-split-tracking-code-expand

- **Frontmatter hint:** `author: Product Owner`, `feature: F6-split-tracking-code-expand`,
  `sprint: 2`.
- **Title (H1):** Split the tracking code into batch and serial, verified live (tracking code retained).
- **Why:** The V1 tracking code from F1 bundles location, batch, and serial into
  one opaque string, so nothing can query or validate batch and serial on their
  own. This is the first of a two-part schema refactor I demo after sprint 1: add
  batch and serial as their own columns and backfill them from the tracking code,
  while **leaving the tracking code in place** so we can deploy this, see it in real
  use, and prove the split populated correctly and lost nothing before anything is
  dropped. Retiring the tracking code is a separate later feature
  (F10-retire-tracking-code).
- **What I want:**
  - Add `batch_number` and `serial_number` as first-class columns on the stock
    record and backfill them from the existing tracking code. The tracking code
    **stays** — this increment does NOT drop it. Location is already its own column
    and is not recreated; this extracts only batch and serial (R3).
  - Deliver the add + backfill as an additive (expand) migration so reads keep
    working throughout rollout; a new column never breaks an existing page (R8).
  - The backfill parses by delimiter (split on "-"; segment 2 is batch, segment 3
    is serial), not by fixed width, because seed and fixture codes are variable
    width and not uniform.
  - No silent data loss or corruption: every sprint-1 row survives. Codes that do
    not parse leave batch and serial NULL rather than being guessed or dropped, and
    an integrity probe surfaces the count of nonconforming rows for my review and
    sign-off before this increment is accepted. Location stays canonical and
    unchanged (R1).
  - Correctness is proven against the paired Lakebase branch — the parent-aware
    schema diff shows batch and serial added (with the tracking code still present)
    plus the integrity-probe warning count — not against a mock (R4).
  - The live app shows the split as it happens, on an isolated branch forked from
    the feature branch — staging and production are never touched (R4). The home
    stock table and SKU detail render correctly driven by whichever columns are
    live (R5): before the backfill, the single tracking-code column; after it, the
    tracking code shown **alongside** the new Batch and Serial columns. Mark the
    columns with pills so the audience sees exactly what changed: a **new-to-verify**
    pill on the new Batch and Serial columns, and a **to-be-retired** pill on the
    tracking-code column (it is slated for elimination in F10) (R3). A field present
    but null renders "not tracked", judged independently per field, never blank
    (R9); the view moves to the current step on its own (R5).
  - The integrity probe's nonconforming-row count is shown on screen for sign-off —
    the count of rows that could not be split (left NULL, never guessed, never
    dropped) is visible for my review, not just logged (R1).
  - The paused, step-by-step *visual walkthrough* of the migration — stage labels, a
    migration overlay, and the reset → expand → verify walk on an isolated branch —
    is the throwaway F11 demo, not part of this shipped increment.
- **What I see when it's done:** On the paired branch, the schema diff shows
  `batch_number` + `serial_number` added with the tracking code still present, the
  integrity probe reports the nonconforming-row count, and every sprint-1 row is
  intact. The home table and SKU detail render from the live schema with the
  tracking code shown alongside Batch and Serial (tracking code with its
  to-be-retired pill, plus Batch and Serial with their new-to-verify pills, "not
  tracked" where empty), and the probe count is on screen for my sign-off — staging
  and production untouched. The tracking code is still there on purpose; dropping it
  is F10, and the paused visual walkthrough is the throwaway F11 demo.
- **Not in this feature:** Dropping the tracking-code column — that is the separate
  contract feature F10-retire-tracking-code, taken only after this split is deployed
  and signed off. Also not part of this feature: the presentation-only demo
  scaffolding (raw inspect / migration-bypass endpoints and page, the demo / seed /
  token-refresh shell scripts, editor tasks, dev-server and inline-browser plumbing,
  the migration-status sentinel file, UI polling) — demo affordances, not acceptance
  criteria.
- **Builds on:** F1-stock-visibility (the stock table and the tracking code it
  introduced).

### F7-multi-warehouse

- **Frontmatter hint:** `author: Product Owner`, `feature: F7-multi-warehouse`,
  `sprint: 3`.
- **Title (H1):** Operate across multiple warehouses.
- **Why:** The team needs to run more than one warehouse from a single deployment
  without each one needing its own copy of the system. Today stock is addressed by
  `(sku, location)`, which has no room for the same location name in a different
  building.
- **What I want:**
  - Introduce a warehouse as a first-class dimension of stock addressing: a record
    is uniquely addressable by `(warehouse, sku, location)`, so the same
    `(sku, location)` pair may exist in more than one warehouse without collision
    (R3).
  - Existing stock records survive the change with no loss — they are assigned to a
    single default warehouse so every prior record stays valid and readable, via an
    additive migration (R1, R8).
  - The operator picks (or is scoped to) a warehouse, and the stock-by-location
    table, the SKU detail, and the receive / pick / adjust / count forms all operate
    within that warehouse.
  - No two warehouses share stock: a pick, receipt, adjustment, or count in one
    warehouse never moves quantity in another.
- **What I see when it's done:** I select a warehouse and work entirely within it;
  the same location name exists independently in two warehouses without collision,
  and all my prior stock records are intact under the default warehouse.
- **Not in this feature:** Cross-warehouse totals, stock transfers between
  warehouses, and per-warehouse access control.
- **Builds on:** F1-stock-visibility (the stock model this extends) and every write
  path from F2 through F5 (each becomes warehouse-scoped).

### F8-barcode-scan

- **Frontmatter hint:** `author: Product Owner`, `feature: F8-barcode-scan`,
  `sprint: 3`.
- **Title (H1):** Barcode-driven receive, pick, and adjust.
- **Why:** The warehouse floor works by barcode scanner, not keyboard. The team
  needs the receive, pick, adjust, and count flows to accept a scan as their
  primary input, so an operator can work one-handed with a scanner and a tablet.
- **What I want:**
  - A barcode scan is the primary input to the receive, pick, adjust, and
    cycle-count flows. Scanning a known code identifies the SKU (and location where
    the code carries it) and focuses the flow on that stock row; keyed entry stays
    available as the fallback.
  - A successful scan flashes the scan zone green and updates the affected stock row
    in place, with no full-page reload (R5).
  - The scan-to-update interaction feels immediate: perceived response under about
    200ms from the scan event to the UI update (R6).
  - A scan that fails (an unknown barcode, a locked SKU) flashes the scan zone red
    and shows a persistent toast naming the problem, never a silent no-op (R7).
  - Every scanned write keeps the same unmodifiable audit trail (R1) and the same
    no-overcommit / never-negative rules as its keyed equivalent (R2); the scan is
    an input method, not a new write path.
- **What I see when it's done:** I scan a real barcode on the floor tablet, watch
  the right stock row focus and update in place under ~200ms with a green flash, and
  see a failed scan flash red with a toast naming the problem.
- **Not in this feature:** New write paths or business rules beyond the keyed
  equivalents, label printing, and camera/OCR capture beyond the scanner input.
- **Builds on:** The keyed forms from F2-stock-adjustment, F3-inbound-receipt,
  F4-outbound-pick, and F5-cycle-count, adding a scan path to each.

### F9-stock-search

- **Frontmatter hint:** `author: Product Owner`, `feature: F9-stock-search`,
  `sprint: 2`.
- **Title (H1):** Search stock by SKU and location.
- **Why:** As the stock table grows, the team needs to find a SKU or a location
  quickly instead of scrolling and scanning by eye. This is the findability surface
  the design brief calls for.
- **What I want:**
  - The operator searches stock by SKU and by location from the home view;
    entering a SKU or a location narrows the stock-by-location table to the matching
    rows, client-side on the single-page app (R5).
  - A search with no matches shows an explicit, specific empty state ("No stock
    matches that SKU or location"), never a blank page (R7).
  - Matching rows reuse the existing stock records from F1 and keep their adaptive
    rendering: optional detail that is absent still shows "not tracked", never a
    blank region (R9).
  - Search is read-only: it filters and finds, never changes a stock level, and
    reuses the existing records with no new write path or schema change.
  - Search reflects the current stock state, including rows created or changed by
    receipts, picks, adjustments, and counts.
- **What I see when it's done:** I type a SKU or a location on the home view and
  watch the table narrow to the matching rows; a no-match search shows a clear
  empty state, and the rows reflect the latest receipts, picks, adjustments, and
  counts.
- **Not in this feature:** Fuzzy or ranked search, saved searches, and any write
  path — search never changes stock.
- **Builds on:** F1-stock-visibility (the stock records and the home table it
  searches over).

### F10-retire-tracking-code

- **Frontmatter hint:** `author: Product Owner`, `feature: F10-retire-tracking-code`,
  `sprint: 3`.
- **Title (H1):** Retire the tracking code now that batch and serial are proven.
- **Why:** F6 added batch and serial and backfilled them while keeping the tracking
  code in place, so we could deploy it and confirm in real use that the split worked
  and nothing was lost. Once stakeholders are comfortable it did, the tracking code
  is redundant and I want it gone — this is the second and final part of the refactor, the contract step.
- **What I want:**
  - Drop the tracking-code column entirely, so the stock record carries batch and
    serial only. This is the whole point of the feature; leaving the column in place
    (even unused) means this feature is not done (R8).
  - The drop is reversible as a proven round-trip: the down path reconstructs a
    tracking code from the canonical location plus the split-out batch and serial,
    and re-applying up drops it again. The accepted end state is the up-migrated
    schema with the tracking code dropped — never left on the down migration (R1).
  - No row is lost or corrupted by the drop; every row that existed before still
    exists after, with its batch and serial intact (R1). Location stays canonical
    and unchanged (R3).
  - Correctness is proven against the paired Lakebase branch — the parent-aware
    schema diff must show the tracking-code column **removed** alongside batch and
    serial present — not against a mock (R4).
  - The home table and SKU detail update to show Batch and Serial only; the
    tracking-code column disappears (its to-be-retired pill is now realized), and a
    field with no value renders "not tracked" per column, never blank, preserving
    one unambiguous identity per stock position (R3, R9). The app renders this driven
    by the live schema, with a "final version after the refactor" stage label (R5).
- **What I see when it's done:** On the paired branch, the schema diff shows the
  tracking-code column dropped and batch + serial present, every row intact. In the
  app the home table and SKU detail show Batch and Serial only — no tracking-code
  column — labelled "final version after the refactor". I can prove the migration
  reverses and re-applies cleanly, landing on the dropped-column end state.
- **Open for confirmation:** This should ship only after F6 (the split) has been
  deployed and the team has signed off that the split is correct and complete.
  Please confirm that sign-off before this is scheduled.
- **Builds on:** F6-split-tracking-code-expand (the batch + serial columns and the backfill
  it added, with the tracking code still present).

### F11-refactor-walkthrough

- **Frontmatter hint:** `author: Product Owner`, `feature: F11-refactor-walkthrough`,
  `sprint: 3`.
- **Title (H1):** Guided refactor walkthrough — a throwaway demo of the F6 → F10 journey.
- **Why:** Once the split (F6) and the retire (F10) are both deployed and signed off,
  I want to *show* stakeholders the whole tracking-code refactor as one observable
  story — expand, verify, then the reversible drop — without touching anything real.
  This is a **throwaway demo**: never shipped into the product, no production
  guarantees of its own, discarded after the showing.
- **What I want:**
  - Run entirely on a **throwaway isolated branch** — it NEVER touches staging or
    production, and nothing it does is merged into the trunk or the final product.
  - **Recreate its own "before" state** by seeding nonconforming codes, so the
    integrity-probe count is visibly non-zero without depending on live data.
  - Replay the refactor as **paused, observable steps**: reset → expand + backfill →
    verify → drop (the reversible contract), pausing between steps.
  - Each screen carries a **stage label** (today / transition-to-verify) and a running
    step shows a **migration overlay** that clears when it finishes.
  - Show how **F6 (expand)** and **F10 (drop)** fit together end to end.
- **What I see when it's done:** On the disposable demo branch I step through reset,
  expand + backfill, verify, and the drop, pausing at each with the stage label and
  overlay, then throw the branch away — production untouched.
- **NFRs (deliberately limited):** F11 is **outside the project's Required NFRs**
  (R1/R3/R4/R8 …) — those bind the shipped features (F6/F10), not this replay. Only
  isolation (never read/write staging or production; never merged into the trunk, so
  it never enters the production CI merge gate) and observability (paused, labeled
  steps) apply.
- **Not in this feature:** any production code or data path — F11 ships nothing; the
  real migrations and their guarantees live in F6 and F10.
- **Builds on:** F6-split-tracking-code-expand and F10-retire-tracking-code — both
  deployed and signed off first; F11 only replays the journey they delivered.

#### Free-form request exemplar — illustrative, NOT a rigid template

Per the kit, a `feature-request.md` is a free-form H1 + body with **no frontmatter
and no mandated sections** — the structure is the PO's choice. The example below is
ONE good free-form shape; author every feature in the PO's own voice from its own
bullets above. The one thing to carry over is the **R-ref discipline**: the inline
backticked `` `R<n>` `` tags preserved on the bullets they govern (pulled from each
feature's own bullets above — never paraphrased away). Illustrative section names
like "What I want" / "What I see when it's done" are optional, not required.

```markdown
# File a stock record and see it by SKU and location

## Why

Before we can receive, pick, count, or adjust anything, the team needs the one
foundational answer: what do we have, in what quantity, at which location, right
now. This is the first job StockFlow exists to do, and it is the schema and the
app shell every later feature writes into. It also establishes the StockFlow
brand and the single-page experience the warehouse-floor tablet lives in.

## What I want

- A form to file a stock record: SKU, location, quantity, and the combined
  tracking code that encodes location, batch, and serial together.
- Every SKU at a location is uniquely addressable — no two records may share the
  same `(sku, location)` pair `R3`.
- A home view with a calm, scannable stock-by-location table, and a SKU detail
  view for a single record.
- A row whose optional detail (par level, batch, serial) is missing still renders
  cleanly, showing an explicit "not tracked" per field, judged independently, and
  an empty location shows an explicit empty state rather than a blank page `R9`.
- Clear, field-named validation when the form is submitted incomplete or invalid,
  shown inline next to the offending field, never a generic "bad request" `R7`.
- Delivered as a single-page React + TypeScript app the tablet loads once and
  navigates without full-page reloads `R5`.
- The write and read paths are proven by integration tests running against the
  paired Lakebase branch, not a mock `R4`.

## What I see when it's done

I fill in a SKU, a location, a quantity, and a tracking code, submit the form,
and watch the new row appear in the home stock-by-location table. I click into
that row and see the SKU detail view, with any untracked optional field showing
"not tracked". If I leave a required field blank, the form tells me exactly which
field is wrong, inline. An empty home view shows a teaching empty state.

## Not in this feature

- Adjusting, receiving, picking, or counting stock — those are F2 through F5.
- Searching or filtering the table — that is F9.
- Splitting the combined tracking code into batch and serial columns — that is
  the F6 refactor.

## Builds on

Nothing — this is the foundation. It establishes the schema, the `(sku, location)`
key, the combined tracking code, the SPA shell, the StockFlow brand, and the
real-branch integration-test baseline that every later feature composes on.
```
