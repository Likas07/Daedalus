<script lang="ts">
	import type { RendererTerminal } from "../client/gui-state-types";
	import { terminalCloseLabel, terminalLabel } from "./terminal/terminal-state";
	const { terminals = [], selectedTerminalId, onSelect, onNew, onClose } = $props<{
		terminals?: readonly RendererTerminal[];
		selectedTerminalId?: string;
		onSelect?: (id: string) => void;
		onNew?: () => void;
		onClose?: (id: string) => void;
	}>();

	function onTabKeydown(event: KeyboardEvent, terminalId: string): void {
		const index = terminals.findIndex((terminal: RendererTerminal) => terminal.terminalId === terminalId);
		if (index < 0) return;
		if (event.key === "ArrowRight") {
			event.preventDefault();
			onSelect?.(terminals[(index + 1) % terminals.length].terminalId);
		} else if (event.key === "ArrowLeft") {
			event.preventDefault();
			onSelect?.(terminals[(index - 1 + terminals.length) % terminals.length].terminalId);
		}
	}
</script>

<div class="flex items-end gap-1 overflow-x-auto border-b border-ink-500 px-3 pt-1.5" role="tablist" aria-label="Terminal tabs">
	{#each terminals as terminal}
		<button
			type="button"
			class="terminal-tab"
			data-active={terminal.terminalId === selectedTerminalId}

			role="tab"
			aria-selected={terminal.terminalId === selectedTerminalId}
			aria-controls={`terminal-panel-${terminal.terminalId}`}
			tabindex={terminal.terminalId === selectedTerminalId ? 0 : -1}
			onkeydown={(event) => onTabKeydown(event, terminal.terminalId)}
			onclick={() => onSelect?.(terminal.terminalId)}
		>
			<span class="text-bone-400">{terminal.status}</span>
			<span class="ml-1.5">{terminalLabel(terminal)}</span>
		</button>
		<button class="btn-mini mb-1" type="button" aria-label={terminalCloseLabel(terminal)} onclick={() => onClose?.(terminal.terminalId)}>×</button>
	{:else}
		<span class="px-2 pb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-bone-400">No terminals</span>
	{/each}
	<button class="btn-mini mb-1 ml-auto" type="button" onclick={onNew}>New terminal</button>
</div>
