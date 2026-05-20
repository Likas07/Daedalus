import type { AgentMessage } from "@daedalus-pi/agent-core";
import type { AssistantMessage, ImageContent, TextContent, ToolResultMessage, UserMessage } from "@daedalus-pi/ai";
import type { BranchSummaryEntry, CompactionEntry, CustomMessageEntry, SessionEntry } from "./session-manager.js";

type Format = "markdown" | "plain";

export interface TranscriptExportOptions {
	format?: Format;
}

export interface AssistantResponseSlice {
	entryId?: string;
	responseId?: string;
	text: string;
	message: AssistantMessage;
}

function heading(format: Format, label: string): string {
	return format === "markdown" ? `## ${label}` : `${label}:`;
}

function fenced(format: Format, value: string, lang = ""): string {
	if (format === "markdown") return `\`\`\`${lang}\n${value}\n\`\`\``;
	return value;
}

function renderTextLikeContent(content: string | (TextContent | ImageContent)[]): string {
	if (typeof content === "string") return content;
	return content
		.map((part) => {
			if (part.type === "text") return part.text;
			return `[image: ${part.mimeType}]`;
		})
		.join("\n");
}

function stringifyArguments(args: Record<string, unknown>): string {
	try {
		return JSON.stringify(args, null, 2);
	} catch {
		return String(args);
	}
}

function renderUserMessage(message: UserMessage, format: Format): string {
	return `${heading(format, "User")}\n\n${renderTextLikeContent(message.content)}`;
}

function renderAssistantMessage(message: AssistantMessage, format: Format): string {
	const parts: string[] = [heading(format, "Assistant")];
	for (const content of message.content) {
		if (content.type === "text") {
			parts.push(content.text);
		} else if (content.type === "thinking") {
			parts.push(
				format === "markdown"
					? `> Thinking\n>\n${content.thinking
							.split("\n")
							.map((line) => `> ${line}`)
							.join("\n")}`
					: `Thinking:\n${content.thinking}`,
			);
		} else if (content.type === "toolCall") {
			parts.push(
				`${format === "markdown" ? "**Tool call**" : "Tool call"}: ${content.name} (${content.id})\n\n${fenced(format, stringifyArguments(content.arguments), "json")}`,
			);
		}
	}
	if (message.errorMessage) parts.push(`Error: ${message.errorMessage}`);
	return parts.join("\n\n");
}

function renderToolResult(message: ToolResultMessage, format: Format): string {
	const body = renderTextLikeContent(message.content);
	const label = `Tool result: ${message.toolName} (${message.toolCallId})${message.isError ? " [error]" : ""}`;
	return `${heading(format, label)}\n\n${body}`;
}

export function renderAgentMessage(message: AgentMessage, options: TranscriptExportOptions = {}): string {
	const format = options.format ?? "markdown";
	switch (message.role) {
		case "user":
			return renderUserMessage(message, format);
		case "assistant":
			return renderAssistantMessage(message, format);
		case "toolResult":
			return renderToolResult(message, format);
		case "bashExecution": {
			const status = message.cancelled
				? "cancelled"
				: message.exitCode === undefined
					? "unknown"
					: `exit ${message.exitCode}`;
			return `${heading(format, `Bash: ${message.command}`)}\n\nStatus: ${status}\n\n${message.output || "(no output)"}`;
		}
		case "custom":
			return `${heading(format, `Custom: ${message.customType}`)}\n\n${renderTextLikeContent(message.content)}`;
		case "branchSummary":
			return `${heading(format, "Branch summary")}\n\n${message.summary}`;
		case "compactionSummary":
			return `${heading(format, "Compaction summary")}\n\n${message.summary}`;
		default:
			return `${heading(format, "Message")}\n\n${JSON.stringify(message, null, 2)}`;
	}
}

export function renderSessionEntry(entry: SessionEntry, options: TranscriptExportOptions = {}): string | undefined {
	const format = options.format ?? "markdown";
	switch (entry.type) {
		case "message":
			return renderAgentMessage(entry.message, options);
		case "custom_message":
			return renderCustomMessageEntry(entry, format);
		case "branch_summary":
			return renderBranchSummaryEntry(entry, format);
		case "compaction":
			return renderCompactionEntry(entry, format);
		default:
			return undefined;
	}
}

function renderCustomMessageEntry(entry: CustomMessageEntry, format: Format): string {
	return `${heading(format, `Custom message: ${entry.customType}`)}\n\n${renderTextLikeContent(entry.content)}`;
}

function renderBranchSummaryEntry(entry: BranchSummaryEntry, format: Format): string {
	return `${heading(format, "Branch summary")}\n\n${entry.summary}`;
}

function renderCompactionEntry(entry: CompactionEntry, format: Format): string {
	return `${heading(format, "Compaction summary")}\n\n${entry.summary}`;
}

export function renderTranscript(entries: readonly SessionEntry[], options: TranscriptExportOptions = {}): string {
	return entries
		.map((entry) => renderSessionEntry(entry, options))
		.filter((part): part is string => Boolean(part))
		.join("\n\n---\n\n");
}

export function renderTranscriptMarkdown(entries: readonly SessionEntry[]): string {
	return renderTranscript(entries, { format: "markdown" });
}

export function renderTranscriptPlain(entries: readonly SessionEntry[]): string {
	return renderTranscript(entries, { format: "plain" });
}

export function getAssistantResponseText(message: AssistantMessage): string {
	return message.content
		.filter((part): part is TextContent => part.type === "text")
		.map((part) => part.text)
		.join("")
		.trim();
}

export function getAssistantResponseSlices(entries: readonly SessionEntry[]): AssistantResponseSlice[] {
	return entries.flatMap((entry) => {
		if (entry.type !== "message" || entry.message.role !== "assistant") return [];
		const message = entry.message as AssistantMessage;
		const text = getAssistantResponseText(message);
		if (!text) return [];
		return [{ entryId: entry.id, responseId: message.responseId, text, message }];
	});
}

export function getLastAssistantResponse(entries: readonly SessionEntry[]): AssistantResponseSlice | undefined {
	return getAssistantResponseSlices(entries).at(-1);
}

export function getAssistantResponseByEntryId(
	entries: readonly SessionEntry[],
	entryId: string,
): AssistantResponseSlice | undefined {
	return getAssistantResponseSlices(entries).find((slice) => slice.entryId === entryId);
}

export function getAssistantResponseByResponseId(
	entries: readonly SessionEntry[],
	responseId: string,
): AssistantResponseSlice | undefined {
	return getAssistantResponseSlices(entries).find((slice) => slice.responseId === responseId);
}
