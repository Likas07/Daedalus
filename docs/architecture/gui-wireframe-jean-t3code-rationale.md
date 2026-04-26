# Jean/T3Code Daedalus GUI Wireframe Rationale

## Artifact and target

Wireframe artifact:

- `/home/likas/Research/Daedalus/docs/architecture/gui-wireframe-jean-t3code.html`

Target implementation package:

- `/home/likas/Research/Daedalus/packages/gui`

The wireframe is a product-structure document for the Daedalus GUI. It is intentionally grayscale and low-decoration so the discussion stays focused on layout, hierarchy, and workflow rather than visual styling.

## Core design decision

The wireframe combines two references:

- **Jean** for project/worktree/session depth.
- **T3Code** for chat-first restraint and progressive disclosure.

In practical terms:

> Daedalus should have Jean's ability to manage real coding-agent work, but its default screen should feel closer to T3Code: quiet, direct, and centered on the current conversation.

## Exact source-to-wireframe inspiration map

### App shell and resizable left navigation

Wireframe element:

- top-level three-region app frame: left navigation, central session, optional inspector
- narrow default left rail with Projects / Sessions / Worktrees

Inspired by:

- `/home/likas/Research/gui-inspiration/t3code/apps/web/src/components/AppSidebarLayout.tsx`
  - Uses `SidebarProvider`, a left `Sidebar`, `SidebarRail`, persistent app-shell wrapping, and a resizable sidebar with stored width.
  - This influenced the wireframe's left-side navigation as part of the persistent app shell rather than a floating modal.
- `/home/likas/Research/gui-inspiration/t3code/apps/web/src/components/Sidebar.tsx`
  - Provides the thread/project sidebar concept: projects, threads, status indicators, search/new-thread controls, settings/footer affordances.
  - This influenced the wireframe's compact Projects / Sessions / Worktrees rail.
- `/home/likas/Research/gui-inspiration/jean/src/components/layout/LeftSideBar.tsx`
  - Wraps Jean's project sidebar in a full-height left column.
  - This influenced the wireframe's decision to keep project navigation structurally persistent.
- `/home/likas/Research/gui-inspiration/jean/src/components/projects/ProjectsSidebar.tsx`
  - Shows project tree navigation, new project/folder controls, archived access, and responsive narrow behavior based on sidebar width.
  - This influenced the wireframe's quiet project/worktree navigation and compact footer actions.

### Project/worktree/session hierarchy

Wireframe element:

- left rail sections for `Projects`, `Sessions`, and `Worktrees`
- top bar labels for current repo/worktree/branch
- session rows showing agent state and review/verification status

Inspired by:

- `/home/likas/Research/gui-inspiration/jean/src/components/projects/ProjectTree.tsx`
  - Jean's project tree influenced treating projects as first-class navigation objects.
- `/home/likas/Research/gui-inspiration/jean/src/components/projects/WorktreeList.tsx`
  - Jean's worktree list influenced surfacing worktrees as navigable coding contexts rather than hiding them behind git details.
- `/home/likas/Research/gui-inspiration/jean/src/components/projects/WorktreeItem.tsx`
  - Jean's worktree item pattern influenced showing per-worktree status in a compact row.
- `/home/likas/Research/gui-inspiration/jean/src/components/chat/SessionListRow.tsx`
  - Jean's session row concept influenced the wireframe's session list entries and running/reviewing state markers.
- `/home/likas/Research/gui-inspiration/t3code/apps/web/src/components/Sidebar.tsx`
  - T3Code's thread list influenced keeping session navigation compact and thread-like rather than presenting a full dashboard.

### Chat-first central workspace

Wireframe element:

- main center column as the dominant surface
- transcript first, controls second
- composer anchored at the bottom of the central session
- Muse / Sage / Worker activity appearing in the conversation flow

Inspired by:

- `/home/likas/Research/gui-inspiration/t3code/apps/web/src/components/ChatView.tsx`
  - T3Code's `ChatView` is the primary thread surface and keeps the thread itself as the center of the app.
  - This influenced the wireframe's decision that chat is the home base.
- `/home/likas/Research/gui-inspiration/t3code/apps/web/src/components/chat/ChatComposer.tsx`
  - T3Code's composer includes model/provider/runtime controls, pending approval/user-input panels, plan follow-up banners, and attachment/skill affordances without making them the whole app.
  - This influenced the wireframe's composer row with mode controls and task input.
- `/home/likas/Research/gui-inspiration/t3code/apps/web/src/components/ComposerPromptEditor.tsx`
  - This influenced the central prompt/editor area as the user's main control point.
- `/home/likas/Research/gui-inspiration/jean/src/components/chat/ChatWindow.tsx`
  - Jean's chat window pulls together active session state, messages, approvals, plans, review results, queued messages, streaming state, and toolbar actions.
  - This influenced the wireframe's richer session content inside a chat-first center.
- `/home/likas/Research/gui-inspiration/jean/src/components/chat/ChatInput.tsx`
  - Jean's input supports execution mode, file mentions, slash commands, attachments, backend switching, and active worktree context.
  - This influenced the wireframe's mode-aware composer for Plan / Build / Autopilot.

### Top project bar and mode/status controls

Wireframe element:

- top bar with current project, branch/worktree, model, connection status, and mode
- explicit Daedalus modes: Plan / Build / Autopilot

Inspired by:

- `/home/likas/Research/gui-inspiration/t3code/apps/web/src/components/BranchToolbar.tsx`
  - T3Code's branch toolbar influenced keeping project/branch/runtime context visible above the chat surface.
- `/home/likas/Research/gui-inspiration/t3code/apps/web/src/components/BranchToolbarBranchSelector.tsx`
  - Influenced the current branch/worktree selector in the wireframe top bar.
- `/home/likas/Research/gui-inspiration/t3code/apps/web/src/components/BranchToolbarEnvModeSelector.tsx`
  - Influenced exposing environment/runtime mode near the project context.
- `/home/likas/Research/gui-inspiration/t3code/apps/web/src/components/chat/ChatComposer.tsx`
  - Contains `runtimeModeConfig` with supervised/less-supervised style runtime choices.
  - This influenced Daedalus making Plan / Build / Autopilot explicit rather than hidden.
- `/home/likas/Research/gui-inspiration/jean/src/components/chat/ChatToolbar.tsx`
  - Jean's session toolbar influenced placing session-level controls close to the active chat.
- `/home/likas/Research/gui-inspiration/jean/src/types/chat.ts`
  - Jean's `ExecutionMode` concept influenced the wireframe's mode vocabulary and mode-aware behavior.

### Contextual right inspector: plan, approvals, diff summary

Wireframe element:

- right-side inspector with Plan, Approvals, Changed Files, Verification Gate
- contextual instead of a permanent dense dashboard

Inspired by:

- `/home/likas/Research/gui-inspiration/t3code/apps/web/src/components/PlanSidebar.tsx`
  - T3Code has a dedicated plan sidebar with active/proposed plan state, step status, copy/download/save actions, and close behavior.
  - This directly inspired the wireframe's right-side Plan section.
- `/home/likas/Research/gui-inspiration/t3code/apps/web/src/components/DiffPanel.tsx`
  - Inspired the wireframe's changed-files/diff summary as a contextual review surface.
- `/home/likas/Research/gui-inspiration/t3code/apps/web/src/components/DiffPanelShell.tsx`
  - Inspired treating diff/review as a side panel rather than defaulting to a separate full dashboard.
- `/home/likas/Research/gui-inspiration/t3code/apps/web/src/routes/_chat.$environmentId.$threadId.tsx`
  - Defines `DiffPanelInlineSidebar` and shows the chat route rendering `ChatView` alongside an inline diff sidebar when needed.
  - This strongly influenced the wireframe's optional right inspector that appears when there is relevant review context.
- `/home/likas/Research/gui-inspiration/jean/src/components/chat/PlanDialog.tsx`
  - Jean's plan display influenced representing plans as reviewable/approvable structured work.
- `/home/likas/Research/gui-inspiration/jean/src/components/chat/PermissionApproval.tsx`
  - Inspired showing approval requests as first-class safety gates.
- `/home/likas/Research/gui-inspiration/jean/src/components/chat/CodexCommandApprovalRequest.tsx`
  - Inspired command approval cards and risky-action confirmation.
- `/home/likas/Research/gui-inspiration/jean/src/components/chat/CodexPermissionsRequest.tsx`
  - Inspired permission-scope approval handling.
- `/home/likas/Research/gui-inspiration/jean/src/components/chat/EditedFilesDisplay.tsx`
  - Inspired changed-file summaries in the inspector.
- `/home/likas/Research/gui-inspiration/jean/src/components/chat/ReviewResultsPanel.tsx`
  - Inspired review/verification findings as a compact contextual panel.

### Terminal/log drawer

Wireframe element:

- bottom terminal/log drawer, partially visible/collapsible
- command/test output available without becoming the default center

Inspired by:

- `/home/likas/Research/gui-inspiration/t3code/apps/web/src/components/ThreadTerminalDrawer.tsx`
  - T3Code's thread terminal drawer provides a resizable terminal surface with limits and terminal controls.
  - This directly inspired the wireframe's bottom terminal/log drawer.
- `/home/likas/Research/gui-inspiration/t3code/apps/web/src/components/ChatView.tsx`
  - T3Code connects terminal state to the active chat thread, influencing Daedalus tying logs to the active session.
- `/home/likas/Research/gui-inspiration/jean/src/components/chat/TerminalPanel.tsx`
  - Jean keeps terminals mounted per worktree and preserves output/running processes across worktree switches.
  - This influenced Daedalus treating terminal state as worktree/session context, not a disposable console.
- `/home/likas/Research/gui-inspiration/jean/src/components/chat/TerminalView.tsx`
  - Inspired the terminal as an operational detail available when needed.
- `/home/likas/Research/gui-inspiration/jean/src/components/chat/ModalTerminalDrawer.tsx`
  - Inspired drawer-style terminal access without making logs the main UI.

### Approvals, verification, and safety gates

Wireframe element:

- explicit approval queue
- verification gate card
- failed/pending command output visible in inspector and terminal drawer

Inspired by:

- `/home/likas/Research/gui-inspiration/jean/src/components/chat/PermissionApproval.tsx`
- `/home/likas/Research/gui-inspiration/jean/src/components/chat/CodexCommandApprovalRequest.tsx`
- `/home/likas/Research/gui-inspiration/jean/src/components/chat/CodexDynamicToolCallRequest.tsx`
- `/home/likas/Research/gui-inspiration/jean/src/components/chat/CodexMcpElicitationRequest.tsx`
- `/home/likas/Research/gui-inspiration/jean/src/components/chat/AskUserQuestion.tsx`
- `/home/likas/Research/gui-inspiration/t3code/apps/web/src/components/chat/ComposerPendingApprovalActions.tsx`
- `/home/likas/Research/gui-inspiration/t3code/apps/web/src/components/chat/ComposerPendingApprovalPanel.tsx`
- `/home/likas/Research/gui-inspiration/t3code/apps/web/src/components/chat/ComposerPendingUserInputPanel.tsx`

These sources influenced the wireframe's view that approvals are not settings or logs; they are live workflow blockers that should appear near the active session and in the contextual inspector.

### Minimal default posture and progressive disclosure

Wireframe element:

- grayscale, quiet UI
- no dashboard metrics by default
- advanced surfaces nearby but not dominant

Inspired by:

- `/home/likas/Research/gui-inspiration/t3code/apps/web/src/components/ChatView.tsx`
- `/home/likas/Research/gui-inspiration/t3code/apps/web/src/components/chat/ChatComposer.tsx`
- `/home/likas/Research/gui-inspiration/t3code/apps/web/src/routes/_chat.index.tsx`
- `/home/likas/Research/gui-inspiration/t3code/apps/web/src/components/NoActiveThreadState.tsx`

These T3Code files informed the wireframe's restraint: the user should be able to open Daedalus and start a conversation without first understanding every project, worktree, agent, terminal, and review concept.

## Secondary references deliberately not primary

`/home/likas/Research/gui-inspiration/superset` and `/home/likas/Research/gui-inspiration/emdash` remain useful references for later power-user flows such as parallel agent monitoring, remote development, ticket intake, PR/CI lifecycle, and broad ADE orchestration.

They were not primary inspirations for this wireframe because the user preference was Jean + T3Code, and because Daedalus should not default to a dense multi-agent operations board.

`/home/likas/Research/Daedalus/packages/web-ui` remains useful as a local source for artifact, attachment, sandbox, and chat-component ideas. It was not used as the main visual structure because `/home/likas/Research/Daedalus/packages/gui` should remain a Svelte-native product surface rather than a direct Lit/mini-lit copy.

## Product principles encoded in the wireframe

1. **Chat is the home base.**
   The user should be able to start, steer, and understand work from the central conversation.

2. **Project context is quiet but available.**
   Repositories, branches, worktrees, sessions, and files are visible without crowding the default state.

3. **The inspector is contextual.**
   Details appear because the user selected a relevant item or because the task needs attention.

4. **Modes are explicit.**
   Plan, Build, and Autopilot should be clear user-facing modes, not hidden behavioral switches.

5. **Verification and approvals are visible.**
   Test results, verification gates, risky actions, and approval requests should be easy to find and hard to miss.

6. **Complexity is progressive rather than default.**
   Daedalus can support multi-agent orchestration, changed-file review, logs, artifacts, and terminal state, but these should unfold from the active task rather than dominate the first screen.

## Intentional non-goals

The wireframe intentionally avoids:

- flashy mockup aesthetics that distract from product structure
- fake metrics that imply nonexistent operational maturity
- permanent dense dashboards as the default layout
- a swarm board as the default mental model
- generic decorative AI UI that looks impressive but does not clarify the workflow

## Mapping to Daedalus concepts

- Muse, Sage, and Worker map to visible but secondary agent activity in the chat stream and inspector.
- Plan, Build, and Autopilot map to explicit mode controls in the top project bar or composer area.
- Verification gates map to right-inspector cards and terminal/log drawer entries.
- Approvals map to prominent inline and inspector actions that require user confirmation.
- Changed files map to contextual inspector sections and review-oriented states.
- Terminal logs map to the bottom drawer so command details are accessible without becoming the main UI.

This keeps Daedalus-specific orchestration visible while preserving the simple Jean + T3Code-inspired workflow.