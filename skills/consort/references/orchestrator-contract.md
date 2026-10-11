# Orchestrator operating contract

How the agent that runs `/sprint`, `/design`, `/build`, `/deploy` must behave. It
is the orchestrator's counterpart to the role agents' `agent-operating-rules.md`:
those govern each role's turn; this governs the agent DRIVING the workflow. The
promise the kit makes to a consumer is **requirements in, working software out,
with human decisions only where they belong** - not a running commentary.

The deterministic driver (`consort-drive`) already sequences the work and
spawns the roles; your job is to run it to completion, **relay what it's doing as
it happens**, and involve the human only at the decisions that are genuinely
theirs. The failure mode to avoid is BOTH extremes: a per-CLI play-by-play, AND
silence – a multi-minute run where the human has no idea what's happening. Relay
the phase/role/gate transitions; don't narrate the tooling.

## Rules

1. **Relay live progress – never go silent.** The drive emits a per-turn progress
   line to stderr (`[drive] NNN <what it's doing>`), on by default (silence it only
   for captures/CI with `LAKEBASE_CONSORT_QUIET=1`), and the drive SELF-WRITES
   `.consort/drive-live.log` (it owns that file, so visibility does not depend on how
   you launch it). Run the drive so you can surface that stream live, with TWO hard
   rules. **(a) Launch with `--detach`, never `nohup`/`&`.** `./scripts/lk
   consort-drive … --detach` re-launches the drive in its OWN session (setsid) and
   returns at once, printing the child pid + the watch command. This is the only
   launch that survives your turn ending: a `nohup … &` leaves the drive in your tool
   call's process group, which the harness SIGTERMs on turn-end (the "drive reaped
   between turns" failure); `--detach` escapes that group. Do NOT redirect stderr to
   `drive-live.log` (the drive owns it – a redirect double-writes). **(b) To SHOW EACH
   STEP LIVE, relay POLL-ONCE with `consort-watch --since <cursor>` in a loop – the ONLY
   foreground-safe way, mandatory.** Each call returns IMMEDIATELY with the new lines + a
   `[consort-watch] cursor=<N> status=<running|gate|pause|escalation|done|waiting>`
   trailer and EXITS; narrate that batch, then call again with the printed `<N>` (poll
   ~every 15-20s while running) until `status` is a stop. **NEVER run a BLOCKING
   `consort-watch` as a foreground Bash call – not `--timeout 0`, not the default bound,
   not any follow – the harness buffers it and the human sees only a spinner until it
   returns (no steps). If you are literally invoking the Monitor TOOL (a persistent
   background task that streams output live), hand it `./scripts/lk consort-watch
   --monitor --pid <drive-pid>` – the persistent mode; **PASS `--pid`** so it alerts the
   INSTANT the drive stops: the moment the pid is gone it reads `.consort/next.json` (the
   authoritative snapshot the drive writes on EVERY stop) and emits `[consort-watch] DRIVE
   STOPPED – <summary>` (+ `HUMAN NEEDED: <prompt> – run: <enact>` when `awaiting_human`),
   then exits so you surface it at once. It NEVER waits on a `[drive]` terminal marker (the
   transient log may carry none – the bug that left the monitor sitting at a gate for
   hours); stop == pid-gone, human-needed == `next.json`'s `awaiting_human`. Otherwise you
   are in a Bash call – use poll-once.** NEVER hand-roll a `tail -f … | while read; case …` monitor
   (brittle; the kit owns the formats). The same poll-once relay follows
   create + refresh (their `[stage]` / `lk:` lines classify too). `consort-watch` relays
   each transition as it lands ,
   e.g. "Planning: Spec Author proposing the backlog… → Architect estimating… → Plan
   gate reached." **`consort-watch` is NARRATION ONLY: its `status` is a display hint,
   NEVER the gate/stop authority.** `drive-live.log` is a transient per-process sink
   (truncated each turn, gone between turns, and it may carry NO stop marker), so
   `status` can read `running` while a gate is actually open, or `done` at a mere turn
   boundary. **The stop/gate authority is ALWAYS the drive pid (gone = stopped) + `consort-next`
   (rule 2), never a log line.** When `consort-next` reports a gate,
   `consort-watch` also OPENS the artifacts under review (feature-spec, architecture,
   db-design, test-list, story + ACs) in your editor when you are inside Cursor/Code,
   so you review them directly instead of hunting – run `./scripts/lk consort-open`
   yourself to (re)open them for the current feature/story at any time. Translate the terse markers
   to human phrasing (`dispatch spec-author for design` → "Spec Author: starting
   design"). This is the phase/role/gate story, NOT a play-by-play of CLIs or state reads.

2. **Drive to completion.** On every stop, read `consort-next` (or the
   auto-emitted `.consort/next.json`) and gate on its **`awaiting_human` boolean – the
   SOLE human-needed signal**: `false` ⇒ enact `primary_action` / RESUME the drive and
   continue; `true` ⇒ STOP and surface the decision (use the non-`resume` option's
   `hil_prompt` + `enact`). **Do NOT gate on `primary_action.kind` or `state.open_gates`**:
   the planning backlog pause (`author-requests`) is an `invoke-role` (product-owner)
   with EMPTY `open_gates`, so those two read it as "resume" and the session sits SILENT
   at the backlog decision – the recurring "no HITL alert" failure. `awaiting_human`
   covers gates, the backlog commit, AND per-story accept/discard/revise uniformly.
   Re-running the drive after a human decision is part of driving, not a question to pose.
   **The interactive drive exits after ONE turn (a fresh session per role, for context
   headroom), so a pid going away with only a `[drive] <role> turn Ns` line and NO
   gate/pause/escalation marker is a NORMAL turn boundary, NOT a crash – `consort-watch`
   may even report `status=done` for such a marker-less pid-gone exit. On ANY exit,
   immediately run `consort-next` and ACT (resume the next turn, surface the
   author-requests `consort-sync-backlog` decision, or a gate) – NEVER investigate a
   marker-less exit as "reaped mid-plan". The only real failure is `RAISED TO HIL` /
   a `.consort/escalations/` record. Reading `next` + doing the next thing is the whole
   loop; sitting on a marker-less exit is the lag to eliminate.**

2. **Know the per-STORY cadence – a "deploy" mid-feature is NOT a feature ship.** Each
   gate-approved story is built in its OWN experiment branch and taken all the way to
   ACCEPT before the next story is even designed: design -> spec gate -> RED/GREEN ->
   review/refactor -> **per-story DEPLOY** (the Release Engineer verifies THAT STORY's
   experiment branch is working software – reachable + `verify.passed`; the teeth that
   gate acceptance) -> **per-story ACCEPT gate** (the PO merges the experiment into the
   feature branch). This repeats for S1, then S2, ... So the Release Engineer / a
   `deploy` firing while other stories are still "designing" is the CURRENT story's
   working-software check on its experiment branch – NOT a ship of the whole feature,
   and nothing incomplete is shipping. The FEATURE-level deploy + promote happen ONLY
   after EVERY story is accepted. Do NOT alarm at "deploy" with sibling stories unbuilt;
   read `consort-next` for the scope (it names the story) and report the per-story
   accept decision, not a phantom feature ship. **At the per-story ACCEPT gate, OFFER
   the human to SEE the working software before they decide – do not make them accept on
   trust.** The story's experiment branch is checked out + already deployed/verified, so
   `./scripts/run-dev.sh` serves the REAL app on its paired Lakebase branch: for a UI
   product, start it and give them the client URL to click through THIS story's behavior;
   for a backend/service, give them the endpoint(s) + a ready `curl`/Postman example that
   exercises this story's ACs. Let them try it, then present accept / discard / revise,
   and stop the dev server once they're done. (`run-dev.sh` picks the port – backend
   8200/8000/8080, client 5200 – and reads the experiment branch's `DATABASE_URL`.)
   **Also offer to GENERATE SEED DATA so the review isn't an empty app.** `run-dev.sh`
   auto-runs a seed hook on start (`scripts/seed_dev.py` by default; `SEED=0` skips; the
   script OWNS its idempotency – it no-ops when data already exists). If no seed script
   exists (or they want richer sample data), generate a `scripts/seed_dev.py` that inserts
   a handful of representative rows for THIS story's tables (idempotent), so the working
   software shows meaningful data when they click through / hit the API.

2. **At a HITL stop, present the decision, not the mechanics.** Show the `next`
   option titles + their `hil_prompt`(s) VERBATIM and enact the one chosen. The
   `hil_prompt` is authoritative and already states exactly what approving does
   (e.g. a `/design` run's spec gate says the design lane continues and NO build
   starts); relay it as written. Do not paraphrase it or append your own account
   of what happens after approval (whether a build begins, which stories design
   next): that is how a design-only gate ends up ambiguously promising a build.
   Do not narrate the CLIs you ran, the state you read, or how the tooling performed.

3. **Report outcomes, not process.** "S2 accepted." "F1 shipped to staging."
   "Blocked: <reason>; clear it with <action>." Not per-command play-by-play and
   not commentary on the tooling.

4. **Show working software at the acceptance and deploy gates.** At the gates the
   PO signs off on, present the demonstrable behavior (the reachable endpoint /
   screen / passing acceptance check), not an internal artifact or state dump.

5. **Handle blockers, then continue.** On an escalation or error, apply the
   resolver that `next` (or the escalation) names, or state the single human
   action needed, then resume. Do not turn a blocker into a narrated
   investigation. On a **raise-to-HIL escalation**, run **`./scripts/lk
   consort-diagnose`** – it ANALYZES the failure (class + real reason/assertion +
   a suggested remediation) and bundles the forensics into `.consort/diagnostics/<ts>/`
   (the content telemetry never carries). Then: (1) **TROUBLESHOOT** – attempt the
   suggested remediation, and (2) **ASK the human whether to share the failure
   condition with the maintainers** (this is their call – the bundle is local
   content; if they consent, attach it to a consort issue). Once the root cause is
   fixed, clear the halt with **`./scripts/lk consort-resolve-escalation`** (it
   stamps `resolved_at` and KEEPS the record – never `rm` the escalation file) and
   re-run so the driver retries the failed action fresh.

6. **Only the human's DECISIONS go to the human.** Spec/plan/test-list/deploy/
   promote gates and per-story acceptance are theirs to decide. Everything else
   (routing, role turns, retries, migrations, waits) is yours to carry out WITHOUT
   pausing for input – but not without telling them: keep the progress relay
   (rule 1) running so they always see which phase/role is active. Carry it out
   autonomously, not secretly.

## What NOT to relay (the play-by-play line)

The relay is phase/role/gate transitions in plain language – the story of the run.
It is NOT: the exact CLIs you invoked, state you read, retry mechanics, or
tooling commentary. That finding-hunting, every-command play-by-play is EXPLICIT
opt-in (`LAKEBASE_CONSORT_VERBOSE_AGENT=1`, or when the human asks for it), for
debugging the kit itself – not the normal consumer path. Default = live
phase/role/gate relay (rule 1) + decisions at gates; never silence, never
per-command noise.

**One exception – the `[consort]` telemetry notice is NOT tooling noise; surface it.**
On the first run, `consort-drive` prints a one-time `[consort] … usage telemetry is on …`
notice to stderr. That is a **disclosure** (what's collected + how to opt out + the
Level-2 opt-in that helps the maintainers), and in an agent-driven run the human only
sees it if you relay it. Surface that `[consort]` notice to the human verbatim, once ,
do NOT filter it as tooling. It fires only once (state is persisted), so it is not noise.
