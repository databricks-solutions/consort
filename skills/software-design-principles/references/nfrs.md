# NFRs: non-functional requirements

The baseline checklist. Walk before declaring a feature done; each row asks "what's the answer, even if it's 'good enough'?" A blank row is fine when scope justifies it; an unconsidered row is a smell.

## The six categories

**1. Performance:** latency p50/p95/p99 (an order-of-magnitude estimate beats nothing); throughput; largest input; hot paths (would a measurement catch a 10x regression?).
Smells: "it'll be fine" with no measurement; an N+1 query hidden by a 10-row dev set; a loop copying a large list each iteration.

**2. Scalability:** horizontal (add a second instance? shared state?); vertical (limiting resource); data growth (10x/100x today?); backpressure (queue / drop / retry?).
Smells: in-memory cache assuming one process; a job that doesn't degrade under load; a data model that can't grow.

**3. Security:** AuthN/AuthZ at the boundary (see [cross-cutting-concerns.md](cross-cutting-concerns.md)); input validation at every trust boundary; secrets (hardcoded / logged / committed?); PII (stored where, retention?); known-vulnerable dependencies.
Smells: a token logged on error; a regex used as security validation (regex is for shape, auth is decisions); an admin endpoint guarded only by "authenticated."

**4. Observability:** structured logs with correlation-id; metrics (request count, error rate, latency per endpoint/job); traces across layers; symptom-based alerts ("checkout success dropped," not "CPU high").
Smells: `console.log("ok")` as the only signal; an alert nobody owns; "error happened" with no context.

**5. Operability:** deployment (idempotent? rollback?); config changed without redeploy (see [layered-architecture.md](layered-architecture.md) policy layer); 3am diagnostics; non-obvious runbook steps.
Smells: a flag that needs a redeploy to flip; "just restart it" for every failure; a new endpoint absent from the health check.

**6. Resilience:** retries + backoff; a timeout on every external call; idempotent writes (duplicate delivery); degraded mode (dependency X down); recovery (rebuild corrupt state).
Smells: an external call with no timeout; a retry loop with no backoff (DDoSes the upstream on recovery); a write that doubles a counter on redelivery.

## How to apply

A 10-minute conversation, not a 200-item form: name each category's answer in one sentence ("no requirement here" is valid); anything you can't answer in one sentence is a follow-up.

- **Release gate**: the NFR baseline gates promote-to-prod, every row has a recorded answer in the release ticket (or "N/A: reason").
- **Feature-level** (`consort`): NFRs live in the feature's `architecture.json` (`nfrs[]`, scoped via `applies_to`), not on `feature-spec.json`/`story.json`. The Architect Reviewer populates them during review, covering every Required item via `brief_ref`. Empty is allowed; unaddressed is not.
- **Tier each NFR `platform` vs `product`** (`consort`): a **platform** NFR is a cross-cutting / substrate-guaranteed concern (layering, config-in-env, observability, auth-ready posture, operability) defended ONCE – by a deterministic gate it names in `defended_by_gate` (e.g. `consort-layering-clean`, `config-in-env`) or a single feature-level `fitness_function` – so it is NOT threaded into every story's rubric and needs no per-story test. A **product** NFR (the default) is feature-specific (correctness, data-integrity, a feature's own performance budget) and is defended per story with fitness tests. A platform NFR must name its defense (`checkPlatformNfrDefended` hard-blocks otherwise) – it is defended once, never dropped. This is what stops a cross-cutting concern from being re-reasoned in every story.
