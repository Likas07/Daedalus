<script lang="ts">
	import type { UiState } from "../../client/ui-state.svelte";
	import { composerModes, composerModeDescriptions, composerModeLabels, composerModeRoleNames, composerModeShortcuts, type ComposerMode } from "./composer-logic";

	const { mode, onSelect, ui } = $props<{
		mode: ComposerMode;
		onSelect?: (mode: ComposerMode) => void;
		ui: UiState;
	}>();

	function pick(value: ComposerMode): void {
		onSelect?.(value);
		ui.popoverKind = null;
		ui.popoverAnchor = null;
	}
</script>

<div class="flex h-full min-h-0 flex-col" data-testid="mode-menu">
	<div class="border-b border-ink-500 px-3 py-2">
		<div class="caps text-bone-400">primary role</div>
	</div>

	<ul class="min-h-0 flex-1 divide-y divide-ink-500 overflow-y-auto">
		{#each composerModes as item}
			{@const on = mode === item}
			<li>
				<button
					type="button"
					onclick={() => pick(item)}
					class="grid w-full grid-cols-[14px_1fr_auto] items-start gap-2 px-3 py-2 text-left transition hover:bg-ink-850"
				>
					<span class="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full {on ? 'bg-gold' : 'bg-ink-500'}"></span>
					<div class="min-w-0">
						<div class="text-[12.5px] {on ? 'font-medium text-bone-50' : 'text-bone-100'}">{composerModeLabels[item]} <span class="ml-1 font-mono text-[10px] text-bone-400">({composerModeRoleNames[item]})</span></div>
						<div class="truncate font-mono text-[10px] text-bone-400">{composerModeDescriptions[item]}</div>
					</div>
					<kbd class="mt-0.5 rounded-sm border border-ink-500 px-1.5 py-px font-mono text-[9.5px] text-bone-400">{composerModeShortcuts[item]}</kbd>
				</button>
			</li>
		{/each}
	</ul>
</div>
