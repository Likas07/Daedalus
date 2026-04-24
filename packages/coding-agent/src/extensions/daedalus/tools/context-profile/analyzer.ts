import type { AgentMessage } from "@daedalus-pi/agent-core";

export interface ContextProfileToolInfo {
	name: string;
	description?: string;
}

export interface ContextProfileInput {
	systemPrompt: string;
	messages: AgentMessage[];
	activeTools: string[];
	allTools: ContextProfileToolInfo[];
	top?: number;
}

export interface SizeStats {
	chars: number;
	bytes: number;
	estimatedTokens: number;
}

export interface MessageProfile extends SizeStats {
	index: number;
	role: string;
	kind: string;
	toolName?: string;
	toolCallId?: string;
	preview: string;
}

export interface ToolAggregate extends SizeStats {
	toolName: string;
	calls: number;
	maxChars: number;
}

export interface ContextProfileWarning {
	kind: "large_message" | "large_tool_result" | "large_system_prompt";
	message: string;
	chars: number;
	role?: string;
	toolName?: string;
	toolCallId?: string;
}

export interface ContextProfileResult {
	total: SizeStats;
	systemPrompt: SizeStats;
	messages: SizeStats & { count: number };
	toolResults: SizeStats & { count: number };
	activeTools: string[];
	inactiveTools: string[];
	topMessages: MessageProfile[];
	topToolResults: MessageProfile[];
	byTool: ToolAggregate[];
	warnings: ContextProfileWarning[];
}

const LARGE_MESSAGE_CHARS = 20_000;
const LARGE_TOOL_RESULT_CHARS = 50_000;
const LARGE_SYSTEM_PROMPT_CHARS = 50_000;

function sizeOf(text: string): SizeStats {
	const chars = text.length;
	return {
		chars,
		bytes: Buffer.byteLength(text, "utf8"),
		estimatedTokens: Math.ceil(chars / 4),
	};
}

function add(a: SizeStats, b: SizeStats): SizeStats {
	return {
		chars: a.chars + b.chars,
		bytes: a.bytes + b.bytes,
		estimatedTokens: a.estimatedTokens + b.estimatedTokens,
	};
}

function textFromContent(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return JSON.stringify(content ?? "");
	return content
		.map((block) => {
			if (block && typeof block === "object" && "type" in block) {
				const typed = block as { type: string; text?: string; mimeType?: string };
				if (typed.type === "text") return typed.text ?? "";
				if (typed.type === "image") return `[image:${typed.mimeType ?? "unknown"}]`;
			}
			return JSON.stringify(block);
		})
		.join("\n");
}

function preview(text: string): string {
	const oneLine = text.replace(/\s+/g, " ").trim();
	return oneLine.length <= 120 ? oneLine : `${oneLine.slice(0, 117)}...`;
}

function emptySize(): SizeStats {
	return { chars: 0, bytes: 0, estimatedTokens: 0 };
}

export function analyzeContextProfile(input: ContextProfileInput): ContextProfileResult {
	const top = Math.max(1, input.top ?? 10);
	const systemPrompt = sizeOf(input.systemPrompt);
	const warnings: ContextProfileWarning[] = [];
	const byTool = new Map<string, ToolAggregate>();

	const messageProfiles: MessageProfile[] = input.messages.map((message, index) => {
		const text = textFromContent((message as { content?: unknown }).content);
		const stats = sizeOf(text);
		const toolName = message.role === "toolResult" ? message.toolName : undefined;
		const toolCallId = message.role === "toolResult" ? message.toolCallId : undefined;

		if (toolName) {
			const current = byTool.get(toolName) ?? { toolName, calls: 0, maxChars: 0, ...emptySize() };
			const next = add(current, stats);
			byTool.set(toolName, {
				...next,
				toolName,
				calls: current.calls + 1,
				maxChars: Math.max(current.maxChars, stats.chars),
			});
		}

		if (toolName && stats.chars >= LARGE_TOOL_RESULT_CHARS) {
			warnings.push({
				kind: "large_tool_result",
				message: `${toolName} returned ${stats.chars} chars`,
				chars: stats.chars,
				role: message.role,
				toolName,
				toolCallId,
			});
		} else if (stats.chars >= LARGE_MESSAGE_CHARS) {
			warnings.push({
				kind: "large_message",
				message: `${message.role} message has ${stats.chars} chars`,
				chars: stats.chars,
				role: message.role,
				toolName,
				toolCallId,
			});
		}

		return {
			...stats,
			index,
			role: message.role,
			kind: toolName ? `tool:${toolName}` : message.role,
			toolName,
			toolCallId,
			preview: preview(text),
		};
	});

	if (systemPrompt.chars >= LARGE_SYSTEM_PROMPT_CHARS) {
		warnings.push({
			kind: "large_system_prompt",
			message: `System prompt has ${systemPrompt.chars} chars`,
			chars: systemPrompt.chars,
		});
	}

	const messageTotals = messageProfiles.reduce<SizeStats>((sum, item) => add(sum, item), emptySize());
	const toolProfiles = messageProfiles.filter((item) => item.role === "toolResult");
	const toolTotals = toolProfiles.reduce<SizeStats>((sum, item) => add(sum, item), emptySize());
	const active = new Set(input.activeTools);

	return {
		total: add(systemPrompt, messageTotals),
		systemPrompt,
		messages: { ...messageTotals, count: messageProfiles.length },
		toolResults: { ...toolTotals, count: toolProfiles.length },
		activeTools: [...input.activeTools],
		inactiveTools: input.allTools
			.map((tool) => tool.name)
			.filter((name) => !active.has(name))
			.sort(),
		topMessages: [...messageProfiles].sort((a, b) => b.chars - a.chars).slice(0, top),
		topToolResults: [...toolProfiles].sort((a, b) => b.chars - a.chars).slice(0, top),
		byTool: [...byTool.values()].sort((a, b) => b.chars - a.chars || a.toolName.localeCompare(b.toolName)),
		warnings,
	};
}
