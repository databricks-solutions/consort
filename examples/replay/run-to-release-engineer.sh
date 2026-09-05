#!/usr/bin/env bash
# TDD-workflow smoke , PAUSE just before the Release Engineer handoff.
#
# Scaffolds a REAL project, stages intake, claims the paired feature branch,
# REPLAYS the design lane AND RESTORES the recorded build (the whole code tree +
# GREEN/reviewed cycles + experiment) from recorded-build/ , so no Navigator or
# Driver runs , then PAUSES the moment the deterministic driver reaches the
# Release Engineer deploy handoff: it prompts [Y/n] and WAITS. Answer Y (or Enter)
# to resume the SAME run into the deploy + verify + the PO acceptance gate; the
# state machine is never abandoned. Use it to review the built, ready-to-ship state.
#
# Set LAKEBASE_CONSORT_AUTO_CONTINUE=1 to auto-confirm the gate (non-interactive / CI).
#
# Determinism is in code: with no --kit-ref, the kit resolves to this checkout's
# built dist (offline, stable). See _replay-smoke.sh.
#
# Usage:
#   run-to-release-engineer.sh --tiers 2 [--kit-ref <ref>] [--project-name <n>]
#                              [--project-dir <dir>] [--feature <id>] [--corpus <dir>]
# Env: DATABRICKS_HOST, GITHUB_OWNER, a CLI profile. Override the build corpus
#      with LAKEBASE_SFTDD_REPLAY_BUILD_DIR.
# Exit: 0 ok (resumed past the gate to completion); 1 scaffold failed; 2 a step failed.

SMOKE_NAME="run-to-release-engineer"
PAUSE_BEFORE="release-engineer"
REPLAY_BUILD="1"
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_replay-smoke.sh"
replay_smoke "$@"
