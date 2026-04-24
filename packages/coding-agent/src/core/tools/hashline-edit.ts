import type { AgentTool } from "@daedalus-pi/agent-core";
import { constants } from "fs";
import {
	access as fsAccess,
	mkdir as fsMkdir,
	readFile as fsReadFile,
	rename as fsRename,
	unlink as fsUnlink,
	writeFile as fsWriteFile,
} from "fs/promises";
import type { ToolDefinition } from "../extensions/types.js";
import type { EditToolDetails } from "./edit.js";
import { createPathEditCallRenderer, createPathEditResultRenderer } from "./edit-render.js";
import { withFileMutationQueue } from "./file-mutation-queue.js";
import {
	executeHashlineFileBatch,
	type HashlineFileBatchResult,
} from "./hashline/bulk-executor.js";
import {
	buildCompactHashlineDiffPreview,
	hashlineEditSchema,
	type HashlineEditToolInput,
	HashlineMismatchError,
	normalizeHashlineBulkInput,
} from "./hashline/index.js";
import { resolveToCwd } from "./path-utils.js";
import { type ReadLedgerLike, requirePriorRead } from "./read-ledger.js";
import { wrapToolDefinition } from "./tool-definition-wrapper.js";

export type { HashlineEditToolInput, RawHashlineEditEntry as HashlineEditEntry } from "./hashline/index.js";

export interface HashlineEditToolDetails extends EditToolDetails {}

export interface HashlineEditOperations {
	readFile: (absolutePath: string) => Promise<Buffer>;
	writeFile: (absolutePath: string, content: string) => Promise<void>;
	access: (absolutePath: string) => Promise<void>;
	unlink: (absolutePath: string) => Promise<void>;
	rename: (fromAbsolutePath: string, toAbsolutePath: string) => Promise<void>;
	mkdir: (absolutePath: string) => Promise<void>;
}

export interface HashlineEditToolOptions {
	operations?: HashlineEditOperations;
	readLedger?: ReadLedgerLike;
}

const defaultHashlineEditOperations: HashlineEditOperations = {
	readFile: (path) => fsReadFile(path),
	writeFile: (path, content) => fsWriteFile(path, content, "utf-8"),
	access: (path) => fsAccess(path, constants.R_OK | constants.W_OK),
	unlink: (path) => fsUnlink(path),
	rename: (from, to) => fsRename(from, to),
	mkdir: async (path) => {
		await fsMkdir(path, { recursive: true });
	},
};

const renderHashlineEditCall = createPathEditCallRenderer("hashline_edit");
const renderHashlineEditResult = createPathEditResultRenderer();

function requiresPriorRead(batch: { contentEdits: Array<{ op: string }> }): boolean {
	return batch.contentEdits.some((edit) => edit.op !== "append_file" && edit.op !== "prepend_file");
}

function formatResultText(result: HashlineFileBatchResult): string {
	const preview = result.diff ? buildCompactHashlineDiffPreview(result.diff) : undefined;
	const previewBlock = preview
		? `\nChanges: +${preview.addedLines} -${preview.removedLines}${preview.preview ? `\n\nDiff preview:\n${preview.preview}` : ""}`
		: "";
	const warnings = result.warnings?.length ? `\nWarnings:\n${result.warnings.join("\n")}` : "";
	return `${result.text}${previewBlock}${warnings}`;
}

function aggregateResults(results: HashlineFileBatchResult[]): {
	content: Array<{ type: "text"; text: string }>;
	details: HashlineEditToolDetails | undefined;
} {
	return {
		content: [{ type: "text", text: results.map(formatResultText).join("\n") }],
		details: {
			diff: results.map((result) => result.diff).filter(Boolean).join("\n"),
			firstChangedLine: results.find((result) => result.firstChangedLine !== undefined)?.firstChangedLine,
		},
	};
}

export function createHashlineEditToolDefinition(
	cwd: string,
	options?: HashlineEditToolOptions,
): ToolDefinition<typeof hashlineEditSchema, HashlineEditToolDetails | undefined> {
	const ops = options?.operations ?? defaultHashlineEditOperations;
	return {
		name: "hashline_edit",
		label: "hashline_edit",
		description:
			'Bulk edit files using LINE#ID anchors from read(format="hashline"). Input is { edits: [{ path, op, pos?, end?, lines? }] } with op replace/append/prepend/delete/move.',
		promptSnippet: "Preferred stale-safe bulk file edits using per-entry path plus op/pos/end/lines LINE#ID anchors",
		promptGuidelines: [
			'Read each anchored target file with read({ path, format: "hashline" }) before hashline_edit',
			'Use the clean bulk shape only: { edits: [{ path, op: "replace"|"append"|"prepend"|"delete"|"move", pos?, end?, lines?, to? }] }',
			"All edits in one call reference the ORIGINAL file snapshot; do not adjust line numbers for earlier edits in the same call",
			"Batch independent edits across files in one hashline_edit call instead of writing ad hoc bash or Python mutation scripts",
			"replace consumes pos..end inclusive; lines contains only replacement content, not unchanged surrounding lines",
			"append/prepend with pos insert after/before the anchor; without pos they append/prepend at EOF/BOF and may create missing files",
			"Use lines:null only with replace to delete the consumed line/range",
			"Re-read a file before editing it again after a successful hashline_edit call",
		],
		parameters: hashlineEditSchema,
		async execute(_toolCallId, input: HashlineEditToolInput, signal?: AbortSignal, _onUpdate?, ctx?) {
			const grouped = normalizeHashlineBulkInput(input);
			const results: HashlineFileBatchResult[] = [];

			for (const batch of grouped.values()) {
				if (signal?.aborted) throw new Error("Operation aborted");
				const absolutePath = resolveToCwd(batch.path, cwd);
				if (requiresPriorRead(batch)) {
					const priorReadError = requirePriorRead(
						ctx?.readLedger ?? options?.readLedger,
						absolutePath,
						"hashline_edit",
					);
					if (priorReadError) return priorReadError;
				}

				try {
					const result = await withFileMutationQueue(absolutePath, () =>
						executeHashlineFileBatch({
							path: batch.path,
							absolutePath,
							batch,
							ops,
							resolvePath: (target) => resolveToCwd(target, cwd),
						}),
					);
					results.push(result);
				} catch (error) {
					if (error instanceof HashlineMismatchError) throw error;
					throw error instanceof Error ? error : new Error(String(error));
				}
			}

			return aggregateResults(results);
		},
		renderCall: (args, theme, context) => renderHashlineEditCall({ path: args.edits[0]?.path }, theme, context),
		renderResult: (result, options, theme, context) =>
			renderHashlineEditResult(result, options, theme, {
				...context,
				args: context.args ? { path: context.args.edits[0]?.path } : undefined,
			}),
	};
}

export function createHashlineEditTool(
	cwd: string,
	options?: HashlineEditToolOptions,
): AgentTool<typeof hashlineEditSchema> {
	return wrapToolDefinition(createHashlineEditToolDefinition(cwd, options));
}

export const hashlineEditToolDefinition = createHashlineEditToolDefinition(process.cwd());
export const hashlineEditTool = createHashlineEditTool(process.cwd());
