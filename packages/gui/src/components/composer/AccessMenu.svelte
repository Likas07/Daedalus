<script lang="ts">
	import type { AccessMode } from "../../client/gui-state-types";
	import type { UiState } from "../../client/ui-state.svelte";

	const { mode = "supervised", onSelect, ui } = $props<{
		mode?: AccessMode;
		onSelect?: (mode: AccessMode) => void;
		ui: UiState;
	}>();

	type Access = { id: AccessMode; label: string; sub: string; kbd: string };
	const modes: Access[] = [
		{ id: "supervised",  label: "Supervised",  sub: "Approve every edit and command", kbd: "Super+Shift+1" },
		{ id: "auto-accept", label: "Auto-accept", sub: "Edits applied · commands gated", kbd: "Super+Shift+2" },
		{ id: "unrestricted", label: "Unrestricted", sub: "Audited · hard blocks remain", kbd: "Super+Shift+3" },
	];

	function pick(value: AccessMode): void {
		onSelect?.(value);
		ui.popoverKind = null;
		ui.popoverAnchor = null;
	}

	function glyphFor(id: AccessMode): string {
		if (id === "supervised") return "M5 7V5a3 3 0 0 1 6 0v2";
		if (id === "auto-accept") return "M5 7V5a3 3 0 0 1 5.5-1.6";
		return "M5 7V5a3 3 0 0 1 6 0";
	}
</script>

<div class="flex h-full min-h-0 flex-col" data-testid="access-menu">
	<div class="border-b border-ink-500 px-3 py-2">
		<div class="caps text-bone-400">approvals</div>
	</div>

	<ul class="min-h-0 flex-1 divide-y divide-ink-500 overflow-y-auto">
		{#each modes as access}
			{@const on = mode === access.id}
			<li>
				<button
					type="button"
					onclick={() => pick(access.id)}
					class="grid w-full grid-cols-[16px_1fr_auto] items-start gap-2 px-3 py-2 text-left transition hover:bg-ink-850"
				>
					<svg viewBox="0 0 16 16" class="mt-0.5 h-3.5 w-3.5 {on ? 'text-gold' : 'text-bone-400'}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<rect x="3" y="7" width="10" height="6" rx="1" />
						<path d={glyphFor(access.id)} />
					</svg>
					<div class="min-w-0">
						<div class="text-[12.5px] {on ? 'font-medium text-bone-50' : 'text-bone-100'}">{access.label}</div>
						<div class="truncate font-mono text-[10px] text-bone-400">{access.sub}</div>
					</div>
					<kbd class="mt-0.5 rounded-sm border border-ink-500 px-1.5 py-px font-mono text-[9.5px] text-bone-400">{access.kbd}</kbd>
				</button>
			</li>
		{/each}
	</ul>
</div>
