# Test strategy: the test surface of the TDD cycle

What the Test Strategist authors, and what RED / GREEN mean here. The "new TDD": every cycle's test surface is **behavior tests (BDD) plus architectural fitness tests**, run against real backing services, with mocks reserved for the narrow case where no real resource exists. Because every feature has a paired Lakebase branch, a real isolated DB is cheap, so the default test is an integration test against that branch, not a unit test against a mocked repository.

## The two kinds of test in a cycle

1. **Behavior tests (BDD).** Each AC becomes a `Given / When / Then` scenario in the project's BDD framework (`pytest-bdd` for Python, equivalent elsewhere) that exercises the real request path through the real layers against the paired-branch DB. This proves the feature does what the AC says.
2. **Architectural fitness tests.** The story's architectural constraints (layering, ORM-only persistence, config-in-env, NFR budgets) become fitness functions (see [evolutionary-architecture](../../architectural-design-principles/references/evolutionary-architecture.md)). They prove the feature is built the way the architecture requires.

Both are authored in the story's test-list, both go RED before the code exists, and both must be GREEN to close the cycle. A behavior test passing while a fitness function is RED is not done.

## The mock policy

- **Never mock anything you can hit for real.** The database is the canonical case: the paired Lakebase branch IS a real isolated DB, so persistence is exercised for real. Same for any backing service the kit provides cheaply.
- **Mocks are acceptable only where no real resource exists or it's genuinely unsafe/nondeterministic in the cycle:** a third-party payment API, an email send, wall-clock time, a paid service. Substitute a fake at the port (the layered-architecture seam), not deep inside the code.
- A mock standing in for the database is a smell a fitness function catches (the no-mock-for-DB check). Point the repository at the paired branch instead.
- **When you DO mock a route in a Playwright E2E test, scope the intercept to the API PATHNAME, never a broad `**`-glob.** Use a URL-matcher function — `page.route((url) => new URL(url).pathname === "/api/stock", ...)` — not `page.route("**/api/stock**", ...)`. Under the Vite dev server the app's OWN ES modules are served from the same origin at `/src/api/stock.ts`, and a `**/api/stock**` glob matches that module request too: the mock then fulfills the module with JSON, the browser rejects it (`Failed to load module script: MIME type application/json`), the SPA never boots, and the behavior under test (e.g. an empty-state) can NEVER render. A pathname matcher hits only the real endpoint (`/api/stock`, query string included) and never the `/src/...` module. This is a spec defect, not app breakage — it dead-locks the cycle on a correct app: the SPA-boot failure looks like a build failure, so no product change can make it GREEN. If an empty-state / no-data E2E never renders and the app is otherwise correct, SUSPECT an over-broad `page.route` glob first.

Why: dev/prod parity (twelve-factor X) + backing-services-as-attached-resources (IV) mean the test DB and the production DB are the same kind of thing, differing by config, so testing against the real branch is faithful and free of the mock-maintenance tax.

## RED / GREEN / REFACTOR

- **RED:** the Test Strategist authors the behavior scenarios per AC and the fitness functions for the architectural constraints. All fail.
- **GREEN:** the Driver writes the code to pass the scenarios against the paired branch and satisfy the fitness functions. No mock substitutes for the DB.
- **REFACTOR:** structure improves; both stay GREEN. A refactor that needs a behavior test rewritten changed the public boundary, a design signal, not a license to edit the test.

## What the Test Strategist produces

For each AC in the story's test-list: one or more BDD behavior scenarios (real path, real DB) + the fitness functions for any architectural constraint the story touches (layering contract, ORM-only, config-in-env, an NFR budget). Mocks appear only with a one-line justification naming the real resource that doesn't exist. If the justification is "the database," reject it: use the paired branch.

## Composition

- **`architectural-design-principles`** provides the fitness-function catalog + layering rules these tests defend.
- **`software-design-principles`** provides the NFR baseline whose budgets become budget fitness tests.
- The **paired Lakebase branch** is why real-DB integration testing is the default and mocks are the exception.
