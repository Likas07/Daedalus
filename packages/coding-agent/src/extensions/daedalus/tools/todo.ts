import { StringEnum } from "@daedalus-pi/ai";
import type { ExtensionAPI, ExtensionContext, Theme } from "@daedalus-pi/coding-agent";
import { matchesKey, Text, truncateToWidth } from "@daedalus-pi/tui";
import { Type } from "@sinclair/typebox";
import { requireUI } from "../shared/ui.js";
import {
	activeTodos,
	createTodoSnapshot,
	extractTodoSnapshotFromCustomEntry,
	extractTodoSnapshotFromDetails,
	formatActiveTodoReminder,
	formatCurrentTaskList,
	mergeTodoLists,
	replaceTodoList,
	summarizeTodos,
	TODO_STATUSES,
	type TodoChange,
	type TodoItem,
	type TodoSnapshot,
	toggleLegacyTodo,
	toLegacyView,
	validateTodoList,
} from "./todo-state.js";

const TodoItemSchema = Type.Object({
	id: Type.String({ description: "Stable todo item id" }),
	content: Type.String({ description: "Todo task text" }),
	status: StringEnum(TODO_STATUSES),
});

const TodoReadParams = Type.Object({});
const TodoWriteParams = Type.Object({
	todos: Type.Array(TodoItemSchema, { description: "Ordered todo items to write" }),
	merge: Type.Optional(
		Type.Boolean({ description: "When true, merge by id. When false or omitted, replace the whole list" }),
	),
});
const LegacyTodoParams = Type.Object({
	action: StringEnum(["list", "add", "toggle", "clear"] as const),
	text: Type.Optional(Type.String({ description: "Todo text (legacy add action)" })),
	id: Type.Optional(Type.Number({ description: "Legacy numeric todo id (1-based current list position)" })),
});

interface TodoReadDetails extends TodoSnapshot {
	action: "read";
}

interface TodoWriteDetails extends TodoSnapshot {
	action: "write" | "legacy";
	mode: "merge" | "replace";
	changes: TodoChange[];
	migratedFromLegacy?: boolean;
}

function iconForStatus(status: TodoItem["status"], theme: Theme): string {
	switch (status) {
		case "pending":
			return theme.fg("dim", "○");
		case "in_progress":
			return theme.fg("accent", "▶");
		case "completed":
			return theme.fg("success", "✓");
		case "cancelled":
			return theme.fg("warning", "✕");
	}
}

function themedTodoText(todo: TodoItem, theme: Theme): string {
	switch (todo.status) {
		case "completed":
			return theme.fg("muted", todo.content);
		case "cancelled":
			return theme.fg("warning", todo.content);
		case "in_progress":
			return theme.fg("accent", todo.content);
		default:
			return theme.fg("text", todo.content);
	}
}

function summarizeChanges(changes: TodoChange[]): string {
	if (changes.length === 0) return "No todo changes";
	return changes
		.map((change) => {
			switch (change.kind) {
				case "added":
					return `added ${change.id}`;
				case "removed":
					return `removed ${change.id}`;
				case "updated":
					return `updated ${change.id}`;
				default:
					return change.id;
			}
		})
		.join(", ");
}

function renderTodoLines(todos: TodoItem[], theme: Theme, expanded: boolean): string {
	if (todos.length === 0) {
		return theme.fg("dim", "No todos");
	}
	const display = expanded ? todos : todos.slice(0, 8);
	let output = theme.fg("muted", `${todos.length} todo(s):`);
	for (const todo of display) {
		output += `\n${iconForStatus(todo.status, theme)} ${theme.fg("accent", todo.id)} ${themedTodoText(todo, theme)}`;
	}
	if (!expanded && todos.length > display.length) {
		output += `\n${theme.fg("dim", `... ${todos.length - display.length} more`)}`;
	}
	return output;
}

function formatReadText(snapshot: TodoSnapshot): string {
	if (snapshot.todos.length === 0) return "No todos";
	return snapshot.todos.map((todo) => `[${todo.status}] ${todo.id}: ${todo.content}`).join("\n");
}

function snapshotToReadDetails(snapshot: TodoSnapshot): TodoReadDetails {
	return { action: "read", ...snapshot };
}

function snapshotToWriteDetails(
	snapshot: TodoSnapshot,
	mode: "merge" | "replace",
	changes: TodoChange[],
): TodoWriteDetails {
	return { action: "write", mode, changes, ...snapshot };
}

class TodoListComponent {
	private todos: TodoItem[];
	private theme: Theme;
	private onClose: () => void;
	private cachedWidth?: number;
	private cachedLines?: string[];

	constructor(todos: TodoItem[], theme: Theme, onClose: () => void) {
		this.todos = todos;
		this.theme = theme;
		this.onClose = onClose;
	}

	handleInput(data: string): void {
		if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
			this.onClose();
		}
	}

	render(width: number): string[] {
		if (this.cachedLines && this.cachedWidth === width) {
			return this.cachedLines;
		}

		const lines: string[] = [];
		const th = this.theme;
		const summary = summarizeTodos(this.todos);

		lines.push("");
		const title = th.fg("accent", " Todos ");
		const headerLine =
			th.fg("borderMuted", "─".repeat(3)) + title + th.fg("borderMuted", "─".repeat(Math.max(0, width - 10)));
		lines.push(truncateToWidth(headerLine, width));
		lines.push("");

		if (this.todos.length === 0) {
			lines.push(truncateToWidth(`  ${th.fg("dim", "No todos yet. Ask the agent to create some!")}`, width));
		} else {
			lines.push(
				truncateToWidth(
					`  ${th.fg("muted", `${summary.completed}/${summary.total} completed · ${summary.active} active`)}`,
					width,
				),
			);
			lines.push("");
			for (const todo of this.todos) {
				const icon = iconForStatus(todo.status, th);
				const id = th.fg("accent", todo.id);
				const status = th.fg("dim", `[${todo.status}]`);
				lines.push(truncateToWidth(`  ${icon} ${id} ${status} ${themedTodoText(todo, th)}`, width));
			}
		}

		lines.push("");
		lines.push(truncateToWidth(`  ${th.fg("dim", "Press Escape to close")}`, width));
		lines.push("");

		this.cachedWidth = width;
		this.cachedLines = lines;
		return lines;
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}
}

export default function todoExtension(pi: ExtensionAPI) {
	let snapshot = createTodoSnapshot([]);

	const reconstructState = (ctx: ExtensionContext) => {
		snapshot = createTodoSnapshot([]);
		for (const entry of ctx.sessionManager.getBranch()) {
			if (entry.type === "custom") {
				const customSnapshot = extractTodoSnapshotFromCustomEntry(entry.customType, entry.data);
				if (customSnapshot) snapshot = customSnapshot;
				continue;
			}
			if (entry.type !== "message") continue;
			const msg = entry.message;
			if (msg.role !== "toolResult") continue;
			if (!["todo", "todo_read", "todo_write"].includes(msg.toolName)) continue;
			const nextSnapshot = extractTodoSnapshotFromDetails(msg.toolName, msg.details);
			if (nextSnapshot) {
				snapshot = nextSnapshot;
			}
		}
	};

	const writeTodos = (todos: TodoItem[], merge: boolean | undefined) => {
		const normalized = validateTodoList(todos);
		return merge ? mergeTodoLists(snapshot.todos, normalized) : replaceTodoList(snapshot.todos, normalized);
	};

	pi.on("session_start", async (_event, ctx) => reconstructState(ctx));
	pi.on("session_start", async (event, ctx) => {
		reconstructState(ctx);
		if (event.reason !== "resume") {
			return;
		}
		if (activeTodos(snapshot.todos).length === 0) {
			return;
		}
		pi.sendMessage(
			{
				customType: "resume-current-task-list",
				content: formatCurrentTaskList(snapshot.todos),
				display: false,
				details: { todos: snapshot.todos },
				droppable: true,
			},
			{ triggerTurn: false },
		);
	});
	pi.on("session_tree", async (_event, ctx) => reconstructState(ctx));

	pi.registerTool({
		name: "todo_read",
		label: "Todo Read",
		description: "Read the current ordered todo list with execution-state summary.",
		promptSnippet: "Read the current ordered todo list and summary",
		promptGuidelines: ["Use todo_read to inspect current task state before claiming completion."],
		parameters: TodoReadParams,
		async execute() {
			return {
				content: [{ type: "text", text: formatReadText(snapshot) }],
				details: snapshotToReadDetails(snapshot),
			};
		},
		renderCall(_args, theme) {
			return new Text(theme.fg("toolTitle", theme.bold("todo_read")), 0, 0);
		},
		renderResult(result, { expanded }, theme) {
			const details = result.details as TodoReadDetails | undefined;
			if (!details) {
				return new Text(formatReadText(snapshot), 0, 0);
			}
			return new Text(renderTodoLines(details.todos, theme, expanded), 0, 0);
		},
	});

	pi.registerTool({
		name: "todo_write",
		label: "Todo Write",
		description:
			"Write structured todo state. Replaces the full list by default; set merge=true for incremental updates by id.",
		promptSnippet: "Write structured todo state; replace entire list by default, use merge=true for targeted updates",
		promptGuidelines: [
			"Use todo_write with stable ids and statuses: pending, in_progress, completed, cancelled.",
			"Use merge=true for incremental updates; omit it to replace the whole list.",
			"Use todo_write frequently to plan and track multi-step tasks.",
			"Mark todos complete ONLY after actually executing the implementation AND verifying it works.",
			"Do not batch multiple completed tasks; mark as you go.",
		],
		parameters: TodoWriteParams,
		async execute(_toolCallId, params) {
			const result = writeTodos(params.todos, params.merge);
			snapshot = createTodoSnapshot(result.todos, result.migratedFromLegacy ?? false);
			return {
				content: [
					{
						type: "text",
						text:
							result.changes.length === 0
								? `Todo list unchanged (${result.todos.length} item(s))`
								: `Todo list ${result.mode}d: ${summarizeChanges(result.changes)}`,
					},
				],
				details: snapshotToWriteDetails(snapshot, result.mode, result.changes),
			};
		},
		renderCall(args, theme) {
			const mode = args.merge ? "merge" : "replace";
			const count = Array.isArray(args.todos) ? args.todos.length : 0;
			return new Text(
				`${theme.fg("toolTitle", theme.bold("todo_write"))} ${theme.fg("muted", mode)} ${theme.fg("accent", String(count))}`,
				0,
				0,
			);
		},
		renderResult(result, { expanded }, theme) {
			const details = result.details as TodoWriteDetails | undefined;
			if (!details) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "", 0, 0);
			}
			let output = theme.fg("success", `✓ ${details.mode} ${details.todos.length} todo(s)`);
			if (details.changes.length > 0) {
				for (const change of expanded ? details.changes : details.changes.slice(0, 6)) {
					output += `\n${theme.fg("muted", `${change.kind}:`)} ${theme.fg("accent", change.id)}`;
				}
				if (!expanded && details.changes.length > 6) {
					output += `\n${theme.fg("dim", `... ${details.changes.length - 6} more changes`)}`;
				}
			}
			output += `\n${renderTodoLines(details.todos, theme, expanded)}`;
			return new Text(output, 0, 0);
		},
	});

	pi.registerTool({
		name: "todo",
		label: "Todo (legacy)",
		description:
			"Legacy compatibility wrapper for todo_read/todo_write. Prefer the structured todo_read/todo_write tools.",
		parameters: LegacyTodoParams,
		async execute(_toolCallId, params) {
			switch (params.action) {
				case "list": {
					const legacyTodos = toLegacyView(snapshot.todos);
					return {
						content: [
							{
								type: "text",
								text: legacyTodos.length
									? legacyTodos
											.map((todo) => `[${todo.done ? "x" : " "}] #${todo.id}: ${todo.text}`)
											.join("\n")
									: "No todos",
							},
						],
						details: { ...snapshotToWriteDetails(snapshot, "merge", []), action: "legacy" },
					};
				}
				case "add": {
					if (!params.text?.trim()) {
						throw new Error("text required for add");
					}
					const nextId = `legacy-${Date.now()}-${snapshot.todos.length + 1}`;
					const result = mergeTodoLists(snapshot.todos, [
						{ id: nextId, content: params.text.trim(), status: "pending" },
					]);
					snapshot = createTodoSnapshot(result.todos);
					return {
						content: [{ type: "text", text: `Added todo #${snapshot.todos.length}: ${params.text.trim()}` }],
						details: { action: "legacy", ...result },
					};
				}
				case "toggle": {
					if (params.id === undefined) {
						throw new Error("id required for toggle");
					}
					const result = toggleLegacyTodo(snapshot.todos, params.id);
					snapshot = createTodoSnapshot(result.todos);
					const toggled = toLegacyView(snapshot.todos)[params.id - 1];
					return {
						content: [
							{ type: "text", text: `Todo #${params.id} ${toggled?.done ? "completed" : "uncompleted"}` },
						],
						details: { action: "legacy", ...result },
					};
				}
				case "clear": {
					const result = replaceTodoList(snapshot.todos, []);
					snapshot = createTodoSnapshot([]);
					return {
						content: [{ type: "text", text: `Cleared ${result.changes.length} todos` }],
						details: { action: "legacy", ...result },
					};
				}
			}
		},
		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("todo ")) + theme.fg("muted", args.action);
			if (args.text) text += ` ${theme.fg("dim", `"${args.text}"`)}`;
			if (args.id !== undefined) text += ` ${theme.fg("accent", `#${args.id}`)}`;
			return new Text(text, 0, 0);
		},
		renderResult(result, _options, theme) {
			const text = result.content[0];
			return new Text(text?.type === "text" ? theme.fg("muted", text.text) : "", 0, 0);
		},
	});

	pi.registerCommand("todos", {
		description: "Show all todos on the current branch",
		handler: async (_args, ctx) => {
			if (!requireUI(ctx, "/todos")) {
				return;
			}
			await ctx.ui.custom<void>(
				(_tui, theme, _kb, done) => new TodoListComponent(snapshot.todos, theme, () => done()),
			);
		},
	});

	pi.registerMessageRenderer("pending-work-reminder", (message, _options, theme) => {
		const details = message.details as { todos?: TodoItem[] } | undefined;
		const active = details?.todos ? activeTodos(details.todos) : [];
		const content = typeof message.content === "string" ? message.content : formatActiveTodoReminder(active);
		return new Text(theme.fg("warning", content), 0, 0);
	});

	pi.registerMessageRenderer("doom-loop-reminder", (message, _options, theme) => {
		const content =
			typeof message.content === "string" ? message.content : "Detected repeated low-progress behavior.";
		return new Text(theme.fg("error", content), 0, 0);
	});
}
