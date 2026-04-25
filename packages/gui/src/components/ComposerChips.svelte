<script lang="ts">
	export type ComposerChipKind = "project" | "session" | "mode" | "draft" | "file" | "diff" | "issue" | "pr" | "link";
	export interface ComposerChip {
		readonly id: string;
		readonly kind: ComposerChipKind;
		readonly label: string;
		readonly removable?: boolean;
	}

	const {
		chips = [],
		onRemove,
	} = $props<{
		chips?: readonly ComposerChip[];
		onRemove?: (chip: ComposerChip) => void;
	}>();
</script>

{#if chips.length > 0}
	<div class="flex flex-wrap gap-1.5" aria-label="Composer context">
		{#each chips as chip (chip.id)}
			<span class="inline-flex items-center gap-1.5 rounded-full border border-zinc-700/80 bg-zinc-900/80 px-2 py-1 text-[11px] text-zinc-300">
				<span class="text-zinc-500">{chip.kind}</span>
				<span>{chip.label}</span>
				{#if chip.removable !== false}
					<button
						type="button"
						class="rounded-full px-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
						aria-label={`Remove ${chip.kind} ${chip.label}`}
						onclick={() => onRemove?.(chip)}
					>
						×
					</button>
				{/if}
			</span>
		{/each}
	</div>
{/if}
