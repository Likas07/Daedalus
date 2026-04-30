<script lang="ts">
	import type { ThreadActivity } from "@daedalus-pi/app-server-protocol";

	interface Props {
		activities: readonly ThreadActivity[];
		status: ThreadActivity["status"];
	}

	let { activities, status }: Props = $props();
let open = $state(false);
	$effect(() => {
		open = status === "running" || status === "failed";
	});
	let title = $derived(activities.length === 1 ? activities[0]?.title ?? "Activity" : `${activities.length} ${activities[0]?.kind ?? "work"} steps`);
	let tone = $derived(status === "failed" ? "error" : status === "running" ? "active" : "done");
</script>

<section class="activity-group" data-activity-status={status} data-activity-tone={tone}>
	<button type="button" class="activity-summary" aria-expanded={open} onclick={() => (open = !open)}>
		<span class="activity-dot" aria-hidden="true"></span>
		<span class="activity-title">{title}</span>
		<span class="activity-meta">{status}</span>
	</button>
	{#if open}
		<ul class="activity-list" aria-label="Thread activity">
			{#each activities as activity (activity.id)}
				<li>
					<span class="activity-kind">{activity.kind}</span>
					<span>{activity.title}</span>
					{#if activity.detail}
						<details class="redacted-detail">
							<summary>Details hidden</summary>
							<p>Raw activity detail is hidden by default to avoid exposing sensitive tool data.</p>
						</details>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.activity-group { margin: 0.35rem auto; width: min(38rem, 88%); color: color-mix(in srgb, currentColor 72%, transparent); font-size: 0.82rem; }
	.activity-summary { display: flex; align-items: center; gap: 0.5rem; width: 100%; border: 1px solid rgba(148, 163, 184, 0.22); border-radius: 999px; background: rgba(148, 163, 184, 0.08); color: inherit; padding: 0.4rem 0.7rem; cursor: pointer; }
	.activity-dot { width: 0.48rem; height: 0.48rem; border-radius: 999px; background: #94a3b8; }
	[data-activity-tone="active"] .activity-dot { background: #38bdf8; box-shadow: 0 0 0 0.25rem rgba(56, 189, 248, 0.14); }
	[data-activity-tone="error"] .activity-dot { background: #f97316; }
	.activity-title { flex: 1; overflow: hidden; text-align: left; text-overflow: ellipsis; white-space: nowrap; }
	.activity-meta { text-transform: capitalize; opacity: 0.68; }
	.activity-list { margin: 0.35rem 0 0 1.05rem; padding: 0; list-style: none; }
	.activity-list li { display: grid; grid-template-columns: 5.5rem 1fr; gap: 0.45rem; padding: 0.25rem 0; }
	.activity-kind { text-transform: capitalize; opacity: 0.66; }
	.redacted-detail { grid-column: 2; opacity: 0.78; }
	.redacted-detail p { margin: 0.25rem 0 0; }
</style>
