<script lang="ts">
	import type { ThreadMessageRow } from "../../client/thread-message-projection";
	import CompactActivityGroup from "./CompactActivityGroup.svelte";
	import EmptyThreadChat from "./EmptyThreadChat.svelte";
	import MessageBubble from "./MessageBubble.svelte";

	interface Props {
		rows: readonly ThreadMessageRow[];
	}

	let { rows }: Props = $props();
	let scroller: HTMLDivElement | undefined = $state();
	let isAtBottom = $state(true);
	let previousActiveAssistantId = $state<string | null>(null);
	let activeAssistantId = $derived(rows.findLast((row) => row.kind === "message" && row.streaming)?.id ?? null);

	function handleScroll() {
		if (!scroller) return;
		isAtBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 48;
	}

	function scrollToEnd(behavior: ScrollBehavior = "smooth") {
		scroller?.scrollTo({ top: scroller.scrollHeight, behavior });
	}

	$effect(() => {
		const shouldFollow = isAtBottom || (activeAssistantId !== null && activeAssistantId !== previousActiveAssistantId);
		previousActiveAssistantId = activeAssistantId;
		if (!shouldFollow) return;
		requestAnimationFrame(() => scrollToEnd(activeAssistantId ? "smooth" : "auto"));
	});
</script>

<div bind:this={scroller} class="messages-timeline" onscroll={handleScroll} data-component="messages-timeline">
	{#if rows.length === 0}
		<EmptyThreadChat />
	{:else}
		<div class="timeline-stack">
			{#each rows as row (row.id)}
				{#if row.kind === "message"}
					<MessageBubble message={row.message} streaming={row.streaming} />
				{:else if row.kind === "activity"}
					<CompactActivityGroup activities={row.activities} status={row.status} />
				{:else if row.kind === "working"}
					<CompactActivityGroup activities={[{ id: row.id, kind: "thinking", status: "running", title: row.title, startedAt: row.createdAt ?? new Date(0).toISOString() }]} status="running" />
				{:else if row.kind === "pending-action"}
					<CompactActivityGroup activities={[{ id: row.id, kind: "approval", status: "running", title: row.action.title, detail: row.action.summary, startedAt: row.createdAt ?? new Date(0).toISOString() }]} status="running" />
				{/if}
			{/each}
		</div>
	{/if}
</div>

<style>
	.messages-timeline { height: 100%; overflow-y: auto; overscroll-behavior: contain; padding: 1.25rem; }
	.timeline-stack { display: flex; min-height: 100%; flex-direction: column; justify-content: flex-end; gap: 0.15rem; }
</style>
