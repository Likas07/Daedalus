<script lang="ts">
	import type { ApprovalItem } from "../client/view-model";

	const { approval, respond } = $props<{
		approval: ApprovalItem;
		respond: (approval: ApprovalItem, decision: "approved" | "denied", message?: string) => void;
	}>();
	let revisionMessage = $state("");

	function askToRevise(): void {
		const message = "Please revise this tool request and propose a safer alternative.";
		revisionMessage = message;
		respond(approval, "denied", message);
	}

	const accentClass = $derived.by(() => {
		if (approval.risk === "high") return "border-red-500";
		if (approval.risk === "medium") return "border-amber-400";
		return "border-gold";
	});
</script>

<section
	class="border-l pl-5 {accentClass}"
	data-testid="approval-card"
	data-risk={approval.risk}
	role="listitem"
	aria-label="Approval requested: {approval.summary}. Risk: {approval.risk}"
>
	<header class="mb-2 flex items-baseline gap-3">
		<h3 class="text-[13px] font-medium text-bone-50">Permission required</h3>
		<span class="caps text-bone-400">{approval.risk} risk</span>
	</header>

	<p class="mb-4 max-w-[60ch] text-[13px] text-bone-200">{approval.summary}</p>

	<div class="mb-5">
		<code class="block font-mono text-[12px] text-bone-100">{approval.summary}</code>
		<span class="mt-1 block font-mono text-[10px] text-bone-400">scope · {approval.scope}</span>
	</div>

	<div class="flex items-center gap-5">
		<button
			type="button"
			onclick={() => respond(approval, "approved")}
			class="caps border border-gold px-4 py-1.5 text-gold transition hover:bg-gold hover:text-ink-950"
			aria-label="Approve once: {approval.summary}"
		>
			Approve once
			<span class="ml-2 font-mono text-[10px] tracking-normal opacity-70">Super+↵</span>
		</button>
		<button
			type="button"
			onclick={() => respond(approval, "denied")}
			class="caps text-bone-300 transition hover:text-bone-50"
			aria-label="Deny approval: {approval.summary}"
		>Deny</button>
		<button
			type="button"
			onclick={askToRevise}
			class="caps ml-auto text-bone-400 transition hover:text-bone-100"
		>Ask to revise</button>
	</div>

	{#if revisionMessage}
		<p class="mt-3 font-mono text-[10.5px] text-bone-400" role="status">{revisionMessage}</p>
	{/if}
</section>
