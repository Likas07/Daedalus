import type { OperationFrame, SummaryOperation } from "../operation-frame.js";

type OpKey =
	| { kind: "file"; path: string }
	| { kind: "shell"; command: string }
	| { kind: "search"; pattern: string }
	| { kind: "sem_search"; queries: string }
	| { kind: "fetch"; url: string }
	| { kind: "followup"; question: string }
	| { kind: "plan"; planName: string }
	| { kind: "skill"; name: string }
	| { kind: "task"; agentId: string }
	| { kind: "mcp"; name: string }
	| { kind: "todo" };

function toKey(op: SummaryOperation): OpKey {
	switch (op.kind) {
		case "file_read":
		case "file_update":
		case "file_remove":
		case "undo":
			return { kind: "file", path: op.path };
		case "shell":
			return { kind: "shell", command: op.command };
		case "search":
			return { kind: "search", pattern: op.pattern };
		case "sem_search":
			return { kind: "sem_search", queries: JSON.stringify(op.queries) };
		case "fetch":
			return { kind: "fetch", url: op.url };
		case "followup":
			return { kind: "followup", question: op.question };
		case "plan":
			return { kind: "plan", planName: op.planName };
		case "skill":
			return { kind: "skill", name: op.name };
		case "task":
			return { kind: "task", agentId: op.agentId };
		case "mcp":
			return { kind: "mcp", name: op.name };
		case "todo_read":
		case "todo_write":
			// Forge code maps both todo variants to Operation::Todo, so consecutive todos collapse.
			return { kind: "todo" };
	}
}

function sameKey(a: OpKey, b: OpKey): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

export function trimContextSummary(frame: OperationFrame): OperationFrame {
	return {
		...frame,
		messages: frame.messages.map((message) => {
			if (message.role !== "assistant") return message;
			const contents: typeof message.contents = [];
			for (const content of message.contents) {
				if (content.type !== "toolCall") {
					contents.push(content);
					continue;
				}
				const last = contents[contents.length - 1];
				if (last?.type === "toolCall" && sameKey(toKey(last.toolCall.tool), toKey(content.toolCall.tool))) {
					contents.pop();
				}
				contents.push(content);
			}
			return { ...message, contents };
		}),
	};
}
