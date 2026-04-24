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
	kind: "large_message" | "large_tool_result" | "large_system_prompt" | "repeated_read";
	message: string;
	chars: number;
	role?: string;
	toolName?: string;
	toolCallId?: string;
}

export interface ReadRangeProfile {
	toolCallId?: string;
	path: string;
	offset?: number;
	limit?: number;
	startLine?: number;
	endLine?: number;
	chars: number;
}

export interface ReadOverlapProfile {
	firstToolCallId?: string;
	secondToolCallId?: string;
	startLine: number;
	endLine: number;
}

export interface ReadFileProfile extends SizeStats {
	path: string;
	calls: number;
	repeatedCalls: number;
	ranges: ReadRangeProfile[];
	overlaps: ReadOverlapProfile[];
}

export interface ReadProfileSummary {
	byFile: ReadFileProfile[];
	repeatedFiles: number;
	overlapCount: number;
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
	reads: ReadProfileSummary;
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

function extractToolCalls(message: AgentMessage): Map<string, { name: string; arguments?: any }> {
	const calls = new Map<string, { name: string; arguments?: any }>();
	if (message.role !== "assistant" || !Array.isArray((message as any).content)) return calls;
	for (const block of (message as any).content) {
		if (block?.type === "toolCall" && typeof block.id === "string" && typeof block.name === "string") {
			calls.set(block.id, { name: block.name, arguments: block.arguments });
		}
	}
	return calls;
}

function readRange(args: any): { offset?: number; limit?: number; startLine?: number; endLine?: number } {
	const offset = typeof args?.offset === "number" ? Math.max(1, Math.floor(args.offset)) : undefined;
	const limit = typeof args?.limit === "number" ? Math.max(1, Math.floor(args.limit)) : undefined;
	return {
		...(offset ? { offset, startLine: offset } : {}),
		...(limit ? { limit } : {}),
		...(offset && limit ? { endLine: offset + limit - 1 } : {}),
	};
}

function overlap(a: ReadRangeProfile, b: ReadRangeProfile): ReadOverlapProfile | undefined {
	if (a.startLine == null || a.endLine == null || b.startLine == null || b.endLine == null) return undefined;
	const startLine = Math.max(a.startLine, b.startLine);
	const endLine = Math.min(a.endLine, b.endLine);
	if (startLine > endLine) return undefined;
	return { firstToolCallId: a.toolCallId, secondToolCallId: b.toolCallId, startLine, endLine };
}

export function analyzeContextProfile(input: ContextProfileInput): ContextProfileResult {
	const top = Math.max(1, input.top ?? 10);
	const systemPrompt = sizeOf(input.systemPrompt);
	const warnings: ContextProfileWarning[] = [];
	const byTool = new Map<string, ToolAggregate>();
	const toolCalls = new Map<string, { name: string; arguments?: any }>();
	for (const message of input.messages) {
		for (const [id, call] of extractToolCalls(message)) toolCalls.set(id, call);
	}
	const readRanges: ReadRangeProfile[] = [];

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

		if (message.role === "toolResult" && toolName === "read") {
			const call = toolCallId ? toolCalls.get(toolCallId) : undefined;
			const details = (message as any).details as any;
			const path = typeof details?.absolutePath === "string" ? details.absolutePath : call?.arguments?.path;
			if (typeof path === "string") {
				readRanges.push({ toolCallId, path, chars: stats.chars, ...readRange(call?.arguments) });
			}
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
	const readsByPath = new Map<string, ReadRangeProfile[]>();
	for (const read of readRanges) {
		const list = readsByPath.get(read.path) ?? [];
		list.push(read);
		readsByPath.set(read.path, list);
	}
	const readFiles = [...readsByPath.entries()]
		.map(([path, ranges]) => {
			const overlaps: ReadOverlapProfile[] = [];
			for (let i = 0; i < ranges.length; i++) {
				for (let j = i + 1; j < ranges.length; j++) {
					const item = overlap(ranges[i], ranges[j]);
					if (item) overlaps.push(item);
				}
			}
			const total = ranges.reduce<SizeStats>(
				(sum, item) => add(sum, { chars: item.chars, bytes: item.chars, estimatedTokens: Math.ceil(item.chars / 4) }),
				emptySize(),
			);
			return { path, calls: ranges.length, repeatedCalls: Math.max(0, ranges.length - 1), ranges, overlaps, ...total };
		})
		.sort((a, b) => b.calls - a.calls || b.chars - a.chars || a.path.localeCompare(b.path));
	for (const item of readFiles.filter((file) => file.repeatedCalls > 0).slice(0, 5)) {
		warnings.push({
			kind: "repeated_read",
			message: `${item.path} read ${item.calls} times`,
			chars: item.chars,
			role: "toolResult",
			toolName: "read",
		});
	}
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
		reads: {
			byFile: readFiles,
			repeatedFiles: readFiles.filter((file) => file.repeatedCalls > 0).length,
			overlapCount: readFiles.reduce((sum, file) => sum + file.overlaps.length, 0),
		},
		warnings,
	};
}
