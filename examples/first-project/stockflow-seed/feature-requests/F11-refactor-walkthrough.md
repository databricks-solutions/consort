---
author: Product Owner
feature: F11-refactor-walkthrough
sprint: 3
---

# Guided refactor walkthrough — a throwaway demo of the F6 → F10 journey

## Why

Once the split (F6) and the retire (F10) are both deployed and signed off, I want a
way to *show* stakeholders the whole tracking-code refactor as one observable story
— expand, verify, then the reversible drop — without touching anything real. This
is a **throwaway demo**: it is never shipped into the product, it carries no
production guarantees of its own, and it is discarded after the showing. Its only
job is to make the journey F6 and F10 already proved *visible*, step by step, on a
disposable branch.

## What I want

- Run entirely on a **throwaway isolated branch** — it NEVER touches staging or
  production data, and nothing it does is merged into the trunk or the final
  product.
- **Recreate its own "before" state**: seed stock records that include nonconforming
  codes, so the integrity-probe count is visibly non-zero, rather than depending on
  any live data.
- Replay the refactor as **paused, observable steps**: reset → expand + backfill →
  verify → drop (the reversible contract), pausing between steps so each change can
  be watched.
- Each screen carries a **stage label** (today / transition-to-verify) and a running
  step shows a **migration overlay** that clears when the step finishes.
- Show how **F6 (expand)** and **F10 (drop)** fit together end to end in one sitting.

## What I see when it's done

On the demo branch I step through reset, expand + backfill, verify, and the drop,
pausing at each, with the stage label and the migration overlay telling me where I
am. I can show the audience the full arc of the refactor and then throw the branch
away, with production untouched.

## Not in this feature

- **Any production code or data path.** F11 ships nothing; the real migrations and
  their guarantees live in F6 and F10. If F11 did not exist, F6 and F10 would be
  unchanged.
- **The data-survival, reversibility, and schema-diff guarantees** — those are F6's
  and F10's to prove against the paired branch. F11 only *visualizes* the journey.

## Non-functional requirements

Deliberately minimal — F11 is a throwaway demo, **explicitly outside the project's
Required NFRs** (R1 data survival, R3 addressability, R4 real-branch CI gate, R8
additive migrations, …). Those bind the shipped features (F6/F10), not this replay.
The only constraints that apply:

- **Isolation.** Runs on a disposable branch; never reads or writes staging or
  production, and is never merged into the trunk (so it never enters the
  production CI merge gate).
- **Observability.** The steps pause and are labeled so the journey is watchable.

## Builds on

F6-split-tracking-code-expand and F10-retire-tracking-code — both deployed and
signed off first. F11 replays the journey those two features already delivered; it
adds nothing to the product.
