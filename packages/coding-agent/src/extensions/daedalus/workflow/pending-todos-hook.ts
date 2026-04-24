import { activeTodos, serializeActiveTodoSignature, type TodoItem } from "../tools/todo-state.js";
import reminderTemplate from "./templates/pending-todos-reminder.md" with { type: "text" };

export interface PendingTodosReminderDecision {
	reminder?: string;
	signature?: string;
	shouldInject: boolean;
}

export function renderPendingTodosReminder(todos: TodoItem[]): string {
	const active = activeTodos(todos);
	if (active.length === 0) {
		return "";
	}
	const lines = active.map((todo) => `- [${todo.status.toUpperCase()}] ${todo.content}`).join("\n");
	return reminderTemplate.trim().replace(/{{#each todos}}[\s\S]*{{\/each}}/, lines);
}

export function decidePendingTodosReminder(
	todos: TodoItem[],
	previousSignature?: string,
): PendingTodosReminderDecision {
	const signature = serializeActiveTodoSignature(todos);
	if (!signature) {
		return { shouldInject: false };
	}
	if (signature === previousSignature) {
		return { signature, shouldInject: false };
	}
	return {
		reminder: renderPendingTodosReminder(todos),
		signature,
		shouldInject: true,
	};
}
