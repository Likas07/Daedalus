<script lang="ts">
	import type { ComposerSlashCommand } from "../../client/gui-state-types";
	const { open, query, commands = [], activeIndex = 0, onSelect } = $props<{ open: boolean; query: string; commands?: readonly ComposerSlashCommand[]; activeIndex?: number; onSelect?: (command: ComposerSlashCommand) => void }>();
	const filtered = $derived(commands.filter((c: ComposerSlashCommand) => c.name.includes(query) || c.label.toLowerCase().includes(query.toLowerCase())));
</script>
{#if open}
	<div class="absolute z-20 mt-2 w-full rounded-xl border border-ink-500 bg-ink-900 p-2 shadow-xl" data-testid="slash-command-popover">
		<div class="px-2 pb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-bone-400">commands · /{query}</div>
		{#each filtered as command, index}
			<button type="button" class="block w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-ink-700 disabled:opacity-50" data-active={index === activeIndex} disabled={command.disabled} title={command.disabledReason ?? command.sourcePath ?? command.source} onclick={() => !command.disabled && onSelect?.(command)}>
				<span class="font-mono">/{command.name}</span>
				<span class="ml-2 rounded border border-ink-500 px-1 font-mono text-[9px] uppercase text-bone-400">{command.source}</span>
				<span class="ml-2 text-bone-300">{command.description ?? command.label}</span>
				{#if command.disabledReason}<span class="ml-2 text-[11px] text-bone-500">{command.disabledReason}</span>{/if}
			</button>
		{:else}<div class="px-2 py-2 text-sm text-bone-400">No matching commands</div>{/each}
	</div>
{/if}
