# GUI parity matrix

Task 31 release gates enforce the GUI parity contract and the no-visible-no-op policy: any visible control must either be wired to a real app-server/runtime action or render as disabled with an explicit reason. Partially available surfaces may display read-only state, but mutation controls must not look active until they are wired. Known limitations are documented only as `partial` or `disabled` rows with user-facing reasons.

| Surface | Status | Contract / disabled reason |
| --- | --- | --- |
| Entrypoints | wired | Browser/Vite renderer can bootstrap against the app-server transport. |
| Sessions | wired | Session list, selection, and new-session entrypoints are connected. |
| Turns | partial | Turn display exists, but cancel/stop controls are disabled unless the selected session has an active server turn. |
| Transcript | wired | Transcript projection renders server events. |
| Tools | wired | Tool calls render in the transcript/inspector surfaces. |
| Approvals | wired | Approval queue and approve/deny responses are connected. |
| Models | wired | Model list and selected model are read from app-server. |
| Auth | wired | Provider auth status is displayed from app-server. |
| Settings | partial | Settings can display current state; controls without app-server mutation APIs are disabled or read-only with inline reasons. |
| Keybindings | partial | Shortcuts are documented/displayed; rebinding is not active. |
| Slash commands | wired | Composer slash-command list is loaded from app-server. |
| Extensions | wired | Renderer-safe extension metadata and UI requests are surfaced. |
| Skills | disabled | No GUI skill browser/activation surface exists yet. |
| Prompts | disabled | No GUI prompt-template browser/editor exists yet. |
| Themes | partial | Current dark theme is displayed; theme switching controls are disabled. |
| Package resources | disabled | Package resource install/manage flows are not exposed in GUI yet. |
| Plans | wired | Plan panels/state render from server/runtime state. |
| Todos | wired | Todo panels/state render from server/runtime state. |
| Subagents | wired | Subagent lanes/state render from server/runtime state. |
| Semantic search | disabled | Semantic index/search controls are not connected to app-server yet. |
| Terminal | wired | Terminal list/create/replay/input/resize/kill flows are connected. |
| Diff | wired | Diff overlays/viewers render available change data. |
| Git | wired | Git summary/change surfaces render available server state. |
| Worktrees | wired | Worktree panel/state render available server state. |
| Diagnostics | partial | Diagnostics are visible; export/download controls remain disabled unless a renderer export sink is available. |
| Export | disabled | Transcript/log export controls are disabled because the GUI export workflow is not connected to app-server yet. |
| Reconnect | wired | Reconnect banner/connection state are visible. |
| Desktop-native behavior | partial | Renderer behavior exists; native packaging/shell integration controls remain disabled until desktop shell hooks are available. |

## Enforcement

- `packages/gui/src/client/capability-registry.ts` is the executable registry for this matrix.
- Registry entries use `wired`, `partial`, or `disabled`; unsupported remaining limitations must be represented as `disabled` with reasons.
- `partial` and `disabled` entries must include `disabledReason`.
- `wired` entries must not include `disabledReason`.
- Command palette and settings controls consume the registry when rendering disabled controls.
