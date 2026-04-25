<script lang="ts">
	import type { IntegrationIssue } from "@daedalus-pi/app-server-protocol";
	const { issues = [], onPick } = $props<{ issues?: readonly IntegrationIssue[]; onPick?: (issue: IntegrationIssue) => void }>();
</script>

<section aria-label="Issue context picker" class="space-y-2">
	<h3 class="text-xs font-semibold uppercase tracking-wide text-zinc-500">Issues</h3>
	{#each issues as issue (issue.id)}
		<button type="button" class="block w-full rounded border border-zinc-800 p-2 text-left text-sm" onclick={() => onPick?.(issue)}>
			<span>{issue.title}</span>
			<span class="ml-2 text-xs text-zinc-500">{issue.state}</span>
		</button>
	{:else}
		<p class="text-sm text-zinc-500">No issues imported.</p>
	{/each}
</section>
