<script lang="ts">
	import type { IntegrationProviderState } from "@daedalus-pi/app-server-protocol";
	import { summarizeIntegration } from "../client/integration-state";

	const { integrations = [], onConnect, onDisconnect, onImport } = $props<{
		integrations?: readonly IntegrationProviderState[];
		onConnect?: (provider: string) => void;
		onDisconnect?: (provider: string) => void;
		onImport?: (provider: string) => void;
	}>();
</script>

<section class="space-y-3" aria-label="Integrations">
	<header><h2 class="text-sm font-semibold text-zinc-100">Integrations</h2></header>
	{#each integrations as integration (integration.provider)}
		<article class="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
			<h3 class="text-sm text-zinc-100">{summarizeIntegration(integration)}</h3>
			<p class="text-xs text-zinc-500">Updated {integration.updatedAt}</p>
			<div class="mt-2 flex flex-wrap gap-2 text-xs">
				<button type="button" onclick={() => onConnect?.(integration.provider)}>Connect / sync</button>
				<button type="button" onclick={() => onImport?.(integration.provider)}>Manual import</button>
				<button type="button" onclick={() => onDisconnect?.(integration.provider)}>Disconnect</button>
			</div>
		</article>
	{:else}
		<p class="text-sm text-zinc-500">No integration state published yet.</p>
	{/each}
</section>
