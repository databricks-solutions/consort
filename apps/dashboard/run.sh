#!/usr/bin/env bash
# Launch the Consort dashboard against a scaffolded Consort project.
# Usage: ./run.sh /absolute/path/to/project   [PORT=3000] [THEME=dark] [CONSORT_RECORD_DIR=/path]
#   The board boots in dark mode by default (Kevin's palette); THEME=light opts back to light
#   (THEME=dark is still honored). The in-app ☀️/🌙 toggle overrides this per viewer and is
#   remembered in localStorage.
#   CONSORT_RECORD_DIR (or LAKEBASE_CONSORT_RECORD_DIR) points at the drive's record-lane corpus.
#   Set it to show the FULL agent exchange — the prompt sent to each role, plus its reasoning,
#   tools and the HIL↔orchestrator conversation — LIVE as the build runs. Without it, a live board
#   shows the event timeline + current outputs only (those richer streams live only in the record
#   corpus); the in-app banner says so and points at replay mode. Same dir you pass the drive.
set -euo pipefail
DIR="${1:-${CONSORT_PROJECT_DIR:-}}"
if [ -z "$DIR" ]; then
  echo "usage: ./run.sh /absolute/path/to/consort-project" >&2
  exit 2
fi
if [ ! -d "$DIR/.consort" ] && [ ! -d "$DIR/.sftdd" ] && [ ! -d "$DIR/.tdd" ]; then
  echo "warning: $DIR has no .consort/ (or legacy .sftdd/.tdd) — is it a scaffolded Consort project? starting anyway." >&2
fi
export CONSORT_PROJECT_DIR="$DIR"
export PORT="${PORT:-3000}"
export THEME="${THEME:-}" # "dark" boots dark; empty = light default (read by app/layout.tsx)
# Accept either env-var name (recordDir() in lib/consort.ts reads both); normalise to the one name
# so the message below is unambiguous, and say plainly whether the live board will show the exchange.
REC="${CONSORT_RECORD_DIR:-${LAKEBASE_CONSORT_RECORD_DIR:-}}"
export CONSORT_RECORD_DIR="$REC"
echo "Watching: $CONSORT_PROJECT_DIR"
echo "Dashboard: http://localhost:$PORT${THEME:+ (theme: $THEME)}"
if [ -n "$REC" ]; then
  # The corpus may not exist yet at launch — the drive writes it as the first turn lands, and the
  # board's capabilities light up then. So confirm the wiring rather than asserting the dir exists.
  echo "Live exchange: ON — companion recording at $REC (prompts, reasoning, tools & HIL conversation appear as turns are captured)"
else
  echo "Live exchange: event timeline only — set CONSORT_RECORD_DIR=/path (the drive's record-lane dir) to show prompts, reasoning & tools live, or open the recorded corpus in replay mode"
fi
exec npm run dev
