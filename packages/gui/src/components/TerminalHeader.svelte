<script lang="ts">
	import type { WorkflowTerminalMetadata } from "@daedalus-pi/app-server-protocol";
	import { terminalElapsedLabel } from "../client/workflow-state";
	const { terminal, onInterrupt, onKill, onDetach } = $props<{ terminal?: WorkflowTerminalMetadata; onInterrupt?: () => void; onKill?: () => void; onDetach?: () => void }>();
</script>
<header class="flex h-8 items-center justify-between border-b border-zinc-900 px-3 text-xs">
	<span class="font-medium text-zinc-300">{terminal ? `${terminal.shell} · ${terminalElapsedLabel(terminal)}` : 'Terminal drawer'}</span>
	<div class="flex gap-2 text-zinc-500">{#if terminal}<span>seq {terminal.replayCursor}</span><button onclick={onInterrupt}>Interrupt</button><button onclick={onDetach}>Detach</button><button class="text-red-300" onclick={onKill}>Kill</button>{:else}<span>no terminal</span>{/if}</div>
</header>
