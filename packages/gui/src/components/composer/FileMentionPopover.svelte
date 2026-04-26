<script lang="ts">
	import type { ComposerFileMention } from "../../client/gui-state-types";
	const { open, query, files = [], activeIndex = 0, onSelect } = $props<{ open: boolean; query: string; files?: readonly ComposerFileMention[]; activeIndex?: number; onSelect?: (file: ComposerFileMention) => void }>();
</script>
{#if open}
	<div class="absolute z-20 mt-2 w-full rounded-xl border border-ink-500 bg-ink-900 p-2 shadow-xl" data-testid="file-mention-popover">
		<div class="px-2 pb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-bone-400">files · @{query}</div>
		{#each files as file, index}
			<button type="button" class="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm hover:bg-ink-700" data-active={index === activeIndex} onclick={() => onSelect?.(file)}>
				<span>{file.label || file.path}</span><span class="font-mono text-[10px] text-bone-400">{file.kind}</span>
			</button>
		{:else}<div class="px-2 py-2 text-sm text-bone-400">No matching files</div>{/each}
	</div>
{/if}
