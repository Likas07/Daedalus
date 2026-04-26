# GUI security model

The Daedalus GUI is a local application. It is designed so the renderer is unprivileged and privileged operations run through the local app-server and coding-agent runtime.

## Local token model

The app-server binds to `127.0.0.1` by default and uses a capability bearer token for WebSocket/API access. Tokens are written to local state for the desktop host or CLI bootstrap and must not be logged. Readiness output and diagnostics redact token values.

Binding to a non-loopback host with `daedalus gui --host 0.0.0.0` or another external address prints a warning and requires token-protected access. Do not expose the GUI port to untrusted networks.

## Renderer and preload boundaries

The GUI renderer does not get direct filesystem, shell, or provider-token access. In desktop mode Electron keeps privileged work in the main process/app-server path and exposes only a narrow preload bridge. Runtime operations go through typed protocol requests and server-side validation.

## Approval safety

Approval cards represent actual tool-gating requests from the runtime. Risky operations such as file mutation, shell commands, network fetches, extension tools, and git changes can be blocked until the user approves, denies, or revises. Hard blocks remain blocked even if a UI control is visible.

The GUI follows the no-visible-no-op policy: controls must be wired to real actions or disabled with an explicit reason. Disabled approval or mutation controls must not pretend that work was accepted.

## Provider authentication

Provider auth is resolved server-side from environment variables, provider OAuth storage, and runtime auth state. The renderer displays status and invokes login/logout actions, but it should not receive raw API keys or OAuth secrets.

## Extension UI limitations

Extension UI in the GUI supports renderer-safe prompts such as select, confirm, input, editor-like fields, and structured responses routed through the app-server. Extensions cannot inject arbitrary privileged renderer code. Unsupported extension UI surfaces must render as disabled or fall back with a clear reason.

## Redaction

Support bundles, logs, and protocol traces must redact bearer tokens and provider credentials. Share JSONL exports and support bundles only with trusted recipients because prompts, tool output, and file paths may contain sensitive project data.
