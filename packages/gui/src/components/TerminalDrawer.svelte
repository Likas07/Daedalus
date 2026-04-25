<script lang="ts">
	import type { GuiState } from "../client/runtime";
	import { createWorkflowState } from "../client/workflow-state";
	import TerminalHeader from "./TerminalHeader.svelte";
	import TerminalTabs from "./TerminalTabs.svelte";
	const { state } = $props<{ state: GuiState }>();
	const workflow = $derived(createWorkflowState({ selectedTerminalId: state.activeTerminalId ?? undefined }));
	const activeTerminal = $derived(workflow.terminals.find((terminal) => String(terminal.id) === workflow.selectedTerminalId));
</script>

<section class="h-40 border-t border-zinc-800 bg-black/80">
	<TerminalTabs terminals={workflow.terminals} selectedTerminalId={workflow.selectedTerminalId} />
	<TerminalHeader terminal={activeTerminal} />
	<pre class="h-24 overflow-auto p-3 font-mono text-[11px] leading-relaxed text-zinc-400">{state.terminalOutput || '$ waiting for terminal output…'}</pre>
</section>
