<script lang="ts">
	import type { SafetySignal } from "@daedalus-pi/app-server-protocol";

	const { targetValidation = "unknown", accessMode = "ask", dirtyTarget = false, pendingApprovals = 0, connectionState = "connected", signals = [] } = $props<{
		targetValidation?: string;
		accessMode?: string;
		dirtyTarget?: boolean;
		pendingApprovals?: number;
		connectionState?: string;
		signals?: readonly SafetySignal[];
	}>();

	const tone = $derived(targetValidation === "blocked" || connectionState === "disconnected" || signals.some((signal: SafetySignal) => signal.level === "blocked") ? "blocked" : dirtyTarget || pendingApprovals > 0 || targetValidation !== "valid" || signals.some((signal: SafetySignal) => signal.level === "warning") ? "warning" : "info");
</script>

<section
	class="flex flex-wrap items-center gap-2 rounded-sm border px-3 py-2 font-mono text-[10.5px] {tone === 'blocked' ? 'border-crimson-500/50 text-crimson-200' : tone === 'warning' ? 'border-ember-500/50 text-ember-100' : 'border-ink-500 text-bone-300'}"
	aria-label="Thread safety signals"
	aria-live="polite"
	data-tone={tone}
>
	<span class="caps" aria-label={`Target validation: ${targetValidation}`}>target {targetValidation}</span>
	<span aria-hidden="true">·</span>
	<span class="caps" aria-label={`Access mode: ${accessMode}`}>access {accessMode}</span>
	<span aria-hidden="true">·</span>
	<span class="caps" aria-label={dirtyTarget ? "Dirty target has uncommitted changes" : "Target has no dirty change signal"}>{dirtyTarget ? "dirty target" : "clean target"}</span>
	<span aria-hidden="true">·</span>
	<span class="caps" aria-label={`${pendingApprovals} pending approvals`}>approvals {pendingApprovals}</span>
	<span aria-hidden="true">·</span>
	<span class="caps" aria-label={`Connection state: ${connectionState}`}>{connectionState}</span>
	{#each signals as signal}
		<span class="truncate" aria-label={`Safety ${signal.level}: ${signal.message}`}>{signal.message}</span>
	{/each}
</section>
