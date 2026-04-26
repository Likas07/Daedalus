<script lang="ts">
	import type { RendererTerminal } from "../client/gui-state-types";
	const { terminal, onKill, onCollapse } = $props<{
		terminal?: RendererTerminal;
		onKill?: () => void;
		onCollapse?: () => void;
	}>();
</script>

<header class="flex h-9 items-center justify-between gap-2 border-b border-ink-500 bg-black/40 px-4">
	<div class="flex min-w-0 items-center gap-3">
		<span aria-hidden="true" class="size-1.5 rounded-full bg-gold"></span>
		<span class="truncate font-mono text-[11px] tabular-nums text-bone-50">{terminal ? terminal.cwd : "Terminal drawer"}</span>
		{#if terminal}
			<span class="font-mono text-[10px] text-bone-400">{terminal.cols}×{terminal.rows}</span>
		{/if}
	</div>
	<div class="flex items-center gap-1.5">
		{#if terminal}
			<span class="font-mono text-[10px] text-bone-400">{terminal.status}</span>
			<button class="btn-mini text-[color:var(--crimson)]" type="button" onclick={onKill}>Kill</button>
		{/if}
		<button class="btn-mini" type="button" onclick={onCollapse}>Collapse</button>
	</div>
</header>
