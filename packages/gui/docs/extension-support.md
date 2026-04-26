# GUI extension support

The GUI supports extension interaction through the app-server extension UI bridge. Extension authors should keep using the coding-agent `ctx.ui` APIs; supported calls are translated into renderer dialogs.

## Support matrix

| Extension capability | GUI support | Notes |
| --- | --- | --- |
| `ctx.ui.notify` | Planned/basic bridge | Display as non-blocking notification when wired by the host. |
| `ctx.ui.confirm` | Supported | Renders primary/secondary actions and resolves to a boolean. |
| `ctx.ui.input` | Supported | Renders a text input and submit/cancel actions. |
| `ctx.ui.select` | Supported | Renders select options when provided by the bridge. |
| `ctx.ui.custom` TUI component | Not supported | TUI-only; provide a simpler confirm/input/select fallback for GUI mode. |
| Tool registration | Supported by runtime | Tool calls execute in the app-server session runtime; GUI renders session events. |
| Command registration | Supported for renderer-safe metadata | GUI command palette exposes extension command labels, descriptions, and extension IDs without executing renderer-unsafe code. |
| Extension persistence APIs | Supported by runtime | Persisted session/app events can be replayed by the GUI. |

## Dialog contract

The app-server sends `extension/ui/request` with `requestId`, `extensionId`, optional `sessionId`, title, description, fields, and actions. The renderer sends `extension/ui/respond` with `requestId`, `actionId`, and field values.

Dialog fields support `text`, `textarea`, `password`, `number`, `boolean`, and `select`. Actions may use `primary`, `secondary`, or `danger` styles.

## Author guidance

- Prefer `confirm`, `input`, and `select` for workflows that must run in both TUI and GUI.
- Keep prompts short and include enough context in `description` for a modal dialog.
- Avoid relying on terminal keyboard shortcuts or custom TUI components when GUI support is required.
- Treat GUI closure/cancellation as a normal negative response.
