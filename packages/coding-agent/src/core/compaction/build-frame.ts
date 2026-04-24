import type { AgentMessage } from "@daedalus-pi/agent-core";
import type { AssistantMessage } from "@daedalus-pi/ai";
import { emptyFrame, type OperationFrame, type SummaryMessageEntry, type SummaryOperation } from "./operation-frame.js";

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string {
	return typeof value === "string" ? value : value == null ? "" : String(value);
}

function normalizeTodoChanges(
	args: Record<string, unknown>,
): Array<{ kind: "added" | "updated" | "removed"; status?: string; content: string }> {
	if (Array.isArray(args.changes)) {
		return args.changes
			.map((change): { kind: "added" | "updated" | "removed"; status?: string; content: string } => {
				const c = asRecord(change);
				const kind: "added" | "updated" | "removed" =
					c.kind === "added" || c.kind === "updated" || c.kind === "removed" ? c.kind : "updated";
				return { kind, status: asString(c.status) || undefined, content: asString(c.content ?? c.text ?? c.title) };
			})
			.filter((change) => change.content);
	}
	if (Array.isArray(args.todos)) {
		return args.todos
			.map((todo) => {
				const t = asRecord(todo);
				return {
					kind: "updated" as const,
					status: asString(t.status) || undefined,
					content: asString(t.content ?? t.text ?? t.title),
				};
			})
			.filter((change) => change.content);
	}
	return [];
}

function mapToolCall(name: string, args: Record<string, unknown>): SummaryOperation | string {
	switch (name) {
		case "read":
			return { kind: "file_read", path: asString(args.path) };
		case "edit":
		case "hashline_edit":
		case "ast_edit":
		case "write":
			return { kind: "file_update", path: asString(args.path) };
		case "remove":
		case "rm":
			return { kind: "file_remove", path: asString(args.path) };
		case "undo":
			return { kind: "undo", path: asString(args.path) };
		case "bash":
			return { kind: "shell", command: asString(args.command) };
		case "fetch":
			return { kind: "fetch", url: asString(args.url) };
		case "grep":
		case "find":
		case "ls":
		case "fs_search":
		case "ast_grep":
			return { kind: "search", pattern: asString(args.pattern ?? args.query ?? args.path) };
		case "sem_search": {
			const rawQueries = Array.isArray(args.queries) ? args.queries : args.query ? [args] : [];
			return {
				kind: "sem_search",
				queries: rawQueries.map((raw) => {
					const q = asRecord(raw);
					return { query: asString(q.query), useCase: asString(q.use_case ?? q.useCase) };
				}),
			};
		}
		case "question":
		case "questionnaire":
		case "followup":
			return { kind: "followup", question: asString(args.question ?? args.prompt) };
		case "execute_plan":
		case "plan":
			return { kind: "plan", planName: asString(args.planName ?? args.path ?? args.name) };
		case "skill":
			return { kind: "skill", name: asString(args.name) };
		case "subagent":
		case "task":
			return { kind: "task", agentId: asString(args.agentId ?? args.agent_id ?? args.agent ?? args.name) };
		case "todo_read":
			return { kind: "todo_read" };
		case "todo_write":
			return { kind: "todo_write", changes: normalizeTodoChanges(args) };
		default:
			if (name.startsWith("mcp_")) return { kind: "mcp", name };
			return `[unmapped tool: ${name}]`;
	}
}

function textFromContent(content: unknown): string {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.map((block) => asRecord(block))
			.filter((block) => block.type === "text")
			.map((block) => asString(block.text))
			.join("");
	}
	return "";
}

function numberFromUnknown(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return Number(value.trim());
	return undefined;
}

function extractExitCodeFromText(text: string): number | undefined {
	const match =
		text.match(/(?:command\s+)?exited\s+with\s+(?:code|status)\s+(-?\d+)/i) ??
		text.match(/exit\s+(?:code|status)[:=]?\s*(-?\d+)/i);
	return match ? numberFromUnknown(match[1]) : undefined;
}

function extractExitCodeFromToolResult(msg: AgentMessage): number | undefined {
	const record = asRecord(msg);
	const details = asRecord(record.details);
	return (
		numberFromUnknown(details.exitCode) ??
		numberFromUnknown(details.exit_code) ??
		numberFromUnknown(details.code) ??
		numberFromUnknown(record.exitCode) ??
		extractExitCodeFromText(textFromContent(record.content) || asString(record.output))
	);
}

export function buildFrameFromMessages(messages: AgentMessage[], cwd: string): OperationFrame {
	const frame = emptyFrame(cwd);
	const exitCodeByToolCallId = new Map<string, number>();
	for (const msg of messages) {
		if (msg.role !== "toolResult") continue;
		const record = asRecord(msg);
		const toolCallId = asString(record.toolCallId);
		if (!toolCallId) continue;
		const exitCode = extractExitCodeFromToolResult(msg);
		if (exitCode !== undefined) exitCodeByToolCallId.set(toolCallId, exitCode);
	}
	for (const msg of messages) {
		if (msg.role === "user") {
			const text = textFromContent((msg as { content?: unknown }).content);
			if (text) frame.messages.push({ role: "user", contents: [{ type: "text", text }] });
			continue;
		}
		if (msg.role !== "assistant") continue;
		const assistant = msg as AssistantMessage;
		const entry: SummaryMessageEntry = { role: "assistant", contents: [] };
		for (const block of assistant.content ?? []) {
			if (block.type === "text" && block.text) {
				entry.contents.push({ type: "text", text: block.text });
			} else if (block.type === "toolCall") {
				const mapped = mapToolCall(block.name, asRecord(block.arguments));
				if (typeof mapped === "string") {
					entry.contents.push({ type: "text", text: mapped });
				} else {
					if (mapped.kind === "shell") {
						const exitCode = exitCodeByToolCallId.get(block.id);
						if (exitCode !== undefined) mapped.exitCode = exitCode;
					}
					entry.contents.push({ type: "toolCall", toolCall: { toolCallId: block.id, tool: mapped } });
				}
			}
		}
		if (entry.contents.length > 0) frame.messages.push(entry);
	}
	return frame;
}
