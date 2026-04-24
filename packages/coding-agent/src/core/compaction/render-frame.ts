import type { OperationFrame, SummaryMessageEntry, SummaryOperation } from "./operation-frame.js";
import { SUMMARY_FRAME_EPILOG, SUMMARY_FRAME_PRELUDE } from "./render-frame.template.js";

function maxBacktickRun(text: string): number {
	let max = 0;
	let current = 0;
	for (const ch of text) {
		if (ch === "`") {
			current++;
			max = Math.max(max, current);
		} else {
			current = 0;
		}
	}
	return max;
}

function fence(text: string, minLength: number): string {
	return "`".repeat(Math.max(minLength, maxBacktickRun(text) + 1));
}

function fenced(text: string, minLength = 4): string {
	const marker = fence(text, minLength);
	return `${marker}\n${text}\n${marker}`;
}

function inlineCode(text: string): string {
	const safeText = text.replace(/\r/g, "\\r").replace(/\n/g, "\\n");
	const marker = fence(safeText, 1);
	const needsPadding = safeText.startsWith("`") || safeText.endsWith("`");
	return needsPadding ? `${marker} ${safeText} ${marker}` : `${marker}${safeText}${marker}`;
}

function escapeText(text: string): string {
	return text.replace(/```/g, "`\u200b``");
}

function renderTodoWrite(
	changes: Array<{ kind: "added" | "updated" | "removed"; status?: string; content: string }>,
): string {
	const lines = ["**Task Plan:**"];
	for (const change of changes) {
		const content = escapeText(change.content);
		if (change.kind === "added") {
			lines.push(`- [ADD] ${content}`);
		} else if (change.kind === "removed") {
			lines.push(`- [CANCELLED] ~~${content}~~`);
		} else if (change.status === "completed") {
			lines.push(`- [DONE] ~~${content}~~`);
		} else if (change.status === "in_progress") {
			lines.push(`- [IN_PROGRESS] ${content}`);
		} else {
			lines.push(`- [UPDATE] ${content}`);
		}
	}
	return lines.join("\n");
}

function renderOp(op: SummaryOperation): string {
	switch (op.kind) {
		case "file_read":
			return `**Read:** ${inlineCode(op.path)}`;
		case "file_update":
			return `**Update:** ${inlineCode(op.path)}`;
		case "file_remove":
			return `**Delete:** ${inlineCode(op.path)}`;
		case "undo":
			return `**Undo:** ${inlineCode(op.path)}`;
		case "search":
			return `**Search:** ${inlineCode(op.pattern)}`;
		case "sem_search":
			return `**Semantic Search:**\n${op.queries.map((query) => `- ${inlineCode(query.useCase || query.query)}`).join("\n")}`;
		case "shell":
			return `**Execute:** \n${fenced(op.command, 3)}${op.exitCode !== undefined ? `\n(exit ${op.exitCode})` : ""}`;
		case "fetch":
			return `**Fetch:** ${inlineCode(op.url)}`;
		case "followup":
			return `**Follow-up:** ${escapeText(op.question)}`;
		case "plan":
			return `**Plan:** ${inlineCode(op.planName)}`;
		case "skill":
			return `**Skill:** ${inlineCode(op.name)}`;
		case "task":
			return `**Task:** ${inlineCode(op.agentId)}`;
		case "mcp":
			return `**MCP:** ${inlineCode(op.name)}`;
		case "todo_write":
			return renderTodoWrite(op.changes);
		case "todo_read":
			return "**Task Plan Read**";
	}
}

function renderMessage(index: number, message: SummaryMessageEntry): string {
	const parts = [`\n### ${index + 1}. ${message.role}\n`];
	for (const content of message.contents) {
		if (content.type === "text") {
			parts.push(`\n${fenced(content.text, 4)}\n`);
		} else {
			parts.push(`${renderOp(content.toolCall.tool)}\n`);
		}
	}
	return parts.join("");
}

export function renderFrame(frame: OperationFrame): string {
	return (
		SUMMARY_FRAME_PRELUDE +
		frame.messages.map((message, index) => renderMessage(index, message)).join("") +
		SUMMARY_FRAME_EPILOG
	);
}
