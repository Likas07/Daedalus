import type { ExtensionAPI } from "@daedalus-pi/coding-agent";
import { Text } from "@daedalus-pi/tui";
import { Type } from "@sinclair/typebox";
import { getSemanticWorkspaceStatus } from "../tools/semantic-workspace.js";
import {
	extractTodoSnapshotFromCustomEntry,
	extractTodoSnapshotFromDetails,
	type TodoSnapshot,
} from "../tools/todo-state.js";

const EmptyParams = Type.Object({});

function latestTodoSnapshot(entries: any[]): TodoSnapshot | undefined {
	let snapshot: TodoSnapshot | undefined;
	for (const entry of entries) {
		if (entry.type === "custom") {
			const next = extractTodoSnapshotFromCustomEntry(entry.customType, entry.data);
			if (next) snapshot = next;
			continue;
		}
		if (entry.type === "message") {
			const message = entry.message;
			if (message.role === "toolResult") {
				const next = extractTodoSnapshotFromDetails(message.toolName, message.details);
				if (next) snapshot = next;
			}
		}
	}
	return snapshot;
}

function buildStatusText(input: {
	cwd: string;
	modelLabel?: string;
	hasPendingMessages?: boolean;
	todoSnapshot?: TodoSnapshot;
}): string {
	const workspace = getSemanticWorkspaceStatus(input.cwd);
	const todoSummary = input.todoSnapshot?.summary;
	const lines = [
		`cwd: ${input.cwd}`,
		`model: ${input.modelLabel ?? "unknown"}`,
		`pending_messages: ${input.hasPendingMessages ? "yes" : "no"}`,
		`semantic_workspace: ${workspace.state}`,
		`semantic_chunk_count: ${workspace.chunkCount}`,
	];
	if (todoSummary) {
		lines.push(`todos_total: ${todoSummary.total}`);
		lines.push(`todos_active: ${todoSummary.active}`);
		lines.push(`todos_in_progress: ${todoSummary.in_progress}`);
	}
	return lines.join("\n");
}

export default function statusDashboard(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "status_overview",
		label: "Status Overview",
		description:
			"Show a compact daily-driver status overview: cwd, model, pending messages, semantic workspace readiness, and todo summary.",
		promptSnippet: "Inspect the current session/workspace status in one compact view",
		parameters: EmptyParams,
		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			const todoSnapshot = latestTodoSnapshot(ctx.sessionManager.getBranch());
			const text = buildStatusText({
				cwd: ctx.cwd,
				modelLabel: ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined,
				hasPendingMessages: ctx.hasPendingMessages(),
				todoSnapshot,
			});
			return {
				content: [{ type: "text", text }],
				details: { todoSnapshot, workspace: getSemanticWorkspaceStatus(ctx.cwd) },
			};
		},
		renderCall(_args, theme) {
			return new Text(theme.fg("toolTitle", theme.bold("status_overview")), 0, 0);
		},
		renderResult(result, _options, theme) {
			const text = result.content.find((block) => block.type === "text")?.text ?? "";
			return new Text(theme.fg("toolOutput", text), 0, 0);
		},
	});

	pi.registerCommand("status", {
		description: "Show a compact workspace/session status dashboard",
		handler: async (_args, ctx) => {
			const todoSnapshot = latestTodoSnapshot(ctx.sessionManager.getBranch());
			const text = buildStatusText({
				cwd: ctx.cwd,
				modelLabel: ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined,
				hasPendingMessages: ctx.hasPendingMessages(),
				todoSnapshot,
			});
			pi.sendMessage(
				{ customType: "status-dashboard", content: text, display: true, details: { todoSnapshot } },
				{ triggerTurn: false },
			);
		},
	});

	pi.registerMessageRenderer("status-dashboard", (message, _options, theme) => {
		const content = typeof message.content === "string" ? message.content : "status unavailable";
		return new Text(theme.fg("accent", content), 0, 0);
	});
}
