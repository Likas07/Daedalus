import type { AgentTool } from "@daedalus-pi/agent-core";
import { Text } from "@daedalus-pi/tui";
import { type Static, Type } from "@sinclair/typebox";
import type { ToolDefinition, ToolRenderResultOptions } from "../extensions/types.js";
import type { ToolOutputSettings } from "../settings-manager.js";
import { DEFAULT_FETCH_MAX_CHARS } from "../tool-output-defaults.js";
import type { ArtifactStore } from "./artifact-store.js";
import {
	extractFetchedText,
	type FetchOperations,
	isTextLikeContentType,
	normalizeFetchUrl,
	normalizeMaxChars,
	normalizeTimeoutSeconds,
} from "./fetch/index.js";
import { getTextOutput, invalidArgText, shortenPath, str } from "./render-utils.js";
import { wrapToolDefinition } from "./tool-definition-wrapper.js";
import type { TruncationResult } from "./truncate.js";

const fetchSchema = Type.Object({
	url: Type.String({ description: "HTTP or HTTPS URL to fetch" }),
	raw: Type.Optional(Type.Boolean({ description: "Return raw response text instead of cleaned HTML extraction" })),
	timeout: Type.Optional(Type.Number({ description: "Timeout in seconds (default: 15)" })),
	maxChars: Type.Optional(
		Type.Number({ description: `Maximum output chars before truncation (default: ${DEFAULT_FETCH_MAX_CHARS})` }),
	),
});

export type FetchToolInput = Static<typeof fetchSchema>;
export interface FetchToolDetails {
	url: string;
	contentType: string;
	truncated: boolean;
	status: number;
	truncation?: TruncationResult;
	fetchArtifactPath?: string;
}

export interface FetchToolOptions {
	operations?: FetchOperations;
	artifactStore?: ArtifactStore;
	toolOutputs?: ToolOutputSettings;
}

const defaultOperations: FetchOperations = {
	fetch: globalThis.fetch.bind(globalThis),
};

function formatFetchCall(
	args: { url?: string; raw?: boolean } | undefined,
	theme: typeof import("../../modes/interactive/theme/theme.js").theme,
): string {
	const rawUrl = str(args?.url);
	const display = rawUrl !== null ? shortenPath(rawUrl) : null;
	const invalidArg = invalidArgText(theme);
	return `${theme.fg("toolTitle", theme.bold("fetch"))} ${display === null ? invalidArg : theme.fg("accent", display)}${args?.raw ? theme.fg("toolOutput", " [raw]") : ""}`;
}

function formatFetchResult(
	result: { content: Array<{ type: string; text?: string }>; details?: FetchToolDetails },
	options: ToolRenderResultOptions,
	theme: typeof import("../../modes/interactive/theme/theme.js").theme,
	showImages: boolean,
): string {
	const output = getTextOutput(result, showImages).trim();
	if (!output) return "";
	const lines = output.split("\n");
	const maxLines = options.expanded ? lines.length : 20;
	const displayLines = lines.slice(0, maxLines);
	const remaining = lines.length - maxLines;
	let text = `\n${displayLines.map((line) => theme.fg("toolOutput", line)).join("\n")}`;
	if (remaining > 0) text += theme.fg("muted", `\n... (${remaining} more lines)`);
	return text;
}

export function createFetchToolDefinition(
	cwd: string,
	options?: FetchToolOptions,
): ToolDefinition<typeof fetchSchema, FetchToolDetails | undefined> {
	const ops = options?.operations ?? defaultOperations;
	const artifactStore = options?.artifactStore;
	const maxFetchChars = options?.toolOutputs?.maxFetchChars ?? DEFAULT_FETCH_MAX_CHARS;
	return {
		name: "fetch",
		label: "fetch",
		description:
			"Fetch remote HTTP/HTTPS content and return cleaned text. Good for documentation pages and known URLs.",
		promptSnippet: "Fetch remote HTTP/HTTPS content and return cleaned text",
		promptGuidelines: [
			"Use fetch when you already know the URL and need remote page content",
			"Prefer fetch over bash curl for ordinary page retrieval",
			"Use raw mode only when cleaned HTML extraction is losing needed detail",
		],
		parameters: fetchSchema,
		async execute(toolCallId, input: FetchToolInput, signal?: AbortSignal) {
			const url = normalizeFetchUrl(input.url);
			const timeoutSeconds = normalizeTimeoutSeconds(input.timeout);
			const maxChars = normalizeMaxChars(input.maxChars ?? maxFetchChars);
			const timeoutSignal = AbortSignal.timeout(timeoutSeconds * 1000);
			const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
			const response = await ops.fetch(url, {
				redirect: "follow",
				signal: combinedSignal,
				headers: { "user-agent": "daedalus-fetch/1" },
			});
			if (!response.ok) {
				throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
			}
			const contentType = response.headers.get("content-type") || "text/plain";
			if (!isTextLikeContentType(contentType)) {
				throw new Error(`Unsupported content type for fetch: ${contentType}`);
			}
			const body = await response.text();
			const extracted = extractFetchedText(body, contentType, { raw: input.raw, maxChars });
			const fetchArtifactPath =
				extracted.truncated && artifactStore
					? artifactStore.writeArtifact("fetch", toolCallId, body, {
							extension: extensionForContentType(extracted.contentType),
						})
					: undefined;
			const visibleArtifactPath = fetchArtifactPath
				? (artifactStore?.getVisiblePath(fetchArtifactPath, cwd) ?? formatVisibleArtifactPath(fetchArtifactPath))
				: undefined;
			const text = visibleArtifactPath
				? `${extracted.text}\n\n[Full fetch content saved to artifact file: ${visibleArtifactPath}]`
				: extracted.text;
			return {
				content: [{ type: "text", text }],
				details: {
					url: response.url || url,
					contentType: extracted.contentType,
					truncated: extracted.truncated,
					status: response.status,
					truncation: extracted.truncation,
					fetchArtifactPath,
				},
			};
		},
		renderCall: (args, theme, context) => {
			const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
			text.setText(formatFetchCall(args, theme));
			return text;
		},
		renderResult: (result, options, theme, context) => {
			const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
			text.setText(formatFetchResult(result as any, options, theme, context.showImages));
			return text;
		},
	};
}

export function createFetchTool(cwd: string, options?: FetchToolOptions): AgentTool<typeof fetchSchema> {
	return wrapToolDefinition(createFetchToolDefinition(cwd, options));
}

function extensionForContentType(contentType: string): ".html" | ".json" | ".txt" {
	const normalized = contentType.split(";")[0].trim().toLowerCase();
	if (normalized === "text/html" || normalized === "application/xhtml+xml") return ".html";
	if (normalized === "application/json" || normalized === "application/ld+json") return ".json";
	return ".txt";
}

function formatVisibleArtifactPath(artifactPath: string): string {
	return artifactPath.split(/[/\\]/).pop() || artifactPath;
}

export const fetchToolDefinition = createFetchToolDefinition(process.cwd());
export const fetchTool = createFetchTool(process.cwd());
