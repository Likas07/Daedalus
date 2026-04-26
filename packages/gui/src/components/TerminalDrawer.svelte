<script lang="ts">
	import type { GuiRuntime, GuiState } from "../client/runtime";
	import { removeTerminal, selectExistingTerminal } from "./terminal/terminal-state";
	import { disposeManagedXterm } from "./terminal/xterm-manager";
	import XtermViewport from "./terminal/XtermViewport.svelte";
	import TerminalHeader from "./TerminalHeader.svelte";
	import TerminalTabs from "./TerminalTabs.svelte";

	const { state: appState, runtime, onCollapse } = $props<{ state: GuiState; runtime: GuiRuntime; onCollapse?: () => void }>();
	const activeTerminal = $derived(appState.terminals.find((terminal: import("../client/gui-state-types").RendererTerminal) => terminal.terminalId === appState.activeTerminalId) ?? appState.terminals[0]);

	async function createTerminal(): Promise<void> {
		await runtime.createTerminal({ cwd: appState.projectRoot ?? "/", projectId: appState.lastProjectId, cols: 100, rows: 24 });
	}
	function selectTerminal(id: string): void {
		appState.activeTerminalId = id;
		void runtime.replayTerminal(id);
		runtime.notify();
	}
	async function closeTerminal(id: string): Promise<void> {
		await runtime.killTerminal(id);
		disposeManagedXterm(id);
		appState.terminals = removeTerminal(appState.terminals, id);
		appState.activeTerminalId = selectExistingTerminal(appState.terminals, appState.activeTerminalId);
		runtime.notify();
	}
</script>

<section class="terminal-shell flex h-72 flex-col" data-testid="terminal-drawer">
	<div class="flex items-center justify-between gap-3 px-4 pt-2">
		<div class="flex items-center gap-3">
			<span class="eyebrow eyebrow-brass">forge · 04 · terminal</span>
			<span aria-hidden="true" class="h-px w-8 bg-[color:var(--rule-strong)]"></span>
			<span class="font-mono text-[10px] uppercase tracking-[0.16em] text-bone-400">{appState.terminals.length} session{appState.terminals.length === 1 ? "" : "s"}</span>
		</div>
		<span class="font-display text-[12px] italic text-bone-400">furnace</span>
	</div>
	<TerminalTabs terminals={appState.terminals} selectedTerminalId={activeTerminal?.terminalId} onSelect={selectTerminal} onNew={() => void createTerminal()} onClose={(id) => void closeTerminal(id)} />
	<TerminalHeader terminal={activeTerminal} onKill={() => activeTerminal && void closeTerminal(activeTerminal.terminalId)} {onCollapse} />
	<div class="min-h-0 flex-1">
		{#if activeTerminal}
			<XtermViewport terminalId={activeTerminal.terminalId} history={activeTerminal.history} {runtime} />
		{:else}
			<div class="flex h-full items-center justify-center bg-black/60 font-mono text-xs text-bone-400">
				<button class="btn-mini" type="button" onclick={() => void createTerminal()}>Create terminal</button>
			</div>
		{/if}
	</div>
</section>
