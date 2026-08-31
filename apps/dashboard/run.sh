#!/usr/bin/env bash
# Launch the Consort dashboard against a scaffolded Consort project.
# Usage: ./run.sh /absolute/path/to/project   [PORT=3000] [THEME=dark]
#   THEME=dark boots the board in dark mode (Kevin's palette). Default is light; the in-app
#   ☀️/🌙 toggle overrides this per viewer and is remembered in localStorage.
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
echo "Watching: $CONSORT_PROJECT_DIR"
echo "Dashboard: http://localhost:$PORT${THEME:+ (theme: $THEME)}"
exec npm run dev
