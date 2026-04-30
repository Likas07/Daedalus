import type {
	protocolV1,
	WorkflowChangedFile,
	WorkflowFileStatus,
	WorkflowRiskGroup,
} from "@daedalus-pi/app-server-protocol";
import { type GitStatusSummary, git, gitStatus, riskGroupForPath } from "./git";

export interface DiffFileSummary extends WorkflowChangedFile {}

export interface DiffResult extends GitStatusSummary {
	readonly files: DiffFileSummary[];
	readonly patch: string;
	readonly riskyGroups: WorkflowRiskGroup[];
}

const LARGE_DIFF_BYTES = 128 * 1024;

export class DiffService {
	async get(cwd: string, base = "HEAD"): Promise<DiffResult> {
		const [nameStatus, patch, numstat, status] = await Promise.all([
			git(cwd, ["diff", "--name-status", base, "--"]),
			git(cwd, ["diff", "--patch", base, "--"]),
			git(cwd, ["diff", "--numstat", base, "--"]),
			gitStatus(cwd),
		]);
		const stats = parseNumstat(numstat.stdout);
		const byPath = new Map<string, DiffFileSummary>();
		for (const file of parseNameStatus(nameStatus.stdout)) {
			const stat = stats.get(file.path) ?? { insertions: 0, deletions: 0 };
			byPath.set(file.path, {
				...file,
				insertions: stat.insertions,
				deletions: stat.deletions,
				staged: Boolean(status.files.find((changed) => changed.path === file.path)?.staged),
				riskGroup: riskGroupForPath(file.path),
			});
		}
		for (const file of status.files) {
			if (byPath.has(file.path)) continue;
			byPath.set(file.path, {
				path: file.path,
				status: file.status,
				staged: file.staged,
				insertions: 0,
				deletions: 0,
				riskGroup: riskGroupForPath(file.path),
			});
		}
		const files = [...byPath.values()];
		return {
			...status,
			files,
			patch: patch.stdout,
			riskyGroups: [...new Set(files.map((file) => file.riskGroup ?? "other"))],
		};
	}

	async getSummaryV1(
		cwd: string,
		params: protocolV1.DiffSummaryParams,
		base = "HEAD",
	): Promise<protocolV1.DiffSummaryResult> {
		try {
			const diff = await this.get(cwd, base);
			const totalBytes = byteLength(diff.patch);
			return {
				ok: true,
				summary: {
					diffId: diffIdFor(params),
					workspaceTargetId: params.workspaceTargetId,
					threadId: params.threadId,
					turnId: params.turnId,
					checkpointId: params.checkpointId,
					status: diff.files.length === 0 ? "clean" : totalBytes > LARGE_DIFF_BYTES ? "large" : "changed",
					title: diff.files.length === 0 ? "No workspace changes" : `${diff.files.length} changed files`,
					createdAt: new Date().toISOString(),
					baseRef: base,
					filesChanged: diff.files.length,
					insertions: diff.files.reduce((sum, file) => sum + file.insertions, 0),
					deletions: diff.files.reduce((sum, file) => sum + file.deletions, 0),
					totalBytes,
					isLarge: totalBytes > LARGE_DIFF_BYTES,
					files: diff.files.map((file) =>
						toV1FileSummary(file, params, filePatchByteLength(diff.patch, file.path)),
					),
					omittedFileCount: 0,
				},
			};
		} catch (error) {
			return diffFailure(params, "error", error instanceof Error ? error.message : String(error));
		}
	}

	async getFileWindowV1(
		cwd: string,
		params: protocolV1.DiffFileWindowParams,
		base = "HEAD",
	): Promise<protocolV1.DiffFileWindowResult> {
		try {
			const [patch, summary] = await Promise.all([
				git(cwd, ["diff", "--patch", base, "--", params.filePath]),
				this.getSummaryV1(cwd, params, base),
			]);
			if (!summary.ok) return summary;
			const file = summary.summary.files.find((item) => item.path === params.filePath);
			if (!file) return diffFailure(params, "not-found", `Diff file ${params.filePath} was not found.`);
			const chunks = chunkPatch(patch.stdout, params.after?.seq ?? 0, params.limit);
			const lastSeq = chunks.at(-1)?.cursor.seq ?? params.after?.seq ?? 0;
			const totalChunks = splitPatchHunks(patch.stdout).length;
			return {
				ok: true,
				window: {
					diffId: params.diffId,
					workspaceTargetId: params.workspaceTargetId,
					threadId: params.threadId,
					turnId: params.turnId,
					checkpointId: params.checkpointId,
					filePath: params.filePath,
					status: file.status,
					isBinary: file.isBinary,
					isLarge: file.isLarge,
					byteLength: byteLength(patch.stdout),
					chunks,
					nextCursor: lastSeq < totalChunks ? { seq: lastSeq } : undefined,
					previousCursor:
						params.after && params.after.seq > 0
							? { seq: Math.max(0, params.after.seq - params.limit) }
							: undefined,
					hasMoreAfter: lastSeq < totalChunks,
					hasMoreBefore: Boolean(params.after && params.after.seq > 0),
				},
			};
		} catch (error) {
			return diffFailure(params, "error", error instanceof Error ? error.message : String(error));
		}
	}
}

export function parseNameStatus(output: string): DiffFileSummary[] {
	return output
		.split("\n")
		.filter(Boolean)
		.map((line) => {
			const [status, ...paths] = line.split("\t");
			const code = status.startsWith("R") ? "R" : (status[0] ?? "M");
			return {
				status: diffStatusCodeToName(code),
				path: paths.at(-1) ?? "",
				previousPath: status.startsWith("R") ? paths[0] : undefined,
				staged: false,
				insertions: 0,
				deletions: 0,
				riskGroup: "other",
			};
		});
}

function diffStatusCodeToName(code: string): WorkflowFileStatus {
	switch (code) {
		case "A":
			return "added";
		case "D":
			return "deleted";
		case "R":
			return "renamed";
		case "C":
			return "copied";
		default:
			return "modified";
	}
}

export function parseNumstat(output: string): Map<string, { insertions: number; deletions: number }> {
	const stats = new Map<string, { insertions: number; deletions: number }>();
	for (const line of output.split("\n").filter(Boolean)) {
		const [insertions, deletions, ...paths] = line.split("\t");
		stats.set(paths.at(-1) ?? "", {
			insertions: insertions === "-" ? 0 : Number(insertions),
			deletions: deletions === "-" ? 0 : Number(deletions),
		});
	}
	return stats;
}

function toV1FileSummary(
	file: DiffFileSummary,
	params: protocolV1.DiffSummaryParams,
	fileBytes: number,
): protocolV1.DiffFileSummary {
	return {
		path: file.path,
		oldPath: file.previousPath,
		status: toV1FileStatus(file.status),
		insertions: file.insertions,
		deletions: file.deletions,
		hunks: 0,
		byteLength: fileBytes,
		isBinary: false,
		isLarge: fileBytes > LARGE_DIFF_BYTES,
		payloadRef: {
			kind: "diff-content",
			diffId: diffIdFor(params),
			filePath: file.path,
			byteLength: fileBytes,
		},
	};
}

function toV1FileStatus(status: WorkflowFileStatus): protocolV1.DiffFileStatus {
	if (status === "added" || status === "deleted" || status === "renamed" || status === "copied") return status;
	return "modified";
}

function diffFailure(
	params: protocolV1.DiffSummaryParams | protocolV1.DiffFileWindowParams,
	code: protocolV1.DiffFailureCode,
	message: string,
): protocolV1.DiffFailure {
	return {
		ok: false,
		code,
		workspaceTargetId: params.workspaceTargetId,
		threadId: params.threadId,
		turnId: params.turnId,
		checkpointId: params.checkpointId,
		diffId: "diffId" in params ? params.diffId : undefined,
		message,
	};
}

function diffIdFor(params: protocolV1.DiffSummaryParams): string {
	return `diff:${params.workspaceTargetId}:${params.threadId}:${params.turnId}:${params.checkpointId}`;
}

function byteLength(value: string): number {
	return Buffer.byteLength(value, "utf8");
}

function filePatchByteLength(patch: string, filePath: string): number {
	return byteLength(patch.split(/^diff --git /m).find((section) => section.includes(` b/${filePath}`)) ?? "");
}

function splitPatchHunks(patch: string): string[] {
	if (!patch.trim()) return [];
	const parts = patch.split(/(?=^@@\s)/m).filter(Boolean);
	return parts.length > 0 ? parts : [patch];
}

function chunkPatch(patch: string, afterSeq: number, limit: number): protocolV1.DiffHunkWindowChunk[] {
	return splitPatchHunks(patch)
		.slice(afterSeq, afterSeq + limit)
		.map((text, index) => ({
			cursor: { seq: afterSeq + index + 1 },
			oldStart: hunkNumber(text, "oldStart"),
			oldLines: hunkNumber(text, "oldLines"),
			newStart: hunkNumber(text, "newStart"),
			newLines: hunkNumber(text, "newLines"),
			text,
			byteLength: byteLength(text),
		}));
}

function hunkNumber(text: string, part: "oldStart" | "oldLines" | "newStart" | "newLines"): number {
	const match = text.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))?/m);
	if (!match) return 0;
	switch (part) {
		case "oldStart":
			return Number(match[1] ?? 0);
		case "oldLines":
			return Number(match[2] ?? 1);
		case "newStart":
			return Number(match[3] ?? 0);
		case "newLines":
			return Number(match[4] ?? 1);
	}
}
