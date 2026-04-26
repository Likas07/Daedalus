<script lang="ts">
	import { parsePatchFiles, type FileDiffMetadata } from "@pierre/diffs";
	import { preloadFileDiff, preloadPatchDiff } from "@pierre/diffs/ssr";
	import type { WorkflowChangedFile } from "@daedalus-pi/app-server-protocol";
	import type { RendererDiffSummary } from "../client/gui-state-types";

	const { diff, patch = diff?.patch ?? "", path = null, readonly = true, disabledReason = "Requires Git mutation policy" } = $props<{
		diff?: RendererDiffSummary;
		patch?: string;
		path?: string | null;
		readonly?: boolean;
		disabledReason?: string;
	}>();
	let viewMode = $state<"unified" | "side-by-side">("unified");

	const fileCount = $derived(diff?.files.length ?? 0);
	const insertions = $derived(diff?.files.reduce((sum: number, file: WorkflowChangedFile) => sum + file.insertions, 0) ?? 0);
	const deletions = $derived(diff?.files.reduce((sum: number, file: WorkflowChangedFile) => sum + file.deletions, 0) ?? 0);
	const focusedFile = $derived(path ? diff?.files.find((file: WorkflowChangedFile) => file.path === path) : undefined);

	let renderedHTML = $state<string>("");
	let renderError = $state<string | null>(null);

	function stripPathPrefix(name: string | null | undefined): string {
		if (!name) return "";
		return name.startsWith("a/") || name.startsWith("b/") ? name.slice(2) : name;
	}

	function findFileDiff(text: string, target: string): FileDiffMetadata | undefined {
		const parsedPatches = parsePatchFiles(text, target);
		for (const parsed of parsedPatches) {
			for (const file of parsed.files) {
				if (stripPathPrefix(file.name) === target || stripPathPrefix(file.prevName) === target) return file;
			}
		}
		return undefined;
	}

	$effect(() => {
		const text = patch?.trim() ?? "";
		if (!text) {
			renderedHTML = "";
			renderError = null;
			return;
		}
		let cancelled = false;
		renderError = null;
		const promise = path
			? Promise.resolve().then(() => {
					const fileDiff = findFileDiff(text, path);
					if (!fileDiff) throw new Error(`No diff found for ${path}.`);
					return preloadFileDiff({ fileDiff }).then((result) => result.prerenderedHTML);
				})
			: preloadPatchDiff({ patch: text }).then((result) => result.prerenderedHTML);
		promise
			.then((html) => {
				if (!cancelled) renderedHTML = html;
			})
			.catch((error: unknown) => {
				if (cancelled) return;
				renderedHTML = "";
				renderError = error instanceof Error ? error.message : "Failed to render diff.";
			});
		return () => {
			cancelled = true;
		};
	});
</script>

<section class="flex h-full flex-col bg-ink-950" data-testid="diff-viewer">
	<header class="flex items-center gap-3 border-b border-ink-500 px-5 py-2.5">
		<div class="min-w-0 flex-1">
			<div class="caps text-bone-400">diff</div>
			<div class="truncate font-mono text-[11.5px] text-bone-50">
				{#if path}
					{path}
				{:else}
					{diff?.branch ?? "detached"}
					<span class="text-bone-500">·</span>
					ahead {diff?.ahead ?? 0}
					<span class="text-bone-500">/</span>
					behind {diff?.behind ?? 0}
				{/if}
			</div>
		</div>
		<div class="flex items-center gap-3 caps text-bone-400">
			{#if path && focusedFile}
				<span>+{focusedFile.insertions} <span class="text-bone-500">/</span> −{focusedFile.deletions}</span>
			{:else}
				<span>{fileCount} files</span>
				<span class="text-bone-500">·</span>
				<span>+{insertions} <span class="text-bone-500">/</span> −{deletions}</span>
			{/if}
		</div>
		<div class="flex rounded-sm border border-ink-500 p-0.5 caps">
			<button type="button" class="px-2 py-1" class:text-bone-50={viewMode === "unified"} onclick={() => (viewMode = "unified")}>unified</button>
			<button type="button" class="px-2 py-1" class:text-bone-50={viewMode === "side-by-side"} onclick={() => (viewMode = "side-by-side")}>side-by-side</button>
		</div>
	</header>

	<div class="min-h-0 flex-1 overflow-y-auto">
		{#if renderError}
			<div class="px-5 py-4 font-mono text-[11.5px] text-bone-400">{renderError}</div>
		{:else if renderedHTML}
			<div class="diff-host px-2 py-3" data-diff-view-mode={viewMode}>{@html renderedHTML}</div>
		{:else if patch}
			<div class="px-5 py-4 font-mono text-[11.5px] text-bone-400">Rendering diff…</div>
		{:else}
			<div class="px-5 py-4 font-mono text-[11.5px] text-bone-400">No patch selected. Git mutation controls are disabled.</div>
		{/if}
	</div>

	<footer class="flex items-center justify-between gap-3 border-t border-ink-500 px-5 py-2 caps">
		<span class="text-bone-400">
			<kbd class="rounded-sm border border-ink-500 px-1.5 py-px font-mono text-[10px] tracking-normal text-bone-300">j</kbd>
			<span class="mx-1">/</span>
			<kbd class="rounded-sm border border-ink-500 px-1.5 py-px font-mono text-[10px] tracking-normal text-bone-300">k</kbd>
		</span>
		<span class="flex items-center gap-4">
			<button
				type="button"
				disabled={readonly}
				title={disabledReason}
				class="text-bone-400 transition hover:text-bone-100 disabled:opacity-50"
			>stage</button>
			<button
				type="button"
				disabled={readonly}
				title={disabledReason}
				class="text-bone-400 transition hover:text-bone-100 disabled:opacity-50"
			>discard</button>
			<button
				type="button"
				disabled={readonly}
				title={disabledReason}
				class="text-gold transition hover:text-bone-50 disabled:opacity-50"
			>commit</button>
		</span>
	</footer>
</section>
