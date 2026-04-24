import path from "node:path";
import { type ExtensionAPI, formatVisiblePath } from "@daedalus-pi/coding-agent";
import { Text } from "@daedalus-pi/tui";
import { Type } from "@sinclair/typebox";
import { resolveToCwd } from "../../../core/tools/path-utils.js";
import {
	GREP_MAX_LINE_LENGTH,
	type TruncationResult,
	truncateHead,
	truncateLine,
} from "../../../core/tools/truncate.js";
import { formatTruncationNotice, saveToTempFile } from "../shared/truncation.js";
import { createSemanticStoreRuntime } from "./semantic-store.js";
import { requireSearchableSemanticWorkspace } from "./semantic-workspace.js";

const SearchQuerySchema = Type.Object({
	query: Type.String({ description: "Semantic retrieval query" }),
	use_case: Type.String({ description: "Reranking/use-case intent for the search" }),
	starts_with: Type.Optional(Type.String({ description: "Optional file path prefix filter" })),
	ends_with: Type.Optional(Type.Array(Type.String(), { description: "Optional file path suffix filters" })),
	top_k: Type.Optional(Type.Number({ description: "Candidate result count retained before final limit" })),
});

const SemSearchParams = Type.Object({
	queries: Type.Array(SearchQuerySchema, { description: "Forge-style semantic search queries" }),
	path: Type.Optional(Type.String({ description: "Directory to search (default: current directory)" })),
	glob: Type.Optional(Type.String({ description: "Optional file glob filter" })),
	limit: Type.Optional(Type.Number({ description: "Maximum ranked chunks to return (default: 10)" })),
});

interface AggregatedHit {
	chunkId: string;
	filePath: string;
	startLine: number;
	endLine: number;
	snippet: string;
	relevanceScore: number;
	distance?: number;
	contentHash: string;
	language?: string;
}

interface QueryBucket {
	query: string;
	use_case: string;
	results: AggregatedHit[];
}

interface BoundedOutput {
	text: string;
	truncation?: TruncationResult;
	linesTruncated?: boolean;
	fullOutputPath?: string;
}

interface Score {
	queryIndex: number;
	relevance?: number;
	distance?: number;
}

function normalizeQueries(params: {
	queries: Array<{ query: string; use_case: string; starts_with?: string; ends_with?: string[]; top_k?: number }>;
}) {
	return params.queries
		.map((item) => ({
			query: item.query.trim(),
			use_case: item.use_case.trim(),
			starts_with: item.starts_with?.trim() || undefined,
			ends_with: item.ends_with?.map((suffix) => suffix.trim()).filter(Boolean),
			top_k: item.top_k,
		}))
		.filter((item) => item.query && item.use_case);
}

function toPosixPath(filePath: string): string {
	return filePath.split(path.sep).join("/");
}

function normalizeSearchPathPrefix(searchPath: string | undefined, cwd: string): string | undefined {
	if (!searchPath || searchPath === ".") return undefined;
	const resolvedPath = resolveToCwd(searchPath, cwd);
	const relativePath = path.relative(cwd, resolvedPath);
	if (relativePath === "") return undefined;
	if (relativePath === ".." || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
		throw new Error(`sem_search path must be inside the workspace: ${searchPath}`);
	}
	return `${toPosixPath(relativePath).replace(/\/+$/, "")}/`;
}

function compareOptionalHigh(a?: number, b?: number): number | undefined {
	if (a != null && b != null) {
		if (a === b) return undefined;
		return a > b ? 1 : -1;
	}
	if (a != null && b == null) return 1;
	if (a == null && b != null) return -1;
	return undefined;
}

function compareOptionalLow(a?: number, b?: number): number | undefined {
	if (a != null && b != null) {
		if (a === b) return undefined;
		return a < b ? 1 : -1;
	}
	if (a != null && b == null) return 1;
	if (a == null && b != null) return -1;
	return undefined;
}

function isBetterScoreFixed(candidate: Score, current?: Score): boolean {
	if (!current) return true;
	const rel = compareOptionalHigh(candidate.relevance, current.relevance);
	if (rel != null) return rel > 0;
	const dist = compareOptionalLow(candidate.distance, current.distance);
	if (dist != null) return dist > 0;
	return candidate.queryIndex < current.queryIndex;
}

function renderForgeStyleBuckets(buckets: QueryBucket[]): string {
	if (buckets.length === 0 || buckets.every((bucket) => bucket.results.length === 0)) {
		return "<sem_search_results>\nNo results found for query. Try refining your search with more specific terms or different keywords.\n</sem_search_results>";
	}
	const lines: string[] = ["<sem_search_results>"];
	for (const bucket of buckets) {
		lines.push("<query_result");
		lines.push(`  query="${bucket.query}"`);
		lines.push(`  use_case="${bucket.use_case}"`);
		lines.push(`  results="${bucket.results.length}"`);
		lines.push(">\n");
		const grouped = new Map<string, AggregatedHit[]>();
		for (const hit of bucket.results) {
			const list = grouped.get(hit.filePath) ?? [];
			list.push(hit);
			grouped.set(hit.filePath, list);
		}
		for (const [filePath, hits] of [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
			hits.sort((a, b) => a.startLine - b.startLine);
			const body = hits.map((hit) => hit.snippet).join("\n...\n");
			lines.push("<file");
			lines.push(`  path="${filePath}"`);
			lines.push(`><![CDATA[${body}]]>`);
			lines.push("</file>");
		}
		lines.push("</query_result>");
	}
	lines.push("</sem_search_results>");
	return lines.join("\n");
}

async function formatBoundedOutput(rawOutput: string): Promise<BoundedOutput> {
	const lineResults = rawOutput.split("\n").map((line) => truncateLine(line));
	const linesTruncated = lineResults.some((line) => line.wasTruncated);
	const compactOutput = lineResults.map((line) => line.text).join("\n");
	const truncation = truncateHead(compactOutput);
	let text = truncation.content;
	let fullOutputPath: string | undefined;

	if (truncation.truncated || linesTruncated) {
		fullOutputPath = await saveToTempFile(rawOutput, "sem-search");
	}
	if (truncation.truncated && fullOutputPath) {
		text += formatTruncationNotice(truncation, fullOutputPath);
	}
	if (linesTruncated && fullOutputPath) {
		text += `\n\n[Some semantic search rows truncated to ${GREP_MAX_LINE_LENGTH} chars. Full output saved to: ${formatVisiblePath(fullOutputPath)}]`;
	}

	return {
		text,
		...(truncation.truncated ? { truncation } : {}),
		...(linesTruncated ? { linesTruncated: true } : {}),
		...(fullOutputPath ? { fullOutputPath } : {}),
	};
}

export default function semSearchExtension(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "sem_search",
		label: "Semantic Search",
		description:
			"AI-powered semantic code search. Use this when you need to find code locations, understand implementations, discover patterns, or explore unfamiliar codebases by meaning rather than exact text.",
		promptSnippet:
			"Use sem_search for semantic code discovery when you need to find code by behavior or concept, not exact strings.",
		promptGuidelines: [
			"Semantic search is the default tool for discovering code locations when you don't know exact identifiers or file names.",
			"Use 2–3 varied queries with distinct use_case descriptions for best results.",
			"Split the embedding query (what to find) from the use_case (why) — reranking uses the use_case.",
			"Use 2-3 varied semantic queries to capture different aspects of what you are looking for.",
			"Each query must include a retrieval query and a use_case that explains why you need the code.",
			"Prefer sem_search for implementation discovery, architecture tracing, and unfamiliar code exploration.",
			"Use fs_search instead when you know the exact string, symbol, TODO, or regex pattern to search for.",
			"After sem_search, use fs_search or read to verify exact matches and inspect precise lines.",
		],
		parameters: SemSearchParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const normalizedQueries = normalizeQueries(params);
			if (normalizedQueries.length === 0) {
				throw new Error("sem_search requires Forge-style queries[{query,use_case}]");
			}

			const { status, state } = requireSearchableSemanticWorkspace(ctx.cwd);
			const runtime = await createSemanticStoreRuntime({
				databaseDir: state.databaseDir,
				workspaceRoot: ctx.cwd,
				host: state.embeddingHost,
				model: state.embeddingModel,
			});
			const pathPrefix = normalizeSearchPathPrefix(params.path, ctx.cwd);

			const queryBuckets = await Promise.all(
				normalizedQueries.map(async (query) => ({
					query: query.query,
					use_case: query.use_case,
					results: await runtime.search({
						query: query.query,
						useCase: query.use_case,
						limit: Math.max(params.limit ?? 10, query.top_k ?? 20),
						topK: query.top_k,
						pathPrefix,
						glob: params.glob,
						startsWith: query.starts_with,
						endsWith: query.ends_with,
					}),
				})),
			);

			const bestByChunk = new Map<string, Score>();
			for (const [queryIndex, bucket] of queryBuckets.entries()) {
				for (const result of bucket.results) {
					const score: Score = { queryIndex, relevance: result.relevanceScore, distance: result.distance };
					if (isBetterScoreFixed(score, bestByChunk.get(result.chunkId))) {
						bestByChunk.set(result.chunkId, score);
					}
				}
			}

			for (const [queryIndex, bucket] of queryBuckets.entries()) {
				bucket.results = bucket.results
					.filter((result) => bestByChunk.get(result.chunkId)?.queryIndex === queryIndex)
					.sort((a, b) => {
						if (a.relevanceScore !== b.relevanceScore) return b.relevanceScore - a.relevanceScore;
						if ((a.distance ?? Infinity) !== (b.distance ?? Infinity))
							return (a.distance ?? Infinity) - (b.distance ?? Infinity);
						return a.filePath.localeCompare(b.filePath) || a.startLine - b.startLine;
					})
					.slice(0, Math.max(1, params.limit ?? 10));
			}

			const total = queryBuckets.reduce((sum, bucket) => sum + bucket.results.length, 0);
			const rawOutput = renderForgeStyleBuckets(queryBuckets);
			const bounded = await formatBoundedOutput(rawOutput);
			return {
				content: [{ type: "text", text: bounded.text }],
				details: {
					queries: queryBuckets,
					total,
					workspace: status,
					...(bounded.truncation ? { truncation: bounded.truncation } : {}),
					...(bounded.linesTruncated ? { linesTruncated: true } : {}),
					...(bounded.fullOutputPath ? { fullOutputPath: bounded.fullOutputPath } : {}),
				},
			};
		},
		renderCall(args, theme) {
			const label = Array.isArray(args.queries)
				? args.queries.map((item: any) => item.query).join(" | ")
				: "semantic query";
			return new Text(`${theme.fg("toolTitle", theme.bold("sem_search"))} ${theme.fg("accent", label)}`, 0, 0);
		},
		renderResult(result, _options, theme) {
			const text = result.content.find((block) => block.type === "text")?.text ?? "";
			return new Text(theme.fg("toolOutput", text), 0, 0);
		},
	});
}
