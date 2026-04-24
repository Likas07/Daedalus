import { createHash } from "node:crypto";
import path from "node:path";
import type { SemanticChunk } from "./semantic-types.js";

export interface SemanticChunkingConfig {
	maxLines?: number;
	overlapLines?: number;
}

const DEFAULT_MAX_LINES = 100;
const DEFAULT_OVERLAP_LINES = 10;

function defaultOverlapForFile(filePath: string): number {
	const ext = path.extname(filePath).toLowerCase();
	if ([".json", ".jsonl", ".csv", ".toml", ".yaml", ".yml"].includes(ext)) return 0;
	if ([".md", ".txt"].includes(ext)) return 5;
	return DEFAULT_OVERLAP_LINES;
}

function contentHash(content: string): string {
	return createHash("sha256").update(content).digest("hex");
}

function inferLanguage(filePath: string): string | undefined {
	const ext = path.extname(filePath).toLowerCase();
	switch (ext) {
		case ".ts":
		case ".tsx":
			return "typescript";
		case ".js":
		case ".jsx":
			return "javascript";
		case ".py":
			return "python";
		case ".rs":
			return "rust";
		case ".go":
			return "go";
		case ".java":
			return "java";
		case ".json":
			return "json";
		case ".md":
			return "markdown";
		default:
			return undefined;
	}
}

export function chunkDocument(filePath: string, content: string, config: SemanticChunkingConfig = {}): SemanticChunk[] {
	const maxLines = Math.max(1, config.maxLines ?? DEFAULT_MAX_LINES);
	const overlapLines = Math.max(0, Math.min(maxLines - 1, config.overlapLines ?? defaultOverlapForFile(filePath)));
	const lines = content.split(/\r?\n/);
	const language = inferLanguage(filePath);
	const chunks: SemanticChunk[] = [];

	let start = 0;
	let ordinal = 0;
	while (start < lines.length) {
		const endExclusive = Math.min(lines.length, start + maxLines);
		const chunkLines = lines.slice(start, endExclusive);
		const chunkContent = chunkLines.join("\n").trimEnd();
		if (chunkContent.length > 0) {
			const startLine = start + 1;
			const endLine = endExclusive;
			chunks.push({
				chunkId: `${filePath}#${startLine}-${endLine}-${ordinal}`,
				filePath,
				language,
				content: chunkContent,
				startLine,
				endLine,
				contentHash: contentHash(chunkContent),
			});
			ordinal += 1;
		}
		if (endExclusive >= lines.length) break;
		start = Math.max(start + 1, endExclusive - overlapLines);
	}

	return chunks;
}
