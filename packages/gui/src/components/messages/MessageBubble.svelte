<script lang="ts">
	import type { ThreadMessage } from "@daedalus-pi/app-server-protocol";
	import AssistantMarkdown from "./AssistantMarkdown.svelte";

	interface Props {
		message: ThreadMessage;
		streaming?: boolean;
	}

	let { message, streaming = false }: Props = $props();
	let isUser = $derived(message.role === "user");
</script>

<div class:user-row={isUser} class:assistant-row={!isUser} class="message-row" data-message-role={message.role}>
	<article class:user-bubble={isUser} class:assistant-bubble={!isUser} class="message-bubble" aria-live={streaming ? "polite" : undefined}>
		{#if isUser}
			<p>{message.content}</p>
		{:else}
			<AssistantMarkdown content={message.content} />
			{#if streaming}
				<div class="streaming-indicator" aria-label="Assistant is still responding">
					<span></span>
					<span></span>
					<span></span>
				</div>
			{/if}
		{/if}
	</article>
</div>

<style>
	.message-row { display: flex; width: 100%; padding: 0.35rem 0; }
	.user-row { justify-content: flex-end; }
	.assistant-row { justify-content: flex-start; }
	.message-bubble { max-width: min(42rem, 88%); border-radius: 1.15rem; padding: 0.75rem 0.95rem; line-height: 1.55; font-size: 0.95rem; }
	.user-bubble { border-bottom-right-radius: 0.35rem; background: #2563eb; color: white; box-shadow: 0 10px 30px rgba(37, 99, 235, 0.22); }
	.user-bubble p { margin: 0; white-space: pre-wrap; }
	.assistant-bubble { width: min(42rem, 100%); border-bottom-left-radius: 0.35rem; background: rgba(148, 163, 184, 0.12); color: inherit; }
	.streaming-indicator { display: inline-flex; gap: 0.2rem; margin-top: 0.45rem; opacity: 0.55; }
	.streaming-indicator span { width: 0.28rem; height: 0.28rem; border-radius: 999px; background: currentColor; animation: pulse 1.2s infinite ease-in-out; }
	.streaming-indicator span:nth-child(2) { animation-delay: 0.15s; }
	.streaming-indicator span:nth-child(3) { animation-delay: 0.3s; }
	@keyframes pulse { 0%, 80%, 100% { opacity: 0.25; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-0.12rem); } }
</style>
