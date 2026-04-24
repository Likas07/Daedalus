import { type Static, Type } from "@sinclair/typebox";
import { stripNewLinePrefixes } from "./prefix-stripping.js";
import type { HashlineEditOperation } from "./types.js";
import { parseTag } from "./validation.js";

const replaceLinesSchema = Type.Union([
	Type.Array(Type.String(), { description: "Replacement lines (preferred)" }),
	Type.String({ description: "Replacement text; split on real newlines" }),
	Type.Null({ description: "Delete consumed range" }),
]);

const insertLinesSchema = Type.Union([
	Type.Array(Type.String(), { description: "Inserted lines (preferred)" }),
	Type.String({ description: "Inserted text; split on real newlines" }),
]);

const replaceEditSchema = Type.Object(
	{
		path: Type.String({ description: "Path to file to edit" }),
		op: Type.Literal("replace"),
		pos: Type.String({ description: "First LINE#ID anchor to consume" }),
		end: Type.Optional(Type.String({ description: "Last LINE#ID anchor to consume, inclusive" })),
		lines: replaceLinesSchema,
	},
	{ additionalProperties: false },
);

const appendEditSchema = Type.Object(
	{
		path: Type.String({ description: "Path to file to edit" }),
		op: Type.Literal("append"),
		pos: Type.Optional(Type.String({ description: "LINE#ID anchor to insert after; omitted means EOF" })),
		lines: insertLinesSchema,
	},
	{ additionalProperties: false },
);

const prependEditSchema = Type.Object(
	{
		path: Type.String({ description: "Path to file to edit" }),
		op: Type.Literal("prepend"),
		pos: Type.Optional(Type.String({ description: "LINE#ID anchor to insert before; omitted means BOF" })),
		lines: insertLinesSchema,
	},
	{ additionalProperties: false },
);

const deleteEditSchema = Type.Object(
	{
		path: Type.String({ description: "Path to delete" }),
		op: Type.Literal("delete"),
	},
	{ additionalProperties: false },
);

const moveEditSchema = Type.Object(
	{
		path: Type.String({ description: "Source path" }),
		op: Type.Literal("move"),
		to: Type.String({ description: "Destination path" }),
	},
	{ additionalProperties: false },
);

export const hashlineEditEntrySchema = Type.Union([
	replaceEditSchema,
	appendEditSchema,
	prependEditSchema,
	deleteEditSchema,
	moveEditSchema,
]);

export const hashlineEditSchema = Type.Object(
	{
		edits: Type.Array(hashlineEditEntrySchema, {
			description: "Bulk hashline edits. Every entry carries path and op. All anchors reference original file snapshots.",
			minItems: 1,
		}),
	},
	{ additionalProperties: false },
);

export type RawHashlineEditEntry = Static<typeof hashlineEditEntrySchema>;
export type HashlineEditToolInput = Static<typeof hashlineEditSchema>;
export type HashlineFileOp = { op: "delete" } | { op: "move"; to: string };

export interface NormalizedHashlineFileBatch {
	path: string;
	contentEdits: HashlineEditOperation[];
	fileOps: HashlineFileOp[];
}

function parseLines(lines: string | string[] | null): string[] {
	if (lines === null) return [];
	if (typeof lines === "string") {
		const normalized = lines.endsWith("\n") ? lines.slice(0, -1) : lines;
		return stripNewLinePrefixes(normalized.replaceAll("\r", "").split("\n"));
	}
	return stripNewLinePrefixes(lines);
}

function assertRawEntry(entry: unknown): asserts entry is RawHashlineEditEntry {
	if (!entry || typeof entry !== "object" || !("path" in entry) || !("op" in entry)) {
		throw new Error('Each hashline_edit entry must include "path" and "op".');
	}
}

function normalizeEntry(entry: RawHashlineEditEntry): {
	path: string;
	contentEdit?: HashlineEditOperation;
	fileOp?: HashlineFileOp;
} {
	switch (entry.op) {
		case "replace": {
			const pos = parseTag(entry.pos);
			const lines = parseLines(entry.lines);
			if (entry.end) {
				return { path: entry.path, contentEdit: { op: "replace_range", pos, end: parseTag(entry.end), lines } };
			}
			return { path: entry.path, contentEdit: { op: "replace_line", pos, lines } };
		}
		case "append": {
			const lines = parseLines(entry.lines);
			if (entry.pos) return { path: entry.path, contentEdit: { op: "append_at", pos: parseTag(entry.pos), lines } };
			return { path: entry.path, contentEdit: { op: "append_file", lines } };
		}
		case "prepend": {
			const lines = parseLines(entry.lines);
			if (entry.pos) return { path: entry.path, contentEdit: { op: "prepend_at", pos: parseTag(entry.pos), lines } };
			return { path: entry.path, contentEdit: { op: "prepend_file", lines } };
		}
		case "delete":
			return { path: entry.path, fileOp: { op: "delete" } };
		case "move":
			return { path: entry.path, fileOp: { op: "move", to: entry.to } };
	}
}

export function normalizeHashlineBulkInput(input: HashlineEditToolInput): Map<string, NormalizedHashlineFileBatch> {
	if (!input || typeof input !== "object" || !("edits" in input) || !Array.isArray(input.edits) || "path" in input) {
		throw new Error(
			'hashline_edit now expects { edits: [{ path, op, pos?, end?, lines? }] }; top-level path/loc/content are no longer supported.',
		);
	}

	const grouped = new Map<string, NormalizedHashlineFileBatch>();
	for (const entry of input.edits as unknown[]) {
		assertRawEntry(entry);
		if ((entry.op === "append" || entry.op === "prepend") && (entry as { lines?: unknown }).lines === null) {
			throw new Error(`${entry.op} requires non-null lines; use replace with lines:null to delete.`);
		}
		if ("loc" in entry || "content" in entry) {
			throw new Error(
				'hashline_edit now expects { edits: [{ path, op, pos?, end?, lines? }] }; loc/content are no longer supported.',
			);
		}
		const normalized = normalizeEntry(entry);
		const batch = grouped.get(normalized.path) ?? { path: normalized.path, contentEdits: [], fileOps: [] };
		if (normalized.contentEdit) batch.contentEdits.push(normalized.contentEdit);
		if (normalized.fileOp) batch.fileOps.push(normalized.fileOp);
		grouped.set(normalized.path, batch);
	}
	return grouped;
}
