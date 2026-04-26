<script lang="ts">
	import { createProjectDashboardViewModel } from "../client/project-dashboard-view-model";
	import type { GuiRuntime, GuiState } from "../client/runtime";
	import type { UiState } from "../client/ui-state.svelte";

	const { guiState, runtime, ui, onViewChange, onPaletteOpenChange, onLeftOpenChange, onRightOpenChange } = $props<{
		guiState: GuiState;
		runtime: GuiRuntime;
		ui: UiState;
		onViewChange?: (view: UiState["view"]) => void;
		onPaletteOpenChange?: (open: boolean) => void;
		onLeftOpenChange?: (open: boolean) => void;
		onRightOpenChange?: (open: boolean) => void;
	}>();
	const dashboard = $derived(createProjectDashboardViewModel(guiState));
	const projectLabel = $derived(dashboard.projectName === "Choose a workspace" ? "Daedalus" : dashboard.projectName);
	const projectPath = $derived(dashboard.projectPath ?? "No project selected");

	function setView(view: UiState["view"]): void {
		onViewChange?.(view);
	}

	function setPaletteOpen(open: boolean): void {
		onPaletteOpenChange?.(open);
	}
</script>

<header class="flex h-9 shrink-0 items-center gap-4 border-b border-ink-500 px-4" data-testid="project-bar">
	<button
		type="button"
		onclick={() => onLeftOpenChange?.(!ui.leftOpen)}
		aria-label="Toggle left sidebar"
		aria-pressed={ui.leftOpen}
		title="Toggle left sidebar  Super+\\"
		class="flex h-6 w-6 items-center justify-center rounded-sm transition hover:bg-ink-850 {ui.leftOpen ? 'text-bone-100' : 'text-bone-400 hover:text-bone-100'}"
	>
		<svg viewBox="0 0 16 16" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="1.25" aria-hidden="true">
			<rect x="2.5" y="3.5" width="11" height="9" rx="1" />
			<line x1="6.5" y1="3.5" x2="6.5" y2="12.5" />
			{#if ui.leftOpen}
				<rect x="2.5" y="3.5" width="4" height="9" rx="1" fill="currentColor" fill-opacity="0.32" stroke="none" />
			{/if}
		</svg>
	</button>

	<button
		type="button"
		onclick={() => { runtime.selectSession(undefined); setView("empty"); }}
		class="font-wordmark text-[12px] font-medium tracking-[0.32em] text-bone-50 transition hover:text-gold"
	>
		DAEDALUS
	</button>

	<span class="min-w-0 truncate font-mono text-[10.5px] text-bone-400" title={projectPath}>
		{projectLabel} · {dashboard.branchLabel} · +{dashboard.git.insertions} · −{dashboard.git.deletions}
	</span>

	<span class="ml-auto flex items-center gap-4">
		<button
			type="button"
			onclick={() => setPaletteOpen(!ui.paletteOpen)}
			class="flex items-center gap-2 caps text-bone-400 transition hover:text-bone-100"
			data-testid="palette-toggle"
		>
			<span>search</span>
			<kbd class="rounded-sm border border-ink-500 px-1.5 py-px font-mono text-[10px] tracking-normal text-bone-300">Super+K</kbd>
		</button>

		<button
			type="button"
			onclick={() => onRightOpenChange?.(!ui.rightOpen)}
			aria-label="Toggle right inspector"
			aria-pressed={ui.rightOpen}
			title="Toggle right inspector  Super+."
			class="flex h-6 w-6 items-center justify-center rounded-sm transition hover:bg-ink-850 {ui.rightOpen ? 'text-bone-100' : 'text-bone-400 hover:text-bone-100'}"
		>
			<svg viewBox="0 0 16 16" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="1.25" aria-hidden="true">
				<rect x="2.5" y="3.5" width="11" height="9" rx="1" />
				<line x1="9.5" y1="3.5" x2="9.5" y2="12.5" />
				{#if ui.rightOpen}
					<rect x="9.5" y="3.5" width="4" height="9" rx="1" fill="currentColor" fill-opacity="0.32" stroke="none" />
				{/if}
			</svg>
		</button>
	</span>
</header>
