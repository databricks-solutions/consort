#!/usr/bin/env bash
# Build .tmp/schema-diff.md describing what this branch changes versus
# production.
#
# Substrate-only: delegates the actual diff to `lakebase-schema-diff
# --format markdown` (TS), which queries Lakebase branches directly via
# information_schema (no pg_dump dependency) and emits the canonical
# "SCHEMA CHANGES (Lakebase diff)" block. The shell keeps just the
# orchestration around it: detect git branch, write the "Migrations
# applied" header (read from the repo's Flyway / alembic / knex source
# files), append the diff block, output the file.
#
# Usage: ./scripts/prepare-schema-diff.sh [branch-name]
#   Argument defaults to the current git branch.
set -euo pipefail

WORK_TREE="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "$WORK_TREE" ]; then
  echo "prepare-schema-diff: run from a git repo." >&2
  exit 1
fi
cd "$WORK_TREE"

# This script runs synchronously inside the prepare-commit-msg hook, so it must
# NEVER block a commit. Two guards:
#   1. LK_NO_INSTALL: a cold kit cache must not trigger an `npm install` on
#      commit (that was the ~70s stall). The `lk` shim skips the install and
#      exits 97; we treat that like any other "diff unavailable".
#   2. A hard timeout on the diff itself, so an unreachable/slow Lakebase can't
#      hang the commit. Override seconds via LAKEBASE_SCHEMA_DIFF_TIMEOUT.
export LK_NO_INSTALL=1
DIFF_TIMEOUT="${LAKEBASE_SCHEMA_DIFF_TIMEOUT:-10}"

# Portable hard timeout: prefer timeout(1)/gtimeout (Linux/coreutils); else a
# bash watchdog that TERMs (then KILLs) the command after $1 seconds. Stdout/
# stderr redirections applied to the call propagate to the backgrounded child.
run_with_timeout() {
  local secs="$1"; shift
  if command -v timeout >/dev/null 2>&1; then timeout "$secs" "$@"; return $?; fi
  if command -v gtimeout >/dev/null 2>&1; then gtimeout "$secs" "$@"; return $?; fi
  "$@" &
  local cmd_pid=$!
  ( sleep "$secs"; kill -TERM "$cmd_pid" 2>/dev/null; sleep 2; kill -KILL "$cmd_pid" 2>/dev/null ) >/dev/null 2>&1 &
  local wd_pid=$!
  local code=0
  wait "$cmd_pid" 2>/dev/null || code=$?
  kill -TERM "$wd_pid" 2>/dev/null || true
  wait "$wd_pid" 2>/dev/null || true
  return $code
}

if [ ! -f .env ]; then
  echo "prepare-schema-diff: .env not found. Copy .env.example to .env and set LAKEBASE_PROJECT_ID." >&2
  exit 1
fi
set -a
# shellcheck source=/dev/null
source .env 2>/dev/null || true
set +a

PROJ_ID="${LAKEBASE_PROJECT_ID:-}"
if [ -z "$PROJ_ID" ]; then
  echo "prepare-schema-diff: set LAKEBASE_PROJECT_ID in .env." >&2
  exit 1
fi

# Resolve the schema-diff bin.
BIN="$WORK_TREE/node_modules/.bin/lakebase-schema-diff"
if [ ! -x "$BIN" ]; then
  ALT="$WORK_TREE/node_modules/@databricks-solutions/lakebase-scm-utils/dist/scripts/lakebase/schema-diff.cli.js"
  if [ -f "$ALT" ]; then
    BIN="node $ALT"
  elif [ -x "$WORK_TREE/scripts/lk" ]; then
    # lk resolver shim , the npm-install-free path the scaffold uses post-npx-kill.
    # CI checks out the project (scripts/lk + .lakebase/kit-ref) but does not
    # npm-install the kit, so this is the path that fires there.
    BIN="$WORK_TREE/scripts/lk lakebase-schema-diff"
  else
    echo "prepare-schema-diff: lakebase-scm-utils not resolvable (no node_modules, dist, or scripts/lk shim)." >&2
    exit 1
  fi
fi

BRANCH="${1:-$(git branch --show-current 2>/dev/null)}"
BRANCH="${BRANCH:-current-branch}"
BRANCH_LABEL="$(echo "$BRANCH" | tr '/' '-')"

mkdir -p .tmp
MD=".tmp/schema-diff.md"

# Header + migrations table (read from on-disk migration files; no
# Lakebase calls needed).
{
  echo "## Schema (Lakebase branch \`${BRANCH_LABEL}\`)"
  echo ""
  echo "### Migrations applied on this branch (CI)"
  echo "| Version | Migration |"
  echo "|---------|-----------|"
} > "$MD"

if [ -d src/main/resources/db/migration ]; then
  # Flyway / Java
  for f in src/main/resources/db/migration/V*.sql; do
    [ -f "$f" ] || continue
    base="$(basename "$f")"
    ver="$(echo "$base" | sed -n 's/^V\([0-9.]*\)__.*/\1/p')"
    desc="$(echo "$base" | sed -n 's/^V[0-9.]*__\(.*\)\.sql$/\1/p' | tr '_' ' ')"
    [ -n "$ver" ] && echo "| V$ver | $desc |" >> "$MD"
  done
elif [ -n "$(find . -maxdepth 1 \( -name '*.sln' -o -name '*.slnx' -o -name '*.csproj' \) -print -quit 2>/dev/null)" ] \
    && [ -x "$WORK_TREE/scripts/lk" ]; then
  # .NET (EF Core or Flyway): the kit's canonical discovery picks the tool + files.
  "$WORK_TREE/scripts/lk" lakebase-schema-migrate list 2>/dev/null \
    | jq -r '.[] | if .tool == "flyway" then "| V\(.version) | \(.description) |" else "| \(.version) | \(.description) (EF Core) |" end' >> "$MD" || true
elif [ -d alembic/versions ]; then
  # Alembic / Python
  for f in alembic/versions/*.py; do
    [ -f "$f" ] || continue
    base="$(basename "$f")"
    echo "| ${base%.py} | (alembic) |" >> "$MD"
  done
elif [ -d migrations ] && [ -n "$(ls migrations/*.js migrations/*.ts 2>/dev/null || true)" ]; then
  # knex / Node
  for f in migrations/*.js migrations/*.ts; do
    [ -f "$f" ] || continue
    base="$(basename "$f")"
    echo "| ${base%.*} | (knex) |" >> "$MD"
  done
fi
echo "" >> "$MD"

# Schema diff via the TS substrate. --against tells it to diff against
# the project's default leaf explicitly so the comparison is "vs
# production" regardless of what the branch was forked from.
echo "### Schema diff: \`${BRANCH_LABEL}\` vs production" >> "$MD"
echo "" >> "$MD"
if ! run_with_timeout "$DIFF_TIMEOUT" $BIN --instance "$PROJ_ID" --branch "$BRANCH" --format markdown >> "$MD" 2>>"$MD.err"; then
  {
    echo ""
    echo "Schema diff could not be computed (commit is not blocked):"
    if [ -s "$MD.err" ]; then
      sed 's/^/  > /' "$MD.err"
    fi
  } >> "$MD"
fi
rm -f "$MD.err"

echo "Wrote $MD"
echo "---"
cat "$MD"
