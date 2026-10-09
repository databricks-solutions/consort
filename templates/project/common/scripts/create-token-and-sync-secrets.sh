#!/usr/bin/env bash
# Mint the canonical CI credential and sync it (plus DATABRICKS_HOST + LAKEBASE_PROJECT_ID)
# to GitHub repo secrets for CI.
#
# Thin delegator to the ONE helper — `lakebase-sync-ci-secrets` — so the CI-token identity
# (a durable 90-day PAT, comment "GitHub Actions (<repo>)", with a short-lived OAuth fallback
# where PATs are disabled) lives in exactly one place (scm-utils ci-secrets.ts), shared by
# create-project, the repair CLI, the seed rehydrate, this pre-push hook, and the prepare-pr /
# scm-merge expiry preflight. The helper resolves DATABRICKS_HOST + LAKEBASE_PROJECT_ID from
# .env and the target repo from the origin remote, mints the token, sets the three secrets, and
# verifies them (non-zero exit names the gap — the pre-push hook WARNS without blocking).
#
# The pre-push hook calls this on every push. Run it manually before:
#   - `gh pr create` / `gh run rerun` / manual workflow_dispatch triggers
#   - any time `databricks current-user me` starts failing in CI logs
#
# Prereq: run `databricks auth login` first. LAKEBASE_PROJECT_ID must be set (e.g. in .env).
# Usage: ./scripts/create-token-and-sync-secrets.sh
set -e
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || true
cd "${REPO_ROOT:-.}"
exec ./scripts/lk lakebase-sync-ci-secrets "$@"
