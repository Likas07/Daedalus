import type { SemanticWorkspaceProgress } from "./semantic-workspace.js";

export type WorkspaceProgressKind = "init" | "sync";

type WorkspacePhase = SemanticWorkspaceProgress["phase"];

function formatDuration(ms: number | undefined): string {
	if (ms == null || !Number.isFinite(ms) || ms < 0) return "--";
	const totalSeconds = Math.max(0, Math.round(ms / 1000));
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	if (hours > 0) return `${hours}h ${minutes}m`;
	if (minutes > 0) return `${minutes}m ${seconds}s`;
	return `${seconds}s`;
}

function formatNumber(value: number | undefined): string {
	if (value == null || !Number.isFinite(value)) return "--";
	return Math.round(value).toLocaleString();
}

function truncateMiddle(value: string, maxLength: number): string {
	if (value.length <= maxLength) return value;
	if (maxLength <= 3) return value.slice(0, maxLength);
	const left = Math.ceil((maxLength - 1) / 2);
	const right = Math.floor((maxLength - 1) / 2);
	return `${value.slice(0, left)}…${value.slice(-right)}`;
}

function getPhaseStep(
	kind: WorkspaceProgressKind,
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
			return { current: 3, total: 4, label: "Embed + write chunks" };
		case "indexing":
			return { current: 4, total: 4, label: "Build indexes" };
		case "complete":
			return { current: 4, total: 4, label: "Ready" };
		default:
			return { current: 1, total: 4, label: "Prepare sync" };
	}
}

export function semanticWorkspaceProgressPercent(
	kind: WorkspaceProgressKind,
	progress: SemanticWorkspaceProgress | undefined,
): number {
	if (!progress) return 0;
	if (progress.phase === "complete") return 100;
	if (progress.phase === "writing" && progress.totalChunksPlanned != null && progress.totalChunksPlanned > 0) {
		const embeddedRatio = Math.max(
			0,
			Math.min(1, (progress.embeddingTextsCompleted ?? progress.insertedChunks ?? 0) / progress.totalChunksPlanned),
		);
		return Math.round(75 + embeddedRatio * 15);
	}
	if (progress.phase === "scanning" && progress.totalFiles != null && progress.totalFiles > 0) {
		const scanRatio = Math.max(0, Math.min(1, (progress.processedFiles ?? 0) / progress.totalFiles));
		return Math.round(25 + scanRatio * 50);
	}
	const step = getPhaseStep(kind, progress.phase);
	return Math.round(((step.current - 1) / step.total) * 100);
}

export function semanticWorkspaceProgressBar(percent: number, width = 30): string {
	const bounded = Math.max(0, Math.min(100, percent));
	const filled = Math.max(0, Math.min(width, Math.round((bounded / 100) * width)));
	return `[${"█".repeat(filled)}${"░".repeat(width - filled)}]`;
}

export function semanticWorkspaceProgressLines(
	kind: WorkspaceProgressKind,
	progress: SemanticWorkspaceProgress | undefined,
	options: { width?: number } = {},
): string[] {
	const width = options.width ?? 80;
	const title = kind === "init" ? "Semantic workspace init" : "Semantic workspace sync";
	if (!progress) return [title, "Starting…"];
	const step = getPhaseStep(kind, progress.phase);
	const percent = semanticWorkspaceProgressPercent(kind, progress);
	const eta = progress.phase === "scanning" ? progress.etaMs : progress.embeddingEtaMs;
	const phase = progress.writeSubphase ? `${progress.phase}/${progress.writeSubphase}` : progress.phase;
	const lines = [
		`${title} • ${percent}%`,
		`${semanticWorkspaceProgressBar(percent)} ${step.current}/${step.total} ${step.label}`,
		`${phase}: ${progress.message}`,
		`Elapsed ${formatDuration(progress.elapsedMs)}${eta != null ? ` • ETA ${formatDuration(eta)}` : ""}`,
	];
	const files = [];
	if (progress.processedFiles != null && progress.totalFiles != null) {
		files.push(`${formatNumber(progress.processedFiles)}/${formatNumber(progress.totalFiles)} files`);
	}
	if (progress.changedFiles != null) files.push(`${formatNumber(progress.changedFiles)} changed`);
	if (progress.deletedFiles != null) files.push(`${formatNumber(progress.deletedFiles)} deleted`);
	if (progress.unchangedFiles != null) files.push(`${formatNumber(progress.unchangedFiles)} unchanged`);
	if (progress.skippedFiles != null) files.push(`${formatNumber(progress.skippedFiles)} skipped`);
	if (progress.failedFiles != null && progress.failedFiles > 0)
		files.push(`${formatNumber(progress.failedFiles)} failed`);
	if (files.length > 0) lines.push(`Files: ${files.join(" • ")}`);
	const chunks = [];
	if (progress.embeddingTextsTotal != null) {
		chunks.push(
			`${formatNumber(progress.embeddingTextsCompleted ?? 0)}/${formatNumber(progress.embeddingTextsTotal)} embedded`,
		);
	} else if (progress.totalChunksPlanned != null) {
		chunks.push(
			`${formatNumber(progress.insertedChunks ?? progress.chunks ?? 0)}/${formatNumber(progress.totalChunksPlanned)} chunks`,
		);
	} else if (progress.chunks != null) {
		chunks.push(`${formatNumber(progress.chunks)} chunks`);
	}
	if (progress.insertedChunks != null) chunks.push(`${formatNumber(progress.insertedChunks)} inserted`);
	if (progress.removedChunks != null) chunks.push(`${formatNumber(progress.removedChunks)} removed`);
	if (chunks.length > 0) lines.push(`Chunks: ${chunks.join(" • ")}`);
	const embedding = [];
	if (progress.embeddingRequestsTotal != null) {
		embedding.push(
			`${formatNumber(progress.embeddingRequestsCompleted ?? 0)}/${formatNumber(progress.embeddingRequestsTotal)} requests`,
		);
	}
	if (progress.embeddingBatchesTotal != null) {
		embedding.push(
			`${formatNumber(progress.embeddingBatchesCompleted ?? 0)}/${formatNumber(progress.embeddingBatchesTotal)} batches`,
		);
	}
	if (progress.embeddingCurrentBatch != null && progress.embeddingCurrentBatchTotal != null) {
		embedding.push(
			`batch ${formatNumber(progress.embeddingCurrentBatch)}/${formatNumber(progress.embeddingCurrentBatchTotal)}`,
		);
	}
	if (progress.embeddingTextsPerSecond != null) {
		embedding.push(`${progress.embeddingTextsPerSecond.toFixed(1)} chunks/s`);
	}
	if (progress.embeddingMsPerRequestAvg != null)
		embedding.push(`${formatNumber(progress.embeddingMsPerRequestAvg)}ms/request avg`);
	if (embedding.length > 0) lines.push(`Embedding: ${embedding.join(" • ")}`);
	const db = [];
	if (progress.dbInsertBatchesTotal != null) {
		db.push(
			`${formatNumber(progress.dbInsertBatchesCompleted ?? 0)}/${formatNumber(progress.dbInsertBatchesTotal)} batches`,
		);
	}
	if (progress.dbRowsInserted != null) db.push(`${formatNumber(progress.dbRowsInserted)} rows`);
	if (progress.dbInsertMsPerBatchAvg != null) db.push(`${formatNumber(progress.dbInsertMsPerBatchAvg)}ms/batch avg`);
	if (db.length > 0) lines.push(`DB inserts: ${db.join(" • ")}`);
	const topSkipReasons = Object.entries(progress.skippedByReason ?? {})
		.sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
		.slice(0, 3)
		.map(([reason, count]) => `${reason} ${count}`)
		.join(", ");
	if (topSkipReasons) lines.push(`Skip reasons: ${topSkipReasons}`);
	if (progress.currentFile)
		lines.push(`Current file: ${truncateMiddle(progress.currentFile, Math.max(24, width - 16))}`);
	return lines;
}

export function semanticWorkspaceProgressSummary(
	kind: WorkspaceProgressKind,
	progress: SemanticWorkspaceProgress | undefined,
): string {
	if (!progress) return kind === "init" ? "Preparing workspace…" : "Starting sync…";
	const step = getPhaseStep(kind, progress.phase);
	const percent = semanticWorkspaceProgressPercent(kind, progress);
	const parts = [`${percent}%`, `Step ${step.current}/${step.total}: ${step.label}`, progress.message];
	if (progress.embeddingTextsTotal != null) {
		parts.push(
			`${formatNumber(progress.embeddingTextsCompleted ?? 0)}/${formatNumber(progress.embeddingTextsTotal)} chunks`,
		);
	}
	if (progress.processedFiles != null && progress.totalFiles != null) {
		parts.push(`${formatNumber(progress.processedFiles)}/${formatNumber(progress.totalFiles)} files`);
	}
	if (progress.embeddingTextsPerSecond != null) parts.push(`${progress.embeddingTextsPerSecond.toFixed(1)} chunks/s`);
	const eta = progress.phase === "scanning" ? progress.etaMs : progress.embeddingEtaMs;
	if (eta != null) parts.push(`ETA ${formatDuration(eta)}`);
	return parts.join(" • ");
}

export class SemanticWorkspaceTerminalProgressRenderer {
	private readonly isTty: boolean;
	private readonly width: number;
	private readonly stream: typeof process.stdout;
	private renderedLines = 0;
	private lastProgress: SemanticWorkspaceProgress | undefined;

	constructor(
		private readonly kind: WorkspaceProgressKind,
		stream: typeof process.stdout = process.stdout,
	) {
		this.stream = stream;
		this.isTty = Boolean(stream.isTTY);
		this.width = Math.max(60, stream.columns ?? 80);
	}

	render(progress: SemanticWorkspaceProgress): void {
		this.lastProgress = progress;
		if (!this.isTty) {
			this.stream.write(`${semanticWorkspaceProgressSummary(this.kind, progress)}\n`);
			return;
		}
		const lines = semanticWorkspaceProgressLines(this.kind, progress, { width: this.width });
		if (this.renderedLines > 0) {
			this.stream.write(`\x1b[${this.renderedLines}F`);
		}
		this.stream.write(lines.map((line) => `${line.slice(0, this.width - 1)}\x1b[K`).join("\n"));
		this.stream.write("\n");
		this.renderedLines = lines.length;
	}

	finish(): void {
		if (this.isTty && this.renderedLines > 0) this.stream.write("\n");
		if (!this.isTty && this.lastProgress?.phase !== "complete") this.stream.write("\n");
	}
}
