<script lang="ts">
	import type { IntegrationIssue } from "@daedalus-pi/app-server-protocol";
	const { issues = [], loading = false, error, backendStatus, onPick } = $props<{
		issues?: readonly IntegrationIssue[];
		loading?: boolean;
		error?: string;
		backendStatus?: string;
		onPick?: (issue: IntegrationIssue) => void;
	}>();

	function stateToneClass(state: string): string {
		if (state === "open") return "pill pill-green";
		if (state === "closed") return "pill";
		return "pill pill-blue";
	}
</script>

<section aria-label="Issue context picker" class="space-y-2" aria-busy={loading}>
	<header>
		<div class="eyebrow eyebrow-brass">ledger · issues</div>
		<h3 class="mt-0.5 font-display text-[16px] italic text-[color:var(--bone)]">Issues</h3>
		{#if backendStatus}
			<p class="mt-1 font-mono text-[10.5px] text-[color:var(--bone-faint)]">{backendStatus}</p>
		{/if}
	</header>
	{#if error}
		<p class="inspector-empty text-[color:var(--crimson)]">{error}</p>
	{/if}
	{#each issues as issue (issue.id)}
		<button
			type="button"
			class="block w-full rounded-sm border border-[color:var(--rule)] bg-[color:var(--ink-3)] p-3 text-left transition hover:border-[color:var(--brass-rule)]"
			disabled={loading}
			onclick={() => onPick?.(issue)}
		>
			<div class="flex items-center justify-between gap-3">
				<span class="flex items-center gap-2 truncate">
					<span aria-hidden="true" class="font-display text-[14px] italic text-[color:var(--brass)]">◆</span>
					<span class="truncate text-[13px] text-[color:var(--bone)]">{issue.title}</span>
				</span>
				<span class={stateToneClass(issue.state)}>{issue.state}</span>
			</div>
			{#if issue.labels?.length}
				<p class="mt-2 font-mono text-[10px] text-[color:var(--bone-faint)]">{issue.labels.join(" · ")}</p>
			{/if}
		</button>
	{:else}
		<p class="inspector-empty">{loading ? "Loading issues…" : "No GitHub issues found."}</p>
	{/each}
</section>
