<script lang="ts">
	import type { GuiState } from "../client/runtime";
	import ProviderStatusRow from "./ProviderStatusRow.svelte";
	import AutomationRulesPanel from "./AutomationRulesPanel.svelte";
	import ExtensionsManager from "./ExtensionsManager.svelte";

	const { state } = $props<{ state: GuiState }>();
	const categories = [
		"General",
		"Providers",
		"Autonomy & Approvals",
		"Projects & Worktrees",
		"Terminal",
		"Git",
		"Integrations",
		"Extensions",
		"Appearance",
		"Keybindings",
		"Web Access",
		"Usage",
		"Diagnostics",
		"Experimental",
	] as const;
</script>

<section class="h-full overflow-auto p-4" data-testid="settings-panel">
	<div class="mb-4">
		<p class="text-[10px] uppercase tracking-[0.22em] text-cyan-300">Settings</p>
		<h2 class="text-lg font-semibold text-zinc-100">Preferences and providers</h2>
	</div>
	<div class="grid gap-4 lg:grid-cols-[14rem_minmax(0,1fr)]">
		<nav class="space-y-1">
			{#each categories as category}
				<a class="block rounded-md border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs text-zinc-300" href={`#settings-${category.toLowerCase().replaceAll(" ", "-").replaceAll("&", "and")}`}>{category}</a>
			{/each}
		</nav>
		<div class="space-y-4">
			{#each categories as category}
				<section id={`settings-${category.toLowerCase().replaceAll(" ", "-").replaceAll("&", "and")}`} class="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
					<h3 class="text-sm font-semibold text-zinc-100">{category}</h3>
					{#if category === "Providers"}
						<div class="mt-3 space-y-2">
							{#each state.providerStatuses as provider}
								<ProviderStatusRow {provider} />
							{:else}
								<ProviderStatusRow provider={{ provider: "No server providers", authenticated: false, status: "unknown" }} />
							{/each}
						</div>
					{:else if category === "Web Access"}
						<div class="mt-3 rounded-lg border border-zinc-800 p-3 text-xs text-zinc-400">
							<p>Endpoint: {state.connected ? "Connected app-server endpoint" : "Disconnected"}</p>
							<p>Token: hidden by default; visible only in native bootstrap diagnostics.</p>
							<p>Allowed origins: localhost / configured desktop origin.</p>
						</div>
					{:else if category === "Extensions"}
						<div class="mt-3"><ExtensionsManager /></div>
					{:else if category === "Autonomy & Approvals"}
						<p class="mt-2 text-xs text-zinc-500">Approval policy and automation guardrails stay separate from provider selection.</p>
						<div class="mt-3"><AutomationRulesPanel /></div>
					{:else if category === "Diagnostics"}
						<p class="mt-2 text-xs text-zinc-500">Export transcript, tool logs, app-server logs, environment, versions, integration status, audit trail, and recent protocol events.</p>
					{:else}
						<p class="mt-2 text-xs text-zinc-500">Placeholder settings will be enabled as protocol data and mutations are added.</p>
					{/if}
				</section>
			{/each}
		</div>
	</div>
</section>
