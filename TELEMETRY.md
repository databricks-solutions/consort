# Consort telemetry

Consort emits **pseudonymous** usage telemetry to help maintainers understand how
the deterministic orchestrator (`consort-drive`) is used in practice — which
commands run, how many gates a run traverses, and how runs end. This document is
the contract: what is collected, what is **not**, and how to turn it off.

This is **Level 1**: `consort-drive` only, one trace per run, resource + span
attributes drawn from a **closed allowlist**. No free-form data is ever collected.

## Pseudonymous, not anonymous

Each install gets a random **UUIDv4 `install_id`** (created once, stored under
`~/.config/consort/telemetry.json`). It lets maintainers count distinct installs
and correlate a single install's runs over time. It is **pseudonymous**: the id
is a random token that carries nothing about you or your machine, but because it
is stable it is not *anonymous*. Delete the config file to reset your identity.

**No PII, ever.** The emitter ships only the fields on the allowlist below — all
enums, booleans, numbers, or structured identifiers. It never ships file paths,
branch names, spec/feature content, hostnames, usernames, environment values, or
error messages. A build-time reachability test
(`tests/bdd/telemetry-allowlist-reachability.test.ts`) fails CI if any field the
emitter can produce is not on the allowlist, and the emitter drops any
non-allowlisted key at runtime as a second layer of defense.

## Nothing phones home by default

**The endpoint defaults to a local no-op sink.** Even with telemetry "enabled",
nothing leaves your machine until a maintainer arms a real endpoint by setting
**both** `CONSORT_TELEMETRY_ENDPOINT` **and** the privacy sign-off flag
`CONSORT_TELEMETRY_SIGNOFF=1`. With the sign-off unset, `consort-drive` builds the
trace in memory and discards it. This gate exists so the collection code can ship
and be exercised (via the local collector) before any real-endpoint decision.

The sender is a small hand-rolled NDJSON `POST` (no OpenTelemetry SDK). It is
**fire-and-forget**: bounded in-memory queue (cap 200, drop-oldest), one attempt,
~500 ms timeout, all errors swallowed. It never throws into `consort-drive` and
never blocks it. Telemetry can never change CLI behavior, latency, or exit code.

## Consent

Telemetry is emitted for a run **iff all** of these hold:

| Condition | Why |
|---|---|
| `telemetry_enabled === true` (persisted) | Your recorded opt-out choice. Default: on. |
| `stdout` is an interactive TTY | Only real, interactive human runs. |
| Not in CI (`CI` unset / `0` / `false`) | Never in automation. |
| `DO_NOT_TRACK` not in `{1,true}` | The cross-tool opt-out standard. |
| `CONSORT_TELEMETRY !== "0"` | Consort's explicit per-invocation kill. |

Environment overrides **always win**, and they only ever *disable*. There is no
force-enable env var: you can always silence telemetry, but nothing can turn it on
where these conditions do not already agree.

On the first consenting run, `consort-drive` prints a one-time notice to stderr.

## Turning it off

```bash
consort-telemetry disable      # persist the opt-out (~/.config/consort/telemetry.json)
DO_NOT_TRACK=1 consort-drive … # per-invocation, honors the cross-tool standard
CONSORT_TELEMETRY=0 consort-drive …  # per-invocation kill switch
```

Inspect the current state (including your install id and whether a run would emit
right now):

```bash
consort-telemetry status          # human-readable
consort-telemetry status --json   # machine-readable
consort-telemetry enable          # re-enable
```

## What is collected (schema `consort/v1`)

**Resource attributes** (shipped once per trace):

| Field | Type | Notes |
|---|---|---|
| `schema` | string | `"consort/v1"` |
| `install_id` | UUIDv4 | pseudonymous per-install id |
| `consort_version` | string | the kit `package.json` version |
| `node_version` | string | `process.versions.node` |
| `os` | enum | `darwin` \| `linux` \| `win32` \| `other` |
| `arch` | enum | `arm64` \| `x64` \| `other` |
| `shell` | enum | `zsh` \| `bash` \| `fish` \| `powershell` \| `unknown` |
| `ci` | bool | in CI? |
| `tty` | bool | interactive terminal? |
| `level` | number | `1` |

**Root span `consort.run`** (one per `consort-drive` run):
`trace_id`, `span_id`, `name` (`"consort.run"`), `start_ts` / `end_ts` (epoch ms),
`duration_ms`, `command` (`plan` \| `design` \| `build` \| `deploy`; a full
feature run reports `build`), `outcome` (`completed` \| `aborted` \| `error`),
`exit_code` (coarse: `0` completed, `3` aborted/escalation, `1` error),
`gates_total` (child span count).

**Child span `consort.gate`** (one per performed action; the terminal `done`
no-op is not a span): `trace_id`, `parent_span_id`, `span_id`, `name`
(`"consort.gate"`), `gate` (the WorkflowAction kind — see below), `ordinal`,
`start_ts` / `end_ts`, `duration_ms`, `outcome` (`pass` \| `fail` \| `skip` \|
`abort`).

### The `gate` enum (frozen WorkflowAction kinds)

Keyed off the real `WorkflowAction` union in
`consort/orchestrator/workflow/workflow-vocabulary.ts`. Frozen at authoring time —
the reachability test fails the build if this drifts from the source:

```
invoke-role, project-architect-notes, surface-gate, approve-gate, design-complete,
approve-plan-gate, planning-complete, dispatch, cut-experiment, deploy-verify-heal,
await-acceptance, accept, complete, feature-complete, deploy, approve-deploy-gate,
deploy-complete, prepare-pr, wait-ci, approve-promote-gate, merge, raise-to-hil,
revise-route, done
```

## Running the local collector

A thin first-party collector (`tools/telemetry-collector/`) accepts the emitter's
`POST /v1/traces`, appends each span as one NDJSON line, tolerates unknown fields
(returns `202`), and binds `127.0.0.1:4318`.

```bash
npm run collector       # start it (writes ./consort-telemetry.ndjson)

# in another shell, arm the endpoint + drive a synthetic two-action run at it:
CONSORT_TELEMETRY_ENDPOINT=http://127.0.0.1:4318 npm run simulate-run
```

`simulate-run` produces one `consort.run` root + two `consort.gate` children —
three NDJSON lines sharing one trace id.
