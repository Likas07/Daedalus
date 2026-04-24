import type { ExtensionAPI, ExtensionCommandContext } from "@daedalus-pi/coding-agent";
import { Text } from "@daedalus-pi/tui";
import {
	applySemanticToolExposure,
	getRememberedSemanticDesiredTools,
	rememberSemanticDesiredTools,
} from "./semantic-tool-availability.js";
import { createSemanticBackgroundSyncController } from "./semantic-background-sync.js";
import {
	getSemanticWorkspaceStatus,
	initSemanticWorkspace,
	type SemanticWorkspaceProgress,
	syncSemanticWorkspace,
} from "./semantic-workspace.js";

const backgroundSync = createSemanticBackgroundSyncController();

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

type WorkspaceCommandKind = "init" | "sync";
type WorkspacePhase = SemanticWorkspaceProgress["phase"];

function formatStatus(status: ReturnType<typeof getSemanticWorkspaceStatus>): string {
	const lines = [
		`state: ${status.state}`,
		`initialized: ${status.initialized}`,
		`ready: ${status.ready}`,
		`chunk_count: ${status.chunkCount}`,
		`root: ${status.root}`,
		`index_path: ${status.indexPath}`,
		`database_dir: ${status.databaseDir}`,
	];
	if (status.embeddingProvider) lines.push(`embedding_provider: ${status.embeddingProvider}`);
	if (status.embeddingModel) lines.push(`embedding_model: ${status.embeddingModel}`);
	if (status.embeddingHost) lines.push(`embedding_host: ${status.embeddingHost}`);
	if (status.embeddingDimension) lines.push(`embedding_dimension: ${status.embeddingDimension}`);
	if (status.vectorIndexName) lines.push(`vector_index: ${status.vectorIndexName}`);
	if (status.ftsIndexName) lines.push(`fts_index: ${status.ftsIndexName}`);
	if (status.indexedAt) lines.push(`indexed_at: ${new Date(status.indexedAt).toISOString()}`);
	if (status.lastDiscoverySummary) {
		lines.push(`candidate_files: ${status.lastDiscoverySummary.candidateFiles}`);
		lines.push(`skipped_files: ${status.lastDiscoverySummary.skippedFiles}`);
		lines.push(`index_profile: ${status.lastDiscoverySummary.indexProfile}`);
	}
	if (status.staleReason) lines.push(`stale_reason: ${status.staleReason}`);
	return lines.join("\n");
}

function formatDuration(ms: number | undefined): string {
	if (ms == null || !Number.isFinite(ms) || ms < 0) return "--";
	const totalSeconds = Math.max(0, Math.round(ms / 1000));
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	if (minutes > 0) return `${minutes}m ${seconds}s`;
	return `${seconds}s`;
}

function getPhaseStep(
	kind: WorkspaceCommandKind,
	phase: WorkspacePhase | undefined,
): { current: number; total: number; label: string } {
	if (kind === "init") {
		switch (phase) {
			case "preparing":
				return { current: 1, total: 2, label: "Prepare workspace" };
			case "complete":
				return { current: 2, total: 2, label: "Ready" };
			default:
				return { current: 1, total: 2, label: "Prepare workspace" };
		}
	}
	switch (phase) {
		case "preparing":
			return { current: 1, total: 4, label: "Prepare sync" };
		case "scanning":
			return { current: 2, total: 4, label: "Scan files" };
		case "writing":
			return { current: 3, total: 4, label: "Write chunks" };
		case "indexing":
			return { current: 4, total: 4, label: "Build indexes" };
		case "complete":
			return { current: 4, total: 4, label: "Ready" };
		default:
			return { current: 1, total: 4, label: "Prepare sync" };
	}
}

function formatPercent(progress: SemanticWorkspaceProgress | undefined): string | undefined {
	if (!progress) return undefined;
	if (
		progress.phase === "writing" &&
		progress.totalChunksPlanned != null &&
		progress.totalChunksPlanned > 0 &&
		progress.insertedChunks != null
	) {
		return `${Math.round((Math.max(0, Math.min(progress.insertedChunks, progress.totalChunksPlanned)) / progress.totalChunksPlanned) * 100)}%`;
	}
	if (
		progress.phase === "scanning" &&
		progress.totalFiles &&
		progress.totalFiles > 0 &&
		progress.processedFiles != null
	) {
		const phaseBase = 25;
		const phaseSpan = 50;
		const scanRatio = Math.max(0, Math.min(1, progress.processedFiles / progress.totalFiles));
		return `${Math.round(phaseBase + scanRatio * phaseSpan)}%`;
	}
	const step = getPhaseStep(
		progress.phase === "preparing" && progress.totalFiles == null && progress.chunks === 0 ? "init" : "sync",
		progress.phase,
	);
	if (progress.phase === "complete") return "100%";
	return `${Math.round(((step.current - 1) / step.total) * 100)}%`;
}

function formatProgressBar(progress: SemanticWorkspaceProgress | undefined, width = 20): string {
	if (!progress) return `[${".".repeat(width)}]`;
	const percentText = formatPercent(progress);
	const percent = percentText ? Number.parseInt(percentText, 10) : 0;
	const filled = Math.max(0, Math.min(width, Math.round((percent / 100) * width)));
	return `[${"#".repeat(filled)}${".".repeat(width - filled)}]`;
}

function summarizeProgress(kind: WorkspaceCommandKind, progress: SemanticWorkspaceProgress | undefined): string {
	if (!progress) return kind === "init" ? "Preparing workspace…" : "Starting sync…";
	const step = getPhaseStep(kind, progress.phase);
	const parts = [`Step ${step.current}/${step.total}: ${step.label}`, progress.message];
	if (progress.processedFiles != null && progress.totalFiles != null) {
		parts.push(`${progress.processedFiles}/${progress.totalFiles} files`);
	}
	if (progress.skippedFiles != null && progress.skippedFiles > 0) {
		parts.push(`${progress.skippedFiles} skipped`);
	}
	if (progress.chunks != null && progress.chunks > 0) {
		parts.push(`${progress.chunks} chunks`);
	}
	if (progress.phase === "scanning" && progress.etaMs != null) {
		parts.push(`ETA ${formatDuration(progress.etaMs)}`);
	}
	if (progress.phase === "writing" && progress.embeddingEtaMs != null) {
		parts.push(`ETA ${formatDuration(progress.embeddingEtaMs)}`);
	}
	const percent = formatPercent(progress);
	if (percent) parts.push(percent);
	return parts.join(" • ");
}

function progressWidgetLines(kind: WorkspaceCommandKind, progress: SemanticWorkspaceProgress | undefined): string[] {
	const title = kind === "init" ? "Semantic workspace init in progress" : "Semantic workspace sync in progress";
	if (!progress) return [title, kind === "init" ? "Preparing workspace…" : "Starting sync…"];
	const step = getPhaseStep(kind, progress.phase);
	const percent = formatPercent(progress);
	const lines = [
		title,
		`Step ${step.current}/${step.total}: ${step.label}${percent ? ` • ${percent}` : ""}`,
		`${formatProgressBar(progress)}${percent ? ` ${percent}` : ""}`,
		progress.message,
		`Elapsed ${formatDuration(progress.elapsedMs)}${progress.phase === "scanning" && progress.etaMs != null ? ` • ETA ${formatDuration(progress.etaMs)}` : progress.phase === "writing" && progress.embeddingEtaMs != null ? ` • ETA ${formatDuration(progress.embeddingEtaMs)}` : ""}`,
	];
	if (progress.processedFiles != null && progress.totalFiles != null) {
		lines.push(`Files: ${progress.processedFiles}/${progress.totalFiles}`);
	}
	if (progress.skippedFiles != null && progress.skippedFiles > 0) {
		lines.push(`Skipped: ${progress.skippedFiles}`);
	}
	const topSkipReasons = Object.entries(progress.skippedByReason ?? {})
		.sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
		.slice(0, 3)
		.map(([reason, count]) => `${reason} ${count}`)
		.join(", ");
	if (topSkipReasons) lines.push(`Skip reasons: ${topSkipReasons}`);
	if (progress.embeddingBatchesTotal != null) {
		lines.push(`Embedding batches: ${progress.embeddingBatchesCompleted ?? 0}/${progress.embeddingBatchesTotal}`);
	}
	if (progress.writeSubphase) lines.push(`Substep: ${progress.writeSubphase}`);
	if (progress.chunks != null) {
		if (progress.totalChunksPlanned != null && progress.totalChunksPlanned > 0) {
			lines.push(`Chunks: ${progress.chunks}/${progress.totalChunksPlanned}`);
		} else {
			lines.push(`Chunks: ${progress.chunks}`);
		}
	}
	if (progress.currentFile) lines.push(`Current file: ${progress.currentFile}`);
	return lines;
}

function buildCompletionSummary(
	kind: WorkspaceCommandKind,
	progress: SemanticWorkspaceProgress | undefined,
	cwd: string,
): string {
	const elapsed = formatDuration(progress?.elapsedMs);
	if (kind === "init") {
		return `Semantic workspace initialized for ${cwd}${elapsed === "--" ? "" : ` in ${elapsed}`}.`;
	}
	const details = [
		progress?.changedFiles != null
			? `${progress.changedFiles} changed file${progress.changedFiles === 1 ? "" : "s"}`
			: undefined,
		progress?.deletedFiles != null
			? `${progress.deletedFiles} deleted file${progress.deletedFiles === 1 ? "" : "s"}`
			: undefined,
		progress?.unchangedFiles != null
			? `${progress.unchangedFiles} unchanged file${progress.unchangedFiles === 1 ? "" : "s"}`
			: undefined,
		progress?.insertedChunks != null
			? `${progress.insertedChunks} inserted chunk${progress.insertedChunks === 1 ? "" : "s"}`
			: undefined,
		progress?.removedChunks != null
			? `${progress.removedChunks} removed chunk${progress.removedChunks === 1 ? "" : "s"}`
			: undefined,
		progress?.skippedFiles != null
			? `${progress.skippedFiles} skipped file${progress.skippedFiles === 1 ? "" : "s"}`
			: undefined,
	]
		.filter(Boolean)
		.join(", ");
	return `Semantic workspace sync complete${details ? `: ${details}` : ""}${elapsed === "--" ? "" : ` in ${elapsed}`}.`;
}

function syncExposure(pi: ExtensionAPI, cwd: string): void {
	const current = pi.getActiveTools();
	if (current.length === 0) return;
	const desired = getRememberedSemanticDesiredTools(current);
	pi.setActiveTools(applySemanticToolExposure(desired, cwd));
}

function emitWorkspaceStatus(pi: ExtensionAPI, cwd: string): void {
	const status = getSemanticWorkspaceStatus(cwd);
	pi.sendMessage(
		{
			customType: "semantic-workspace-status",
			content: formatStatus(status),
			display: true,
			details: { workspace: status },
		},
		{ triggerTurn: false },
	);
}

function emitWorkspaceSummary(pi: ExtensionAPI, content: string, details?: Record<string, unknown>): void {
	pi.sendMessage(
		{ customType: "semantic-workspace-summary", content, display: true, details },
		{ triggerTurn: false },
	);
}

async function runWorkspaceCommand(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	kind: WorkspaceCommandKind,
	run: (onProgress: (progress: SemanticWorkspaceProgress) => void) => Promise<unknown>,
): Promise<void> {
	let latestProgress: SemanticWorkspaceProgress | undefined;
	let frame = 0;
	const statusKey = "semantic-workspace-progress";
	const widgetKey = "semantic-workspace-progress";
	const hasUI = ctx.hasUI;
	const render = (): void => {
		if (!hasUI) return;
		const summary = summarizeProgress(kind, latestProgress);
		const spinner = SPINNER_FRAMES[frame % SPINNER_FRAMES.length];
		ctx.ui.setStatus(statusKey, ctx.ui.theme.fg("accent", `${spinner} ${summary}`));
		ctx.ui.setWidget(widgetKey, progressWidgetLines(kind, latestProgress), { placement: "aboveEditor" });
	};
	const timer = setInterval(() => {
		frame += 1;
		render();
	}, 120);
	try {
		render();
		await run((progress) => {
			latestProgress = progress;
			render();
		});
		clearInterval(timer);
		if (hasUI) {
			ctx.ui.setWidget(widgetKey, undefined, { placement: "aboveEditor" });
			const summary = buildCompletionSummary(kind, latestProgress, ctx.cwd);
			ctx.ui.setStatus(statusKey, ctx.ui.theme.fg("success", `✓ ${summary}`));
		}
		syncExposure(pi, ctx.cwd);
		emitWorkspaceSummary(pi, buildCompletionSummary(kind, latestProgress, ctx.cwd), {
			kind,
			progress: latestProgress,
		});
		emitWorkspaceStatus(pi, ctx.cwd);
	} catch (error) {
		clearInterval(timer);
		if (hasUI) {
			ctx.ui.setWidget(widgetKey, undefined, { placement: "aboveEditor" });
			const message = error instanceof Error ? error.message : String(error);
			ctx.ui.setStatus(statusKey, ctx.ui.theme.fg("error", `✗ semantic workspace ${kind} failed`));
			ctx.ui.notify(`Semantic workspace ${kind} failed: ${message}`, "error");
		}
		throw error;
	}
}

export default function semanticWorkspaceExtension(pi: ExtensionAPI): void {
	pi.on("session_start", async (_event, ctx) => {
		const active = pi.getActiveTools();
		const allToolNames = pi.getAllTools().map((tool) => tool.name);
		const desired =
			active.includes("sem_search") || !allToolNames.includes("sem_search") ? active : [...active, "sem_search"];
		rememberSemanticDesiredTools(desired);
		syncExposure(pi, ctx.cwd);
		void backgroundSync.maybeStartForSession(ctx.cwd);
	});
	pi.on("session_tree", async (_event, ctx) => {
		syncExposure(pi, ctx.cwd);
	});
	pi.on("before_agent_start", async (_event, ctx) => {
		syncExposure(pi, ctx.cwd);
	});
	pi.on("turn_end", async (_event, ctx) => {
		void backgroundSync.maybeStartAfterTurn(ctx.cwd);
	});

	pi.registerMessageRenderer("semantic-workspace-status", (message, _options, theme) => {
		const content = typeof message.content === "string" ? message.content : "semantic workspace status unavailable";
		return new Text(theme.fg("accent", content), 0, 0);
	});

	pi.registerMessageRenderer("semantic-workspace-summary", (message, _options, theme) => {
		const content = typeof message.content === "string" ? message.content : "semantic workspace summary unavailable";
		return new Text(theme.fg("success", content), 0, 0);
	});

	pi.registerCommand("workspace-init", {
		description: "Initialize semantic workspace for the current project",
		handler: async (_args, ctx) =>
			runWorkspaceCommand(pi, ctx, "init", (onProgress) => initSemanticWorkspace(ctx.cwd, onProgress)),
	});
	pi.registerCommand("sync-init", {
		description: "Alias for /workspace-init",
		handler: async (_args, ctx) =>
			runWorkspaceCommand(pi, ctx, "init", (onProgress) => initSemanticWorkspace(ctx.cwd, onProgress)),
	});

	pi.registerCommand("workspace-sync", {
		description: "Build or refresh the semantic workspace index for the current project",
		handler: async (_args, ctx) =>
			runWorkspaceCommand(pi, ctx, "sync", (onProgress) => syncSemanticWorkspace(ctx.cwd, onProgress)),
	});
	pi.registerCommand("sync", {
		description: "Alias for /workspace-sync",
		handler: async (_args, ctx) =>
			runWorkspaceCommand(pi, ctx, "sync", (onProgress) => syncSemanticWorkspace(ctx.cwd, onProgress)),
	});

	pi.registerCommand("workspace-status", {
		description: "Show semantic workspace readiness and freshness",
		handler: async (_args, ctx) => emitWorkspaceStatus(pi, ctx.cwd),
	});
	pi.registerCommand("sync-status", {
		description: "Alias for /workspace-status",
		handler: async (_args, ctx) => emitWorkspaceStatus(pi, ctx.cwd),
	});

	pi.registerCommand("workspace-info", {
		description: "Show semantic workspace details",
		handler: async (_args, ctx) => emitWorkspaceStatus(pi, ctx.cwd),
	});
	pi.registerCommand("sync-info", {
		description: "Alias for /workspace-info",
		handler: async (_args, ctx) => emitWorkspaceStatus(pi, ctx.cwd),
	});
}
