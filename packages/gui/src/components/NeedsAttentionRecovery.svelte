<script lang="ts">
	import type { NewBuildState } from "../client/new-build-state-machine";
	import type { SessionSummary } from "../client/runtime";

	const { state, session, blocking = false } = $props<{ state?: NewBuildState; session?: SessionSummary; blocking?: boolean }>();
	const message = $derived(state?.kind === "needsAttention" ? state.message : session?.needsAttentionReason ?? "Build target needs attention.");
	const show = $derived(state?.kind === "needsAttention" || session?.validationStatus === "needs_attention" || session?.validationStatus === "invalid");
</script>

{#if show}
	<section
		class="needs-attention-recovery"
		role={blocking ? "alertdialog" : "alert"}
		aria-modal={blocking ? "true" : undefined}
		aria-labelledby="needs-attention-title"
		aria-describedby="needs-attention-message needs-attention-disabled-reason"
		data-testid="needs-attention-recovery"
	>
		<div class="sheet-kicker">Needs attention</div>
		<h2 id="needs-attention-title">Validate build target before continuing</h2>
		<p id="needs-attention-message">{message}</p>
		<div class="recovery-actions" role="group" aria-label="Recovery actions">
			<button type="button">Repair</button>
			<button type="button">Locate worktree</button>
			<button type="button">Archive record</button>
		</div>
		<p id="needs-attention-disabled-reason" class="visible-disabled-reason">Continue is unavailable until validation passes.</p>
	</section>
{/if}
