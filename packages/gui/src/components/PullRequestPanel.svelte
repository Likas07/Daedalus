<script lang="ts">
	import type { IntegrationCiCheck, IntegrationPullRequest } from "@daedalus-pi/app-server-protocol";
	import { canCreateOrUpdatePullRequest } from "../client/integration-state";
	const { pullRequests = [], ciChecks = [], safePushEnabled = false, loading = false, error, onCreate } = $props<{
		pullRequests?: readonly IntegrationPullRequest[];
		ciChecks?: readonly IntegrationCiCheck[];
		safePushEnabled?: boolean;
		loading?: boolean;
		error?: string;
		onCreate?: () => void;
	}>();
	const enabled = $derived(canCreateOrUpdatePullRequest({ safePushEnabled }) && !loading);

	function stateToneClass(state: string): string {
		if (state === "open") return "pill pill-green";
		if (state === "merged") return "pill pill-brass";
		if (state === "closed" || state === "failure") return "pill pill-crimson";
		return "pill";
	}
</script>

<section aria-label="Pull requests" class="space-y-2" aria-busy={loading}>
	<header class="flex items-baseline justify-between">
		<div>
			<div class="eyebrow eyebrow-brass">ledger · pulls</div>
			<h3 class="mt-0.5 font-display text-[16px] italic text-[color:var(--bone)]">Pull requests</h3>
		</div>
		<button
			type="button"
			class={enabled ? "btn-brass" : "btn-ghost"}
			disabled={!enabled}
			title={enabled ? "Create pull request (approval required)" : "Approval-gated safe push support is required before PR create/update"}
			onclick={() => onCreate?.()}
		>
			Create PR
		</button>
	</header>
	{#if error}
		<p class="inspector-empty text-[color:var(--crimson)]">{error}</p>
	{/if}
	{#each pullRequests as pr (pr.number)}
		<article class="inspector-card">
			<div class="inspector-card-title">
				<span class="flex items-center gap-2">
					<span class="font-mono tabular-nums text-[color:var(--bone-faint)]">#{pr.number}</span>
					<span>{pr.title}</span>
				</span>
				<span class={stateToneClass(pr.state)}>{pr.state}</span>
			</div>
			<p class="inspector-card-meta">{pr.head ?? "head"} → {pr.base ?? "base"} · approval gated</p>
		</article>
	{:else}
		<p class="inspector-empty">{loading ? "Loading pull requests…" : "No pull requests found."}</p>
	{/each}
	{#if ciChecks.length}
		<div class="space-y-1">
			{#each ciChecks as check (check.name)}
				<p class="inspector-card-meta"><span class={stateToneClass(check.status)}>{check.status}</span> {check.name}{check.summary ? ` — ${check.summary}` : ""}</p>
			{/each}
		</div>
	{/if}
</section>
