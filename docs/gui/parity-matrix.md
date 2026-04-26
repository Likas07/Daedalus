# GUI parity matrix

Task 1 strict gates enforce the GUI full-parity contract and the no-visible-no-op policy. Any visible control must be wired to a real app-server/runtime action or render as disabled with a user-facing reason. Required surfaces are release blockers: the full parity gate must fail while any required row is `partial` or `disabled`, lacks behavioral test coverage, uses source-string-only coverage, or is covered only by fixtures. Optional rows may remain `partial` or `disabled` only when the reason is explicit and the UI does not present an active mutation control.

| Surface | Required | Status | Behavioral coverage | Contract / blocker |
| --- | --- | --- | --- | --- |
| Composer | yes | partial | packages/gui/src/components/composer/composer-logic.test.ts; packages/gui/src/components/composer/composer-submit-context.test.ts; packages/gui/src/app.test.ts; packages/gui/test/e2e/web-gui-smoke.test.ts | Must support Enter-to-send, menu selection, attachments, slash/file context, model/mode/access state, and real session/turn submission. Blocker: full context and end-to-end submission coverage are not complete. |
| Project/session | yes | partial | packages/app-server/src/server/session-routes.test.ts; packages/app-server/src/runtime/session-controller.test.ts; packages/gui/src/client/project-dashboard-view-model.test.ts; packages/gui/src/client/session-entry-projection.test.ts; packages/gui/src/app.test.ts | Must expose and persist project/session/thread summaries plus start, select, resume, fork, rename, archive, delete, import/export, and restart hydration. Blocker: full lifecycle parity is not complete. |
| Provider/model/auth | yes | partial | packages/app-server/src/runtime/provider-auth-service.test.ts; packages/app-server/src/runtime/settings-service.test.ts; packages/gui/src/client/settings-view-model.test.ts; packages/gui/src/app.test.ts | Must expose complete provider snapshots, honest auth actions, diagnostics, models, capabilities, and persisted model selection. Blocker: provider/auth/model state is not fully wired and persistent. |
| Terminal | yes | partial | packages/app-server/src/terminal/terminal-service.test.ts; packages/app-server/src/terminal/pty-adapter.test.ts; packages/gui/src/components/terminal/terminal-state.test.ts; packages/gui/src/components/terminal/xterm-manager.test.ts; packages/gui/src/app.test.ts; packages/gui/test/e2e/web-gui-smoke.test.ts; packages/desktop/test/e2e/desktop-gui-smoke.test.ts | Must support canonical terminal snapshots, scoped cwd validation, PTY create/input/output/resize/replay/kill, and persisted history. Blocker: terminal end-to-end behavior is not fully proven. |
| Git/diff/checkpoint/PR | yes | partial | packages/app-server/src/workspaces/git-mutation-service.test.ts; packages/app-server/src/integrations/github-cli-service.test.ts; packages/app-server/src/integrations/integration-api.test.ts; packages/gui/src/client/diff-view-model.test.ts; packages/gui/src/app.test.ts; packages/gui/test/e2e/web-gui-smoke.test.ts | Must wire stage, unstage, discard, commit, checkpoint create/restore/diff, push, PR create/open/status, safety policy, and refresh after mutation. Blocker: mutation and integration coverage are incomplete. |
| Settings | yes | partial | packages/app-server/src/runtime/settings-service.test.ts; packages/app-server/src/runtime/resource-management-service.test.ts; packages/gui/src/client/settings-view-model.test.ts; packages/gui/src/app.test.ts | Must provide read/write/reset/persist for provider defaults, model, theme, density, keybindings, terminal/image behavior, access policy, integrations, and resource controls. Blocker: several controls are not fully read/write/persistent. |
| Persistence | yes | partial | packages/app-server/src/persistence/event-store.test.ts; packages/app-server/src/persistence/projector.test.ts; packages/app-server/src/sessions/sqlite-session-store.test.ts; packages/gui/src/client/reconnect-state.test.ts | Must make SQLite read models authoritative for projects, sessions, turns, messages, approvals, terminals, providers, settings, git/checkpoints, and cursor state. Blocker: restart/replay hydration is not fully complete. |
| Workflow/inspector | yes | partial | packages/app-server/src/runtime/daedalus-workflow-service.test.ts; packages/gui/src/client/daedalus-workflow-view-model.test.ts; packages/gui/src/phase4-differentiation.test.ts; packages/gui/src/app.test.ts | Must drive inspector, orchestration, audit, automation, and workflow panels from live server projections with reconnect safety and prompt redaction. Blocker: all panels are not yet proven live. |
| Desktop-native behavior | yes | partial | packages/desktop/src/native-command-router.test.ts; packages/desktop/src/server-process.test.ts; packages/desktop/test/e2e/desktop-gui-smoke.test.ts; packages/desktop/test/e2e/preload-smoke.test.ts | Must wire folder picker, recents, native commands, notifications, preload bridge, packaged app-server, SQLite path, and desktop bootstrap. Blocker: packaged/native parity is not complete. |
| E2E | yes | partial | packages/gui/test/e2e/web-gui-smoke.test.ts; packages/desktop/test/e2e/desktop-gui-smoke.test.ts | Must cover full web and desktop user journeys across composer, provider/model/settings, terminal, git/checkpoint/PR, approvals, diagnostics, persistence, restart, and hydration. Blocker: the complete journeys are not implemented. |
| Entrypoints | no | wired | — | Browser/Vite renderer can bootstrap against the app-server transport. |
| Sessions | no | wired | — | Session list, selection, and new-session entrypoints are connected as supporting surfaces for the required project/session row. |
| Turns | no | partial | — | Turn display exists, but cancel/stop controls are disabled unless the selected session has an active server turn. |
| Transcript | no | wired | — | Transcript projection renders server events. |
| Tools | no | wired | — | Tool calls render in the transcript/inspector surfaces. |
| Approvals | no | wired | — | Approval queue and approve/deny responses are connected. |
| Models | no | wired | — | Model list and selected model are read from app-server as supporting provider/model/auth state. |
| Auth | no | wired | — | Provider auth status is displayed from app-server as supporting provider/model/auth state. |
| Keybindings | no | partial | — | Shortcuts are documented/displayed; rebinding is not active. |
| Slash commands | no | wired | — | Composer slash-command list is loaded from app-server. |
| Extensions | no | wired | — | Renderer-safe extension metadata and UI requests are surfaced. |
| Skills | no | disabled | — | No GUI skill browser/activation surface exists yet. |
| Prompts | no | disabled | — | No GUI prompt-template browser/editor exists yet. |
| Themes | no | partial | — | Current dark theme is displayed; theme switching controls are disabled. |
| Package resources | no | disabled | — | Package resource install/manage flows are not exposed in GUI yet. |
| Plans | no | wired | — | Plan panels/state render from server/runtime state. |
| Todos | no | wired | — | Todo panels/state render from server/runtime state. |
| Subagents | no | wired | — | Subagent lanes/state render from server/runtime state. |
| Semantic search | no | disabled | — | Semantic index/search controls are not connected to app-server yet. |
| Diff | no | wired | — | Diff overlays/viewers render available change data as supporting git/diff/checkpoint/PR state. |
| Git | no | wired | — | Git summary/change surfaces render available server state as supporting git/diff/checkpoint/PR state. |
| Worktrees | no | wired | — | Worktree panel/state render available server state. |
| Diagnostics | no | partial | — | Diagnostics are visible; export/download controls remain disabled unless a renderer export sink is available. |
| Export | no | disabled | — | Transcript/log export controls are disabled because the GUI export workflow is not connected to app-server yet. |
| Reconnect | no | wired | — | Reconnect banner/connection state are visible. |

## Enforcement

- `packages/gui/src/client/capability-registry.ts` is the executable registry for this matrix.
- Registry entries use only `wired`, `partial`, or `disabled`.
- Required entries use `requirement: "required"` and must list behavioral test coverage.
- The normal focused tests assert that the strict validator reports any current required blockers without failing the focused suite.
- `scripts/check-gui-parity.sh` runs the same gate with `STRICT_GUI_FULL_PARITY=1`, which fails while any required row remains incomplete or any required test is skipped.
- `partial` and `disabled` entries must include `disabledReason`; `wired` entries must not include `disabledReason`.
- Command palette and settings controls consume the registry when rendering disabled controls.
