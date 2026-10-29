# StockFlow — Non-functional requirements

## Required

- **R1 — Data survival + immutable audit.** Existing stock data survives every
  schema migration with no loss. Each iteration's additive model change preserves
  the inventory records created before it, and every inventory adjustment keeps an
  unmodifiable timestamp and actor, never editable after the fact and queryable
  later.
- **R2 — Never negative, never overcommit.** Stock levels never go below zero and
  never overcommit beyond available quantity. A pick (or any write) that would
  overcommit is rejected at write time — never a stored negative, never a silently
  allowed double-allocation against the same stock.
- **R3 — Unique addressability.** Every SKU at every location is uniquely
  addressable by `(sku, location)` and no two records share that pair. A collision
  is resolved at write time — never two stored duplicates, never an error page.
  `location` stays canonical and unchanged across the tracking-code refactor.
- **R4 — Real-branch integration tests.** Integration tests run against the paired
  Lakebase branch, not a mock or in-memory substitute. The CI workflow refuses to
  merge a PR whose integration tests do not run against a real branch. Schema-change
  correctness is proven by the parent-aware schema diff on that paired branch.
- **R5 — Single-page web application.** The UI is a single-page web application.
  The warehouse-floor tablet loads the app once and navigates client-side (home,
  SKU detail, the receipt / pick / adjustment / count forms) with no full-page
  reloads; a stock adjustment updates the affected row in place (optimistic update,
  reconciled against the server response) rather than re-rendering the page. The
  client is a React + TypeScript application under `client/`, and the backend is a
  JSON API (the boundary layer returns data, not server-rendered HTML). The client
  ships its own component tests; the API is covered by the branch integration tests
  in R4.
- **R6 — Immediate scan response.** Barcode-scan interactions feel immediate:
  perceived response under ~200ms from the scan event to the UI update.
- **R7 — Clear, field-named validation.** Validation messages are clear and
  specific, naming the offending field (for example "quantity would go below zero"
  or "only 3 available at A-12"), never a generic "bad request". A validation
  problem is shown inline next to the field that caused it.
- **R8 — Additive migrations, reads keep working.** Migrations are additive where
  possible — reads keep working during rollout; a new column or table never breaks
  an existing page. (The F10 contract step is the one deliberate exception: a
  reversible, proven round-trip drop, taken only after the expand step is signed
  off.)
- **R9 — Graceful, adaptive rendering.** A stock-level row missing optional detail
  still renders cleanly — par level, batch, and serial default to empty and show an
  explicit "not tracked", judged independently per field, never a null crash and
  never a blank region. An empty location shows an explicit empty state, never a
  blank page.
- **R10 — Findability.** As the stock table grows, stock must be findable by SKU
  and location from the home view — a read-only search/filter that narrows the
  stock-by-location table, with an explicit no-match empty state ("No stock matches
  that SKU or location"), never a blank page. This is a stated V1 need, not a
  nice-to-have.

## Preferences

- Migrations stay additive wherever the change allows it, so rollout never breaks
  an existing page (the destructive F10 drop is the deliberate, gated, reversible
  exception).
- When entering a location, offer locations already on record to reuse without
  retyping, while never blocking a brand-new location. How that is presented is the
  designer's call.
- Errors route through a single `describeError()` helper that maps status codes to
  actionable text and includes the status code.

## Out of bounds

- **No authentication, authorization, or per-tenant ownership for V1.**
- **No caching layer and no multi-region concerns.**
- **No real-time multi-operator conflict resolution** beyond the simple
  no-overcommit rule (R2). No specific scalability target for V1.
- **Environment / database constraint.** The app connects to the
  substrate-provisioned `databricks_postgres` database via the `DATABASE_URL` the
  post-checkout hook writes from the paired Lakebase branch. Do NOT rename the
  database or set `DB_NAME` / `PGDATABASE` to an app-specific name, and do not make
  the database name a requirement or NFR: the branch provisions only
  `databricks_postgres` (a migration creates tables, not databases), so an app
  pointed at any other name cannot connect. Leave the scaffold's connection
  defaults alone; the schema lives in `databricks_postgres` on the paired branch.
