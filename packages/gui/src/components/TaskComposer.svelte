<script lang="ts">
	import ComposerChips, { type ComposerChip } from "./ComposerChips.svelte";

	type ComposerMode = "Ask" | "Plan" | "Build" | "Review" | "Fix tests";
	const modes: ComposerMode[] = ["Ask", "Plan", "Build", "Review", "Fix tests"];
	const {
		projectPath,
		sessionId,
		storageKey,
		requireProjectPath = false,
		disabled = false,
		disabledReason,
		submitLabel = "Start session",
		onSubmit,
	} = $props<{
		projectPath?: string;
		sessionId?: string;
		storageKey?: string;
		requireProjectPath?: boolean;
		disabled?: boolean;
		disabledReason?: string;
		submitLabel?: string;
		onSubmit?: (input: { prompt: string; path?: string; mode: ComposerMode }) => Promise<void> | void;
	}>();

	let prompt = $state("");
	let path = $state("");
	let mode = $state<ComposerMode>("Build");
	let error = $state("");
	let submitting = $state(false);
	let loadedKey = "";
	let saveTimer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		path = projectPath ?? path;
	});

	$effect(() => {
		if (!storageKey || loadedKey === storageKey || typeof localStorage === "undefined") return;
		const saved = localStorage.getItem(storageKey);
		prompt = saved ?? "";
		loadedKey = storageKey;
	});

	$effect(() => {
		if (!storageKey || loadedKey !== storageKey || typeof localStorage === "undefined") return;
		const value = prompt;
		if (saveTimer) clearTimeout(saveTimer);
		saveTimer = setTimeout(() => {
			if (value.trim()) localStorage.setItem(storageKey, value);
			else localStorage.removeItem(storageKey);
		}, 120);
		return () => {
			if (saveTimer) clearTimeout(saveTimer);
		};
	});

	const chips = $derived.by<ComposerChip[]>(() => {
		const items: ComposerChip[] = [];
		if (projectPath) items.push({ id: "project", kind: "project", label: projectPath, removable: false });
		if (sessionId) items.push({ id: "session", kind: "session", label: sessionId, removable: false });
		items.push({ id: "mode", kind: "mode", label: mode, removable: false });
		if (prompt.trim()) items.push({ id: "draft", kind: "draft", label: `${prompt.trim().length} chars` });
		return items;
	});

	function removeChip(chip: ComposerChip): void {
		if (chip.kind === "draft") prompt = "";
	}

	async function submit(): Promise<void> {
		error = "";
		if (disabled) {
			error = disabledReason ?? "Composer is unavailable.";
			return;
		}
		const trimmedPrompt = prompt.trim();
		const trimmedPath = (projectPath ?? path).trim();
		if (!trimmedPrompt) {
			error = "Enter a prompt before submitting.";
			return;
		}
		if (requireProjectPath && !trimmedPath) {
			error = "Choose a project path before starting a session.";
			return;
		}
		submitting = true;
		try {
			await onSubmit?.({ prompt: trimmedPrompt, path: trimmedPath || undefined, mode });
			prompt = "";
			if (storageKey && typeof localStorage !== "undefined") localStorage.removeItem(storageKey);
		} catch (cause) {
			error = cause instanceof Error ? cause.message : "Submit failed.";
		} finally {
			submitting = false;
		}
	}

	function onKeydown(event: KeyboardEvent): void {
		if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
			event.preventDefault();
			void submit();
		}
	}
</script>

<form data-testid="task-composer" class="mx-auto w-full max-w-3xl rounded-3xl border border-zinc-800/90 bg-zinc-950/95 p-3 shadow-2xl shadow-black/40 backdrop-blur" aria-label="Task composer" onsubmit={(event) => { event.preventDefault(); void submit(); }}>
	<div class="space-y-3">
		<ComposerChips {chips} onRemove={removeChip} />
		{#if requireProjectPath}
			<label class="block text-[11px] uppercase tracking-[0.16em] text-zinc-500" for="composer-project-path">Project path</label>
			<input id="composer-project-path" data-testid="composer-project-path" class="w-full rounded-xl border border-zinc-800 bg-black/30 px-3 py-2 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-cyan-700/70" bind:value={path} placeholder="/path/to/project" />
		{/if}
		<label class="sr-only" for="composer-prompt">Task prompt</label>
		<textarea id="composer-prompt" data-testid="composer-prompt" class="min-h-28 w-full resize-y rounded-2xl border border-zinc-800 bg-black/40 px-4 py-3 text-sm leading-6 text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-cyan-600/80" bind:value={prompt} onkeydown={onKeydown} disabled={submitting} placeholder="Ask Daedalus to inspect, plan, build, review, or fix tests…"></textarea>
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div class="flex flex-wrap gap-1.5">
				{#each modes as item}
					<button type="button" class={`rounded-full border px-2.5 py-1 text-[11px] ${mode === item ? 'border-cyan-500/60 bg-cyan-500/15 text-cyan-200' : 'border-zinc-800 bg-zinc-900 text-zinc-400'}`} aria-pressed={mode === item} onclick={() => (mode = item)}>{item}</button>
				{/each}
			</div>
			<div class="composer-support-chips flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
				<span class="rounded-full border border-zinc-800 px-2 py-1">Provider · model soon</span>
				<span class="rounded-full border border-emerald-900/70 bg-emerald-950/30 px-2 py-1 text-emerald-300">Sandbox · low risk</span>
				<span class="rounded-full border border-zinc-800 px-2 py-1">Context 0%</span>
			</div>
		</div>
		{#if error || disabledReason}
			<p data-testid="composer-error" class="text-xs text-amber-300" role="alert">{error || disabledReason}</p>
		{/if}
		<div class="task-composer-actions flex items-center justify-between gap-3">
			<p class="text-[11px] text-zinc-600">Ctrl/Cmd+Enter to submit</p>
			<button data-testid="composer-submit" type="submit" class="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-medium text-zinc-950 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400" disabled={submitting || disabled}>{submitting ? "Submitting…" : submitLabel}</button>
		</div>
	</div>
</form>
