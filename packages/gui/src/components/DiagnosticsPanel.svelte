<script lang="ts">
	import type { DiagnosticExport, DiagnosticExportKind, DiagnosticExportResult } from "@daedalus-pi/app-server-protocol";
	const { diagnostics, selectedSessionId, onExport, onRetryFailedTool } = $props<{
		diagnostics?: DiagnosticExport;
		selectedSessionId?: string;
		onExport?: (kind: DiagnosticExportKind) => Promise<DiagnosticExportResult | void> | DiagnosticExportResult | void;
		onRetryFailedTool?: () => void;
	}>();
	let exporting: DiagnosticExportKind | undefined = $state();
	let output = $state("");
	let error = $state("");
	const sessionRequired = new Set<DiagnosticExportKind>(["sqlite-session-bundle", "jsonl-session", "html-session"]);
	function disabledReason(kind: DiagnosticExportKind): string | undefined {
		if (exporting) return "Export already running";
		if (sessionRequired.has(kind) && !selectedSessionId) return "Select a session first";
		return undefined;
	}
	async function runExport(kind: DiagnosticExportKind) {
		const reason = disabledReason(kind);
		if (reason) { error = reason; return; }
		exporting = kind; error = ""; output = "";
		try {
			const result = await onExport?.(kind);
			output = result?.path ?? result?.filename ?? "Export complete";
		} catch (caught) {
			error = caught instanceof Error ? caught.message : String(caught);
		} finally {
			exporting = undefined;
		}
	}
	const buttons: readonly { kind: DiagnosticExportKind; label: string }[] = [
		{ kind: "support-bundle", label: "Export support bundle" },
		{ kind: "sqlite-session-bundle", label: "Export SQLite bundle" },
		{ kind: "jsonl-session", label: "Export JSONL" },
		{ kind: "html-session", label: "Export HTML" },
	];
</script>

<section aria-label="Diagnostics" class="space-y-3">
	<header class="flex items-baseline justify-between gap-3">
		<div>
			<div class="eyebrow eyebrow-brass">drawer · diagnostics</div>
			<h2 class="mt-1 font-display text-[20px] italic text-[color:var(--bone)]">Diagnostics &amp; recovery</h2>
		</div>
	</header>
	<div class="flex flex-wrap gap-2">
		{#each buttons as button}
			{@const reason = disabledReason(button.kind)}
			<button class="btn-brass" type="button" disabled={!!reason} title={reason} onclick={() => void runExport(button.kind)}>
				{exporting === button.kind ? "Exporting…" : button.label}
			</button>
		{/each}
		<button class="btn-mini" type="button" onclick={() => onRetryFailedTool?.()}>Retry failed tool</button>
	</div>
	{#if output}<p class="text-[12px] text-[color:var(--ok)]">Export written: {output}</p>{/if}
	{#if error}<p class="text-[12px] text-[color:var(--danger)]">{error}</p>{/if}
	{#if diagnostics}
		<dl class="grid gap-2 rounded-md border border-[color:var(--rule)] bg-[color:var(--ink-3)] p-4 font-mono text-[11px]">
			<div class="flex justify-between gap-4"><dt class="uppercase tracking-[0.14em] text-[color:var(--bone-faint)]">exported</dt><dd class="text-[color:var(--bone)]">{diagnostics.exportedAt}</dd></div>
			<div class="flex justify-between gap-4"><dt class="uppercase tracking-[0.14em] text-[color:var(--bone-faint)]">kind</dt><dd class="text-[color:var(--bone)]">{diagnostics.kind ?? "support-bundle"}</dd></div>
			<div class="flex justify-between gap-4"><dt class="uppercase tracking-[0.14em] text-[color:var(--bone-faint)]">platform</dt><dd class="text-[color:var(--bone)]">{diagnostics.environment.platform}/{diagnostics.environment.arch}</dd></div>
			<div class="flex justify-between gap-4"><dt class="uppercase tracking-[0.14em] text-[color:var(--bone-faint)]">protocol events</dt><dd class="text-[color:var(--bone)] tabular-nums">{diagnostics.recentProtocolEvents.length}</dd></div>
		</dl>
	{:else}
		<p class="inspector-empty">No diagnostic export loaded.</p>
	{/if}
</section>
