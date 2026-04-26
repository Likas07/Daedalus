# GUI parity implementation roadmap closeout

Status: Phase 1-4 parity plus GUI mock wiring closeout, 2026-04-26.

This document records what the parity roadmap implemented and what remains a product decision. It is a current capability map, not a new implementation plan.

## Implemented surfaces

### Phase 1: core GUI loop

- Quiet workspace shell with project/session navigation, central canvas, inspector, terminal drawer placement, and reconnect/diagnostic affordances.
- Central task composer for project-first session creation and session follow-up where supported by the app-server protocol.
- Renderer view models for sessions, worktrees, provider status placeholders, approvals, display density, and selected-session state.
- Structured transcript timeline with compact event rendering, expandable raw/debug details, approval cards, and session status tones.
- Approval queue surface for pending/risk-labeled requests and response actions through typed client requests.

### Phase 2: development workflow parity

- Worktree panel and rows that summarize branch/path/dirty counts and make isolation visible without making cleanup destructive by default.
- Terminal drawer/tabs/header surfaces for command evidence, elapsed metadata, copy/search/kill-style controls, and session/project association.
- Changes, diff, and Git summary surfaces for changed files, risky-file indicators, read-only review, and follow-up context.
- Settings, command palette, and provider-status UI for discoverable actions and global/project configuration entry points.

### Phase 3: desktop and integration depth

- Desktop bridge/server bootstrap paths with reconnect recovery copy and diagnostics.
- Integration panels for GitHub/issue/PR/CI-style metadata and composer chips.
- Pull request surface that intentionally gates creation/push actions until safe Git mutation policy is defined.
- Diagnostics and recovery UI for app-server connection state, protocol status, and local runtime visibility.

### Phase 4: Daedalus differentiation

- Plan/Build/autonomy-mode panel as a user-facing policy surface rather than raw internal permission settings.
- Orchestration panel and subagent lanes for Daedalus delegation visibility without exposing internal prompts.
- Audit trail projection for queryable session/project evidence across tool, approval, automation, and orchestration events.
- Automation-rules panel with destructive-action confirmation requirements.
- Extension manager/dialog/permission-card surfaces backed by renderer-safe extension metadata and command contributions.

### GUI mock wiring closeout

- The renderer now follows an explicit responsive policy: below 760px the inspector closes, and below 520px both side panes close so ProjectBar, the central session/composer, and TerminalTail remain reachable instead of compressing the desktop three-pane shell.
- Runtime wiring is protocol-first: stable project hydration, replayed app-server events, real coding-agent session control, audited access policy, composer file/command/attachment flows, and PTY/xterm terminal contracts stay behind app-server protocol/client APIs.
- Regression coverage includes fallback-renderer marking, responsive policy checks, command palette/focus behavior, composer popover keyboard handling through component tests, and approval shortcut coverage.

## Protocol and package boundaries

- `@daedalus-pi/app-server-protocol` remains the typed contract boundary for requests, responses, events, workflow messages, diagnostics, integration messages, audit/orchestration projections, and extension UI metadata.
- `@daedalus-pi/app-server-client` owns client request correlation, reconnect replay, and typed helpers for renderer/desktop clients.
- `@daedalus-pi/app-server` owns durable runtime behavior, SQLite event/read-model persistence, session control, workspace services, terminal service, integrations, automation, orchestration, diagnostics, and extension bridge/registry code.
- `@daedalus-pi/gui` is a renderer client. It projects protocol/server data into Svelte components and local transient UI state; it should not import Electron or server implementation details in production code.
- `@daedalus-pi/desktop` owns native shell lifecycle and app-server process/bootstrap integration.

## Known tradeoffs

- Several GUI surfaces are evidence/projection-first and intentionally conservative: Git, PR, extension, and automation views emphasize visibility and confirmation rather than broad mutation.
- Unrestricted is the implemented high-autonomy label: it is audited, auto-approves soft prompts, and does not bypass hard runtime blocks.
- Worktree support is visible and modelled, but the default session-creation policy is not finalized.
- Some integration surfaces are ready for metadata and context chips before full external mutation flows.
- The renderer contains placeholder-safe states where server data or bridge capability is absent, preserving the protocol-first architecture.

## Intentionally deferred product decisions

1. **Autonomy defaults:** Unrestricted is the v1 high-autonomy label and audited semantics; final defaults and rollout copy remain product decisions.
2. **Default worktree policy:** decide whether new build sessions run in the main checkout, prompt for isolation, or auto-create a worktree by default.
3. **Git mutation depth:** choose the v1 boundary for stage/unstage/discard/commit/push/PR actions and the confirmation/audit rules for each.
4. **Extension v1 visibility:** decide how much extension capability, permission, background-task, and command metadata is exposed in the first public GUI release.
5. **Desktop trust bar:** decide whether the desktop shell should show a persistent trust/status bar for project path, app-server connection, sandbox/autonomy mode, and dangerous capability state.
