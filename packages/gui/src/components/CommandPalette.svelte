<script lang="ts">
	import { onMount } from "svelte";
	import type { CommandDescriptor, CommandId } from "../client/commands";
	import { extensionCommands, type RendererSafeExtensionMetadata } from "../client/extension-surfaces";

	type PaletteCommand = CommandDescriptor & { readonly extensionId?: string };
	const { commands, extensions = [], onCommand } = $props<{
		commands: readonly CommandDescriptor[];
		extensions?: readonly RendererSafeExtensionMetadata[];
		onCommand: (id: CommandId) => void;
	}>();
	let open = $state(false);
	let query = $state("");
	let selected = $state(0);
	let input = $state<HTMLInputElement>();
	let previousFocus: Element | null = null;

	const allCommands = $derived<PaletteCommand[]>([
		...commands,
		...extensionCommands(extensions).map((command) => ({
			id: "extension-commands" as const,
			label: command.title,
			group: `Extensions · ${command.extensionId}`,
			keywords: [command.description ?? "", command.id],
			extensionId: command.extensionId,
		})),
	]);

	const filtered = $derived(
		allCommands.filter((command: PaletteCommand) => {
			const needle = query.trim().toLowerCase();
			if (!needle) return true;
			const haystack = [command.label, command.group, ...(command.keywords ?? [])].join(" ").toLowerCase();
			return [...needle].every((char) => haystack.includes(char)) || haystack.includes(needle);
		}),
	);

	function show(): void {
		previousFocus = document.activeElement;
		open = true;
		query = "";
		selected = 0;
		setTimeout(() => input?.focus(), 0);
	}
	function hide(restore = true): void {
		open = false;
		if (restore && previousFocus instanceof HTMLElement) previousFocus.focus();
	}
	function run(command: PaletteCommand): void {
		if (command.disabled) return;
		hide(false);
		onCommand(command.id);
	}
	function onKeydown(event: KeyboardEvent): void {
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
			event.preventDefault();
			show();
			return;
		}
		if (!open) return;
		if (event.key === "Escape") hide();
		if (event.key === "ArrowDown") {
			event.preventDefault();
			selected = Math.min(selected + 1, Math.max(filtered.length - 1, 0));
		}
		if (event.key === "ArrowUp") {
			event.preventDefault();
			selected = Math.max(selected - 1, 0);
		}
		if (event.key === "Enter" && filtered[selected]) {
			event.preventDefault();
			run(filtered[selected]);
		}
	}

	onMount(() => {
		window.addEventListener("keydown", onKeydown);
		document.addEventListener("keydown", onKeydown);
		return () => {
			window.removeEventListener("keydown", onKeydown);
			document.removeEventListener("keydown", onKeydown);
		};
	});

</script>



{#if open}
	<div class="fixed inset-0 z-50 bg-black/50 p-6" data-testid="command-palette">
		<div class="mx-auto max-w-xl rounded-xl border border-zinc-700 bg-zinc-950 shadow-xl">
			<input bind:this={input} bind:value={query} class="w-full border-b border-zinc-800 bg-transparent px-4 py-3 text-sm text-zinc-100 outline-none" placeholder="Type a command..." data-testid="command-palette-input" />
			<div class="max-h-80 overflow-auto p-2">
				{#each filtered as command, index}
					{#if index === 0 || filtered[index - 1].group !== command.group}
						<p class="px-2 pb-1 pt-2 text-[10px] uppercase tracking-wider text-zinc-600">{command.group}</p>
					{/if}
					<button class="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm {index === selected ? 'bg-cyan-500/10 text-cyan-100' : 'text-zinc-300'}" disabled={command.disabled} onclick={() => run(command)}>
						<span>{command.label}</span>
						{#if command.disabled}<span class="text-[10px] text-zinc-600">Soon</span>{/if}
					</button>
				{:else}
					<p class="p-4 text-sm text-zinc-500">No commands found.</p>
				{/each}
			</div>
		</div>
	</div>
{/if}
