export const TODO_STATUSES = ["pending", "in_progress", "completed", "cancelled"] as const;

export type TodoStatus = (typeof TODO_STATUSES)[number];

export interface TodoItem {
	id: string;
	content: string;
	status: TodoStatus;
}

export interface TodoSummary {
	total: number;
	active: number;
	pending: number;
	in_progress: number;
	completed: number;
	cancelled: number;
}

export interface TodoSnapshot {
	todos: TodoItem[];
	summary: TodoSummary;
	migratedFromLegacy?: boolean;
}

export interface TodoChange {
	kind: "added" | "updated" | "removed";
	id: string;
	before: TodoItem | null;
	after: TodoItem | null;
}

export interface TodoWriteResult extends TodoSnapshot {
	changes: TodoChange[];
	mode: "merge" | "replace";
}

export interface LegacyTodo {
	id: number;
	text: string;
	done: boolean;
}

interface LegacyTodoLike {
	id?: unknown;
	text?: unknown;
	done?: unknown;
}

interface NewTodoLike {
	id?: unknown;
	content?: unknown;
	status?: unknown;
}

function isTodoStatus(value: unknown): value is TodoStatus {
	return typeof value === "string" && TODO_STATUSES.includes(value as TodoStatus);
}

function normalizeTodoContent(value: string): string {
	return value.trim().replace(/\s+/g, " ");
}

function normalizeTodoId(value: string): string {
	return value.trim();
}

export function validateTodoItem(item: TodoItem): TodoItem {
	const id = normalizeTodoId(item.id);
	const content = normalizeTodoContent(item.content);
	if (!id) {
		throw new Error("Todo item id must be non-empty");
	}
	if (!content) {
		throw new Error(`Todo item ${JSON.stringify(id)} must have non-empty content`);
	}
	if (!isTodoStatus(item.status)) {
		throw new Error(`Todo item ${JSON.stringify(id)} has invalid status: ${String(item.status)}`);
	}
	return { id, content, status: item.status };
}

export function validateTodoList(todos: TodoItem[]): TodoItem[] {
	const normalized = todos.map(validateTodoItem);
	const seen = new Set<string>();
	let inProgressCount = 0;
	for (const todo of normalized) {
		if (seen.has(todo.id)) {
			throw new Error(`Duplicate todo id: ${todo.id}`);
		}
		seen.add(todo.id);
		if (todo.status === "in_progress") {
			inProgressCount += 1;
		}
	}
	if (inProgressCount > 1) {
		throw new Error("Todo list can contain at most one in_progress item");
	}
	return normalized;
}

export function summarizeTodos(todos: TodoItem[]): TodoSummary {
	const summary: TodoSummary = {
		total: todos.length,
		active: 0,
		pending: 0,
		in_progress: 0,
		completed: 0,
		cancelled: 0,
	};
	for (const todo of todos) {
		summary[todo.status] += 1;
		if (todo.status === "pending" || todo.status === "in_progress") {
			summary.active += 1;
		}
	}
	return summary;
}

export function createTodoSnapshot(todos: TodoItem[], migratedFromLegacy = false): TodoSnapshot {
	const normalized = validateTodoList(todos);
	return {
		todos: normalized,
		summary: summarizeTodos(normalized),
		...(migratedFromLegacy ? { migratedFromLegacy: true } : {}),
	};
}

export function mergeTodoLists(existing: TodoItem[], updates: TodoItem[]): TodoWriteResult {
	const current = validateTodoList(existing);
	const incoming = validateTodoList(updates);
	const existingMap = new Map(current.map((todo) => [todo.id, todo]));
	const changes: TodoChange[] = [];
	const next = current.map((todo) => {
		const replacement = incoming.find((candidate) => candidate.id === todo.id);
		if (!replacement) {
			return todo;
		}
		if (
			replacement.content !== todo.content ||
			replacement.status !== todo.status
		) {
			changes.push({ kind: "updated", id: todo.id, before: todo, after: replacement });
		}
		return replacement;
	});
	for (const todo of incoming) {
		if (!existingMap.has(todo.id)) {
			next.push(todo);
			changes.push({ kind: "added", id: todo.id, before: null, after: todo });
		}
	}
	const snapshot = createTodoSnapshot(next);
	return { ...snapshot, changes, mode: "merge" };
}

export function replaceTodoList(existing: TodoItem[], replacement: TodoItem[]): TodoWriteResult {
	const current = validateTodoList(existing);
	const next = validateTodoList(replacement);
	const changes: TodoChange[] = [];
	const currentMap = new Map(current.map((todo) => [todo.id, todo]));
	const nextMap = new Map(next.map((todo) => [todo.id, todo]));

	for (const todo of current) {
		const replacementTodo = nextMap.get(todo.id);
		if (!replacementTodo) {
			changes.push({ kind: "removed", id: todo.id, before: todo, after: null });
			continue;
		}
		if (
			replacementTodo.content !== todo.content ||
			replacementTodo.status !== todo.status
		) {
			changes.push({ kind: "updated", id: todo.id, before: todo, after: replacementTodo });
		}
	}
	for (const todo of next) {
		if (!currentMap.has(todo.id)) {
			changes.push({ kind: "added", id: todo.id, before: null, after: todo });
		}
	}
	const snapshot = createTodoSnapshot(next);
	return { ...snapshot, changes, mode: "replace" };
}

export function isTodoItemLike(value: unknown): value is NewTodoLike {
	return typeof value === "object" && value !== null;
}

export function asTodoItem(value: unknown): TodoItem | undefined {
	if (!isTodoItemLike(value)) return undefined;
	if (typeof value.id !== "string" || typeof value.content !== "string" || !isTodoStatus(value.status)) {
		return undefined;
	}
	return validateTodoItem({ id: value.id, content: value.content, status: value.status });
}

export function migrateLegacyTodos(legacyTodos: LegacyTodo[]): TodoItem[] {
	return legacyTodos.map((todo) => ({
		id: `legacy-${todo.id}`,
		content: normalizeTodoContent(todo.text),
		status: todo.done ? "completed" : "pending",
	}));
}

export function asLegacyTodo(value: unknown): LegacyTodo | undefined {
	const todo = value as LegacyTodoLike;
	if (!todo || typeof todo !== "object") return undefined;
	if (typeof todo.id !== "number" || typeof todo.text !== "string" || typeof todo.done !== "boolean") {
		return undefined;
	}
	return {
		id: todo.id,
		text: todo.text,
		done: todo.done,
	};
}

export function extractTodoSnapshotFromDetails(toolName: string, details: unknown): TodoSnapshot | undefined {
	if (!details || typeof details !== "object") {
		return undefined;
	}
	const maybeTodos = (details as { todos?: unknown }).todos;
	if (!Array.isArray(maybeTodos)) {
		return undefined;
	}

	const newTodos = maybeTodos.map(asTodoItem);
	if (newTodos.every((todo): todo is TodoItem => todo !== undefined)) {
		return createTodoSnapshot(newTodos, Boolean((details as { migratedFromLegacy?: boolean }).migratedFromLegacy));
	}

	if (toolName === "todo") {
		const legacyTodos = maybeTodos.map(asLegacyTodo);
		if (legacyTodos.every((todo): todo is LegacyTodo => todo !== undefined)) {
			return createTodoSnapshot(migrateLegacyTodos(legacyTodos), true);
		}
	}

	return undefined;
}

export function extractTodoSnapshotFromCustomEntry(customType: string, data: unknown): TodoSnapshot | undefined {
	if (!["plan-execution-state", "plan-mode"].includes(customType)) {
		return undefined;
	}
	if (!data || typeof data !== "object") {
		return undefined;
	}
	const maybeTodos = (data as { todos?: unknown; planTodos?: unknown }).todos ?? (data as { planTodos?: unknown }).planTodos;
	if (!Array.isArray(maybeTodos)) {
		return undefined;
	}
	const todos = maybeTodos.map(asTodoItem);
	if (!todos.every((todo): todo is TodoItem => todo !== undefined)) {
		return undefined;
	}
	return createTodoSnapshot(todos);
}

export function activeTodos(todos: TodoItem[]): TodoItem[] {
	return todos.filter((todo) => todo.status === "pending" || todo.status === "in_progress");
}

export function hasActiveTodos(todos: TodoItem[]): boolean {
	return activeTodos(todos).length > 0;
}

export function serializeActiveTodoSignature(todos: TodoItem[]): string {
	return JSON.stringify(
		activeTodos(todos).map((todo) => ({ id: todo.id, content: todo.content, status: todo.status })),
	);
}

export function formatActiveTodoReminder(todos: TodoItem[]): string {
	const active = activeTodos(todos);
	if (active.length === 0) {
		return "";
	}
	const lines = active.map((todo, index) => `${index + 1}. [${todo.status}] ${todo.content} (${todo.id})`);
	return `You still have unfinished todo items. Continue working instead of concluding yet. Remaining active todos:\n${lines.join("\n")}`;
}

export function toLegacyView(todos: TodoItem[]): LegacyTodo[] {
	return todos.map((todo, index) => ({
		id: index + 1,
		text: todo.content,
		done: todo.status === "completed",
	}));
}

export function toggleLegacyTodo(todos: TodoItem[], legacyId: number): TodoWriteResult {
	const current = validateTodoList(todos);
	const index = legacyId - 1;
	const existing = current[index];
	if (!existing) {
		throw new Error(`Todo #${legacyId} not found`);
	}
	const nextStatus: TodoItem["status"] = existing.status === "completed" ? "pending" : "completed";
	const next = current.map((todo, todoIndex) =>
		todoIndex === index ? { ...todo, status: nextStatus } : todo,
	);
	return mergeTodoLists(current, next.filter((_, todoIndex) => todoIndex === index));
}
