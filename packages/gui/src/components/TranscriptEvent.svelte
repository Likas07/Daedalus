<script lang="ts">
	import type { TranscriptItem } from "../client/view-model";
	import AssistantMessage from "./transcript/AssistantMessage.svelte";
	import BashExecutionMessage from "./transcript/BashExecutionMessage.svelte";
	import CompactionMessage from "./transcript/CompactionMessage.svelte";
	import CustomMessage from "./transcript/CustomMessage.svelte";
	import SkillInvocationMessage from "./transcript/SkillInvocationMessage.svelte";
	import ToolExecutionMessage from "./transcript/ToolExecutionMessage.svelte";
	import UserMessage from "./transcript/UserMessage.svelte";

	const { item } = $props<{ item: TranscriptItem }>();
	let expanded = $state(false);
	let copied = $state(false);

	async function copyRaw(): Promise<void> {
		const text = JSON.stringify(item.raw, null, 2);
		await navigator.clipboard?.writeText(text).catch(() => undefined);
		copied = true;
		setTimeout(() => (copied = false), 1200);
	}
</script>

<article
	class="transcript-event"
	data-tone={item.type}
	data-testid="transcript-event"
	aria-label={`${item.type} transcript event: ${item.title}`}
>
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0 flex-1">
			<div class="flex flex-wrap items-center gap-2">
				<span class="transcript-type">{item.type}</span>
				<h3 class="transcript-title truncate">{item.title}</h3>
			</div>
			{#if item.kind === "assistant"}
				<AssistantMessage {item} />
			{:else if item.kind === "user"}
				<UserMessage {item} />
			{:else if item.kind === "bash"}
				<BashExecutionMessage {item} />
			{:else if item.kind === "tool"}
				<ToolExecutionMessage {item} />
			{:else if item.kind === "compaction" || item.kind === "branch-summary"}
				<CompactionMessage {item} />
			{:else if item.kind === "skill"}
				<SkillInvocationMessage {item} />
			{:else if item.kind === "custom" || item.kind === "custom-message" || item.kind === "label"}
				<CustomMessage {item} />
			{:else if item.summary}
				<p class="transcript-summary line-clamp-3">{item.summary}</p>
			{/if}
		</div>
		<div class="flex shrink-0 items-center gap-2">
			{#if item.timestamp}
				<time class="font-mono text-[10px] text-[color:var(--bone-faint)] tabular-nums">
					{new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
				</time>
			{/if}
			{#if item.expandable}
				<div class="transcript-actions">
					<button
						type="button"
						aria-expanded={expanded}
						aria-label={`${expanded ? "Collapse" : "Expand"} raw details for ${item.title}`}
						onclick={() => (expanded = !expanded)}
					>
						{expanded ? "Collapse" : "Expand"}
					</button>
					<button
						type="button"
						aria-label={`Copy raw JSON for ${item.title}`}
						onclick={copyRaw}
					>
						{copied ? "Copied" : "Copy"}
					</button>
				</div>
			{/if}
		</div>
	</div>
	{#if expanded}
		<pre class="transcript-pre">{JSON.stringify(item.raw, null, 2)}</pre>
	{/if}
</article>
