<script lang="ts">
	import type { RendererModel } from "../../client/gui-state-types";
	import type { UiState } from "../../client/ui-state.svelte";

	const { effort, onSelect, model, fastMode, onSelectFastMode, ui } = $props<{
		effort?: string;
		onSelect?: (effort: string) => void;
		model?: RendererModel;
		fastMode: boolean;
		onSelectFastMode?: (value: boolean) => void;
		ui: UiState;
	}>();

	const labels: Record<string, string> = {
		minimal: "Minimal",
		low: "Low",
		medium: "Medium",
		high: "High",
		xhigh: "Extra high",
	};

	const levels = $derived<readonly string[]>(model?.reasoningLevels ?? []);
	const supportsReasoning = $derived(model?.reasoning === true && levels.length > 0);
	const supportsFastMode = $derived(model?.supportsFastMode === true);
	const contextLabel = $derived(formatContext(model?.contextWindow ?? 0));

	function formatContext(value: number): string {
		if (value <= 0) return "—";
		if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M tokens`;
		return `${Math.round(value / 1000)}k tokens`;
	}
</script>

{#snippet sectionLabel(text: string)}
	<div class="px-3 pb-1 pt-2 caps text-bone-400">{text}</div>
{/snippet}

{#snippet checkRow(active: boolean, label: string, sub: string | null, click: () => void)}
	<button
		type="button"
		onclick={click}
		class="grid w-full grid-cols-[14px_1fr] items-baseline gap-2 px-3 py-1 text-left transition hover:bg-ink-850 {active ? 'text-bone-50' : 'text-bone-200'}"
	>
		<span class="text-[11px] {active ? 'text-gold' : 'text-transparent'}" aria-hidden="true">✓</span>
		<span class="min-w-0 truncate text-[12.5px] {active ? 'font-medium' : ''}">
			{label}{#if sub}<span class="ml-1 font-mono text-[10px] text-bone-400">({sub})</span>{/if}
		</span>
	</button>
{/snippet}

<div class="flex h-full min-h-0 flex-col" data-testid="effort-menu">
	<div class="min-h-0 flex-1 overflow-y-auto py-1">
		{@render sectionLabel("reasoning")}
		{#if supportsReasoning}
			<ul>
				{#each levels as level}
					<li>{@render checkRow(effort === level, labels[level] ?? level, null, () => onSelect?.(level))}</li>
				{/each}
			</ul>
		{:else}
			<div class="px-3 py-2 text-[11.5px] text-bone-400">Reasoning levels not available for this model.</div>
		{/if}

		<div class="my-1 h-px bg-ink-500"></div>

		{@render sectionLabel("context window")}
		<div class="px-3 py-1 font-mono text-[11.5px] text-bone-200">{contextLabel}</div>

		{#if supportsFastMode}
			<div class="my-1 h-px bg-ink-500"></div>
			{@render sectionLabel("fast mode")}
			<ul>
				<li>{@render checkRow(fastMode === true, "On", "priority tier", () => onSelectFastMode?.(true))}</li>
				<li>{@render checkRow(fastMode === false, "Off", null, () => onSelectFastMode?.(false))}</li>
			</ul>
		{/if}
	</div>
</div>
