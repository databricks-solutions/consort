---
author: Product Owner
feature: F6-split-tracking-code
sprint: 2
---

# Split the tracking code into batch and serial — expand and verify, tracking code retained

## Why

This is the showcase live-data schema refactor, and I am deliberately doing it in
two increments. This first increment expands the schema — add new batch and serial
columns and backfill them from the combined tracking code — while leaving the
combined tracking code exactly where it is. I want stakeholders to see the split
populate correctly against real data and lose nothing before anything destructive
happens. Retiring the old column is a separate, later feature (F10), not part of
this one. The accepted end state here is the expanded schema with the combined
tracking code retained on purpose.

## What I want

- Add new batch and serial columns to the stock record, and backfill them from the
  combined tracking code — while leaving the combined tracking code in place `R1`.
- Backfill parses the combined code **by delimiter**: split on `-`, segment 2 is
  the batch, segment 3 is the serial. Never fixed-width; codes are variable-width
  and some have no batch or serial segment.
- Codes that do not parse leave batch and serial NULL — never guessed, never
  dropped `R1`.
- `location` stays canonical and unchanged — the split extracts only batch and
  serial and does not recreate a location column from the code `R3`.
- Surface an integrity-probe count of nonconforming rows **in the app** for my
  review and sign-off before this increment is accepted.
- The add + backfill is additive so reads keep working throughout the rollout; the
  home table and SKU detail keep rendering the whole time `R8`.
- Prove correctness with the parent-aware schema diff on the paired Lakebase
  branch — batch + serial **added**, the combined tracking code **still present** —
  alongside the integrity-probe warning count `R4`.
- A UI-visible, stepwise walk on an isolated branch (reset → expand + backfill →
  verify) that pauses between steps so each change is observable, with a "before"
  seed that includes nonconforming codes so the probe count is visibly non-zero.
- In the transition UI, the new Batch and Serial columns carry a **new-to-verify**
  pill AND the combined tracking-code column carries a **to-be-retired** pill; each
  screen carries a stage label (today / transition-to-verify); a running migration
  shows an overlay that clears when the step finishes.

## What I see when it's done

I walk the refactor step by step: reset to a "before" state with nonconforming
codes seeded in, run the expand + backfill, and watch the home table and SKU detail
re-render from the live schema with new Batch and Serial columns — each marked with
a new-to-verify pill — while the combined tracking-code column is still there,
marked to-be-retired. The app shows me the integrity-probe count of nonconforming
rows so I can sign off. Each screen tells me which stage I am on, and a running
step shows a migration overlay that clears when it finishes. The schema diff on the
paired branch confirms batch + serial added with the combined code retained.

## Not in this feature

- Dropping the combined tracking-code column — that is deliberately deferred to
  F10. This increment retains it on purpose.
- Scoping records by warehouse — that is F7.

## Builds on

F1-stock-visibility — the stock schema and the combined tracking code this expands.
This increment is the prerequisite for F10, which contracts the schema only after
this one is deployed and signed off.
