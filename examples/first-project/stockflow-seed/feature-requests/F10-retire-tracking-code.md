---
author: Product Owner
feature: F10-retire-tracking-code
sprint: 3
---

# Retire the combined tracking code — contract to batch and serial only

## Why

This is the second increment of the refactor, and I am taking it only after
stakeholders are comfortable that the F6 split worked and lost nothing. Now I want
to finish the job: drop the combined tracking-code column entirely so the stock
record carries batch and serial only. This is the one deliberate exception to our
additive-only migrations, so it must be a reversible, proven round-trip — I will
not accept a one-way drop.

## What I want

- Drop the combined tracking-code column entirely so the record carries batch and
  serial only `R8`.
- The drop is reversible as a proven round-trip: the down path reconstructs the
  combined code from the canonical location plus the split-out batch and serial,
  and re-applying up drops it again `R1`.
- `location` stays canonical and unchanged — the down path reads it, never
  recreates it `R3`.
- The accepted end state is the up-migrated schema with the combined code dropped,
  never left on the down migration.
- Update the home table and SKU detail to show batch/serial only — the
  combined-code column disappears, and an empty batch or serial field shows "not
  tracked" per field.
- Prove correctness with the parent-aware schema diff on the paired Lakebase
  branch, showing the combined tracking code **removed** alongside batch + serial
  present `R4`.

## What I see when it's done

The home table and SKU detail render batch and serial only — the combined
tracking-code column is gone, and any empty batch or serial field reads "not
tracked". The schema diff on the paired branch confirms the combined code removed
with batch + serial present. The drop has been proven reversible: the down path
reconstructs the combined code from location + batch + serial, and re-applying up
drops it again, landing on the up-migrated end state.

## Not in this feature

- Re-deriving or changing the `location` column — it stays canonical.
- Any further batch/serial behavior beyond carrying them as the record's only
  tracking identity.

## Open for confirmation

- The product overview and proposals fix this as sprint 3 and gated on F6 being
  deployed and signed off. I want to confirm at planning that F6 is in fact
  deployed and signed off before I commit F10 into the sprint — if F6 has not been
  accepted in real use, F10 waits.

## Builds on

F6-split-tracking-code — gated on F6 being deployed and signed off first. This
increment contracts the schema that F6 expanded, dropping the combined tracking
code that F6 deliberately retained.
