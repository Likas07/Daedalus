<script lang="ts">
	import type { DiagnosticExport } from "@daedalus-pi/app-server-protocol";
	const { diagnostics, onExport, onRetryFailedTool } = $props<{
		diagnostics?: DiagnosticExport;
		onExport?: () => void;
		onRetryFailedTool?: () => void;
	}>();
</script>

<section aria-label="Diagnostics" class="space-y-3">
	<header class="flex items-center justify-between">
		<h2 class="text-sm font-semibold text-zinc-100">Diagnostics and recovery</h2>
		<button type="button" onclick={() => onExport?.()}>Export bundle</button>
	</header>
	<button type="button" class="rounded border border-zinc-700 px-2 py-1 text-xs" onclick={() => onRetryFailedTool?.()}>Retry failed tool</button>
	{#if diagnostics}
		<dl class="text-xs text-zinc-400">
			<dt>Exported</dt><dd>{diagnostics.exportedAt}</dd>
			<dt>Platform</dt><dd>{diagnostics.environment.platform}/{diagnostics.environment.arch}</dd>
			<dt>Recent protocol events</dt><dd>{diagnostics.recentProtocolEvents.length}</dd>
		</dl>
	{:else}
		<p class="text-sm text-zinc-500">No diagnostic export loaded.</p>
	{/if}
</section>
