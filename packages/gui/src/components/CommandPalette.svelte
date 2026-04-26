<script lang="ts">
	import { onMount } from "svelte";
	import type { RegisteredCommand } from "../client/command-registry";
	import type { UiState } from "../client/ui-state.svelte";

	const { commands, ui } = $props<{
		commands: readonly RegisteredCommand[];
		ui: UiState;
	}>();
	let query = $state("");
	let selected = $state(0);
	let input = $state<HTMLInputElement>();
	let previousFocus: Element | null = null;

	const allCommands = $derived<RegisteredCommand[]>([...commands]);

	const filtered = $derived(
		allCommands.filter((command: RegisteredCommand) => {
			const needle = query.trim().toLowerCase();
			if (!needle) return true;
			const haystack = [command.label, command.group, ...(command.keywords ?? [])].join(" ").toLowerCase();
			return [...needle].every((char) => haystack.includes(char)) || haystack.includes(needle);
		}),
	);
	const activeOptionId = $derived(filtered[selected] ? `command-palette-option-${selected}` : undefined);

	function show(): void {
		previousFocus = document.activeElement;
		ui.paletteOpen = true;
		query = "";
		selected = 0;
		setTimeout(() => input?.focus(), 0);
	}
	function hide(restore = true): void {
		ui.paletteOpen = false;
		if (restore && previousFocus instanceof HTMLElement) previousFocus.focus();
	}
	function run(command: RegisteredCommand): void {
		if (command.disabledReason || !command.run) return;
		hide(false);
		void command.run();
	}
	function onKeydown(event: KeyboardEvent): void {
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
			event.preventDefault();
			if (ui.paletteOpen) hide();
			else show();
			return;
		}
		if (!ui.paletteOpen) return;
		if (event.key === "Escape") {
			event.preventDefault();
			hide();
		}
		if (event.key === "Tab") {
			event.preventDefault();
			input?.focus();
		}
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
		const onPaletteOpen = (event: Event): void => {
			const open = (event as CustomEvent<{ open?: boolean }>).detail?.open;
			if (open === false) hide(false);
			else show();
		};
		window.addEventListener("daedalus:palette-open", onPaletteOpen);
		return () => {
			window.removeEventListener("keydown", onKeydown);
			document.removeEventListener("keydown", onKeydown);
			window.removeEventListener("daedalus:palette-open", onPaletteOpen);
		};
	});
</script>

{#if ui.paletteOpen}
	<button
		type="button"
		aria-label="Close palette"
		onclick={() => hide()}
		class="fixed inset-0 z-40 bg-ink-950/70"
	></button>

	<div class="pointer-events-none fixed inset-0 z-50 flex items-start justify-center pt-[12vh]" data-testid="command-palette">
		<div class="pointer-events-auto w-[min(640px,90vw)] border border-ink-400 bg-ink-900 shadow-[0_30px_80px_rgba(0,0,0,0.7)]" role="dialog" aria-modal="true" aria-labelledby="command-palette-title" aria-describedby="command-palette-help">
			<h2 id="command-palette-title" class="sr-only">Command palette</h2>
			<div class="flex items-center gap-3 border-b border-ink-500 px-5 py-3">
				<svg viewBox="0 0 16 16" class="h-3.5 w-3.5 text-bone-400" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
					<circle cx="7" cy="7" r="4.5" />
					<path d="M10.5 10.5L13 13" stroke-linecap="round" />
				</svg>
				<input
					bind:this={input}
					bind:value={query}
					oninput={() => (selected = 0)}
					placeholder="Search commands, extensions, surfaces…"
					data-testid="command-palette-input"
					role="combobox"
					aria-label="Search commands"
					aria-controls="command-palette-listbox"
					aria-expanded="true"
					aria-activedescendant={activeOptionId}
					class="flex-1 bg-transparent text-[14px] text-bone-50 placeholder:text-bone-400 focus:outline-none"
				/>
				<kbd class="rounded-sm border border-ink-500 px-1.5 py-px font-mono text-[10px] text-bone-300">esc</kbd>
			</div>

			<div id="command-palette-listbox" class="max-h-[55vh] overflow-y-auto py-2" role="listbox" aria-label="Commands">
				{#each filtered as command, index}
					{#if index === 0 || filtered[index - 1].group !== command.group}
						<div class="px-5 pt-3 pb-1 caps text-bone-400">{command.group}</div>
					{/if}
					<button
						type="button"
						id={`command-palette-option-${index}`}
						role="option"
						aria-selected={selected === index}
						onclick={() => run(command)}
						onmouseenter={() => (selected = index)}
						disabled={Boolean(command.disabledReason || !command.run)}
						class="flex w-full items-baseline justify-between gap-4 px-5 py-2 text-left transition {selected === index ? 'bg-ink-850 text-bone-50' : 'text-bone-200 hover:bg-ink-850'} disabled:opacity-50"
					>
						<span class="flex min-w-0 flex-col gap-0.5">
							<span class="flex min-w-0 items-baseline gap-3">
								<span class="truncate text-[13px]">{command.label}</span>

							</span>
							{#if command.disabledReason}
								<span class="truncate font-mono text-[10.5px] text-bone-400">{command.disabledReason}</span>
							{/if}
						</span>
						{#if command.disabledReason || !command.run}
							<span class="caps text-bone-400">disabled</span>
						{:else}
							<kbd class="rounded-sm border border-ink-500 px-1.5 py-px font-mono text-[10px] tracking-normal text-bone-300">↵</kbd>
						{/if}
					</button>
				{:else}
					<div class="px-5 py-8 text-center text-[12.5px] text-bone-400">No commands found.</div>
				{/each}
			</div>

			<div id="command-palette-help" class="flex items-center justify-between border-t border-ink-500 px-5 py-2 caps text-bone-400">
				<span class="flex items-center gap-3">
					<span class="flex items-center gap-1.5">
						<kbd class="rounded-sm border border-ink-500 px-1 py-px font-mono text-[9.5px] tracking-normal text-bone-300">↑↓</kbd>
						navigate
					</span>
					<span class="flex items-center gap-1.5">
						<kbd class="rounded-sm border border-ink-500 px-1 py-px font-mono text-[9.5px] tracking-normal text-bone-300">↵</kbd>
						select
					</span>
				</span>
				<span>{filtered.length} of {allCommands.length}</span>
			</div>
		</div>
	</div>
{/if}
