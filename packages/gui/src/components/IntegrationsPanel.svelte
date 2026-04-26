<script lang="ts">
	import type { IntegrationProviderState } from "@daedalus-pi/app-server-protocol";
	import { integrationPanelViewModel, summarizeIntegration } from "../client/integration-state";

	const { integrations = [], loading = false, error, onConnect, onDisconnect, onImport } = $props<{
		integrations?: readonly IntegrationProviderState[];
		loading?: boolean;
		error?: string;
		onConnect?: (provider: string) => void;
		onDisconnect?: (provider: string) => void;
		onImport?: (provider: string) => void;
	}>();

	function statusToneClass(status: string): string {
		if (status === "authenticated" || status === "available") return "pill pill-green";
		if (status === "error" || status === "not-configured") return "pill pill-crimson";
		if (status === "unknown") return "pill pill-blue";
		return "pill";
	}
</script>

<section class="space-y-3" aria-label="Integrations" aria-busy={loading}>
	<header class="flex items-baseline justify-between">
		<div>
			<div class="eyebrow eyebrow-brass">ledger · integrations</div>
			<h2 class="mt-1 font-display text-[20px] italic text-[color:var(--bone)]">Integrations</h2>
		</div>
		<span class="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--bone-faint)]">
			{loading ? "syncing" : `${integrations.length} bound`}
		</span>
	</header>
	{#if error}
		<p class="inspector-empty text-[color:var(--crimson)]">{error}</p>
	{/if}
	{#each integrations as integration (integration.provider)}
		{@const vm = integrationPanelViewModel(integration, { loading, error })}
		<article class="rounded-md border border-[color:var(--rule)] bg-[color:var(--ink-2)] p-4">
			<div class="flex items-start justify-between gap-3">
				<div class="min-w-0">
					<div class="flex items-center gap-2">
						<span aria-hidden="true" class="font-display text-[16px] italic text-[color:var(--brass)]">¶</span>
						<h3 class="text-[14px] font-medium text-[color:var(--bone)]">{summarizeIntegration(integration)}</h3>
					</div>
					<p class="mt-1 font-mono text-[10.5px] text-[color:var(--bone-faint)]">{vm.backendStatus}</p>
					<p class="mt-1 font-mono text-[10.5px] text-[color:var(--bone-faint)]">
						{vm.issueCount} issues · {vm.pullRequestCount} PRs · {vm.ciSummary} · updated <time>{integration.updatedAt}</time>
					</p>
				</div>
				<span class={statusToneClass(integration.status)}>{integration.status}</span>
			</div>
			{#if vm.error}
				<p class="mt-3 rounded-sm border border-[color:var(--crimson)]/40 p-2 font-mono text-[11px] text-[color:var(--crimson)]">{vm.error}</p>
			{/if}
			<div class="mt-3 flex flex-wrap gap-2">
				<button class="btn-mini" type="button" disabled={loading} onclick={() => onConnect?.(integration.provider)}>Connect / sync</button>
				<button class="btn-mini" type="button" disabled={loading} onclick={() => onImport?.(integration.provider)}>Manual import</button>
				<button class="btn-mini text-[color:var(--crimson)]" type="button" disabled={loading} onclick={() => onDisconnect?.(integration.provider)}>Disconnect</button>
			</div>
		</article>
	{:else}
		<p class="inspector-empty">{loading ? "Loading GitHub integration state…" : "No integration state published yet."}</p>
	{/each}
</section>
