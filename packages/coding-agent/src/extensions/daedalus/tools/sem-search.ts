import path from "node:path";
import { StringEnum } from "@daedalus-pi/ai";
import { Text } from "@daedalus-pi/tui";
import { Type } from "@sinclair/typebox";
import type { ExtensionAPI } from "@daedalus-pi/coding-agent";
import { requireReadySemanticWorkspace } from "./semantic-workspace.js";

const SemSearchParams = Type.Object({
	query: Type.Optional(Type.String({ description: "Semantic search query" })),
	queries: Type.Optional(Type.Array(Type.String(), { description: "Optional multi-query semantic search batch" })),
	path: Type.Optional(Type.String({ description: "Directory to search (default: current directory)" })),
	glob: Type.Optional(Type.String({ description: "Optional file glob filter" })),
	limit: Type.Optional(Type.Number({ description: "Maximum ranked files to return (default: 10)" })),
});

interface RankedResult {
	path: string;
	score: number;
	snippet: string;
}

function tokenize(input: string): string[] {
	return input
		.toLowerCase()
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.replace(/[^a-z0-9]+/g, " ")
		.split(/\s+/)
		.filter((token) => token.length >= 2);
}

function scoreLine(line: string, queryTokens: string[], rawQuery: string): number {
	const lower = line.toLowerCase();
	let score = 0;
	for (const token of queryTokens) {
		if (lower.includes(token)) {
			score += 2;
		}
	}
	if (rawQuery && lower.includes(rawQuery.toLowerCase())) {
		score += 6;
	}
	return score;
}

function scoreDocument(relativePath: string, content: string, queries: string[]): RankedResult | undefined {
	const pathTokens = tokenize(relativePath);
	const lines = content.split(/\r?\n/);
	let totalScore = 0;
	let bestSnippet = "";
	let bestSnippetScore = 0;

	for (const query of queries) {
		const queryTokens = tokenize(query);
		if (queryTokens.length === 0) continue;
		let queryScore = 0;
		for (const token of queryTokens) {
			if (pathTokens.includes(token)) {
				queryScore += 5;
			} else if (relativePath.toLowerCase().includes(token)) {
				queryScore += 3;
			}
		}
		if (relativePath.toLowerCase().includes(query.toLowerCase())) {
			queryScore += 8;
		}
		for (const line of lines) {
			const lineScore = scoreLine(line, queryTokens, query);
			if (lineScore > 0) {
				queryScore += lineScore;
				if (lineScore > bestSnippetScore) {
					bestSnippetScore = lineScore;
					bestSnippet = line.trim();
				}
			}
		}
		totalScore += queryScore;
	}

	if (totalScore <= 0) return undefined;
	return {
		path: relativePath,
		score: totalScore,
		snippet: bestSnippet || relativePath,
	};
}

export default function semSearchExtension(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "sem_search",
		label: "Semantic Search",
		description:
			"Rank indexed files using semantic-style matching over file paths and indexed file contents. Requires a ready semantic workspace index.",
		promptSnippet: "Use indexed semantic search when the workspace is initialized and synced",
		promptGuidelines: [
			"Before relying on sem_search, check sem_workspace_status and sync the workspace if needed.",
			"Use sem_workspace_init once per project, then sem_workspace_sync whenever the index is missing or stale.",
			"Use fs_search after sem_search to verify exact matches or inspect precise lines.",
		],
		parameters: SemSearchParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const queries = [...(params.queries ?? []), ...(params.query ? [params.query] : [])].map((query) => query.trim()).filter(Boolean);
			if (queries.length === 0) {
				throw new Error("sem_search requires query or queries");
			}
			const { status, state } = requireReadySemanticWorkspace(ctx.cwd);
			const scopedPrefix = params.path && params.path !== "." ? `${params.path.replace(/\\/g, "/").replace(/\/+$/, "")}/` : undefined;
			const globPattern = params.glob ? new RegExp(params.glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i") : undefined;
			const ranked: RankedResult[] = [];
			for (const doc of state.documents) {
				if (scopedPrefix && !doc.path.startsWith(scopedPrefix)) continue;
				if (globPattern && !globPattern.test(path.basename(doc.path))) continue;
				const result = scoreDocument(doc.path, doc.content, queries);
				if (result) ranked.push(result);
			}
			ranked.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
			const limited = ranked.slice(0, Math.max(1, params.limit ?? 10));
			return {
				content: [
					{
						type: "text",
						text: limited.length
							? limited.map((result, index) => `${index + 1}. ${result.path} [score=${result.score}]\n   ${result.snippet}`).join("\n")
							: "No semantic matches found in indexed workspace",
					},
				],
				details: { queries, results: limited, total: ranked.length, workspace: status },
			};
		},
		renderCall(args, theme) {
			const label = args.query ?? (Array.isArray(args.queries) ? args.queries.join(" | ") : "semantic query");
			return new Text(`${theme.fg("toolTitle", theme.bold("sem_search"))} ${theme.fg("accent", label)}`, 0, 0);
		},
		renderResult(result, _options, theme) {
			const text = result.content.find((block) => block.type === "text")?.text ?? "";
			return new Text(theme.fg("toolOutput", text), 0, 0);
		},
	});
}
