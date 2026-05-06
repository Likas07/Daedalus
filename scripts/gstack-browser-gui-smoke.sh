#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GUI_PACKAGE_DIR="$ROOT/packages/gui"
ARTIFACT_DIR="${DAEDALUS_GUI_SMOKE_ARTIFACT_DIR:-$ROOT/.daedalus/gui-gstack-browser-smoke}"
PROJECT_DIR="${DAEDALUS_GUI_SMOKE_PROJECT:-$ROOT}"
HOST="${DAEDALUS_GUI_SMOKE_HOST:-127.0.0.1}"
PORT="${DAEDALUS_GUI_SMOKE_PORT:-$((47000 + RANDOM % 1000))}"
URL="http://$HOST:$PORT"
LOG_FILE="$ARTIFACT_DIR/daedalus-gui.log"
SCREENSHOT="$ARTIFACT_DIR/gui-smoke.png"
CONSOLE_LOG="$ARTIFACT_DIR/gstack-console.log"
NETWORK_LOG="$ARTIFACT_DIR/gstack-network.log"
SNAPSHOT_LOG="$ARTIFACT_DIR/initial-snapshot.txt"
SERVER_PID=""

GSTACK_ROOT="$HOME/.daedalus/agent/skills/gstack"
if [[ -d "$ROOT/.daedalus/skills/gstack" ]]; then
	GSTACK_ROOT="$ROOT/.daedalus/skills/gstack"
fi
B="$GSTACK_ROOT/browse/dist/browse"

mkdir -p "$ARTIFACT_DIR"
cleanup() {
	if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
		kill "$SERVER_PID" 2>/dev/null || true
		wait "$SERVER_PID" 2>/dev/null || true
	fi
}
trap cleanup EXIT

if [[ ! -x "$B" ]]; then
	echo "gstack browse is required. Expected executable at: $B" >&2
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
curl -fsS "$URL/.well-known/t3/environment" >/dev/null
curl -fsS "$URL/api/auth/session" >/dev/null
"$B" console --clear >/dev/null 2>&1 || true
"$B" network --clear >/dev/null 2>&1 || true

"$B" goto "$URL"
"$B" wait --load || true
"$B" snapshot -c >"$SNAPSHOT_LOG"
"$B" screenshot "$SCREENSHOT" || true
"$B" console --errors >"$CONSOLE_LOG" || true
"$B" network >"$NETWORK_LOG" || true

if grep -Ei "(uncaught|unhandled|unexpected token|syntaxerror|typeerror|referenceerror)" "$CONSOLE_LOG" >/dev/null 2>&1; then
	echo "gstack browser smoke captured console errors; see $CONSOLE_LOG" >&2
	exit 1
fi

if grep -E "\b(4[0-9][0-9]|5[0-9][0-9])\b" "$NETWORK_LOG" >/dev/null 2>&1; then
	echo "gstack browser smoke captured failed network requests; see $NETWORK_LOG" >&2
	exit 1
fi

if grep -F "Something went wrong" "$SNAPSHOT_LOG" >/dev/null 2>&1; then
	echo "gstack browser smoke rendered the error boundary; see $SNAPSHOT_LOG" >&2
	exit 1
fi

if ! grep -E "(Daedalus|T3 CODE|composer|New Thread|Projects|Threads)" "$SNAPSHOT_LOG" >/dev/null 2>&1; then
	echo "gstack browser smoke did not find expected GUI shell text; see $SNAPSHOT_LOG" >&2
	exit 1
fi

echo "gstack browser GUI smoke artifacts: $ARTIFACT_DIR"
