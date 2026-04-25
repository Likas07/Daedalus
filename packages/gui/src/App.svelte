<script lang="ts">
	import type { ExtensionUiRequest } from "@daedalus-pi/app-server-protocol";
	import { GUI_COMMANDS, type CommandId } from "./client/commands";
	import { createGuiStateStore } from "./client/state.svelte";
	import type { GuiRuntime } from "./client/runtime";
	import type { ApprovalItem } from "./client/view-model";
	import CommandPalette from "./components/CommandPalette.svelte";
	import ExtensionDialogs from "./components/ExtensionDialogs.svelte";
	import InspectorPanel from "./components/InspectorPanel.svelte";
	import ProjectCanvas from "./components/ProjectCanvas.svelte";
	import SessionWorkspace from "./components/SessionWorkspace.svelte";
	import SettingsPanel from "./components/SettingsPanel.svelte";
	import Sidebar from "./components/Sidebar.svelte";
	import TerminalDrawer from "./components/TerminalDrawer.svelte";
	import WorkspaceShell from "./components/WorkspaceShell.svelte";

	let { runtime } = $props<{ runtime: GuiRuntime }>();
	const store = createGuiStateStore(runtime);
	const guiState = $derived(store.current);
	let settingsOpen = $state(false);

	function focusComposer(): void {
		document.querySelector<HTMLTextAreaElement>('[data-testid="composer-prompt"]')?.focus();
	}

	function runCommand(commandId: CommandId): void {
		switch (commandId) {
			case "open-settings":
			case "provider-settings":
				settingsOpen = true;
				runtime.selectSession(undefined);
				break;
			case "focus-composer":
			case "new-session":
				settingsOpen = false;
				runtime.selectSession(undefined);
				setTimeout(focusComposer, 0);
				break;
			case "show-approval-queue":
				document.querySelector<HTMLElement>('[data-testid="approval-queue"]')?.scrollIntoView();
				break;
		}
	}

	function respond(request: ExtensionUiRequest, actionId: string, values: Record<string, unknown>): void {
		void runtime.respondToExtensionUI({ requestId: request.requestId, actionId, values }).then(() => {
			const index = runtime.state.extensionRequests.findIndex((item: ExtensionUiRequest) => item.requestId === request.requestId);
			if (index >= 0) runtime.state.extensionRequests.splice(index, 1);
			runtime.notify();
		});
	}

	function respondToApproval(approvalId: string, decision: "approved" | "denied"): void {
		void runtime.respondToApproval(approvalId, decision).then(() => {
			const index = runtime.state.approvalItems.findIndex((item: ApprovalItem) => item.id === approvalId);
			if (index >= 0) runtime.state.approvalItems.splice(index, 1);
			runtime.notify();
		});
	}
</script>

<WorkspaceShell state={guiState}>
	{#snippet navigation()}
		<Sidebar state={guiState} {runtime} onOpenSettings={() => (settingsOpen = true)} />
	{/snippet}

	{#snippet main()}
		{#if settingsOpen}
			<SettingsPanel state={guiState} />
		{:else if guiState.selectedSessionId}
			<SessionWorkspace state={guiState} {runtime} />
		{:else}
			<ProjectCanvas state={guiState} {runtime} />
		{/if}
	{/snippet}

	{#snippet inspector()}
		<InspectorPanel state={guiState} {respondToApproval} />
	{/snippet}

	{#snippet terminal()}
		<TerminalDrawer state={guiState} />
	{/snippet}
</WorkspaceShell>

<div class="sr-only" aria-live="polite" aria-atomic="true">
	Connection status: {guiState.connected ? "connected" : "offline"}. Pending approvals: {guiState.approvalItems.length}.
</div>

<ExtensionDialogs requests={guiState.extensionRequests} {respond} />
<CommandPalette commands={GUI_COMMANDS} onCommand={runCommand} />
