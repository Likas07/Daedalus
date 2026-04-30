#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACT_DIR="${DAEDALUS_REACT_GUI_SMOKE_ARTIFACT_DIR:-$ROOT/.daedalus/react-gui-agent-browser-smoke}"
PROJECT_DIR="${DAEDALUS_REACT_GUI_SMOKE_PROJECT:-$ROOT}"
HOST="${DAEDALUS_REACT_GUI_SMOKE_HOST:-127.0.0.1}"
PORT="${DAEDALUS_REACT_GUI_SMOKE_PORT:-47339}"
TOKEN="${DAEDALUS_REACT_GUI_SMOKE_TOKEN:-react-gui-smoke-token}"
URL="http://$HOST:$PORT"
DB_PATH="$ARTIFACT_DIR/app.sqlite"
LOG_FILE="$ARTIFACT_DIR/react-gui-app-server.log"
SMOKE_DIST="$ARTIFACT_DIR/react-dist"
SCREENSHOT="$ARTIFACT_DIR/react-gui-smoke.png"
CONSOLE_LOG="$ARTIFACT_DIR/agent-browser-console.log"
SERVER_PID=""

mkdir -p "$ARTIFACT_DIR"
cleanup() {
	if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
		kill "$SERVER_PID" 2>/dev/null || true
		wait "$SERVER_PID" 2>/dev/null || true
	fi
}
trap cleanup EXIT

cd "$ROOT"

bun scripts/check-react-gui-import-boundaries.ts
bun --cwd=packages/react-gui test --conditions browser test/e2e/react-thread-loop-smoke.test.ts
mkdir -p "$SMOKE_DIST"
cat >"$SMOKE_DIST/index.html" <<'HTML'
<!doctype html>
<html lang="en">
<head><meta charset="UTF-8" /><title>Daedalus React GUI Smoke</title></head>
<body><div id="root">Daedalus React GUI smoke</div></body>
</html>
HTML

if ! command -v agent-browser >/dev/null 2>&1; then
	echo "agent-browser is required for the visible React GUI smoke. Install with: npm i -g agent-browser && agent-browser install" >&2
	exit 127
fi

rm -f "$DB_PATH"
DAEDALUS_GUI_DIST_DIR="$SMOKE_DIST" bun --cwd=packages/app-server src/server/main.ts \
	--gui \
	--db "$DB_PATH" \
	--host "$HOST" \
	--port "$PORT" \
	--token "$TOKEN" \
	--project "$PROJECT_DIR" >"$LOG_FILE" 2>&1 &
SERVER_PID=$!

for _ in {1..80}; do
	if curl -fsS "$URL/health" >/dev/null 2>&1; then
		break
	fi
	sleep 0.25
done
curl -fsS "$URL/health" >/dev/null
curl -fsS "$URL/api/gui/bootstrap" >/dev/null

agent-browser open "$URL" --session daedalus-react-gui-smoke
agent-browser snapshot --session daedalus-react-gui-smoke >"$ARTIFACT_DIR/initial-snapshot.txt"
agent-browser screenshot --session daedalus-react-gui-smoke "$SCREENSHOT"
agent-browser console --session daedalus-react-gui-smoke >"$CONSOLE_LOG" || true

if grep -Ei "(uncaught|unhandled|error)" "$CONSOLE_LOG" >/dev/null 2>&1; then
	echo "agent-browser React GUI smoke captured console errors; see $CONSOLE_LOG" >&2
	exit 1
fi

echo "agent-browser React GUI smoke artifacts: $ARTIFACT_DIR"
