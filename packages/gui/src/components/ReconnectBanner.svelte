<script lang="ts">
	import type { ConnectionStatus } from "../client/reconnect-state";
	import { reconnectMessage } from "../client/integration-state";

	const {
		connected = true,
		status = connected ? "connected" : "disconnected",
		endpoint,
		attempt = 0,
		lastEventCursor,
		onReconnect,
		onExportDiagnostics,
	} = $props<{
		connected?: boolean;
		status?: ConnectionStatus;
		endpoint?: string;
		attempt?: number;
		lastEventCursor?: string;
		onReconnect?: () => void;
		onExportDiagnostics?: () => void;
	}>();
	const message = $derived(statusMessage(status, endpoint, attempt, lastEventCursor) ?? reconnectMessage(connected, endpoint));

	function statusMessage(status: ConnectionStatus, endpoint?: string, attempt?: number, cursor?: string): string | undefined {
		if (status === "connected") return undefined;
		const target = endpoint ? ` ${endpoint}` : " the app server";
		const cursorText = cursor ? ` Replaying after event ${cursor}.` : "";
		if (status === "connecting") return `Connecting to${target}.${cursorText}`;
		if (status === "replaying") return `Reconnected to${target}; replaying missed events.${cursorText}`;
		if (status === "failed") return `Reconnect failed after ${attempt ?? 0} attempts.${cursorText} Export diagnostics for details.`;
		return `Disconnected from${target}. Reconnect will replay missed events.${cursorText}`;
	}
</script>

{#if message}
	<section
		class="relative overflow-hidden rounded-md border border-[color:var(--ember)]/45 bg-gradient-to-br from-[color:var(--ember)]/12 to-[color:var(--ember)]/4 px-4 py-3"
		aria-live="polite"
		data-testid="reconnect-banner"
	>
		<span aria-hidden="true" class="absolute left-0 top-0 bottom-0 w-1 bg-[color:var(--ember)]"></span>
		<div class="flex items-start gap-3 pl-2">
			<span aria-hidden="true" class="mt-0.5 grid size-6 place-items-center rounded-full border border-[color:var(--ember)] font-display text-[14px] italic text-[color:var(--ember)]">
				!
			</span>
			<div class="flex-1">
				<p class="font-display text-[15px] italic text-[color:var(--bone)]">Connection {status}</p>
				<p class="mt-1 font-mono text-[11.5px] text-[color:var(--bone-soft)]">{message}</p>
				<div class="mt-3 flex gap-2">
					<button class="btn-brass" type="button" onclick={() => onReconnect?.()}>Reconnect</button>
					<button class="btn-ghost" type="button" onclick={() => onExportDiagnostics?.()}>
						Export diagnostics
					</button>
				</div>
			</div>
		</div>
	</section>
{/if}
