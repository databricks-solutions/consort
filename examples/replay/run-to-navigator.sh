#!/usr/bin/env bash
# TDD-workflow smoke , PAUSE just before the Navigator handoff.
#
# Scaffolds a REAL project, stages intake, claims the paired feature branch, and
# REPLAYS the design lane (Spec Author, Architect, Test Strategist, UX Designer,
# PO) from recorded-artifacts/ , then PAUSES the moment the deterministic driver
# reaches the Navigator build handoff: it prompts [Y/n] and WAITS. Answer Y (or
# Enter) to resume the SAME run into the live Navigator/Driver build + deploy; the
# state machine is never abandoned. Use it to review the pristine pre-build state.
#
# Set LAKEBASE_CONSORT_AUTO_CONTINUE=1 to auto-confirm the gate (non-interactive / CI).
#
# Determinism is in code: with no --kit-ref, the kit resolves to this checkout's
# built dist (offline, stable). See _replay-smoke.sh.
#
# Usage:
#   run-to-navigator.sh --tiers 2 [--kit-ref <ref>] [--project-name <n>]
#                       [--project-dir <dir>] [--feature <id>] [--corpus <dir>]
# Env: DATABRICKS_HOST, GITHUB_OWNER, a CLI profile.
# Exit: 0 ok (resumed past the gate to completion); 1 scaffold failed; 2 a step failed.

SMOKE_NAME="run-to-navigator"
PAUSE_BEFORE="navigator"
REPLAY_BUILD="0"
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_replay-smoke.sh"
replay_smoke "$@"
