#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACT_DIR="${DAEDALUS_REACT_GUI_GSTACK_ARTIFACT_DIR:-$ROOT/.daedalus/t3code-visual-qa}"
HOST="${DAEDALUS_REACT_GUI_GSTACK_HOST:-127.0.0.1}"
PORT="${DAEDALUS_REACT_GUI_GSTACK_PORT:-0}"
DIST_DIR="${DAEDALUS_REACT_GUI_GSTACK_DIST:-$ROOT/packages/react-gui/dist}"
SERVER_STDOUT="$ARTIFACT_DIR/fixture-server.jsonl"
SERVER_LOG="$ARTIFACT_DIR/fixture-server.stderr.log"
SNAPSHOT_TXT="$ARTIFACT_DIR/thread-workspace-snapshot.txt"
FULL_SNAPSHOT_TXT="$ARTIFACT_DIR/thread-workspace-full-snapshot.txt"
ANNOTATED_SCREENSHOT="$ARTIFACT_DIR/thread-workspace-annotated.png"
DESKTOP_SCREENSHOT="$ARTIFACT_DIR/thread-workspace-desktop.png"
RESPONSIVE_PREFIX="$ARTIFACT_DIR/thread-workspace-responsive"
RESPONSIVE_LOG="$ARTIFACT_DIR/responsive.log"
CONSOLE_LOG="$ARTIFACT_DIR/gstack-console.log"
BROWSE_LOG="$ARTIFACT_DIR/gstack-browse.log"
SERVER_PID=""

mkdir -p "$ARTIFACT_DIR"
: >"$BROWSE_LOG"

cleanup() {
	if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
		kill "$SERVER_PID" 2>/dev/null || true
		wait "$SERVER_PID" 2>/dev/null || true
	fi
}
trap cleanup EXIT

resolve_browse() {
	local candidate=""
	for candidate in \
		"${DAEDALUS_GSTACK_BROWSE_BIN:-}" \
		"${GSTACK_BROWSE_BIN:-}" \
		"$ROOT/.daedalus/skills/gstack/browse/dist/browse" \
		"$HOME/.daedalus/agent/skills/gstack/browse/dist/browse"; do
		if [[ -n "$candidate" && -x "$candidate" ]]; then
			printf '%s\n' "$candidate"
			return 0
		fi
	done

	if command -v browse >/dev/null 2>&1; then
		command -v browse
		return 0
	fi

	return 1
}

json_field() {
	local field="$1"
	bun -e 'const data = JSON.parse(await Bun.stdin.text()); const value = data[Bun.argv[1]]; if (value === undefined || value === null) process.exit(1); console.log(String(value));' "$field"
}

BROWSE_BIN="$(resolve_browse || true)"
if [[ -z "$BROWSE_BIN" ]]; then
	echo "gstack browse is required. Expected an executable at .daedalus/skills/gstack/browse/dist/browse or ~/.daedalus/agent/skills/gstack/browse/dist/browse." >&2
	exit 127
fi

if [[ ! -f "$DIST_DIR/index.html" ]]; then
	echo "React GUI dist is missing at $DIST_DIR. Run: bun --cwd=packages/react-gui run build" >&2
	exit 1
fi

cd "$ROOT"
rm -f "$SERVER_STDOUT" "$SERVER_LOG" "$SNAPSHOT_TXT" "$FULL_SNAPSHOT_TXT" "$ANNOTATED_SCREENSHOT" "$DESKTOP_SCREENSHOT" "$CONSOLE_LOG" "$RESPONSIVE_LOG"
rm -f "$RESPONSIVE_PREFIX"-mobile.png "$RESPONSIVE_PREFIX"-tablet.png "$RESPONSIVE_PREFIX"-desktop.png

bun scripts/react-gui-visual-fixture-server.ts \
	--host "$HOST" \
	--port "$PORT" \
	--artifact-dir "$ARTIFACT_DIR" \
	--dist "$DIST_DIR" >"$SERVER_STDOUT" 2>"$SERVER_LOG" &
SERVER_PID=$!

for _ in {1..120}; do
	if [[ -s "$SERVER_STDOUT" ]]; then
		break
	fi
	if ! kill -0 "$SERVER_PID" 2>/dev/null; then
		echo "fixture server exited before printing bootstrap JSON; see $SERVER_LOG" >&2
		cat "$SERVER_LOG" >&2 || true
		exit 1
	fi
	sleep 0.25
done

if [[ ! -s "$SERVER_STDOUT" ]]; then
	echo "timed out waiting for fixture server bootstrap JSON; see $SERVER_LOG" >&2
	exit 1
fi

FIXTURE_JSON="$(head -n 1 "$SERVER_STDOUT")"
HTTP_URL="$(printf '%s' "$FIXTURE_JSON" | json_field httpUrl)"
THREAD_ID="$(printf '%s' "$FIXTURE_JSON" | json_field threadId)"
THREAD_URL="$(printf '%s' "$FIXTURE_JSON" | bun -e 'const data = JSON.parse(await Bun.stdin.text()); console.log(data.threadUrl ?? `${data.httpUrl}/?threadId=${encodeURIComponent(data.threadId)}`);')"

echo "fixture: $THREAD_URL" >>"$BROWSE_LOG"

for _ in {1..80}; do
	if curl -fsS "$HTTP_URL/health" >/dev/null 2>&1; then
		break
	fi
	sleep 0.25
done
curl -fsS "$HTTP_URL/health" >/dev/null
curl -fsS "$HTTP_URL/api/gui/bootstrap" >/dev/null

export CONTAINER="${CONTAINER:-1}"
"$BROWSE_BIN" viewport 1440x1000 >>"$BROWSE_LOG" 2>&1
"$BROWSE_BIN" goto "$THREAD_URL" >>"$BROWSE_LOG" 2>&1
"$BROWSE_BIN" wait "[data-testid='thread-workspace']" >>"$BROWSE_LOG" 2>&1
sleep 1
"$BROWSE_BIN" snapshot >"$FULL_SNAPSHOT_TXT" 2>>"$BROWSE_LOG"
"$BROWSE_BIN" snapshot -i -a -C -o "$ANNOTATED_SCREENSHOT" >"$SNAPSHOT_TXT" 2>>"$BROWSE_LOG"
"$BROWSE_BIN" screenshot "$DESKTOP_SCREENSHOT" >>"$BROWSE_LOG" 2>&1

if "$BROWSE_BIN" --help 2>&1 | grep -q "responsive"; then
	"$BROWSE_BIN" responsive "$RESPONSIVE_PREFIX" >"$RESPONSIVE_LOG" 2>&1
else
	echo "responsive command not supported by $BROWSE_BIN" >"$RESPONSIVE_LOG"
fi

"$BROWSE_BIN" console >"$CONSOLE_LOG" 2>>"$BROWSE_LOG" || true

if grep -Ei "(uncaught|unhandled|TypeError|ReferenceError)" "$CONSOLE_LOG" >/dev/null 2>&1; then
	echo "gstack React GUI visual smoke captured console errors; see $CONSOLE_LOG" >&2
	exit 1
fi

cat <<EOF
GStack React GUI visual smoke passed.
threadId: $THREAD_ID
artifacts: $ARTIFACT_DIR
snapshot: $SNAPSHOT_TXT
full snapshot: $FULL_SNAPSHOT_TXT
annotated: $ANNOTATED_SCREENSHOT
desktop: $DESKTOP_SCREENSHOT
console: $CONSOLE_LOG
EOF
