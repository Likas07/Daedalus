<script lang="ts">
	import { reconnectMessage } from "../client/integration-state";

	const { connected = true, endpoint, onReconnect, onExportDiagnostics } = $props<{
		connected?: boolean;
		endpoint?: string;
		onReconnect?: () => void;
		onExportDiagnostics?: () => void;
	}>();
	const message = $derived(reconnectMessage(connected, endpoint));
</script>

{#if message}
	<section class="rounded-xl border border-amber-500/40 bg-amber-950/30 p-3 text-sm text-amber-100" aria-live="polite">
		<p>{message}</p>
		<div class="mt-2 flex gap-2">
			<button type="button" class="rounded bg-amber-300 px-2 py-1 text-black" onclick={() => onReconnect?.()}>Reconnect</button>
			<button type="button" class="rounded border border-amber-400/50 px-2 py-1" onclick={() => onExportDiagnostics?.()}>Export diagnostics</button>
		</div>
	</section>
{/if}
