#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

bun run check:gui
bun --cwd=packages/gui test --conditions browser src/client/no-visible-noop.test.ts src/client/capability-registry.test.ts src/client/command-registry.test.ts src/app.test.ts
bun --cwd=packages/app-server-protocol test
bun --cwd=packages/app-server-client test
bun --cwd=packages/app-server test src/server/parity-gate.test.ts src/server/session-routes.test.ts
bun run test:gui:e2e
