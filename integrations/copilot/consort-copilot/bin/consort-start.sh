#!/usr/bin/env bash
# consort-start: launch a Consort run with GitHub Copilot executing each role turn.
#
# PROTOTYPE wrapper. The deterministic orchestrator is the Consort Node CLI (`consort-drive`); this
# only selects the Copilot executor and forwards your scope flags. Requires:
#   - the Copilot CLI installed + authenticated (invoked as `gh copilot`, or the standalone `copilot`
#     on PATH; auth via COPILOT_GITHUB_TOKEN / GH_TOKEN / GITHUB_TOKEN),
#   - the Consort kit resolvable (a scaffolded project's ./scripts/lk, or consort-drive on PATH),
#   - the kit's kind:"copilot" executor wired to spawn `gh copilot -p` for role turns.
#
# Usage:
#   consort-start --feature F1-stock-visibility --target local
#   consort-start --sprint sprint-1 --gates proxy
set -euo pipefail

# Resolve the orchestrator: prefer a scaffolded project's shim, else a consort-drive on PATH.
if [ -x "./scripts/lk" ]; then
  DRIVE=(./scripts/lk consort-drive)
elif command -v consort-drive >/dev/null 2>&1; then
  DRIVE=(consort-drive)
else
  echo "consort-start: could not find the Consort orchestrator (./scripts/lk or consort-drive)." >&2
  echo "  Run from a scaffolded Consort project, or install the consort kit so consort-drive resolves." >&2
  exit 1
fi

# The executor backend is NOT set here — it lives in the project's .lakebase/consort-config.json
# (project.executor, set at `lakebase-create-project --executor copilot`); the drive reads it
# deterministically (copilotExecutorSelected / copilotExecutorSpec in executor-dispatch). One door.

# Which Copilot binary the executor spawns. The copilot-runner AUTO-RESOLVES it (order: this override,
# else `ug copilot` when `ug` is on PATH, else standalone `copilot`, else `gh copilot --`). On a
# Databricks-policy machine the GitHub-hosted CLI is blocked and `ug` is present, so the auto-preference
# already routes through Unity Gateway — leave this unset. Set it ONLY to force a specific binary.
export CONSORT_COPILOT_BIN="${CONSORT_COPILOT_BIN:-}"

exec "${DRIVE[@]}" "$@"
