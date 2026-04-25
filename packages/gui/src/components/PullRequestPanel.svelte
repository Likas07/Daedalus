<script lang="ts">
	import type { IntegrationPullRequest } from "@daedalus-pi/app-server-protocol";
	import { canCreateOrUpdatePullRequest } from "../client/integration-state";
	const { pullRequests = [], safePushEnabled = false, onCreate } = $props<{
		pullRequests?: readonly IntegrationPullRequest[];
		safePushEnabled?: boolean;
		onCreate?: () => void;
	}>();
	const enabled = $derived(canCreateOrUpdatePullRequest({ safePushEnabled }));
</script>

<section aria-label="Pull requests" class="space-y-2">
	<header class="flex items-center justify-between">
		<h3 class="text-xs font-semibold uppercase tracking-wide text-zinc-500">Pull requests</h3>
		<button type="button" disabled={!enabled} title={enabled ? "Create pull request" : "Safe push support is required before PR create/update"} onclick={() => onCreate?.()}>Create PR</button>
	</header>
	{#each pullRequests as pr (pr.number)}
		<article class="rounded border border-zinc-800 p-2 text-sm">
			<p>#{pr.number} {pr.title}</p>
			<p class="text-xs text-zinc-500">{pr.state}</p>
		</article>
	{:else}
		<p class="text-sm text-zinc-500">No pull requests imported.</p>
	{/each}
</section>
