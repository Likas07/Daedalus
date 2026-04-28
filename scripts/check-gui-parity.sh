#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

REQUIRED_PARITY_TESTS=(
	"packages/app-server/src/server/parity-gate.test.ts"
	"packages/gui/src/client/no-visible-noop.test.ts"
	"packages/gui/src/client/capability-registry.test.ts"
	"packages/gui/src/client/command-registry.test.ts"
	"packages/gui/src/phase4-differentiation.test.ts"
	"packages/gui/test/e2e/web-gui-smoke.test.ts"
	"packages/desktop/test/e2e/desktop-gui-smoke.test.ts"
	"packages/desktop/test/e2e/gui-smoke.test.ts"
	"packages/desktop/test/e2e/preload-smoke.test.ts"
)

for test_file in "${REQUIRED_PARITY_TESTS[@]}"; do
	if [[ ! -f "$test_file" ]]; then
		echo "Missing required GUI parity test: $test_file" >&2
		exit 1
	fi
	if grep -En '\b(describe|test|it)\.(skip|todo)\b|\.(skip|todo)\(' "$test_file"; then
		echo "Required GUI parity test contains skipped or todo tests: $test_file" >&2
		exit 1
	fi
done

if ! grep -q "session/start requires explicit startTarget" packages/desktop/test/e2e/gui-smoke.test.ts; then
	echo "Desktop GUI smoke must verify app-server startTarget validation is not bypassed" >&2
	exit 1
fi

if ! grep -q "worktreeId" packages/desktop/test/e2e/desktop-gui-smoke.test.ts; then
	echo "Desktop GUI smoke must verify project/session/worktree context preservation" >&2
	exit 1
fi

bun run check:gui
bun --cwd=packages/app-server-protocol test
bun --cwd=packages/app-server-client test
bun --cwd=packages/app-server test src/server/parity-gate.test.ts src/server/session-routes.test.ts src/server/app-server.test.ts
STRICT_GUI_FULL_PARITY=1 bun --cwd=packages/app-server test src/server/parity-gate.test.ts
bun --cwd=packages/gui test --conditions browser src/client/no-visible-noop.test.ts src/client/capability-registry.test.ts src/client/command-registry.test.ts src/phase4-differentiation.test.ts src/app.test.ts
bun --cwd=packages/desktop test
bun --cwd=packages/desktop run validate:packaged-runtime
bun run test:gui:e2e
