<script lang="ts">
	import type { RendererTerminal } from "../client/gui-state-types";
	import type { GuiRuntime, GuiState } from "../client/runtime";
	import type { UiState } from "../client/ui-state.svelte";
	import TerminalDrawer from "./TerminalDrawer.svelte";

	const { guiState: appState, runtime, ui, onTerminalOpenChange } = $props<{ guiState: GuiState; runtime: GuiRuntime; ui: UiState; onTerminalOpenChange?: (open: boolean) => void }>();
	const active = $derived(appState.terminals.find((terminal: RendererTerminal) => terminal.id === appState.activeTerminalId) ?? appState.terminals[0]);
	const lastLine = $derived(((active?.history ?? appState.terminalOutput ?? "").split("\n").filter((line: string) => line.trim().length > 0).at(-1)) ?? "ready");
	const cwdLabel = $derived(appState.projectRoot ?? "~");
	function setTerminalOpen(open: boolean): void {
		onTerminalOpenChange?.(open);
	}
</script>

{#if ui.terminalOpen}
	<TerminalDrawer state={appState} {runtime} onCollapse={() => setTerminalOpen(false)} />
{:else}
	<footer class="flex h-7 shrink-0 items-center gap-4 border-t border-ink-500 px-5 font-mono text-[10.5px] text-bone-400" data-testid="terminal-tail">
		<span class="text-bone-300">$</span>
		<span class="min-w-0 truncate">
			<span class="text-bone-300">{active?.id ?? "terminal"}</span>
			<span class="text-bone-500"> · </span>
			<span class="text-bone-300">{lastLine}</span>
		</span>
		<span class="ml-auto shrink-0 truncate text-bone-500" title={cwdLabel}>{cwdLabel}</span>
		<button
			type="button"
			onclick={() => setTerminalOpen(!ui.terminalOpen)}
			class="caps transition hover:text-bone-100"
		>
			{ui.terminalOpen ? "collapse" : "expand"}
			<span class="ml-2 text-[10px] tracking-normal text-bone-500">Super+`</span>
		</button>
	</footer>
{/if}
