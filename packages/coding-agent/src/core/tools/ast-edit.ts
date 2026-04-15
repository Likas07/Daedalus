import type { AgentTool } from "@daedalus-pi/agent-core";
import { type Static, Type } from "@sinclair/typebox";
import { readFile as fsReadFile, rm as fsRm, writeFile as fsWriteFile } from "fs/promises";
import path from "path";
import type { ToolDefinition } from "../extensions/types.js";
import { createPathEditCallRenderer, createPathEditResultRenderer } from "./edit-render.js";
import { withFileMutationQueue } from "./file-mutation-queue.js";
import {
	applyAstReplacementGroups,
	createDefaultAstBackend,
	createTempAstWorkspace,
	finalizeAstWorkspace,
	formatAstEditPreview,
	normalizePositiveInt,
	normalizeRewriteOps,
	resolveAstScope,
	type AstBackend,
	type AstMatch,
} from "./ast/index.js";
import { wrapToolDefinition } from "./tool-definition-wrapper.js";

const astEditOpSchema = Type.Object({
	pat: Type.String({ description: "AST pattern to match" }),
	out: Type.String({ description: "Replacement template" }),
});

const astEditSchema = Type.Object({
	ops: Type.Array(astEditOpSchema, { description: "Rewrite ops as [{ pat, out }]", minItems: 1 }),
	lang: Type.Optional(Type.String({ description: "Language override" })),
	path: Type.Optional(Type.String({ description: "File or directory to rewrite (default: cwd)" })),
	glob: Type.Optional(Type.String({ description: "Optional glob filter relative to path" })),
	sel: Type.Optional(Type.String({ description: "Optional selector for contextual pattern mode" })),
	limit: Type.Optional(Type.Number({ description: "Max total replacements" })),
});

export type AstEditToolInput = Static<typeof astEditSchema>;
export interface AstEditToolDetails {
	diff: string;
	firstChangedLine?: number;
	totalReplacements: number;
	filesTouched: number;
	scopePath: string;
	stderr?: string;
}

export interface AstEditOperations {
	readFile: (absolutePath: string) => Promise<string>;
	writeFile: (absolutePath: string, content: string) => Promise<void>;
	removeDir: (dir: string) => Promise<void>;
}

export interface AstEditToolOptions {
	backend?: AstBackend;
	operations?: AstEditOperations;
}

const defaultOperations: AstEditOperations = {
	readFile: (absolutePath) => fsReadFile(absolutePath, "utf-8"),
	writeFile: (absolutePath, content) => fsWriteFile(absolutePath, content, "utf-8"),
	removeDir: (dir) => fsRm(dir, { recursive: true, force: true }),
};

function groupByFile(matches: AstMatch[], cwd: string): Map<string, AstMatch[]> {
	const grouped = new Map<string, AstMatch[]>();
	for (const match of matches) {
		const file = path.isAbsolute(match.file) ? match.file : path.join(cwd, match.file);
		if (!grouped.has(file)) grouped.set(file, []);
		grouped.get(file)!.push(match);
	}
	return grouped;
}

export function createAstEditToolDefinition(
	cwd: string,
	options?: AstEditToolOptions,
): ToolDefinition<typeof astEditSchema, AstEditToolDetails | undefined> {
	const backend = options?.backend ?? createDefaultAstBackend();
	const ops = options?.operations ?? defaultOperations;
	return {
		name: "ast_edit",
		label: "ast_edit",
		description: "Structural AST-aware rewrites for codemods and safe syntax-aware edits.",
		promptSnippet: "Structural AST-aware rewrites using ast-grep",
		promptGuidelines: [
			"Use ast_edit for codemods and structural rewrites where plain text replace is unsafe",
			"Keep ast_edit scope narrow with path, glob, and lang",
			"Prefer hashline_edit for one-off surgical text edits",
			"Use ast_grep first when you are not certain the structural match set is correct",
		],
		parameters: astEditSchema,
		async execute(_toolCallId, input: AstEditToolInput, signal?: AbortSignal) {
			const rewriteOps = normalizeRewriteOps(input.ops);
			const limit = normalizePositiveInt(input.limit, "limit", Number.MAX_SAFE_INTEGER);
			const scope = await resolveAstScope(input.path, cwd, input.glob);
			const workspace = await createTempAstWorkspace(scope);
			let totalReplacements = 0;
			let stderr = "";
			try {
				for (const rewrite of rewriteOps) {
					if (totalReplacements >= limit) break;
					const commandCwd = scope.isDirectory ? workspace.scopePath : workspace.tempBasePath;
					const commandPaths = scope.isDirectory ? ["."] : [scope.commandPaths[0]!];
					const result = await backend.run({
						pattern: rewrite.pat,
						rewrite: rewrite.out,
						lang: input.lang,
						selector: input.sel,
						cwd: commandCwd,
						paths: commandPaths,
						glob: scope.glob,
						signal,
					});
					if (result.stderr) stderr = stderr ? `${stderr}\n${result.stderr}` : result.stderr;
					let matches = result.matches;
					if (totalReplacements + matches.length > limit) {
						matches = matches.slice(0, Math.max(0, limit - totalReplacements));
					}
					for (const [filePath, fileMatches] of groupByFile(matches, commandCwd)) {
						const current = await ops.readFile(filePath);
						const next = applyAstReplacementGroups(current, fileMatches);
						await ops.writeFile(filePath, next);
					}
					totalReplacements += matches.length;
				}
				const finalResult = await finalizeAstWorkspace(workspace);
				if (finalResult.changedFiles.length === 0) {
					const text = totalReplacements === 0 ? "No replacements made" : formatAstEditPreview(finalResult.changes);
					return {
						content: [{ type: "text", text: `${text}${stderr ? `\n\nWarnings:\n${stderr}` : ""}` }],
						details: undefined,
					};
				}
				for (const changedFile of finalResult.changedFiles) {
					await withFileMutationQueue(changedFile.absolutePath, () => ops.writeFile(changedFile.absolutePath, changedFile.content));
				}
				return {
					content: [{ type: "text", text: `${formatAstEditPreview(finalResult.changes)}${stderr ? `\n\nWarnings:\n${stderr}` : ""}` }],
					details: {
						diff: finalResult.diff,
						firstChangedLine: finalResult.firstChangedLine,
						totalReplacements,
						filesTouched: finalResult.changedFiles.length,
						scopePath: scope.displayPath,
						...(stderr ? { stderr } : {}),
					},
				};
			} finally {
				await ops.removeDir(workspace.rootDir).catch(() => {});
			}
		},
		renderCall: createPathEditCallRenderer("ast_edit"),
		renderResult: createPathEditResultRenderer(),
	};
}

export function createAstEditTool(cwd: string, options?: AstEditToolOptions): AgentTool<typeof astEditSchema> {
	return wrapToolDefinition(createAstEditToolDefinition(cwd, options));
}

export const astEditToolDefinition = createAstEditToolDefinition(process.cwd());
export const astEditTool = createAstEditTool(process.cwd());
