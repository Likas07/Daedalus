import type { ContextProfileResult, MessageProfile, ToolAggregate } from "./analyzer.js";

export interface ContextProfileFormatOptions {
	format?: "text" | "json";
}

function pct(part: number, total: number): string {
	if (total <= 0) return "0.0%";
	return `${((part / total) * 100).toFixed(1)}%`;
}

function size(chars: number, bytes: number, tokens: number): string {
	return `${chars.toLocaleString()} chars, ${bytes.toLocaleString()} bytes, ~${tokens.toLocaleString()} tokens`;
}

function formatMessage(item: MessageProfile, totalChars: number): string {
	const label = item.toolName ? `${item.role}:${item.toolName}` : item.role;
	const call = item.toolCallId ? ` ${item.toolCallId}` : "";
	return `- #${item.index} ${label}${call}: ${size(item.chars, item.bytes, item.estimatedTokens)} (${pct(item.chars, totalChars)}) — ${item.preview}`;
}

function formatTool(item: ToolAggregate, totalChars: number): string {
	return `- ${item.toolName}: ${size(item.chars, item.bytes, item.estimatedTokens)} (${pct(item.chars, totalChars)}), calls=${item.calls}, max=${item.maxChars.toLocaleString()} chars`;
}

export function formatContextProfile(profile: ContextProfileResult, options: ContextProfileFormatOptions = {}): string {
	if (options.format === "json") {
		return JSON.stringify(profile, null, 2);
	}

	const lines: string[] = [];
	lines.push("Context profile");
	lines.push("");
	lines.push(`Total: ${size(profile.total.chars, profile.total.bytes, profile.total.estimatedTokens)}`);
	lines.push(
		`System prompt: ${size(profile.systemPrompt.chars, profile.systemPrompt.bytes, profile.systemPrompt.estimatedTokens)} (${pct(profile.systemPrompt.chars, profile.total.chars)})`,
	);
	lines.push(
		`Messages: ${profile.messages.count} messages, ${size(profile.messages.chars, profile.messages.bytes, profile.messages.estimatedTokens)} (${pct(profile.messages.chars, profile.total.chars)})`,
	);
	lines.push(
		`Tool results: ${profile.toolResults.count} results, ${size(profile.toolResults.chars, profile.toolResults.bytes, profile.toolResults.estimatedTokens)} (${pct(profile.toolResults.chars, profile.total.chars)})`,
	);
	lines.push(`Active tools: ${profile.activeTools.length ? profile.activeTools.join(", ") : "(none)"}`);
	lines.push(`Inactive tools: ${profile.inactiveTools.length ? profile.inactiveTools.join(", ") : "(none)"}`);
	lines.push("");
	lines.push("By tool:");
	lines.push(
		...(profile.byTool.length ? profile.byTool.map((item) => formatTool(item, profile.total.chars)) : ["- (none)"]),
	);
	lines.push("");
	lines.push("Repeated reads:");
	lines.push(
		...(profile.reads.byFile.length
			? profile.reads.byFile
					.slice(0, 10)
					.map(
						(item) =>
							`- ${item.path}: calls=${item.calls}, repeated=${item.repeatedCalls}, overlaps=${item.overlaps.length}, ${size(item.chars, item.bytes, item.estimatedTokens)}`,
					)
			: ["- (none)"]),
	);
	lines.push("");
	lines.push("Top tool results:");
	lines.push(
		...(profile.topToolResults.length
			? profile.topToolResults.map((item) => formatMessage(item, profile.total.chars))
			: ["- (none)"]),
	);
	lines.push("");
	lines.push("Top messages:");
	lines.push(
		...(profile.topMessages.length
			? profile.topMessages.map((item) => formatMessage(item, profile.total.chars))
			: ["- (none)"]),
	);
	lines.push("");
	lines.push("Warnings:");
	lines.push(
		...(profile.warnings.length
			? profile.warnings.map((warning) => `- ${warning.kind}: ${warning.message}`)
			: ["- (none)"]),
	);
	return lines.join("\n");
}
