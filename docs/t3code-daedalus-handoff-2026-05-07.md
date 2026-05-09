# t3code Daedalus app-server adapter handoff

You are taking over work on the **t3code Daedalus app-server adapter Codex-parity effort**.

## Mission

Continue from the current state and finish the Daedalus happy-path smoke for t3code, while keeping the machine safe.

The project is replacing t3code’s old Daedalus RPC adapter with a **Daedalus app-server-backed adapter**, targeting **Codex-level parity**.

The intended architecture is:

```text
t3code UI
  → t3code Daedalus provider driver
  → thin Daedalus adapter
  → DaedalusSessionRuntime
  → managed daedalus-app-server process/client
  → Daedalus app-server v1 protocol
  → Daedalus owns auth, sessions, transcript, approvals, tools, checkpoints, rollback, text generation
```

t3code should only own provider routing, chat UI, and rendering.

## Absolute safety rule: process/browser discipline

The previous run caused many stray t3code, Bun, Node, Vite, Turbo, and Daedalus app-server processes, contributing to OOM. Do **not** repeat that.

You must obey these rules:

1. Use **exactly one t3code dev process** at a time.
2. Use **exactly one Daedalus app-server process tree** at a time.
   - It may be spawned by t3code.
   - If t3code restarts, verify old app-server children are gone before continuing.
3. Use **exactly one headed gstack browser instance** for all browser testing.
4. Open/test t3code **only in the headed gstack browser**.
5. Do not open multiple headless/browser tabs unless unavoidable. Prefer one tab.
6. Before every t3code restart:
   - stop the existing t3code process
   - kill any remaining managed `daedalus-app-server` process
   - verify with `pgrep`
7. After every browser smoke attempt:
   - verify no extra t3code/app-server processes remain
   - clean temporary logs/pids you created
8. Do not run repeated `bun run dev` loops. If a restart is needed, do it serially and verify cleanup first.
9. Prefer focused unit/integration tests before browser tests.
10. Browser smoke must be bounded and deliberate. No runaway waits.

Suggested process check command:

```bash
pgrep -af 'gui-inspiration/t3code|t3:dev|dev-runner|app-server/src/server/main|daedalus-app-server|vite.*t3|turbo.*dev' || true
```

Suggested cleanup before a restart:

```bash
# Stop known t3code dev process if you started one and recorded its pid.
[ -f /tmp/t3code-single-dev.pid ] && kill "$(cat /tmp/t3code-single-dev.pid)" 2>/dev/null || true

# Kill any leftover Daedalus app-server spawned by t3code.
pkill -f '/home/likas/Research/Daedalus/.daedalus/worktrees/t3code-daedalus-appserver-codex-parity/packages/app-server/src/server/main.ts' || true

sleep 2

pgrep -af 'gui-inspiration/t3code|t3:dev|dev-runner|app-server/src/server/main|daedalus-app-server|vite.*t3|turbo.*dev' || true
```

Use a single log/pid path if you start t3code:

```bash
cd /home/likas/Research/gui-inspiration/t3code
bun run dev > /tmp/t3code-single-dev.log 2>&1 &
echo $! > /tmp/t3code-single-dev.pid
```

At the end, clean only your own temp pid/log files:

```bash
rm -f /tmp/t3code-single-dev.pid /tmp/t3code-single-dev.log
```

## Browser rule

Use gstack headed browser only.

Do not use ad hoc browser instances. Do not spawn multiple gstack sessions.

Use the `browse` skill if available. Then launch/control the single headed browser. Keep it as the only UI surface for t3code testing.

The t3code page should be opened only there.

## Repos and branches

### Daedalus

Repo:

```text
/home/likas/Research/Daedalus
```

Implementation worktree:

```text
/home/likas/Research/Daedalus/.daedalus/worktrees/t3code-daedalus-appserver-codex-parity
```

Branch:

```text
t3code-daedalus-appserver-codex-parity
```

Latest relevant commit:

```text
e089ef204 fix(app-server): report v1 provider auth snapshot
```

### t3code

Repo:

```text
/home/likas/Research/gui-inspiration/t3code
```

Branch:

```text
daedalus-adapter-phase-1
```

Latest relevant commits:

```text
defe8d45 fix daedalus stale thread retry
b641759b fix: send valid Daedalus replay and cancel requests
24e2b261 fix: validate Daedalus resume cursors
f121f2db fix(qa): QA-007 — return Daedalus turn start promptly
9b6b4b10 fix(qa): QA-005 — create Daedalus threads in registered project
3f95fad6 fix(qa): QA-004 — send valid v1 thread create params
c184898e fix(qa): QA-002 — align Daedalus app-server request protocol
0c9c32d7 fix(qa): QA-001 — launch Daedalus app-server provider
```

## Current dirty state

Before editing, inspect this:

```bash
git -C /home/likas/Research/gui-inspiration/t3code status --short
git -C /home/likas/Research/Daedalus/.daedalus/worktrees/t3code-daedalus-appserver-codex-parity status --short
```

Known current t3code dirty state at handoff:

```text
 M apps/server/src/provider/Layers/DaedalusProvider.test.ts
 M apps/server/src/provider/Layers/DaedalusProvider.ts
?? apps/server/.daedalus/
```

Important:

- `apps/server/.daedalus/` is local runtime state from smoke testing.
- Do **not** commit `apps/server/.daedalus/`.
- Re-read modified files before changing them because they were externally modified.

## What is already done

### Daedalus app-server uses the same auth as CLI

This was verified.

CLI works:

```bash
daedalus --provider openai --list-models
```

It listed OpenAI Codex models.

Daedalus auth/model state is from:

```text
~/.daedalus/agent/auth.json
~/.daedalus/agent/models.json
```

Daedalus app-server now uses the same agent dir by default via `getAgentDir()`.

A direct app-server `provider.snapshot` WebSocket probe returned:

```text
status: ready
auth: openai-codex authenticated
models: openai-codex/gpt-5.1, gpt-5.2, gpt-5.5, etc.
```

So Daedalus app-server auth is **not** the blocker anymore.

### Daedalus fix committed

Commit:

```text
e089ef204 fix(app-server): report v1 provider auth snapshot
```

This replaced the loose v1 provider snapshot response with the real protocol shape from:

```text
packages/app-server-protocol/src/v1/provider.ts
```

Expected shape:

```ts
{
  status: "ready" | "auth-needed" | "degraded" | "failed" | "starting",
  server: {
    name: string,
    version: string,
    protocolVersion: string,
  },
  capabilities: {
    streamingChat: boolean,
    cancellation: boolean,
    approvals: boolean,
    structuredUserInput: boolean,
    toolTimeline: boolean,
    payloadWindows: boolean,
    diffs: boolean,
    checkpoints: boolean,
    rollback: boolean,
    resume: boolean,
    modelSwitching: boolean,
    textGeneration: boolean,
    terminals: boolean,
  },
  models: Array<{
    slug: string,
    provider: string,
    id: string,
    name: string,
    available: boolean,
    reasoning?: boolean,
    fastMode?: boolean,
    reasoningLevels?: string[],
  }>,
  auth: Array<{
    provider: string,
    status: "authenticated" | "unauthenticated" | "unknown",
    message?: string,
  }>,
  commands: Array<...>,
  message?: string,
}
```

### t3code stale-session fixes committed

Commits:

```text
24e2b261 fix: validate Daedalus resume cursors
b641759b fix: send valid Daedalus replay and cancel requests
defe8d45 fix daedalus stale thread retry
```

These fixed:

- stale Daedalus resume cursor validation
- invalid v1 `thread.replay` params missing `limit`
- invalid `turn.cancel` without required `turnId`
- retrying `turn.start` after stale provider thread/session id

## Current blocker

The current blocker appears to be **t3code provider discovery/status**, not Daedalus auth.

Even though Daedalus app-server returns:

```text
status: ready
openai-codex authenticated
models available
```

the t3code UI can still show:

```text
No Daedalus model providers are authenticated.
```

Likely cause:

```text
apps/server/src/provider/Layers/DaedalusProvider.ts
```

still has stale/stub discovery behavior and is not consuming real app-server `provider.snapshot` in production discovery.

There are already uncommitted modifications in:

```text
apps/server/src/provider/Layers/DaedalusProvider.ts
apps/server/src/provider/Layers/DaedalusProvider.test.ts
```

Re-read and inspect those before acting.

## Next implementation task

Fix t3code Daedalus provider discovery so it uses real Daedalus app-server `provider.snapshot`.

### Target behavior

`t3code` provider status should reflect Daedalus app-server snapshot:

- status ready when app-server says ready
- auth authenticated when `openai-codex` is authenticated
- models from snapshot shown as Daedalus models
- capabilities from snapshot mapped to t3code provider capability fields where applicable
- discovery process must close managed app-server after probing if it starts one

### Important files

t3code:

```text
apps/server/src/provider/Layers/DaedalusProvider.ts
apps/server/src/provider/Layers/DaedalusProvider.test.ts
apps/server/src/provider/Layers/DaedalusAppServerProcess.ts
apps/server/src/provider/Layers/DaedalusDiscovery.ts
apps/server/src/provider/Layers/DaedalusSessionRuntime.ts
apps/server/src/provider/Layers/DaedalusAdapter.ts
apps/server/src/provider/Drivers/DaedalusDriver.ts
packages/contracts/src/settings.ts
```

Daedalus:

```text
packages/app-server/src/server/router.ts
packages/app-server-protocol/src/v1/provider.ts
packages/app-server-protocol/src/v1/envelope.ts
```

## Tests to run before browser smoke

Use focused tests first. Do **not** start browser/t3code until these pass.

Suggested t3code tests:

```bash
cd /home/likas/Research/gui-inspiration/t3code

bun test \
  apps/server/src/provider/Layers/DaedalusProvider.test.ts \
  apps/server/src/provider/Layers/DaedalusSessionRuntime.test.ts \
  apps/server/src/provider/Layers/DaedalusAdapter.test.ts \
  apps/server/src/provider/Layers/DaedalusAppServerProcess.test.ts \
  apps/server/src/textGeneration/DaedalusTextGeneration.test.ts
```

Suggested Daedalus checks if Daedalus is touched:

```bash
cd /home/likas/Research/Daedalus/.daedalus/worktrees/t3code-daedalus-appserver-codex-parity

bun run --filter @daedalus-pi/app-server check
bun test \
  packages/app-server/src/server/app-server.test.ts \
  packages/app-server/src/server/thread-v1-routes.test.ts \
  packages/app-server-protocol/src/v1/protocol-v1.test.ts \
  packages/app-server/src/runtime/session-controller.test.ts
```

## Browser smoke to run after provider discovery is fixed

Only after focused tests pass.

Use one t3code dev process and one headed gstack browser.

### Start t3code once

```bash
cd /home/likas/Research/gui-inspiration/t3code
bun run dev > /tmp/t3code-single-dev.log 2>&1 &
echo $! > /tmp/t3code-single-dev.pid
```

Wait for pairing URL:

```bash
grep -i pairingUrl /tmp/t3code-single-dev.log | tail -1
```

Open that URL in the **single headed gstack browser only**.

### Smoke checklist

Verify in browser:

1. Provider page/status shows Daedalus ready/authenticated, not “No Daedalus model providers are authenticated.”
2. Model picker has Daedalus/OpenAI Codex model.
3. Fresh prompt:
   ```text
   Reply with OK only.
   ```
   produces visible assistant response.
4. No stuck `Sending`.
5. Turn ack is immediate.
6. Streaming/final assistant event renders.
7. Approval request renders and approve/deny roundtrip works.
8. Cancel/interrupt works on a long-running turn.
9. Reload/reconnect replays thread.
10. Rollback/checkpoint/diff flow works.
11. Text generation endpoints work:
    - thread title
    - branch name
    - commit message
    - PR content

If full approval/rollback is too large for one safe browser run, stop after prompt/stream/cancel/replay and report remaining items. Do not loop indefinitely.

## QA report

Existing QA report:

```text
/home/likas/Research/gui-inspiration/t3code/.gstack/qa-reports/qa-report-t3code-localhost-2026-05-07.md
```

Baseline:

```text
/home/likas/Research/gui-inspiration/t3code/.gstack/qa-reports/baseline.json
```

Screenshots directory:

```text
/home/likas/Research/gui-inspiration/t3code/.gstack/qa-reports/screenshots/
```

Update the QA report only after actual evidence.

## Known prior errors fixed or encountered

Fixed:

```text
Message is not a valid app-server request or notification
Unsafe worktree target: Unknown project: ...
options.sessionManager.setWorkspaceIdentity is not a function
turn.start blocked instead of returning immediate ack
Unknown session: session-...
thread.replay missing required limit
turn.cancel sent without required turnId
```

Current suspected issue:

```text
t3code provider status/discovery still does not consume real app-server provider.snapshot
```

## Do not do

- Do not reintroduce RPC fallback.
- Do not import Daedalus app-server internals into t3code runtime.
- Do not commit `apps/server/.daedalus/`.
- Do not run many t3code dev processes.
- Do not run many app-server processes.
- Do not use multiple browsers.
- Do not continue browser loops if the system starts accumulating processes.
- Do not claim full parity until the browser smoke proves it.

## Expected next summary

At completion, report:

1. What changed.
2. Commits created.
3. Tests run and results.
4. Browser smoke evidence.
5. Process cleanup evidence:
   ```bash
   pgrep -af 'gui-inspiration/t3code|t3:dev|dev-runner|app-server/src/server/main|daedalus-app-server|vite.*t3|turbo.*dev' || true
   ```
6. Remaining parity gaps, if any.
