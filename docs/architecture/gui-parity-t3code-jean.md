# Daedalus GUI parity findings: T3Code and Jean

Status: research baseline plus Phase 1-4 implementation closeout.

This document started as target parity research for T3Code and Jean. The Phase 1-4 roadmap has now implemented the first Daedalus GUI parity pass; remaining items below should be read as future candidates unless marked implemented.

Current implemented behavior is summarized in `docs/architecture/gui-parity-implementation-roadmap.md`. In short: Daedalus now has a quiet project/session shell, central composer, compact transcript, approval queue, worktree/terminal/diff/Git review surfaces, settings/command palette/provider placeholders, desktop diagnostics/reconnect affordances, integration and PR metadata surfaces, orchestration/subagent visibility, audit trails, automation rules, and extension management/permission UI.

The peer lessons remain useful context:

- **T3Code**: a minimal web/desktop GUI for Codex/Claude-style coding agents. Its strongest lessons are speed, focus, low ceremony, and a simple chat/composer-first loop.
- **Jean**: a desktop AI assistant/ADE with projects, worktrees, sessions, Plan/Build/Yolo modes, terminal, diffs, GitHub/Linear integrations, command palette, settings, themes, and headless web access. Its strongest lessons are workspace/session organization, desktop polish, and full development workflow coverage.
- **Daedalus GUI target**: implemented baseline plus candidate backlog. Validate future expansion against Daedalus architecture and product goals before implementation.

## Feature parity findings

### 1. Projects and sessions

Target parity:

- Provide a **project hub** as the top-level IA unit: recent projects, pinned projects, active sessions, background tasks, and quick entry points.
- Support **multiple sessions per project**, each with title, model/provider, mode, branch/worktree, status, last activity, and transcript summary.
- Let users resume, duplicate, archive, rename, and delete sessions.
- Show session state clearly: idle, running, waiting for approval, failed, disconnected, completed.
- Preserve transcript continuity across app restarts.
- Support fast creation flows: `Open folder`, `New session in current project`, `Continue last session`, `Start from issue/task`.

T3Code lesson:

- Keep the first-run and daily loop extremely direct: pick a project, type a task, see the agent work.

Jean lesson:

- Treat projects and sessions as durable desktop objects, not disposable chat tabs.

Actionable Daedalus target:

- Use projects/sessions as the backbone of the GUI navigation model, but avoid forcing users through a heavyweight project setup wizard before they can run an agent.

Implemented Phase 1-4 baseline: Daedalus has a project/session navigation shell, durable session status projections, central composer entry points, and reconnect-aware renderer state. Future candidates include richer resume/duplicate/archive/delete flows and issue/task start flows.

### 2. Worktrees

Target parity:

- Create, list, switch, and clean up Git worktrees from the GUI.
- Associate each agent session with a branch/worktree.
- Surface whether a session is isolated in a worktree or running in the main checkout.
- Provide safe defaults for parallel work: suggested branch names, auto-created worktrees, and cleanup prompts.
- Detect dirty state before destructive operations.
- Show worktree metadata: path, branch, upstream, dirty count, active sessions, and last activity.

Jean lesson:

- Worktree support is central to desktop ADE workflows because it makes parallel agent execution understandable and safer.

Actionable Daedalus target:

- Make worktree isolation a first-class session creation option, not an advanced Git-only feature.

### 3. Composer

Target parity:

- Provide a prominent task composer with multiline input, file/context attachments, slash commands, model/mode selectors, and submit controls.
- Support continuing a session, starting a new session, or sending a follow-up to a paused/running agent where safe.
- Include common intent presets: ask, plan, implement, review, fix tests, explain, summarize.
- Support context chips for selected files, diffs, folders, issues, terminal output, or transcript excerpts.
- Preserve drafts per session/project.
- Make mode and risk obvious before submit.

T3Code lesson:

- The composer should feel immediate and lightweight, not like filling out a form.

Jean lesson:

- Modes such as Plan/Build/Yolo help users express risk tolerance and autonomy expectations.

Actionable Daedalus target:

- Ship a simple composer first, then enrich it with attachments, mode presets, reusable prompts, and contextual send targets.

### 4. Transcript and tools

Target parity:

- Render a structured transcript with user messages, assistant reasoning summaries where available, tool calls, file edits, shell commands, approvals, errors, and final summaries.
- Collapse noisy tool details by default while keeping full expansion available.
- Provide filters: messages only, tools, diffs, terminal commands, approvals, errors.
- Show live streaming status during agent execution.
- Link transcript events to concrete artifacts: file paths, diffs, terminal output, approvals, and Git commits.
- Allow copying messages, tool inputs/outputs, command lines, and final summaries.

T3Code lesson:

- Minimal transcript views reduce cognitive load when the user only wants to track progress.

Jean lesson:

- Desktop users need durable, inspectable execution history when agents change code.

Actionable Daedalus target:

- Use progressive disclosure: compact readable timeline first, full debug transcript second.

### 5. Approvals

Target parity:

- Support explicit approval requests for shell commands, file writes, risky actions, network access, commits, PR creation, and external integrations.
- Show enough context to decide: command, working directory, affected files, risk label, agent rationale, and allow/deny alternatives.
- Provide scoped approval options: approve once, approve similar commands this session, approve for project, deny, edit command, ask agent to revise.
- Keep approval state visible in session lists and navigation badges.
- Support timeout, notification, and recovery flows when a session is waiting unattended.

Jean lesson:

- Plan/Build/Yolo-style autonomy modes are a user-facing approval policy, not just a backend permission setting.

Actionable Daedalus target:

- Design approvals as a UX surface with clear risk and scope language; do not expose raw policy internals as the primary user model.

### 6. Terminal

Target parity:

- Embed terminals per project/worktree/session.
- Show commands initiated by the agent and allow user-run commands where appropriate.
- Link terminal command events to transcript entries.
- Support copy, search, clear, restart, kill, and open in external terminal.
- Handle long-running processes with status indicators and kill/interrupt controls.
- Preserve enough terminal history for review without making terminal logs the only durable source of truth.

Jean lesson:

- Integrated terminal is table stakes for desktop AI development workflows.

Actionable Daedalus target:

- Treat terminal as both a live control surface and an evidence pane connected to session history.

### 7. Diff and review

Target parity:

- Provide a file-changes panel with added/modified/deleted/renamed files and per-file status.
- Render inline and side-by-side diffs.
- Let users accept/revert selected hunks or files where feasible.
- Link diffs back to the session/tool event that produced them.
- Support review comments or follow-up prompts from selected diff ranges.
- Provide summary views: changed files, test status, lint status, uncommitted changes, commits created.

Jean lesson:

- Diff review should be built into the agent loop rather than outsourced entirely to Git CLI or external editors.

Actionable Daedalus target:

- Make review of agent changes a first-class post-run step before commit/PR actions.

### 8. Git

Target parity:

- Show branch, worktree, dirty state, staged/unstaged changes, commits ahead/behind, and remote sync status.
- Support common actions: stage, unstage, discard, commit, create branch, switch branch/worktree, push, pull, open repository.
- Offer agent-assisted commit messages and change summaries.
- Integrate PR-oriented flows later: create PR, update PR, check CI, respond to review.
- Warn before actions that conflict with active sessions or dirty worktrees.

Jean lesson:

- Git operations are part of the desktop development workflow and should be visible beside sessions.

Actionable Daedalus target:

- Start with read-only Git state and safe commit support, then expand into branch/PR lifecycle.

### 9. Model and provider settings

Target parity:

- Select provider/model at session start and allow safe switching for future turns.
- Show authentication state, available models, context limits, cost/rate hints where known, and provider health.
- Support project defaults, global defaults, and per-session overrides.
- Expose autonomy/mode settings separately from provider/model selection.
- Provide clear errors for missing keys, expired auth, unavailable models, and provider outages.

T3Code lesson:

- Minimal provider switching is useful when targeting Codex/Claude-style agents.

Jean lesson:

- Desktop users expect settings to survive restarts and be discoverable in app settings.

Actionable Daedalus target:

- Keep model selection near the composer but put credential management in settings.

### 10. Command palette

Target parity:

- Add a global command palette for navigation and actions.
- Include project/session commands, worktree actions, Git actions, terminal actions, settings, theme, extensions, and help.
- Support fuzzy search, keyboard-first operation, recent commands, and context-aware results.
- Make dangerous actions confirm explicitly.

Jean lesson:

- A command palette helps desktop apps expose breadth without overloading visible chrome.

Actionable Daedalus target:

- Use the command palette to keep the UI simple while retaining power-user speed.

### 11. Settings

Target parity:

- Provide global and project settings with clear inheritance and override indicators.
- Cover providers/models, approval policy/modes, terminal shell, Git/worktree defaults, themes, keyboard shortcuts, integrations, extensions, telemetry/logging, and storage.
- Include import/export/reset paths.
- Validate settings and explain failures inline.

Actionable Daedalus target:

- Avoid a flat settings dump; group settings by user task and show effective values.

### 12. Extensions

Target parity:

- Surface installed extensions, enabled/disabled state, capabilities, permissions, version, and configuration.
- Show extension-contributed commands/actions in the command palette.
- Show extension-owned background tasks and errors.
- Provide clear permission prompts for extensions that touch files, network, terminals, or external services.

Daedalus differentiator:

- Daedalus can make extension capability and permission boundaries more explicit than many peer GUIs by aligning them with app-server protocol concepts.

Actionable Daedalus target:

- Design extension UX early enough that core GUI surfaces are extensible instead of hard-coded.

### 13. Integrations

Target parity:

- Support external task/code systems over time: GitHub, Linear, issue links, PR links, CI status, and possibly remote repositories.
- Allow starting a session from an issue or PR context.
- Attach integration artifacts as composer context chips.
- Show auth state and sync errors clearly.

Jean lesson:

- GitHub and Linear integrations turn sessions into workflow units rather than isolated chats.

Actionable Daedalus target:

- Start with linkable external context and manual paste/import, then add authenticated integrations.

### 14. Persistence and remote/headless access

Target parity:

- Persist sessions, projects, worktrees, settings, drafts, transcript summaries, run metadata, and recovery state.
- Recover gracefully after app restart or crash.
- Support a local app-server model that can later serve desktop, browser, or headless clients.
- Make connection state visible if renderer and runtime are separate.
- Provide export/import for transcripts and diagnostics.

Jean lesson:

- Headless web access and durable desktop runtime are useful patterns for long-running local agents.

Actionable Daedalus target:

- Keep durable runtime state out of the renderer and design reconnection as a normal UI state.

### 15. Desktop

Target parity:

- Provide native desktop packaging with windows, menus, keyboard shortcuts, notifications, deep links, recent projects, tray/dock affordances where useful, and OS theme support.
- Support opening files/folders from the OS.
- Handle app updates and diagnostics.
- Provide polished window behavior: restore size/location, remember sidebar state, support multiple windows if desired.

Jean lesson:

- Desktop feel matters for trust when the app can run commands and edit code.

Actionable Daedalus target:

- Do not ship a web app in a shell without native affordances; prioritize the desktop basics that make local development feel safe and integrated.

### 16. Observability

Target parity:

- Show run status, active jobs, queued approvals, failed tools, provider errors, and background tasks.
- Provide diagnostic export: session transcript, tool logs, app-server logs, environment summary, versions, and integration status.
- Track performance hotspots: slow startup, slow transcript rendering, slow diff computation, provider latency, terminal attachment issues.
- Give users actionable error recovery steps.

Actionable Daedalus target:

- Build a user-facing activity/diagnostics model, not just developer logs.

### 17. Daedalus differentiators

Candidate differentiators to preserve or emphasize:

- **Protocol-first GUI architecture**: stable app-server protocol can support desktop, local web, and future remote/headless clients.
- **Extension-aware GUI**: make extension capabilities visible and governable from the UI.
- **Agent orchestration depth**: expose Daedalus-specific orchestration, subagents, review lanes, and steering as understandable UI concepts without leaking raw internals.
- **Safety and auditability**: combine approvals, transcript, diffs, terminal logs, and Git state into a coherent audit trail.
- **Progressive complexity**: T3Code-like simple first-run, Jean-like full workflow depth as users opt in.

### 18. Recommended phases

#### Implementation status (2026-04-24)

Phase 1 gate validation is complete. The shipped minimal GUI loop covers app-server runtime bootstrap, project/session state, central composer, compact transcript/debug inspector, approval queue, quiet shell navigation, command palette, and settings/provider placeholders.

Phase 2 and Phase 3 gate validation is complete. Shipped workflow parity surfaces now cover worktree/session workflow state, embedded terminal metadata, file-change/diff summaries, Git safety summaries, desktop/integration helpers, provider/integration state, issue/PR composer chips, PR safety guards, diagnostics recovery copy, and web-access/settings placeholders. Phase 4 is unblocked; confirm no protocol/runtime/shared GUI shell workers are active before starting differentiated Daedalus workflow work.

#### Phase 1: usable minimal GUI loop

- Project picker/recent projects.
- Session list and session detail.
- Composer with provider/model/mode selection.
- Live transcript with compact tool events.
- Basic approval prompts.
- Basic Git dirty-state indicator.
- Persist sessions and drafts.

#### Phase 2: development workflow parity

- Worktree creation/selection per session.
- Embedded terminal tied to project/session.
- File changes panel and diff viewer.
- Session status dashboard and approval queue.
- Command palette.
- Settings for providers, modes, themes, terminal, and Git defaults.

#### Phase 3: desktop and integration depth

- Native menus, notifications, recent projects, shortcuts, deep links.
- Git commit/push/PR flows.
- GitHub/Linear integration entry points.
- Extension management UI.
- Diagnostics export and recovery flows.
- Headless/local web access story if aligned with architecture.

#### Phase 4: differentiated Daedalus workflows

- Multi-agent/subagent visualizations.
- Review-lane and plan/build orchestration surfaces.
- Rich audit trail across transcript, tools, diffs, terminal, and commits.
- Extension-contributed panes/actions/settings.
- Advanced project automation and background-agent management.

## UX parity pass

The items below focus specifically on user experience parity with T3Code and Jean. They are written as actionable design requirements rather than backend features.

### 1. Information architecture

UX parity points:

- Use a stable three-level model: **Project → Session → Run artifacts**.
- Keep global navigation small: Projects, Active, Settings, Extensions, Help/Diagnostics.
- Within a project, make primary tabs predictable: Sessions, Worktrees, Changes, Terminal, Integrations, Settings.
- Within a session, keep the main layout anchored by transcript/composer, with side panels for context, files, approvals, and run details.
- Avoid mixing global settings, project settings, and per-session controls in the same panel without visible scope labels.

Concrete actions:

- Add persistent scope labels such as `Global`, `Project`, `Session`, and `Worktree` where settings/actions apply.
- Design session cards to show enough information to choose the right session without opening it.
- Make `waiting for approval` and `running` visible from any top-level view.

### 2. Onboarding and empty states

UX parity points:

- First launch should offer a direct path to value: open a folder and ask the agent to do something.
- Empty project state should suggest starter tasks such as `Explain this repo`, `Find failing tests`, `Plan a feature`, `Review local changes`.
- Empty session state should explain composer modes and safety expectations in one or two sentences.
- Missing provider credentials should be a guided setup state, not a dead error.
- Empty worktree/change/terminal panels should explain what will appear there and how to create it.

Concrete actions:

- Create targeted empty states for projects, sessions, worktrees, changes, terminal, integrations, and settings.
- Include one-click sample prompts that populate the composer rather than auto-running unexpectedly.
- Keep onboarding skippable and non-blocking unless credentials are required.

### 3. Navigation

UX parity points:

- Support mouse-first and keyboard-first navigation.
- Provide breadcrumbs for project/session/worktree context.
- Preserve back/forward behavior across project, session, settings, and detail views.
- Make active work visible without forcing users to poll every session.
- Allow quick switching between active sessions and recent projects.

Concrete actions:

- Add an `Active work` view for running sessions, blocked approvals, and failing jobs.
- Provide session switcher shortcuts and command palette entries.
- Keep deep links or route IDs stable enough to restore exact views after restart.

### 4. Density

UX parity points:

- T3Code-style minimalism should govern the default view.
- Jean-style detail should be available through expandable panels, not always-on clutter.
- Transcript tool calls, diffs, and terminal output need compact summaries with expansion.
- Session lists need both comfortable and compact density options.

Concrete actions:

- Default to a clean transcript with collapsed low-risk tool calls.
- Add `Compact`, `Comfortable`, and possibly `Debug` display density modes.
- Keep important status badges visible even in compact mode.

### 5. Keyboard shortcuts

UX parity points:

- Provide shortcuts for command palette, new session, send message, focus composer, search transcript, toggle terminal, toggle changes, approve/deny, and switch sessions.
- Make shortcuts discoverable in menus, tooltips, and a shortcuts settings page.
- Avoid conflicts with OS/editor conventions.
- Let users customize at least common shortcuts over time.

Concrete actions:

- Define a shortcut map early and use it consistently across desktop menus and renderer UI.
- Add a keyboard shortcut help overlay.
- Make destructive shortcut actions require confirmation or a second step.

### 6. Composer ergonomics

UX parity points:

- Composer must be fast, obvious, and resilient to accidental loss.
- Multiline editing should be natural: `Enter` vs `Cmd/Ctrl+Enter` behavior must be explicit and configurable.
- Context attachments should be visible as removable chips.
- Mode/model selection should be close to the composer but not dominate it.
- Drafts should survive navigation and app restart.

Concrete actions:

- Add placeholder text that reflects the selected project/session mode.
- Show attached files/diffs/issues above the input as chips with clear remove controls.
- Provide a pre-submit summary for high-autonomy modes such as Yolo-equivalent behavior.

### 7. Approval UX

UX parity points:

- Approval prompts should be unmissable but not panic-inducing.
- Users need to understand **what**, **why**, **where**, and **scope** before approving.
- Approval decisions should be reversible where possible or at least auditable.
- Batch approvals should be possible for repetitive safe actions, but never ambiguous.

Concrete actions:

- Use risk tiers with plain labels: low, medium, high.
- Show command/file/network/integration scope in structured rows.
- Offer `Approve once`, `Approve for this session`, `Deny`, and `Ask agent to revise` as primary actions.
- Keep an approval queue accessible from the top bar/sidebar.

### 8. Terminal UX

UX parity points:

- Terminal panes should clearly indicate project, worktree, shell, and whether the agent or user owns the process.
- Long-running commands need status, elapsed time, and stop controls.
- Terminal output used by the agent should be linkable back to the transcript.
- Multiple terminals need naming and clear association with sessions/worktrees.

Concrete actions:

- Add terminal headers with path, branch/worktree, process status, and ownership.
- Provide `Copy last command`, `Copy output`, `Send output to composer`, and `Open external terminal` actions.
- Make kill/interrupt controls visible and confirm when destructive.

### 9. Diff UX

UX parity points:

- Diff review should answer: what changed, why, and can I safely accept it?
- File lists need grouping by risk and type: source, tests, config, lockfiles, generated files, deletions.
- Users should be able to prompt the agent from a selected file/hunk.
- Large diffs need summarization and virtualization to avoid sluggishness.

Concrete actions:

- Add a changes summary with counts and notable risky files.
- Link each changed file to the session/tool event that modified it when possible.
- Provide actions: open file, view diff, revert file, ask agent about this change, add follow-up from selection.

### 10. Settings UX

UX parity points:

- Settings must communicate scope and effective value.
- Provider setup needs guided validation and actionable errors.
- Project overrides should be obvious and easy to reset.
- Settings should avoid exposing raw config JSON as the primary experience.

Concrete actions:

- Organize settings by task: AI Providers, Autonomy & Approvals, Projects & Worktrees, Terminal, Git, Integrations, Extensions, Appearance, Diagnostics.
- Show `Inherited from global` and `Overridden in project` labels.
- Add test buttons for providers/integrations.

### 11. Error and reconnect states

UX parity points:

- Renderer/app-server disconnects should be normal recoverable states, not blank screens.
- Provider/auth/tool errors should state what happened and what the user can do next.
- Failed sessions need retry/resume paths.
- Crashes should offer diagnostics export.

Concrete actions:

- Add a reconnect banner with retry status and offline-safe actions.
- For failed tools, show command/tool name, reason, and actions: retry, edit, skip, ask agent to recover.
- Persist enough state to restore drafts and visible session context after reload.

### 12. Visual hierarchy

UX parity points:

- The current agent status should be the most visually prominent dynamic element.
- Dangerous actions need stronger visual treatment than routine actions.
- Transcript should separate human text, assistant text, tool actions, approvals, and errors using consistent color/iconography.
- Model/mode/worktree context should be visible but secondary.

Concrete actions:

- Define a status color system for idle/running/waiting/error/done.
- Use consistent icons for file edit, command, approval, diff, Git, integration, and error events.
- Avoid making every event a high-contrast card; reserve emphasis for user decisions and failures.

### 13. Responsiveness

UX parity points:

- The GUI must work on laptop widths without hiding critical controls.
- Side panels should collapse predictably.
- Transcript/composer should remain usable when terminal or diff panes are open.
- Heavy panes such as diff and terminal should not block typing in the composer.

Concrete actions:

- Define responsive breakpoints for single-pane, two-pane, and three-pane layouts.
- Keep composer sticky in session views.
- Virtualize long transcripts, terminal logs, and large diffs.

### 14. Native desktop feel

UX parity points:

- Desktop parity requires more than packaging: menus, shortcuts, notifications, file/folder open flows, recent documents, and OS theme behavior.
- Native dialogs should be used where users expect filesystem access.
- Background work should notify users when attention is needed.
- App restart/update flows should not lose active session context.

Concrete actions:

- Mirror key commands in the application menu.
- Use native open-folder/file dialogs.
- Add desktop notifications for approval needed, run completed, run failed.
- Restore windows, recent projects, selected project/session, and panel state on launch.

### 15. Accessibility

UX parity points:

- Keyboard-only usage must cover the primary loop: open project, create session, compose, approve, inspect changes, use terminal, open settings.
- Status cannot rely on color alone.
- Transcript, diff, terminal, and command palette need sensible focus order.
- Text contrast and font sizing must work for long coding sessions.

Concrete actions:

- Add visible focus states to all interactive controls.
- Provide labels for icon-only buttons.
- Use text labels plus icons for risk/status.
- Test with reduced motion and high-contrast themes.

### 16. Perceived performance

UX parity points:

- First meaningful interaction should be quick even if provider/model discovery continues in the background.
- Session opening should show transcript skeletons or cached summaries before full hydration.
- Agent status should update immediately after submit.
- Long operations need progress or heartbeat indicators.

Concrete actions:

- Cache recent project/session metadata for fast startup.
- Lazy-load large transcript details, diffs, and terminal history.
- Optimistically create a session/run row when the user submits a task, then reconcile with runtime state.
- Show streaming and heartbeat states so the app never appears frozen during agent work.


## Screenshot-informed UX observations

> Sources: seven user-provided screenshots from T3Code and Jean captured during GUI parity review. These observations refine the UX parity list above with concrete visual/layout details.

### 1. T3Code: quiet shell and thread-first sidebar

Observed: T3Code uses an extremely quiet dark shell: a narrow left sidebar, grouped projects, terse thread rows, search with `Ctrl+K`, and a centered empty-state card saying to pick a thread. The main canvas stays mostly empty until a thread is active.

Daedalus implications:

- Use a low-noise project/session sidebar; avoid oversized dashboard cards as the default daily surface.
- Group sessions under projects with tiny metadata, elapsed time, and status, not full descriptions everywhere.
- Empty state should be centered, calm, and action-oriented: `Pick a session`, `Start a new task`, `Open project`.
- Keep global search/command access visible from the sidebar from the first screen.
- Avoid filling the initial canvas with debug/event panels before the user has selected or started work.

### 2. T3Code: active thread layout and composer ergonomics

Observed: T3Code’s active thread centers the transcript in a readable column while keeping a persistent bottom composer. The composer is a large rounded command box with embedded controls for provider/model, effort/context, mode, access/sandbox, context percentage, and send. Thread-level actions live in the top bar: add action, open, initialize Git, etc.

Daedalus implications:

- The composer should be the primary interaction object, not a small form in the sidebar.
- Put model, effort, mode, and permission/sandbox controls inside or immediately adjacent to the composer.
- Keep the composer sticky at the bottom of the session, with enough width for long prompts.
- Keep transcript width readable even on wide screens; do not stretch prose across the full window.
- Add top-bar contextual actions for the active session/worktree: open editor, Git init/status, add action, terminal, diff.

### 3. T3Code: settings structure

Observed: T3Code settings use a simple left settings nav and centered settings card sections. General settings are plain rows with label, short description, and right-aligned control. Providers show health/status, version, source, and enable toggles.

Daedalus implications:

- Settings should use row-based forms: label + helper text left, control right.
- Provider settings must show installation/auth status, CLI version, source/path, and enable/disable state.
- Include a `Restore defaults` action in settings.
- Use settings categories rather than one giant form: General, Providers, Connections/Integrations, Archive, Appearance, Keybindings, Extensions.

### 4. Jean: worktree/session dashboard as a sparse cockpit

Observed: Jean’s project/worktree overview is spacious and sparse. It has a top centered search box, top-right `Open in Zed`, and large horizontal worktree/session rows showing branch and diff counts (`+8815 / -281`). The left/top chrome is minimal, with bottom-left compact shortcut/status cluster.

Daedalus implications:

- Worktree/session rows should expose diff magnitude prominently; this is more useful than generic status text.
- Search across worktrees and sessions deserves top-level placement in worktree/project views.
- External editor action should be always near the top right of project/worktree views.
- Use sparse overview screens for project/worktree management, and denser sidebars for active work.
- Diff counts and branch names should be visible in navigation rows, not buried in inspector panels.

### 5. Jean: active session and compact tab strip

Observed: Jean’s active session view keeps the project/session breadcrumb and diff counts in the top bar, a small session tab strip beneath it, and a bottom-centered composer. The main transcript starts very sparse. The composer includes mode/model controls and a focus shortcut hint.

Daedalus implications:

- Use breadcrumbs: `Project › Worktree/Base Session › Session` instead of generic titles.
- Add a compact session tab strip for multiple sessions under the same worktree/base session.
- Put diff counts in the persistent header; users should always know change magnitude.
- Add focus shortcut hints directly in the composer (`Ctrl+L`, etc.).
- Keep the first assistant prompt/light greeting minimal; do not flood the session with system metadata.

### 6. Jean: project sidebar with selected worktree state

Observed: Jean’s project sidebar can show projects, selected project, nested worktree/session entries, branch names, and green/red diff counts. Footer actions include `+ New` and `Archived`. The active row is highlighted with a yellow accent bar.

Daedalus implications:

- Sidebar IA should support `Project > Worktree/Base Session > Session`, not just flat sessions.
- Active row should have a strong but narrow accent marker; avoid turning the entire row into a loud card.
- `New` and `Archived` should be persistent sidebar footer actions.
- Diff counts should be displayed inline beside branch/worktree names.
- Row controls such as more/actions and add should appear on hover or as compact right-side icons.

### 7. Jean: deep settings and provider management

Observed: Jean settings have a left navigation with categories: General, Opinionated, Web Access, Providers, Usage, Appearance, Keybindings, Magic Prompts, MCP Servers, Integrations, Experimental. Provider rows show login state, relogin/install actions, CLI version, install source, path, and managed/system choices.

Daedalus implications:

- Daedalus settings needs a comparable category model; especially Providers, Usage, Appearance, Keybindings, Extensions, Integrations, Web Access, and Experimental.
- Provider configuration must support both discovered/system binaries and managed/bundled sources where applicable.
- Auth controls should be inline per provider: login/relogin/install, not hidden behind generic auth pages.
- Usage/debug visibility deserves its own settings or dashboard area.
- Web/headless access should be a first-class settings page, not only CLI flags.

### 8. Visual design deltas for Daedalus

From the screenshots, both T3Code and Jean lean darker, quieter, and more spacious than Daedalus’ current dense panel prototype. The best target is not more decoration; it is stronger information hierarchy.

Concrete visual direction:

- Use near-black backgrounds with subtle borders; reserve saturated color for status, diff counts, active accents, and primary actions.
- Prefer thin separators and row highlights over boxed panels everywhere.
- Keep sidebars narrow and text-dense; keep main session content centered and readable.
- Make the composer visually premium: rounded container, blue/cyan focus ring, embedded controls, clear send affordance.
- Use small badges for mode/model/branch/provider, but avoid badge clutter in transcript prose.
- Use red/green diff counts consistently across headers, rows, and review panes.

### 9. Immediate Daedalus UI adjustments suggested by screenshots

1. Move start-session prompt from sidebar into a bottom-centered composer in the main session/workspace area.
2. Keep project/session creation controls in the sidebar, but treat task prompting as central composer activity.
3. Add top-level breadcrumb/header with project, worktree/session, branch, diff counts, and open-in-editor action.
4. Replace raw event-card timeline as default with a clean transcript; move raw events to a debug/inspector tab.
5. Add a T3Code-like centered empty state when no session is selected.
6. Add Jean-like project/worktree overview with search and wide worktree rows.
7. Add settings IA matching Jean/T3Code categories before settings sprawl begins.
8. Build provider status rows with version/source/auth state as a dedicated settings primitive.
9. Add persistent sidebar footer actions: New, Archived, Settings.
10. Use active-row accent bars and compact inline row controls rather than large colorful cards.

## Deep code reconnaissance addendum

> Sources: focused read-only code scans of T3Code, Jean, plus supplemental Emdash/Superset/DPCode layout code. This section emphasizes implementation patterns behind the visual/UX observations above.

### T3Code implementation patterns to borrow

- **Global app shell as provider/layout stack.** T3Code wraps authenticated content with toast/trace/server/environment surfaces, command palette, websocket state, and sidebar layout before rendering route content. Daedalus should keep command palette, connection state, toasts, and sidebar outside session routes so they persist across navigation.
- **Resizable persisted sidebar with main-width guard.** T3Code persists sidebar width, supports mobile sheet/offcanvas behavior, and guards minimum main content width. Daedalus should not hard-code the sidebar; it should be resizable, persisted, and constrained so the composer/transcript remain usable.
- **Sidebar as real project/thread/worktree navigation.** T3Code sidebar handles grouping, sorting, drag/drop, multi-select, rename/archive, PR/terminal/running indicators, context menus, and shortcut hints. Daedalus should treat sidebar rows as dense operational objects, not simple links.
- **Strict chat flex architecture.** T3Code uses full-height `min-h-0` flex regions, isolated scroll areas, a virtualized timeline, sticky composer, optional plan/sidebar, and bottom terminal drawer. Daedalus should copy the spatial model: left nav, centered thread, bottom terminal, right diff/plan/context panel.
- **Composer as a stateful command surface.** T3Code composer includes pending approval/question/plan panels, slash/file/skill menu, image attachments, provider/model picker, traits/runtime mode, build/plan toggle, context meter, and send/stop/implement actions. Daedalus should move task input out of the sidebar and build a premium bottom composer with embedded controls.
- **Width-observed responsive composer.** T3Code compacts composer footer controls based on actual composer width via `ResizeObserver`, not only viewport size. Daedalus should adopt component-measured compaction for dense toolbar controls.
- **Command palette as launcher and browser.** T3Code palette handles commands, recent threads, project open/add, filesystem browsing, nested views, backstack, and composer focus restoration. Daedalus command palette should be a navigation/action hub, not just a command list.
- **Right panels switch to sheets.** T3Code diff/plan panels render inline on wide screens and as right-side sheets under a width threshold. Daedalus should avoid squeezing chat at narrow widths; inspector panes should become sheets/drawers.
- **Terminal is per-thread persistent state.** T3Code terminal drawer persists height/open/groups, supports split/new/close, and keeps terminal state scoped per thread. Daedalus should persist terminal UI state separately from transcript state.
- **Token-first CSS.** T3Code maps Tailwind v4 theme to CSS variables, includes WCO/titlebar variants, slim scrollbars, and computed xterm/diff theming. Daedalus needs semantic tokens before expanding UI complexity.

### Jean implementation patterns to borrow

- **Desktop-first state-driven shell.** Jean switches between welcome, project canvas, and active worktree chat from app state rather than relying on heavy route structure. Daedalus can initially use selected project/worktree/session state as the main navigation driver.
- **Lazy-loaded heavy surfaces.** Jean lazy-loads preferences, project settings, worktree modal, archive modal, magic modal, GitHub dashboard, commit/review surfaces, and retains mounted modals after first load. Daedalus should lazy-load settings/diff/terminal-heavy panels and avoid bloating first paint.
- **Project canvas as operational cockpit.** Jean project canvas has sticky translucent header, centered search, project badges, sort/actions, worktree rows, keyboard shortcuts, and empty CTA. Daedalus should build a project/worktree overview separate from active chat.
- **Worktree rows show actionable metadata.** Jean rows include active marker, branch, diff counts, status chips, PR/security/label metadata, and `Press Enter to open` affordance. Daedalus rows should expose status and diff magnitude inline.
- **Nested resizable chat workspace.** Jean chat uses horizontal resizable panels plus a vertical chat/terminal split and optional review sidebar. Daedalus should use nested panel groups: chat + terminal vertically, inspector/review horizontally.
- **Uncontrolled composer for performance.** Jean composer intentionally avoids controlled textarea re-rendering on every keystroke, persists drafts debounced, supports mentions/slash/images/text attachments. Daedalus should use an uncontrolled editor/input with explicit state synchronization.
- **Toolbar as action hub.** Jean composer toolbar carries execution mode, backend/model/provider/thinking, diff stats, PR status, context attachments, MCP status, commit/review/merge/open PR actions, and queue count. Daedalus should centralize active-session controls near the composer.
- **Searchable pane-based preferences.** Jean preferences use categories like General, Opinionated, Web Access, Providers, Usage, Appearance, Keybindings, Magic Prompts, MCP Servers, Integrations, Experimental. Daedalus settings should follow this category depth early.
- **Provider settings are operational.** Jean provider rows expose login/relogin/install, CLI versions, source paths, managed/system source selection, and provider profiles. Daedalus provider settings should show operational readiness, not just model dropdowns.
- **Persistent terminal mounts.** Jean keeps terminal containers mounted and hides inactive ones to preserve xterm buffers/processes/scroll. Daedalus should hide inactive terminal panes rather than destroying them.
- **Diff/review is action-oriented.** Jean diff supports split/unified, file stats, line selection/comments, commit/revert, search, and review findings with `fix`/`fix all`. Daedalus should treat diff/review as an input back into the agent, not passive output.
- **Responsive/mobile gestures and native gating.** Jean includes mobile breakpoints, swipe-back, command-palette pull gesture, browser/native title behavior, and native-only terminal gating. Daedalus should plan web/desktop capability differences explicitly.

### Supplemental patterns from Emdash, Superset, and DPCode

- **Emdash tri-pane workspace.** Emdash uses resizable left/main/right panels, with diff/editor/settings overlays while preserving task context. Borrow for Daedalus inspector layout.
- **Emdash task rows.** Rows combine status/unread, hover archive/delete, inline rename, pin, warnings, PR badge, diff badge, and relative time. Borrow row density and metadata strategy.
- **Emdash settings/search.** Settings are searchable cards with scroll-to-section behavior. Good model for Daedalus settings once categories grow.
- **Superset AI element composition.** Superset uses clean message/conversation components and structured `FileDiffTool` outputs both inline and in diff tab. Borrow component API shape for tool-result cards.
- **Superset session list.** Sessions are grouped by Today/Yesterday/Older with compact rows, status icon, repo/model metadata, diff stats, and relative time. Borrow for archived/history views.
- **DPCode terminal workspace.** DPCode has dedicated terminal workspace, split/tab chrome, and visual layout preset cards. Borrow if Daedalus makes terminal workspace first-class.
- **DPCode/Emdash palettes.** Their palettes span actions, projects/tasks, settings, filesystem/theme, and shortcuts. Daedalus palette should similarly unify navigation and operations.

### Practical Daedalus layout target from code reconnaissance

1. **WorkspaceShell**: full-height app shell with persistent resizable left nav, command palette, toast/connection layer, and desktop titlebar integration.
2. **ProjectCanvas**: sparse project/worktree cockpit with centered search, worktree/session rows, diff counts, branch/status chips, open-in-editor, and empty CTA.
3. **SessionWorkspace**: centered transcript and premium sticky bottom composer, with raw/debug events moved to inspector.
4. **InspectorPanel**: right panel that hosts diff, approvals, plan, files, integrations, and debug; becomes a sheet/drawer on narrow widths.
5. **TerminalDrawer**: persistent per-session/worktree xterm drawer with height persistence, tabs/splits, and hidden-not-destroyed inactive terminals.
6. **SettingsDialog/Route**: searchable pane-based settings with provider readiness rows, web access, usage, appearance, keybindings, extensions, integrations, experimental.
7. **CommandPalette**: global launcher/switcher/browser for projects, sessions, files, commands, settings, and extension commands.

### Implementation cautions

- Do not copy large monolithic components like T3Code `Sidebar`/`ChatView` or Jean `ChatWindow` directly; borrow their decomposition and split Daedalus into smaller Svelte stores/components.
- Keep state domains separate: server projections, UI chrome, command palette, composer drafts, terminal UI/runtime state, settings, and modal/dialog state.
- Use typed command/event buses rather than ad-hoc DOM custom events where possible.
- Port UI patterns, not backend assumptions: Jean is CLI-wrapper/Tauri-oriented; T3Code has its own server/projection stack. Daedalus should preserve its app-server protocol and extension architecture.

## Open validation questions

- Which autonomy modes should Daedalus expose as first-class UX labels, and how closely should they map to Jean-style Plan/Build/Yolo?
- Should worktree creation be default for implementation sessions, opt-in per session, or a project-level setting?
- How much Git mutation should ship before PR/integration workflows exist?
- Which extension capabilities must be visible in v1 versus deferred until extension management matures?
- What is the minimum desktop-native feature set required before the GUI feels trustworthy for local code execution?
