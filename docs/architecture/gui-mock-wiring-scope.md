# GUI mock wiring scope

Status: implemented closeout for `docs/plans/2026-04-25-gui-mock-wiring.md` Task 12.

This document records what the GUI mock wiring plan is expected to address and what remains deliberately outside this plan. The mock in `docs/architecture/gui-mock/` remains the visual/layout target: obsidian surfaces, bone text, sparse gold accents, left project/session navigation, central session/composer, right inspector, command palette, and bottom terminal affordances.

## Addressed by the GUI mock wiring plan

### Runtime and app-server foundations

- Replace the default fake echo app-server runtime with the real coding-agent session runtime in the desktop/app-server startup path.
- Keep deterministic fake runtime injection available for app-server tests.
- Hydrate GUI state on startup from app-server data instead of relying only on future notifications.
- Replay persisted app events into the renderer after reconnect/reload.
- Stabilize project identity by upserting projects by normalized path instead of creating duplicate project ids for the same checkout.
- Persist GUI config/model/access settings durably in the app-server SQLite runtime state.
- Implement baseline provider/model/auth/config router behavior instead of silent `{}` fallthrough responses.
- Ensure selected model and effort/thinking settings affect session creation where the coding-agent runtime supports them.
- Preserve reconnect/offline diagnostics and expose them in the mock-styled shell.

### Sessions, transcript, and approvals

- Enable real GUI follow-up turns through `turn/start`.
- Add session lifecycle controls for cancel current turn and stop session.
- Project coding-agent events into a useful transcript: user messages, assistant output, tool calls/results, approvals, errors, terminal evidence, and subagent/orchestration events.
- Keep raw/debug payloads available only behind explicit debug UI so secrets do not appear in the normal transcript.
- Implement the app-server approval response lifecycle, including persisted resolution events and renderer queue updates.
- Implement approval keyboard shortcuts where safe.

### Composer functionality

- Make `@` file/context mentions functional.
- Make slash commands functional by listing available session/runtime commands and submitting command text through the coding-agent session path.
- Make image and text attachments functional, including safe storage, validation, renderer chips/previews, and prompt delivery to the runtime.
- Keep composer copy honest: any visible placeholder or shortcut in the mock UI must correspond to implemented behavior or be removed.

### Access/autonomy mode

- Implement a real high-autonomy mode with sober product language such as **Unrestricted** rather than “Yolo”.
- Treat Unrestricted as an audited policy mode that auto-approves soft approval gates and permission prompts.
- Do not let Unrestricted bypass hard safety blocks such as protected paths or runtime-enforced invariants.
- Persist access/autonomy mode changes and include mode changes in the audit trail.

### Terminal

- Replace plain Bun shell-output rendering with an xterm.js-backed terminal.
- Use a real PTY backend for terminal sessions, not a line-oriented `Bun.spawn` stdout/stderr approximation.
- Support terminal create/write/resize/close/replay/history flows behind the app-server protocol.
- Keep terminal instances mounted or restorable enough to preserve buffers and running processes across drawer/worktree switches where possible.
- Preserve the mock terminal drawer/tail visual design.

### Read-only project/worktree/Git functionality

- Make project/session/worktree navigation live from app-server state.
- Register and display the base checkout as a worktree-like row.
- Provide read-only Git status and diff summaries for current project/worktree.
- Render real patch/diff data when available.
- Keep destructive Git mutation disabled or explicitly gated.

### Settings, command palette, extensions, and QA

- Port settings and command palette to the mock style while binding them to live runtime actions.
- Expose extension commands in the command palette where renderer-safe metadata exists.
- Preserve extension confirm/input/select dialogs in GUI mode.
- Preserve narrower GUI extension support as documented: custom TUI components remain unsupported.
- Add responsive behavior for narrow windows instead of allowing the three-pane desktop layout to overflow.
- Add keyboard/focus tests and browser QA with `agent-browser`.
- Add guards so GUI tests fail if the Happy DOM fallback renderer masks real Svelte mount failures.

## Reference codebases allowed for implementation guidance

Use these repositories as references only. Do not copy their styling into Daedalus; the Daedalus mock remains the visual source of truth.

### T3Code references

- `/home/likas/Research/gui-inspiration/t3code/apps/web/src/components/ThreadTerminalDrawer.tsx` — xterm drawer, fit addon, terminal selection/context interactions, and terminal event application.
- `/home/likas/Research/gui-inspiration/t3code/apps/web/src/terminalStateStore.ts` — persisted terminal UI state keyed by thread.
- `/home/likas/Research/gui-inspiration/t3code/packages/contracts/src/terminal.ts` — terminal open/write/resize/restart/close/snapshot/event contracts.
- `/home/likas/Research/gui-inspiration/t3code/apps/server/src/terminal/Services/PTY.ts` — PTY adapter interface.
- `/home/likas/Research/gui-inspiration/t3code/apps/server/src/terminal/Services/Manager.ts` — terminal lifecycle manager contract.
- `/home/likas/Research/gui-inspiration/t3code/apps/web/src/components/ComposerPromptEditor.tsx` — rich composer with inline file/skill/terminal-context chips.
- `/home/likas/Research/gui-inspiration/t3code/apps/web/src/composer-editor-mentions.ts` — parsing prompt mentions and inline skill tokens.
- `/home/likas/Research/gui-inspiration/t3code/apps/web/src/composer-logic.ts` — trigger detection for path mentions, slash commands, and skills.

### Jean references

- `/home/likas/Research/gui-inspiration/jean/src/components/chat/TerminalView.tsx` — xterm tab UI, keep-mounted terminal panes, resize/focus behavior.
- `/home/likas/Research/gui-inspiration/jean/src/components/chat/TerminalPanel.tsx` — preserving terminals across active worktree switches.
- `/home/likas/Research/gui-inspiration/jean/src/hooks/useTerminal.ts` — attaching persistent terminal instances to DOM containers.
- `/home/likas/Research/gui-inspiration/jean/src/lib/terminal-instances.ts` — xterm instance lifecycle, FitAddon, WebLinksAddon, and PTY event wiring.
- `/home/likas/Research/gui-inspiration/jean/src-tauri/src/terminal/pty.rs` — real PTY spawn/write/resize event model using `xterm-256color` and truecolor environment.
- `/home/likas/Research/gui-inspiration/jean/src/store/terminal-store.ts` — terminal tab/running/failed state.
- `/home/likas/Research/gui-inspiration/jean/src/components/chat/ChatInput.tsx` — `@` mention, slash command, attachment, paste, and keyboard handling.
- `/home/likas/Research/gui-inspiration/jean/src/components/chat/FileMentionPopover.tsx` — file mention popover behavior.
- `/home/likas/Research/gui-inspiration/jean/src/components/chat/SlashPopover.tsx` — slash command/skill popover behavior.
- `/home/likas/Research/gui-inspiration/jean/src/components/chat/attachment-processing.ts` — attachment validation and staged attachment handling.

## Intentionally not addressed by this plan

These remain deferred product or release-engineering tracks:

- Auto-created worktrees and the default “one worktree per session” policy.
- Final policy for whether new build sessions default to main checkout, prompt for isolation, or create a worktree.
- Destructive Git mutation implementation: stage, unstage, discard, commit, push, force-push, and cleanup automation.
- Pull request creation, update, merge, and push flows.
- External integration mutation flows such as creating/updating GitHub issues, Linear issues, Slack messages, CI actions, or PR comments.
- Extension marketplace/install/update/uninstall flows.
- Full support for `ctx.ui.custom()` or arbitrary TUI component rendering in GUI mode.
- Full TUI parity across every command and interaction.
- Remote/headless/multi-user GUI clients or exposing the app-server beyond the local desktop model.
- A persistent desktop trust/status bar beyond lightweight connection/path/mode indicators in the mock shell.
- Full provider health/cost telemetry beyond baseline model/auth/config visibility.
- Final desktop packaging/distribution hardening such as signing, notarization, installer UX, and auto-update.
- Changing the SQLite-primary GUI persistence model or making JSONL the primary GUI store. JSONL remains import/export/debug/interoperability material.
