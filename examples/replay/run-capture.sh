#!/usr/bin/env bash
# FULL LIVE CAPTURE , real design AND real build, recording every state-machine
# turn, PAUSED just before the Navigator (build) handoff.
#
# Unlike run-to-navigator (which REPLAYS the design lane), this runs the design
# lane LIVE (real Spec Author / Architect / Test Strategist / UX Designer / PO,
# gates approved headless by the Human Proxy) so a FRESH design corpus is
# produced, then pauses at the build handoff for review/comparison against the
# recorded replay corpus. Answer Y (write to LAKEBASE_CONSORT_GATE_ANSWER_FILE) to
# RESUME the SAME run into the live build , one process, so the turn recorder +
# logs span design and build CONTINUOUSLY (as if there were no pause).
#
# Recording: set LAKEBASE_CONSORT_RECORD_DIR to a PERSISTENT path (NOT under the
# scaffolded project dir, which is cleaned up). The recorder writes
#   <RECORD_DIR>/turns/<NNNN>-<label>/   per-turn manifest + .tdd/code delta
#   <RECORD_DIR>/turns/index.json        the ordered timeline of every turn
#   <RECORD_DIR>/recorded-artifacts/     cumulative .tdd mirror (design corpus)
#   <RECORD_DIR>/recorded-build/         per-turn code corpus (build corpus)
#
# Pausing/holding: set LAKEBASE_CONSORT_GATE_ANSWER_FILE to a control file. Leave it
# ABSENT to HOLD at the navigator gate; write Y to it to RESUME into the build.
#
# Usage:
#   LAKEBASE_CONSORT_RECORD_DIR=<dir> LAKEBASE_CONSORT_GATE_ANSWER_FILE=<file> \
#     run-capture.sh --tiers 2 [--kit-ref <ref>] [--project-name <n>]
#                    [--project-dir <dir>] [--feature <id>] [--corpus <dir>]
# Env: DATABRICKS_HOST, GITHUB_OWNER, a CLI profile (same as run-smoke.sh).
# Exit: 0 ok (resumed past the gate to completion); 1 scaffold failed; 2 a step failed.

SMOKE_NAME="run-capture"
PAUSE_BEFORE="navigator"
REPLAY_BUILD="0"   # build runs LIVE (we are capturing it)
REPLAY_DESIGN="0"  # design runs LIVE (we are capturing it)
# Models: kit DEFAULTS for the live capture (each role's recommended model),
# backed by the deterministic gates + honest-GREEN. Set AGENT_MODELS (space-
# separated role=model pairs) to override for a perf experiment; empty = defaults.
export AGENT_MODELS="${AGENT_MODELS:-}"
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_replay-smoke.sh"
replay_smoke "$@"
