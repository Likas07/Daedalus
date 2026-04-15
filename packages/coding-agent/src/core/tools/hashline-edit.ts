import type { AgentTool } from "@daedalus-pi/agent-core";
import { type Static, Type } from "@sinclair/typebox";
import { constants } from "fs";
import { access as fsAccess, readFile as fsReadFile, writeFile as fsWriteFile } from "fs/promises";
import type { ToolDefinition } from "../extensions/types.js";
import { detectLineEnding, generateDiffString, normalizeToLF, restoreLineEndings, stripBom } from "./edit-diff.js";
import { EditToolDetails } from "./edit.js";
import { createPathEditCallRenderer, createPathEditResultRenderer } from "./edit-render.js";
import { withFileMutationQueue } from "./file-mutation-queue.js";
import {
	applyHashlineEditsToNormalizedContent,
	HashlineMismatchError,
	parseTag,
	type HashlineAnchor,
	type HashlineEditOperation,
	stripNewLinePrefixes,
} from "./hashline/index.js";
import { resolveToCwd } from "./path-utils.js";
import { wrapToolDefinition } from "./tool-definition-wrapper.js";

const linesSchema = Type.Union([
	Type.Array(Type.String(), { description: "Content lines (preferred)" }),
	Type.String({ description: "Content string; split on real newlines" }),
	Type.Null({ description: "Delete targeted range" }),
]);

const locSchema = Type.Union(
	[
		Type.Literal("append"),
		Type.Literal("prepend"),
		Type.Object({ append: Type.String({ description: "Anchor in LINE#ID format" }) }),
		Type.Object({ prepend: Type.String({ description: "Anchor in LINE#ID format" }) }),
		Type.Object({
			range: Type.Object({
				pos: Type.String({ description: "First line to replace (inclusive)" }),
				end: Type.String({ description: "Last line to replace (inclusive)" }),
			}),
		}),
	],
	{ description: "Edit location" },
);

const hashlineEditEntrySchema = Type.Object(
	{
		loc: locSchema,
		content: linesSchema,
	},
	{ additionalProperties: false },
);

const hashlineEditSchema = Type.Object(
	{
		path: Type.String({ description: "Path to file to edit (relative or absolute)" }),
		edits: Type.Array(hashlineEditEntrySchema, {
			description: "Hashline edits for path. All anchors reference original file snapshot.",
			minItems: 1,
		}),
	},
	{ additionalProperties: false },
);

export type HashlineEditEntry = Static<typeof hashlineEditEntrySchema>;
export type HashlineEditToolInput = Static<typeof hashlineEditSchema>;
export interface HashlineEditToolDetails extends EditToolDetails {}

export interface HashlineEditOperations {
	readFile: (absolutePath: string) => Promise<Buffer>;
	writeFile: (absolutePath: string, content: string) => Promise<void>;
	access: (absolutePath: string) => Promise<void>;
}

export interface HashlineEditToolOptions {
	operations?: HashlineEditOperations;
}

const defaultHashlineEditOperations: HashlineEditOperations = {
	readFile: (path) => fsReadFile(path),
	writeFile: (path, content) => fsWriteFile(path, content, "utf-8"),
	access: (path) => fsAccess(path, constants.R_OK | constants.W_OK),
};

function parseContent(content: string | string[] | null): string[] {
	if (content === null) return [];
	if (typeof content === "string") {
		const normalized = content.endsWith("\n") ? content.slice(0, -1) : content;
		return stripNewLinePrefixes(normalized.replaceAll("\r", "").split("\n"));
	}
	return stripNewLinePrefixes(content);
}

function parseAnchor(raw: string, field: string): HashlineAnchor {
	try {
		return parseTag(raw);
	} catch (error) {
		throw new Error(`${field} requires valid LINE#ID anchor. ${error instanceof Error ? error.message : String(error)}`);
	}
}

function resolveHashlineEdits(edits: HashlineEditEntry[]): HashlineEditOperation[] {
	return edits.map((edit) => {
		const lines = parseContent(edit.content);
		if (edit.loc === "append") return { op: "append_file", lines };
		if (edit.loc === "prepend") return { op: "prepend_file", lines };
		if ("append" in edit.loc) return { op: "append_at", pos: parseAnchor(edit.loc.append, "append"), lines };
		if ("prepend" in edit.loc) return { op: "prepend_at", pos: parseAnchor(edit.loc.prepend, "prepend"), lines };
		return {
			op: "replace_range",
			pos: parseAnchor(edit.loc.range.pos, "range.pos"),
			end: parseAnchor(edit.loc.range.end, "range.end"),
			lines,
		};
	});
}

function buildNoChangeError(path: string, noopEdits?: Array<{ editIndex: number; loc: string; current: string }>): Error {
	let diagnostic = `No changes made to ${path}. The edits produced identical content.`;
	if (noopEdits && noopEdits.length > 0) {
		diagnostic += ` No-op edits: ${noopEdits
			.map((edit) => `edits[${edit.editIndex}] at ${edit.loc}`)
			.join(", ")}.`;
	}
	return new Error(diagnostic);
}

const renderHashlineEditCall = createPathEditCallRenderer("hashline_edit");
const renderHashlineEditResult = createPathEditResultRenderer();

export function createHashlineEditToolDefinition(
	cwd: string,
	options?: HashlineEditToolOptions,
): ToolDefinition<typeof hashlineEditSchema, HashlineEditToolDetails | undefined> {
	const ops = options?.operations ?? defaultHashlineEditOperations;
	return {
		name: "hashline_edit",
		label: "hashline_edit",
		description:
			"Edit a single file using LINE#ID anchors from read(format=\"hashline\"). Read first, copy anchors exactly, batch all edits for one file in one call, then re-read before editing same file again.",
		promptSnippet: "Apply precise file edits using LINE#ID anchors from read(format=\"hashline\")",
		promptGuidelines: [
			"Use hashline_edit for stale-safe surgical edits after read(format=\"hashline\")",
			"Copy anchors exactly as LINE#ID from latest read output",
			"Batch all edits for one file in one hashline_edit call, then re-read before another call on same file",
			"Do not guess anchors or reproduce surrounding file text",
		],
		parameters: hashlineEditSchema,
		async execute(_toolCallId, input: HashlineEditToolInput, signal?: AbortSignal) {
			const { path, edits } = input;
			const absolutePath = resolveToCwd(path, cwd);
			const resolvedEdits = resolveHashlineEdits(edits);

			return withFileMutationQueue(
				absolutePath,
				() =>
					new Promise<{ content: Array<{ type: "text"; text: string }>; details: HashlineEditToolDetails | undefined }>(
						(resolve, reject) => {
							if (signal?.aborted) {
								reject(new Error("Operation aborted"));
								return;
							}

							let aborted = false;
							const onAbort = () => {
								aborted = true;
								reject(new Error("Operation aborted"));
							};
							signal?.addEventListener("abort", onAbort, { once: true });

							void (async () => {
								try {
									try {
										await ops.access(absolutePath);
									} catch {
										signal?.removeEventListener("abort", onAbort);
										reject(new Error(`File not found: ${path}`));
										return;
									}
									if (aborted) return;

									const buffer = await ops.readFile(absolutePath);
									const rawContent = buffer.toString("utf-8");
									if (aborted) return;

									const { bom, text } = stripBom(rawContent);
									const originalEnding = detectLineEnding(text);
									const normalizedContent = normalizeToLF(text);
									const applyResult = applyHashlineEditsToNormalizedContent(normalizedContent, resolvedEdits, path);
									if (applyResult.baseContent === applyResult.newContent) {
										throw buildNoChangeError(path, applyResult.noopEdits);
									}
									if (aborted) return;

									const finalContent = bom + restoreLineEndings(applyResult.newContent, originalEnding);
									await ops.writeFile(absolutePath, finalContent);
									if (aborted) return;

									signal?.removeEventListener("abort", onAbort);
									const diffResult = generateDiffString(applyResult.baseContent, applyResult.newContent);
									const warningsBlock = applyResult.warnings?.length
										? `\nWarnings:\n${applyResult.warnings.join("\n")}`
										: "";
									resolve({
										content: [
											{
												type: "text",
												text: `Updated ${path} with ${resolvedEdits.length} hashline edit(s).${warningsBlock}`,
											},
										],
										details: {
											diff: diffResult.diff,
											firstChangedLine: applyResult.firstChangedLine ?? diffResult.firstChangedLine,
										},
									});
								} catch (error) {
									signal?.removeEventListener("abort", onAbort);
									if (aborted) return;
									if (error instanceof HashlineMismatchError) {
										reject(error);
										return;
									}
									reject(error instanceof Error ? error : new Error(String(error)));
								}
							})();
						},
					),
			);
		},
		renderCall: renderHashlineEditCall,
		renderResult: renderHashlineEditResult,
	};
}

export function createHashlineEditTool(cwd: string, options?: HashlineEditToolOptions): AgentTool<typeof hashlineEditSchema> {
	return wrapToolDefinition(createHashlineEditToolDefinition(cwd, options));
}

export const hashlineEditToolDefinition = createHashlineEditToolDefinition(process.cwd());
export const hashlineEditTool = createHashlineEditTool(process.cwd());
