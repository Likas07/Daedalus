#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GUI_PACKAGE_DIR="$ROOT/packages/gui"
ARTIFACT_DIR="${DAEDALUS_GUI_SMOKE_ARTIFACT_DIR:-$ROOT/.daedalus/gui-agent-browser-smoke}"
PROJECT_DIR="${DAEDALUS_GUI_SMOKE_PROJECT:-$ROOT}"
HOST="${DAEDALUS_GUI_SMOKE_HOST:-127.0.0.1}"
PORT="${DAEDALUS_GUI_SMOKE_PORT:-47329}"
URL="http://$HOST:$PORT"
LOG_FILE="$ARTIFACT_DIR/daedalus-gui.log"
SCREENSHOT="$ARTIFACT_DIR/gui-smoke.png"
CONSOLE_LOG="$ARTIFACT_DIR/agent-browser-console.log"
SERVER_PID=""
SESSION="daedalus-gui-smoke-$$"

mkdir -p "$ARTIFACT_DIR"
cleanup() {
	if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
		kill "$SERVER_PID" 2>/dev/null || true
		wait "$SERVER_PID" 2>/dev/null || true
	fi
}
trap cleanup EXIT

if ! command -v agent-browser >/dev/null 2>&1; then
	echo "agent-browser is required. Install with: npm i -g agent-browser && agent-browser install" >&2
	exit 127
fi

if [[ ! -f "$GUI_PACKAGE_DIR/package.json" ]]; then
	echo "canonical GUI package not found at $GUI_PACKAGE_DIR" >&2
	exit 1
fi

cd "$ROOT"
bun --cwd=packages/coding-agent src/cli.ts gui --host "$HOST" --port "$PORT" --no-open --new-server --project "$PROJECT_DIR" --log-file "$LOG_FILE" >"$ARTIFACT_DIR/daedalus-gui.stdout.log" 2>"$ARTIFACT_DIR/daedalus-gui.stderr.log" &
SERVER_PID=$!

for _ in {1..80}; do
	if curl -fsS "$URL/health" >/dev/null 2>&1; then
		break
	fi
	sleep 0.25
done
curl -fsS "$URL/health" >/dev/null

agent-browser open "$URL" --session "$SESSION"
agent-browser snapshot --session "$SESSION" >"$ARTIFACT_DIR/initial-snapshot.txt"
if ! agent-browser screenshot --session "$SESSION" --output "$SCREENSHOT"; then
	echo "agent-browser screenshot capture failed; continuing after snapshot/console checks" >&2
fi
agent-browser console --session "$SESSION" >"$CONSOLE_LOG" || true

if grep -Ei "(uncaught|unhandled|error)" "$CONSOLE_LOG" >/dev/null 2>&1; then
	echo "agent-browser smoke captured console errors; see $CONSOLE_LOG" >&2
	exit 1
fi

echo "agent-browser GUI smoke artifacts: $ARTIFACT_DIR"
