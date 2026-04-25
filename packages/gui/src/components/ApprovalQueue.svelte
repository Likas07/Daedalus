<script lang="ts">
	import type { ApprovalItem } from "../client/view-model";
	import ApprovalCard from "./ApprovalCard.svelte";

	const { approvals, respond } = $props<{
		approvals: readonly ApprovalItem[];
		respond: (approval: ApprovalItem, decision: "approved" | "denied") => void;
	}>();
</script>

<section class="space-y-3" data-testid="approval-queue">
	<div class="flex items-center justify-between gap-3">
		<div>
			<h3 class="text-xs font-semibold uppercase tracking-wide text-zinc-400">Approval queue</h3>
			<p class="text-xs text-zinc-500">Review risk, scope, and session context before responding.</p>
		</div>
		<span class="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-200" data-testid="approval-count">{approvals.length}</span>
	</div>

	{#each approvals as approval (approval.id)}
		<ApprovalCard {approval} {respond} />
	{:else}
		<p class="rounded-lg border border-dashed border-zinc-800 p-3 text-xs text-zinc-500">No pending approvals.</p>
	{/each}
</section>
