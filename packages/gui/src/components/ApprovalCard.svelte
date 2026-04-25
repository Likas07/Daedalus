<script lang="ts">
	import type { ApprovalItem } from "../client/view-model";

	const { approval, respond } = $props<{
		approval: ApprovalItem;
		respond: (approval: ApprovalItem, decision: "approved" | "denied") => void;
	}>();
	let revisionMessage = $state("");
	const riskClass = $derived(
		approval.risk === "high"
			? "border-red-500/40 bg-red-500/10 text-red-200"
			: approval.risk === "medium"
				? "border-amber-500/40 bg-amber-500/10 text-amber-200"
				: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
	);

	function askToRevise(): void {
		revisionMessage = "Revision request drafted locally. Ask the agent to propose a safer alternative in chat; no approval protocol message was sent.";
	}
</script>

<article class="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3" data-testid="approval-card" aria-label={`Approval requested: ${approval.summary}. Risk: ${approval.risk}`}> 
	<div class="mb-3 flex items-start justify-between gap-3">
		<div>
			<h4 class="text-sm font-medium text-zinc-100">Approval requested</h4>
			<p class="mt-1 text-xs text-zinc-400">{approval.summary}</p>
		</div>
		<span class={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${riskClass}`} aria-label={`Risk level: ${approval.risk}`}>{approval.risk} risk</span>
	</div>

	<dl class="grid gap-2 text-xs">
		<div class="grid grid-cols-[4rem_minmax(0,1fr)] gap-2">
			<dt class="text-zinc-500">What</dt>
			<dd class="text-zinc-300">{approval.summary}</dd>
		</div>
		<div class="grid grid-cols-[4rem_minmax(0,1fr)] gap-2">
			<dt class="text-zinc-500">Why</dt>
			<dd class="text-zinc-300">Agent needs operator approval before continuing.</dd>
		</div>
		<div class="grid grid-cols-[4rem_minmax(0,1fr)] gap-2">
			<dt class="text-zinc-500">Where</dt>
			<dd class="text-zinc-300">{approval.sessionId ?? "Current project"}</dd>
		</div>
		<div class="grid grid-cols-[4rem_minmax(0,1fr)] gap-2">
			<dt class="text-zinc-500">Scope</dt>
			<dd class="break-words text-zinc-300">{approval.scope}</dd>
		</div>
	</dl>

	<div class="mt-3 grid grid-cols-3 gap-2">
		<button type="button" class="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1.5 text-xs text-emerald-200 hover:border-emerald-400" aria-label={`Approve once: ${approval.summary}`} onclick={() => respond(approval, "approved")}>Approve once</button>
		<button type="button" class="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-xs text-red-200 hover:border-red-400" aria-label={`Deny approval: ${approval.summary}`} onclick={() => respond(approval, "denied")}>Deny</button>
		<button type="button" class="rounded-md border border-zinc-700 bg-zinc-900/70 px-2 py-1.5 text-xs text-zinc-300 hover:border-cyan-700/60" onclick={askToRevise}>Ask agent to revise</button>
	</div>
	{#if revisionMessage}<p class="mt-2 rounded-md border border-cyan-500/20 bg-cyan-500/10 p-2 text-xs text-cyan-200" role="status">{revisionMessage}</p>{/if}
</article>
