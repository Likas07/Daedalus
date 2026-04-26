<script lang="ts">
	import type { ExtensionUiRequest } from "@daedalus-pi/app-server-protocol";
	import { createCommandRegistry, type RegisteredCommand } from "./client/command-registry";
	import { createGuiStateStore } from "./client/state.svelte";
	import { createUiState } from "./client/ui-state.svelte";
	import type { GuiRuntime } from "./client/runtime";
	import type { ApprovalItem } from "./client/view-model";
	import CommandPalette from "./components/CommandPalette.svelte";
	import DiffOverlay from "./components/DiffOverlay.svelte";
	import EmptyState from "./components/EmptyState.svelte";
	import ExtensionDialogs from "./components/ExtensionDialogs.svelte";
	import Inspector from "./components/Inspector.svelte";
	import LeftNav from "./components/LeftNav.svelte";
	import ProjectBar from "./components/ProjectBar.svelte";
	import ReconnectBanner from "./components/ReconnectBanner.svelte";
	import ProjectCanvas from "./components/ProjectCanvas.svelte";
	import Session from "./components/Session.svelte";
	import SettingsPanel from "./components/SettingsPanel.svelte";
	import TerminalTail from "./components/TerminalTail.svelte";

	let { runtime } = $props<{ runtime: GuiRuntime }>();
	const store = $derived(createGuiStateStore(runtime));
	const guiState = $derived(store.current);
	const ui = createUiState();
	const extensions = $derived(guiState.extensionRequests.map((request) => ({
		id: request.extensionId,
		enabled: true,
		capabilities: ["ui"],
		permissions: [],
		commands: request.actions.map((action) => ({ id: action.id, extensionId: request.extensionId, kind: "command" as const, title: action.label })),
		panes: [],
		backgroundTasks: [],
		errors: [],
	})));
	const commandRegistry = $derived<readonly RegisteredCommand[]>(createCommandRegistry({
		guiState,
		ui,
		runtime,
		extensions,
		focusComposer,
		dispatchExtensionCommand: (command) => {
			const request = guiState.extensionRequests.find((item) => item.extensionId === command.extensionId && item.actions.some((action) => action.id === command.id));
			if (request) respond(request, command.id, {});
		},
		exportDiagnostics: copyDiagnostics,
	}));
	applyViewportPolicy();
	$effect(() => {
		ui.view = guiState.selectedSessionId ? "session" : ui.view === "session" ? "empty" : ui.view;
	});

	$effect(() => {
		const onResize = () => applyViewportPolicy();
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	});

	$effect(() => {
		const onKeydown = (event: KeyboardEvent): void => {
			if (!event.metaKey && !event.altKey) return;
			if (event.ctrlKey || event.shiftKey) return;
			if (event.key === "\\") { event.preventDefault(); ui.leftOpen = !ui.leftOpen; }
			else if (event.key === ".") { event.preventDefault(); ui.rightOpen = !ui.rightOpen; }
			else if (event.key === "`") { event.preventDefault(); ui.terminalOpen = !ui.terminalOpen; }
		};
		window.addEventListener("keydown", onKeydown);
		return () => window.removeEventListener("keydown", onKeydown);
	});

	function applyViewportPolicy(width = window.innerWidth): void {
		ui.compact = width < 760;
		if (width < 520) {
			ui.leftOpen = false;
			ui.rightOpen = false;
			return;
		}
		if (width < 760) ui.rightOpen = false;
	}

	function focusComposer(): void {
		document.querySelector<HTMLTextAreaElement>('[data-testid="composer-prompt"]')?.focus();
	}

	function setView(view: typeof ui.view): void {
		ui.view = view;
	}

	function setPaletteOpen(open: boolean, mode: typeof ui.paletteMode = "commands"): void {
		ui.paletteMode = mode;
		ui.paletteOpen = open;
		window.dispatchEvent(new CustomEvent("daedalus:palette-open", { detail: { open, mode } }));
	}

	function setLeftOpen(open: boolean): void {
		ui.leftOpen = open;
	}

	function setRightOpen(open: boolean): void {
		ui.rightOpen = open;
	}

	function setTerminalOpen(open: boolean): void {
		ui.terminalOpen = open;
	}

	function copyDiagnostics(diagnostics: string): void {
		void navigator.clipboard?.writeText(diagnostics);
		console.info("Daedalus diagnostics export", diagnostics);
	}

	function respond(request: ExtensionUiRequest, actionId: string, values: Record<string, unknown>): void {
		void runtime.respondToExtensionUI({ requestId: request.requestId, actionId, values }).then(() => {
			const index = runtime.state.extensionRequests.findIndex((item: ExtensionUiRequest) => item.requestId === request.requestId);
			if (index >= 0) runtime.state.extensionRequests.splice(index, 1);
			runtime.notify();
		});
	}

	function closeExtensionRequest(request: ExtensionUiRequest): void {
		void runtime.closeExtensionUI?.(request.requestId);
	}

	function respondToApproval(approvalId: string, decision: "approved" | "denied"): void {
		void runtime.respondToApproval(approvalId, decision).then(() => {
			const index = runtime.state.approvalItems.findIndex((item: ApprovalItem) => item.id === approvalId);
			if (index >= 0) runtime.state.approvalItems.splice(index, 1);
			runtime.notify();
		});
	}
</script>

<main class="h-screen overflow-hidden bg-ink-950 text-bone-50" data-testid="mock-shell">
	<div class="flex h-full flex-col">
		<ProjectBar guiState={guiState} {runtime} {ui} onViewChange={setView} onPaletteOpenChange={setPaletteOpen} onLeftOpenChange={setLeftOpen} onRightOpenChange={setRightOpen} />
		{#if guiState.connectionStatus !== "connected"}
			<div class="px-4 py-3">
				<ReconnectBanner status={guiState.connectionStatus} endpoint={guiState.projectRoot} attempt={guiState.reconnectAttempt} lastEventCursor={guiState.lastEventCursor} onReconnect={() => void runtime.reconnect()} onExportDiagnostics={() => runtime.exportDiagnostics()} />
			</div>
		{/if}
		<div class="grid min-h-0 flex-1 {ui.leftOpen && ui.rightOpen ? 'grid-cols-[minmax(220px,17rem)_minmax(0,1fr)_minmax(300px,22rem)]' : ui.leftOpen ? 'grid-cols-[minmax(220px,17rem)_minmax(0,1fr)]' : ui.rightOpen ? 'grid-cols-[minmax(0,1fr)_minmax(300px,22rem)]' : 'grid-cols-1'}">
			{#if ui.leftOpen}
				<div class="min-w-0 overflow-hidden border-r border-ink-500 bg-ink-900"><LeftNav guiState={guiState} {runtime} {ui} onViewChange={setView} onPaletteOpenChange={setPaletteOpen} /></div>
			{/if}
			<section class="min-w-0 overflow-hidden bg-ink-950">
				{#if ui.view === "settings"}
					<SettingsPanel guiState={guiState} {runtime} {ui} />
				{:else if guiState.selectedSessionId && ui.view === "session"}
					<Session guiState={guiState} {runtime} {ui} />
				{:else if guiState.sessions.length === 0}
					<EmptyState guiState={guiState} {runtime} {ui} onViewChange={setView} onPaletteOpenChange={setPaletteOpen} />
				{:else}
					<ProjectCanvas guiState={guiState} {runtime} {ui} />
				{/if}
			</section>
			{#if ui.rightOpen}
				<div class="min-w-0 overflow-hidden border-l border-ink-500 bg-ink-900" role="complementary" aria-label="Inspector drawer"><Inspector guiState={guiState} {respondToApproval} {ui} /></div>
			{/if}
		</div>
		<TerminalTail guiState={guiState} {runtime} {ui} onTerminalOpenChange={setTerminalOpen} />
	</div>
</main>

<div class="sr-only" aria-live="polite" aria-atomic="true">
	Connection status: {guiState.connected ? "connected" : "offline"}. Pending approvals: {guiState.approvalItems.length}.
</div>

<ExtensionDialogs requests={guiState.extensionRequests} {respond} close={closeExtensionRequest} />
<CommandPalette commands={commandRegistry} guiState={guiState} {runtime} {ui} />
<DiffOverlay guiState={guiState} {ui} />
