<script lang="ts">
	import "@xterm/xterm/css/xterm.css";
	import type { GuiRuntime } from "../../client/runtime";
	import { getManagedXterm } from "./xterm-manager";

	const { terminalId, history = "", runtime } = $props<{ terminalId: string; history?: string; runtime: GuiRuntime }>();
	let container: HTMLDivElement;
	let managed = $derived(getManagedXterm(terminalId, runtime));

	$effect(() => {
		if (!container) return;
		managed.attach(container);
		return () => managed.detach();
	});
	$effect(() => {
		managed.replay(history);
	});
</script>

<div class="h-full min-h-0 bg-black/80 p-2" data-testid="xterm-viewport" data-terminal-id={terminalId}>
	<div bind:this={container} class="h-full min-h-0 overflow-hidden rounded border border-ink-500/70 bg-black/70 terminal-xterm"></div>
</div>
