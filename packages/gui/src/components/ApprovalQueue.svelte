<script lang="ts">
	import type { ApprovalItem } from "../client/view-model";
	import ApprovalCard from "./ApprovalCard.svelte";

	const { approvals, respond } = $props<{
		approvals: readonly ApprovalItem[];
		respond: (approval: ApprovalItem, decision: "approved" | "denied", message?: string) => void;
	}>();

	function onQueueKeydown(event: KeyboardEvent): void {
		const approval = approvals[0];
		if (!approval) return;
		if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
			event.preventDefault();
			respond(approval, "approved");
		} else if (event.key === "Escape") {
			event.preventDefault();
			respond(approval, "denied");
		}
	}
</script>

	<svelte:window onkeydown={onQueueKeydown} />

<section class="space-y-4" data-testid="approval-queue" aria-labelledby="approval-queue-title">
	<header class="flex items-baseline justify-between gap-3">
		<div>
			<div id="approval-queue-title" class="caps text-bone-400">queue · approvals</div>
			<p class="mt-1 font-mono text-[10.5px] text-bone-400">
				review risk, scope, and session context before responding.
			</p>
		</div>
		<span
			class="caps text-bone-300 tabular-nums"
			data-testid="approval-count"
			aria-label={`${approvals.length} approvals pending`}
		>
			pending {approvals.length.toString().padStart(2, "0")}
		</span>
	</header>

	<div class="space-y-4" role="list" aria-label="Pending approval requests">
		{#each approvals as approval (approval.id)}
			<ApprovalCard {approval} {respond} />
		{:else}
			<p class="font-mono text-[11px] text-bone-400">No pending approvals.</p>
		{/each}
	</div>
</section>
