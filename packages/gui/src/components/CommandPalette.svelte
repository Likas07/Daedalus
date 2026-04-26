<script lang="ts">
	import { onMount } from "svelte";
	import type { RegisteredCommand } from "../client/command-registry";
	import type { RendererProject } from "../client/gui-state-types";
	import type { DesktopBridge, GuiRuntime, GuiState } from "../client/runtime";
	import type { UiState } from "../client/ui-state.svelte";

	// Extension commands are still supplied by createCommandRegistry via extensionCommands(extensions).
	const { commands, guiState, runtime, ui } = $props<{
		commands: readonly RegisteredCommand[];
		guiState: GuiState;
		runtime: GuiRuntime;
		ui: UiState;
	}>();
	let query = $state("");
	let selected = $state(0);
	let input = $state<HTMLInputElement>();
	let previousFocus: Element | null = null;
	let error = $state<string | undefined>();
	let opening = $state(false);

	const allCommands = $derived<RegisteredCommand[]>([...commands]);
	const projectChoices = $derived.by((): RendererProject[] => {
		const rows: RendererProject[] = [];
		const add = (project: RendererProject): void => {
			if (!project.path || rows.some((item) => item.path === project.path)) return;
			rows.push(project);
		};
		for (const project of guiState.projects) add(project);
		if (guiState.projectRoot) {
			add({
				id: guiState.lastProjectId ?? "current",
				path: guiState.projectRoot,
				name: guiState.projectRoot.split("/").filter(Boolean).at(-1) ?? guiState.projectRoot,
			});
		}
		for (const recent of guiState.recentProjects ?? []) {
			add({
				id: recent.path,
				path: recent.path,
				name: recent.path.split("/").filter(Boolean).at(-1) ?? recent.path,
			});
		}
		return rows;
	});

	const filtered = $derived(
		allCommands.filter((command: RegisteredCommand) => {
			const needle = query.trim().toLowerCase();
			if (!needle) return true;
			const haystack = [command.label, command.group, ...(command.keywords ?? [])].join(" ").toLowerCase();
			return [...needle].every((char) => haystack.includes(char)) || haystack.includes(needle);
		}),
	);
	const filteredProjects = $derived(projectChoices.filter((project: RendererProject) => {
		const needle = query.trim().toLowerCase();
		if (!needle) return true;
		return [project.name, project.path].filter(Boolean).join(" ").toLowerCase().includes(needle);
	}));
	const activeOptionId = $derived(ui.paletteMode === "project" ? (filteredProjects[selected] ? `project-palette-option-${selected}` : undefined) : (filtered[selected] ? `command-palette-option-${selected}` : undefined));
	const bridge = $derived<DesktopBridge | undefined>(typeof window === "undefined" ? undefined : window.desktopBridge ?? window.daedalusNative);
	const canBrowseFolders = $derived(Boolean(bridge?.shell?.openFolder));

	function show(mode: UiState["paletteMode"] = "commands"): void {
		previousFocus = document.activeElement;
		ui.paletteMode = mode;
		ui.paletteOpen = true;
		query = "";
		selected = 0;
		error = undefined;
		setTimeout(() => input?.focus(), 0);
	}
	function hide(restore = true): void {
		ui.paletteOpen = false;
		ui.paletteMode = "commands";
		error = undefined;
		if (restore && previousFocus instanceof HTMLElement) previousFocus.focus();
	}
	function run(command: RegisteredCommand): void {
		if (command.disabledReason || !command.run) return;
		hide(false);
		void command.run();
	}
	async function openProject(path: string): Promise<void> {
		const trimmed = path.trim();
		if (!trimmed) {
			error = "Enter a folder path or choose an existing project.";
			return;
		}
		opening = true;
		error = undefined;
		try {
			await runtime.openProject(trimmed);
			hide(false);
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			opening = false;
		}
	}
	async function browseFolder(): Promise<void> {
		if (!bridge?.shell?.openFolder) return;
		opening = true;
		error = undefined;
		try {
			const path = await bridge.shell.openFolder(guiState.projectRoot);
			if (path) await runtime.openProject(path);
			if (path) hide(false);
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			opening = false;
		}
	}
	function submitProject(): void {
		const project = filteredProjects[selected];
		if (!query.trim() && project?.path) void openProject(project.path);
		else void openProject(query);
	}
	function onKeydown(event: KeyboardEvent): void {
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
			event.preventDefault();
			if (ui.paletteOpen) hide();
			else show("commands");
			return;
		}
		if (!ui.paletteOpen) return;
		const rowCount = ui.paletteMode === "project" ? filteredProjects.length : filtered.length;
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
			selected = Math.min(selected + 1, Math.max(rowCount - 1, 0));
		}
		if (event.key === "ArrowUp") {
			event.preventDefault();
			selected = Math.max(selected - 1, 0);
		}
		if (event.key === "Enter") {
			event.preventDefault();
			if (ui.paletteMode === "project") submitProject();
			else if (filtered[selected]) run(filtered[selected]);
		}
	}

	onMount(() => {
		window.addEventListener("keydown", onKeydown);
		document.addEventListener("keydown", onKeydown);
		const onPaletteOpen = (event: Event): void => {
			const detail = (event as CustomEvent<{ open?: boolean; mode?: UiState["paletteMode"] }>).detail;
			if (detail?.open === false) hide(false);
			else show(detail?.mode ?? "commands");
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
			<h2 id="command-palette-title" class="sr-only">{ui.paletteMode === "project" ? "Open project" : "Command palette"}</h2>
			<div class="flex items-center gap-3 border-b border-ink-500 px-5 py-3">
				<svg viewBox="0 0 16 16" class="h-3.5 w-3.5 text-bone-400" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
					<circle cx="7" cy="7" r="4.5" />
					<path d="M10.5 10.5L13 13" stroke-linecap="round" />
				</svg>
				<input
					bind:this={input}
					bind:value={query}
					oninput={() => (selected = 0)}
					placeholder={ui.paletteMode === "project" ? "Type a folder path…" : "Search commands, extensions, surfaces…"}
					data-testid="command-palette-input"
					role="combobox"
					aria-label={ui.paletteMode === "project" ? "Project folder path" : "Search commands"}
					aria-controls="command-palette-listbox"
					aria-expanded="true"
					aria-activedescendant={activeOptionId}
					class="flex-1 bg-transparent text-[14px] text-bone-50 placeholder:text-bone-400 focus:outline-none"
				/>
				{#if ui.paletteMode === "project"}
					<button type="button" data-testid="project-native-folder" onclick={browseFolder} disabled={!canBrowseFolders || opening} class="rounded-sm border border-ink-500 px-2 py-1 caps text-bone-300 transition hover:border-gold hover:text-bone-50 disabled:opacity-50">Browse…</button>
				{/if}
				<kbd class="rounded-sm border border-ink-500 px-1.5 py-px font-mono text-[10px] text-bone-300">esc</kbd>
			</div>

			{#if ui.paletteMode === "project"}
				<div id="command-palette-listbox" class="max-h-[55vh] overflow-y-auto py-2" role="listbox" aria-label="Projects">
					<div class="px-5 pt-3 pb-1 caps text-bone-400">Projects</div>
					{#if query.trim()}
						<button type="button" data-testid="project-path-submit" onclick={() => void openProject(query)} disabled={opening} class="flex w-full items-baseline justify-between gap-4 px-5 py-2 text-left text-bone-200 transition hover:bg-ink-850 hover:text-bone-50 disabled:opacity-50">
							<span class="min-w-0 truncate text-[13px]">Open folder <span class="font-mono text-bone-400">{query}</span></span>
							<kbd class="rounded-sm border border-ink-500 px-1.5 py-px font-mono text-[10px] tracking-normal text-bone-300">↵</kbd>
						</button>
					{/if}
					{#each filteredProjects as project, index}
						<button
							type="button"
							id={`project-palette-option-${index}`}
							role="option"
							aria-selected={selected === index}
							onclick={() => project.path && void openProject(project.path)}
							onmouseenter={() => (selected = index)}
							class="flex w-full items-baseline justify-between gap-4 px-5 py-2 text-left transition {selected === index ? 'bg-ink-850 text-bone-50' : 'text-bone-200 hover:bg-ink-850'}"
						>
							<span class="flex min-w-0 flex-col gap-0.5">
								<span class="truncate text-[13px]">{project.name ?? project.path}</span>
								<span class="truncate font-mono text-[10.5px] text-bone-400">{project.path}</span>
							</span>
							<span class="caps text-bone-400">{project.path === guiState.projectRoot ? "active" : "open"}</span>
						</button>
					{:else}
						{#if !query.trim()}
							<div class="px-5 py-8 text-center text-[12.5px] text-bone-400">No projects yet. Type a folder path or browse.</div>
						{/if}
					{/each}
					{#if error}
						<div class="mx-5 mt-2 border border-crimson/60 px-3 py-2 text-[12px] text-crimson" role="alert">{error}</div>
					{/if}
				</div>
			{:else}
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
			{/if}

			<div id="command-palette-help" class="flex items-center justify-between border-t border-ink-500 px-5 py-2 caps text-bone-400">
				<span class="flex items-center gap-3">
					<span class="flex items-center gap-1.5">
						<kbd class="rounded-sm border border-ink-500 px-1 py-px font-mono text-[9.5px] tracking-normal text-bone-300">↑↓</kbd>
						navigate
					</span>
					<span class="flex items-center gap-1.5">
						<kbd class="rounded-sm border border-ink-500 px-1 py-px font-mono text-[9.5px] tracking-normal text-bone-300">↵</kbd>
						{ui.paletteMode === "project" ? "open" : "select"}
					</span>
				</span>
				<span>{ui.paletteMode === "project" ? `${filteredProjects.length} projects` : `${filtered.length} of ${allCommands.length}`}</span>
			</div>
		</div>
	</div>
{/if}
