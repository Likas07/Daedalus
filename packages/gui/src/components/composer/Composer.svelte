<script lang="ts">
	import type { ComposerDraftAttachment, ComposerFileMention, ComposerSlashCommand, RendererModel } from "../../client/gui-state-types";
	import { createComposerDraftState, createComposerSubmitContext, type ComposerSubmitInput } from "../../client/composer-state";
	import type { GuiRuntime, GuiState } from "../../client/runtime";
	import type { UiState, PopoverKind } from "../../client/ui-state.svelte";
	import { executeSlashCommand } from "../../client/slash-command-executor";
	import AttachmentTray from "./AttachmentTray.svelte";
	import ComposerPopovers from "./ComposerPopovers.svelte";
	import ChipPopovers from "./ChipPopovers.svelte";
	import { attachmentIds, commandReplacement, composerModeLabels, detectComposerTrigger, fileMentionPaths, mentionReplacement, replaceTextRange, shouldSubmitComposerKey, validateAttachmentFile, type ComposerMode, type ComposerTrigger } from "./composer-logic";

	const { guiState, runtime, ui, projectPath, sessionId, storageKey, requireProjectPath = false, disabled = false, disabledReason, submitLabel = "Start session", onSubmit } = $props<{
		guiState: GuiState;
		runtime: GuiRuntime;
		ui: UiState;
		projectPath?: string;
		sessionId?: string;
		storageKey?: string;
		requireProjectPath?: boolean;
		disabled?: boolean;
		disabledReason?: string;
		submitLabel?: string;
		onSubmit?: (input: ComposerSubmitInput) => Promise<void> | void;
	}>();

	let draft = $state("");
	let path = $state("");
	let error = $state("");
	let submitting = $state(false);
	let submitInFlight = false;
	let trigger = $state<ComposerTrigger | null>(null);
	let files = $state<ComposerFileMention[]>([]);
	let commands = $state<ComposerSlashCommand[]>([]);
	let mentions = $state<ComposerFileMention[]>([]);
	let attachments = $state<ComposerDraftAttachment[]>([]);
	let activeIndex = $state(0);
	let loadedKey = "";
	let textarea: HTMLTextAreaElement;

	$effect(() => { path = projectPath ?? path; });
	$effect(() => {
		if (!storageKey || loadedKey === storageKey || typeof localStorage === "undefined") return;
		draft = localStorage.getItem(storageKey) ?? "";
		loadedKey = storageKey;
	});
	$effect(() => {
		if (!storageKey || loadedKey !== storageKey || typeof localStorage === "undefined") return;
		const value = draft;
		const timer = setTimeout(() => value.trim() ? localStorage.setItem(storageKey, value) : localStorage.removeItem(storageKey), 120);
		return () => clearTimeout(timer);
	});

	const selectedModel = $derived<RendererModel | undefined>(guiState.models.find((model: RendererModel) => model.id === guiState.selectedModel));
	const selectedModelLabel = $derived.by(() => {
		if (selectedModel) return selectedModel.label ?? selectedModel.id;
		if (guiState.selectedModel) return guiState.selectedModel;
		return guiState.models.length === 0 ? "No models authenticated" : "Select model";
	});
	const cap = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
	const contextWindow = $derived(selectedModel?.contextWindow ?? 0);
	const winLabel = $derived(contextWindow >= 1_000_000 ? `${(contextWindow / 1_000_000).toFixed(contextWindow % 1_000_000 === 0 ? 0 : 1)}M` : contextWindow > 0 ? `${Math.round(contextWindow / 1000)}k` : "—");
	const supportsReasoning = $derived(selectedModel?.reasoning === true);
	const supportsFastMode = $derived(selectedModel?.supportsFastMode === true);
	const effortLabel = $derived(supportsReasoning ? cap(guiState.effort ?? "medium") : "Default");
	const fastSuffix = $derived(supportsFastMode && guiState.fastMode ? " · Fast" : "");
	const tuningLabel = $derived(`${effortLabel} · ${winLabel}${fastSuffix}`);
	const accessLabel = $derived.by(() => {
		if (guiState.accessMode === "auto-accept") return "Auto-accept";
		if (guiState.accessMode === "unrestricted") return "Unrestricted";
		return "Supervised";
	});
	const mode = $derived<ComposerMode>((guiState.mode ?? "daedalus") as ComposerMode);
	const modeLabel = $derived(composerModeLabels[mode]);

	const tokensUsed = $derived(guiState.sessionTokensUsed ?? 0);
	const ringR = 7;
	const ringC = $derived(2 * Math.PI * ringR);
	const tokenPct = $derived(contextWindow > 0 ? Math.min(100, Math.round((tokensUsed / contextWindow) * 100)) : 0);
	const ringDash = $derived((tokenPct / 100) * ringC);
	const fmtTokens = (n: number): string => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M` : `${Math.round(n / 1000)}k`;
	const tokensFmt = $derived(fmtTokens(tokensUsed));
	const windowFmt = $derived(fmtTokens(contextWindow));

	const branchLabel = $derived.by((): string => {
		const worktree = guiState.worktrees.find((w: { branch?: string; activeSessionIds: readonly string[] }) => sessionId && w.activeSessionIds.includes(sessionId));
		return worktree?.branch ?? "main";
	});
	const cwdLabel = $derived(projectPath ?? guiState.projectRoot ?? "~");

	function openChip(kind: PopoverKind, event: MouseEvent): void {
		const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
		if (ui.popoverKind === kind) {
			ui.popoverKind = null;
			ui.popoverAnchor = null;
			return;
		}
		ui.popoverKind = kind;
		ui.popoverAnchor = { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
	}

	async function refresh(): Promise<void> {
		if (textarea) draft = textarea.value;
		trigger = detectComposerTrigger(draft, textarea?.selectionStart ?? draft.length);
		activeIndex = 0;
		if (trigger?.kind === "path") files = [...await runtime.searchComposerFiles({ projectId: guiState.lastProjectId ?? "local", query: trigger.query, limit: 15 })];
		if (trigger?.kind === "slash-command") commands = [...await runtime.listComposerCommands(sessionId)];
	}

	function insertFile(file: ComposerFileMention): void {
		if (!trigger) return;
		const next = replaceTextRange(draft, trigger.rangeStart, trigger.rangeEnd, mentionReplacement(file));
		draft = next.text;
		mentions = [...mentions.filter((item) => item.path !== file.path), file];
		trigger = null;
		setTimeout(() => { textarea.focus(); textarea.selectionStart = textarea.selectionEnd = next.cursor; }, 0);
	}

	async function insertCommand(command: ComposerSlashCommand): Promise<void> {
		if (!trigger || command.disabled) return;
		const result = await executeSlashCommand(command, {
			sessionId,
			openSettings: () => { ui.view = "settings"; },
			openModelPicker: () => { ui.popoverKind = "model"; },
			newSession: () => { ui.view = "empty"; },
			reloadResources: () => runtime.client.reloadResources(),
			compact: (id) => id ? runtime.client.runtime.compact({ sessionId: id }) : undefined,
		});
		if (result.action === "submit") {
			const next = replaceTextRange(draft, trigger.rangeStart, trigger.rangeEnd, commandReplacement(command));
			draft = next.text;
			setTimeout(() => { textarea.focus(); textarea.selectionStart = textarea.selectionEnd = next.cursor; }, 0);
		} else {
			error = result.message;
		}
		trigger = null;
	}

	async function attachFile(file: File): Promise<void> {
		const invalid = validateAttachmentFile(file);
		if (invalid) { error = invalid; return; }
		const dataBase64 = await new Promise<string>((resolve, reject) => {
			const reader = new FileReader();
			reader.onerror = () => reject(reader.error);
			reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
			reader.readAsDataURL(file);
		});
		attachments = [...attachments, await runtime.saveComposerAttachment({ sessionId, filename: file.name, mimeType: file.type, dataBase64 })];
	}

	async function submit(): Promise<void> {
		if (submitInFlight) return;
		error = "";
		if (disabled) { error = disabledReason ?? "Composer is unavailable."; return; }
		const prompt = draft.trim();
		const trimmedPath = (projectPath ?? path).trim();
		if (!prompt) { error = "Enter a prompt before submitting."; return; }
		if (requireProjectPath && !trimmedPath) { error = "Choose a project path before starting a session."; return; }
		submitting = true;
		submitInFlight = true;
		try {
			await onSubmit?.({
				...createComposerSubmitContext({
					prompt,
					attachmentIds: attachmentIds(attachments),
					filePaths: fileMentionPaths(mentions),
					model: guiState.selectedModel,
					effort: guiState.effort,
					accessMode: guiState.accessMode,
					mode,
					fastMode: guiState.fastMode,
					projectId: guiState.lastProjectId,
					worktreeId: guiState.worktrees.find((worktree: { id?: string; activeSessionIds: readonly string[] }) => sessionId && worktree.activeSessionIds.includes(sessionId))?.id,
					sessionId,
					draftState: createComposerDraftState({
						prompt: draft,
						mode: mode === "muse" ? "plan" : mode === "daedalus" ? "build" : "default",
						effort: guiState.effort,
						model: guiState.selectedModel,
						accessMode: guiState.accessMode,
						attachments,
						fileMentions: mentions,
						slashCommands: [],
					}),
				}),
				path: trimmedPath || undefined,
			});
			draft = "";
			attachments = [];
			mentions = [];
			if (storageKey && typeof localStorage !== "undefined") localStorage.removeItem(storageKey);
		} catch (cause) {
			error = cause instanceof Error ? cause.message : "Submit failed.";
		} finally {
			submitInFlight = false;
			submitting = false;
		}
	}

	function keydown(event: KeyboardEvent): void {
		if (trigger && ["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(event.key)) {
			event.preventDefault();
			const list = trigger.kind === "path" ? files : commands;
			if (event.key === "Escape") trigger = null;
			else if (event.key === "ArrowDown") activeIndex = Math.min(activeIndex + 1, Math.max(0, list.length - 1));
			else if (event.key === "ArrowUp") activeIndex = Math.max(0, activeIndex - 1);
			else {
				const item = list[activeIndex];
				if (item) trigger.kind === "path" ? insertFile(item as ComposerFileMention) : insertCommand(item as ComposerSlashCommand);
			}
			return;
		}
		if (!shouldSubmitComposerKey(event)) return;
		event.preventDefault();
		void submit();
	}
</script>

<form
	data-testid="task-composer"
	class="border border-ink-500 bg-ink-900"
	aria-label="Task composer"
	onsubmit={(e) => { e.preventDefault(); void submit(); }}
	ondrop={(e) => { e.preventDefault(); for (const file of e.dataTransfer?.files ?? []) void attachFile(file); }}
	ondragover={(e) => e.preventDefault()}
>
	<!-- Branch toolbar -->
	<div class="flex h-8 items-center gap-4 border-b border-ink-500 px-4">
		<span class="font-mono text-[10.5px] text-bone-300">{branchLabel}</span>
		<span class="text-bone-500">·</span>
		<span class="text-[10px] font-medium uppercase tracking-[0.18em] text-bone-100">local</span>
		<span class="ml-auto truncate font-mono text-[10px] text-bone-500" title={cwdLabel}>{cwdLabel}</span>
	</div>

	{#if requireProjectPath}
		<input
			data-testid="composer-project-path"
			class="w-full border-b border-ink-500 bg-transparent px-4 py-2 font-mono text-[12.5px] text-bone-100 placeholder:text-bone-500 focus:outline-none"
			bind:value={path}
			placeholder="/path/to/project"
		/>
	{/if}

	<div class="relative">
		<textarea
			bind:this={textarea}
			id="composer-prompt"
			data-testid="composer-prompt"
			rows="2"
			class="w-full resize-none bg-transparent px-4 pt-3 text-[14px] leading-[1.6] text-bone-50 placeholder:text-bone-400 focus:outline-none disabled:opacity-60"
			bind:value={draft}
			oninput={() => void refresh()}
			onkeydown={keydown}
			disabled={submitting}
			placeholder="Reply to Daedalus, attach context with @, run a slash command…"
		></textarea>
		<ComposerPopovers {trigger} {files} {commands} {activeIndex} onFileSelect={insertFile} onCommandSelect={insertCommand} />
	</div>

	{#if attachments.length}
		<div class="border-t border-ink-500 px-4 py-2">
			<AttachmentTray {attachments} onRemove={(id) => attachments = attachments.filter((item) => item.id !== id)} />
		</div>
	{/if}

	<!-- Chip row · model · effort · mode · access · token ring · send -->
	<div class="flex items-center gap-1 border-t border-ink-500 px-2 py-1.5">
		<button
			type="button"
			onclick={(e) => openChip("model", e)}
			aria-haspopup="dialog"
			aria-expanded={ui.popoverKind === "model"}
			data-testid="model-chip"
			class="flex items-center gap-1.5 rounded-sm px-2 py-1 text-bone-200 transition hover:bg-ink-850 hover:text-bone-50 {ui.popoverKind === 'model' ? 'bg-ink-850 text-bone-50' : ''}"
		>
			<svg viewBox="0 0 16 16" class="h-3 w-3 text-gold" fill="currentColor" aria-hidden="true">
				<path d="M8 1l1.4 4.6L14 7l-4.6 1.4L8 13l-1.4-4.6L2 7l4.6-1.4z" />
			</svg>
			<span class="text-[12px]">{selectedModelLabel}</span>
			<span class="text-[9px] text-bone-500">▾</span>
		</button>

		<span class="h-4 w-px bg-ink-500"></span>

		<button
			type="button"
			onclick={(e) => openChip("effort", e)}
			aria-haspopup="dialog"
			aria-expanded={ui.popoverKind === "effort"}
			data-testid="effort-chip"
			class="flex items-center gap-1.5 rounded-sm px-2 py-1 text-bone-200 transition hover:bg-ink-850 hover:text-bone-50 {ui.popoverKind === 'effort' ? 'bg-ink-850 text-bone-50' : ''}"
		>
			<span class="text-[12px]">{tuningLabel}</span>
			<span class="text-[9px] text-bone-500">▾</span>
		</button>

		<span class="h-4 w-px bg-ink-500"></span>

		<button
			type="button"
			onclick={(e) => openChip("mode", e)}
			aria-haspopup="dialog"
			aria-expanded={ui.popoverKind === "mode"}
			data-testid="mode-chip"
			class="flex items-center gap-1.5 rounded-sm px-2 py-1 text-bone-200 transition hover:bg-ink-850 hover:text-bone-50 {ui.popoverKind === 'mode' ? 'bg-ink-850 text-bone-50' : ''}"
		>
			<svg viewBox="0 0 16 16" class="h-3 w-3 text-bone-300" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<path d="M3 13l4-4 2 2 4-4" />
				<path d="M11 4h2v2" />
			</svg>
			<span class="text-[12px]">{modeLabel}</span>
			<span class="text-[9px] text-bone-500">▾</span>
		</button>

		<span class="h-4 w-px bg-ink-500"></span>

		<button
			type="button"
			onclick={(e) => openChip("access", e)}
			aria-haspopup="dialog"
			aria-expanded={ui.popoverKind === "access"}
			data-testid="access-chip"
			class="flex items-center gap-1.5 rounded-sm px-2 py-1 text-bone-200 transition hover:bg-ink-850 hover:text-bone-50 {ui.popoverKind === 'access' ? 'bg-ink-850 text-bone-50' : ''}"
		>
			<svg viewBox="0 0 16 16" class="h-3 w-3 text-bone-300" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<rect x="3" y="7" width="10" height="6" rx="1" />
				<path d="M5 7V5a3 3 0 0 1 6 0v2" />
			</svg>
			<span class="text-[12px]">{accessLabel}</span>
			<span class="text-[9px] text-bone-500">▾</span>
		</button>

		<label class="ml-1 flex items-center gap-1.5 rounded-sm px-2 py-1 text-bone-200 transition hover:bg-ink-850 hover:text-bone-50 cursor-pointer" title="Attach files">
			<svg viewBox="0 0 16 16" class="h-3 w-3 text-bone-300" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<path d="M11 7l-4 4a2 2 0 0 1-2.8-2.8l5-5a3 3 0 0 1 4.3 4.3l-5.5 5.5" />
			</svg>
			<input class="sr-only" type="file" multiple onchange={(e) => { for (const file of (e.currentTarget as HTMLInputElement).files ?? []) void attachFile(file); }} />
		</label>

		<span class="ml-auto"></span>

		<!-- Token ring · context window -->
		<span class="group relative flex h-6 w-6 items-center justify-center" role="img" aria-label="{tokensUsed.toLocaleString()} of {contextWindow.toLocaleString()} tokens used">
			<svg viewBox="0 0 18 18" class="h-6 w-6 -rotate-90">
				<circle cx="9" cy="9" r={ringR} fill="none" stroke="var(--color-ink-500)" stroke-width="1.5" />
				<circle cx="9" cy="9" r={ringR} fill="none" stroke="var(--color-gold-soft)" stroke-width="1.5" stroke-linecap="round" stroke-dasharray={ringC} stroke-dashoffset={ringC - ringDash} />
			</svg>
			<span class="absolute font-mono text-[8px] text-bone-300 tabular-nums">{tokenPct}</span>
			<span role="tooltip" class="pointer-events-none absolute bottom-full right-0 mb-2 hidden whitespace-nowrap border border-ink-500 bg-ink-900 px-3 py-2 text-left shadow-2xl shadow-black/40 group-hover:block">
				<span class="block caps text-bone-400">context window</span>
				<span class="mt-0.5 block font-mono text-[11px] text-bone-100 tabular-nums">
					{tokenPct}% <span class="text-bone-500">·</span> {tokensFmt}/{windowFmt} context used
				</span>
			</span>
		</span>

		<!-- Send button -->
		<button
			type="submit"
			data-testid="composer-submit"
			disabled={submitting}
			aria-label={submitLabel}
			title={submitLabel}
			class="ml-1 flex h-7 w-7 items-center justify-center rounded-full bg-gold text-ink-950 transition hover:bg-bone-50 disabled:opacity-50"
		>
			<svg viewBox="0 0 16 16" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<path d="M8 13V3" />
				<path d="M4 7l4-4 4 4" />
			</svg>
		</button>
	</div>

	{#if error || disabledReason}
		<p data-testid="composer-error" class="border-t border-ink-500 px-4 py-2 font-mono text-[10.5px] text-amber-300" role="alert">{error || disabledReason}</p>
	{/if}
</form>

<ChipPopovers
	{ui}
	models={guiState.models}
	selectedModel={guiState.selectedModel}
	selectedModelInfo={selectedModel}
	onSelectModel={(model) => void runtime.setModel(model)}
	effort={guiState.effort}
	onSelectEffort={(effort) => void runtime.setEffort(effort)}
	fastMode={guiState.fastMode}
	onSelectFastMode={(value) => void runtime.setFastMode(value)}
	{mode}
	onSelectMode={(value) => void runtime.setMode(value)}
	accessMode={guiState.accessMode}
	onSelectAccess={(value) => void runtime.setAccessMode(value)}
/>
