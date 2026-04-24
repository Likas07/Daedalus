import path from "node:path";
import type { OperationFrame, SummaryOperation } from "../operation-frame.js";

function stripPath(value: string, cwd: string): string {
	if (!cwd) return value;
	const normalizedCwd = cwd.endsWith(path.sep) ? cwd.slice(0, -1) : cwd;
	const prefix = `${normalizedCwd}${path.sep}`;
	return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

function stripOperation(op: SummaryOperation, cwd: string): SummaryOperation {
	switch (op.kind) {
		case "file_read":
		case "file_update":
		case "file_remove":
		case "undo":
			return { ...op, path: stripPath(op.path, cwd) };
		case "plan":
			return { ...op, planName: stripPath(op.planName, cwd) };
		default:
			return op;
	}
}

export function stripWorkingDir(frame: OperationFrame, cwd = frame.cwd): OperationFrame {
	return {
		...frame,
		cwd,
		messages: frame.messages.map((message) => ({
			...message,
			contents: message.contents.map((content) =>
				content.type === "toolCall"
					? { ...content, toolCall: { ...content.toolCall, tool: stripOperation(content.toolCall.tool, cwd) } }
					: content,
			),
		})),
	};
}
