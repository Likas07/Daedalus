<script lang="ts">
	import type { WorkflowTerminalMetadata } from "@daedalus-pi/app-server-protocol";
	const { terminals = [], selectedTerminalId, onSelect } = $props<{ terminals?: readonly WorkflowTerminalMetadata[]; selectedTerminalId?: string; onSelect?: (id: string) => void }>();
</script>
<div class="flex gap-1 overflow-x-auto border-b border-zinc-900 px-2 pt-2">
	{#each terminals as terminal}
		<button class={`rounded-t-md border border-b-0 px-3 py-1 text-xs ${String(terminal.id) === selectedTerminalId ? 'border-cyan-700 bg-zinc-900 text-cyan-100' : 'border-zinc-800 bg-black text-zinc-500'}`} onclick={() => onSelect?.(String(terminal.id))}>{terminal.status} · {terminal.cwd.split('/').at(-1)}</button>
	{:else}<span class="px-2 py-1 text-xs text-zinc-600">No terminals</span>{/each}
</div>
