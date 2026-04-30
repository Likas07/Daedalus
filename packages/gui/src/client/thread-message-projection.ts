import type { ThreadActivity, ThreadDetailSnapshot, ThreadMessage, ThreadPendingAction } from "@daedalus-pi/app-server-protocol";

export type ThreadMessageRow =
	| { kind: "message"; id: string; createdAt: string; message: ThreadMessage; streaming: boolean }
	| { kind: "activity"; id: string; createdAt: string; activities: readonly ThreadActivity[]; status: ThreadActivity["status"] }
	| { kind: "working"; id: string; createdAt?: string; title: string }
	| { kind: "pending-action"; id: string; createdAt?: string; action: ThreadPendingAction };

export interface ProjectThreadMessagesInput {
	readonly messages: readonly ThreadMessage[];
	readonly activity?: readonly ThreadActivity[];
	readonly pendingActions?: readonly ThreadPendingAction[];
	readonly status?: ThreadDetailSnapshot["status"];
}

export function projectThreadMessages(input: ProjectThreadMessagesInput): readonly ThreadMessageRow[] {
	const rows: ThreadMessageRow[] = [];
	const messages = coalesceAssistantUpdates(input.messages);
	const latestAssistantId = findLatestAssistantId(messages);

	for (const message of messages) {
		if (message.role === "system" || message.role === "tool") continue;
		rows.push({
			kind: "message",
			id: `message:${message.id}`,
			createdAt: message.createdAt,
			message,
			streaming: message.role === "assistant" && input.status === "running" && message.id === latestAssistantId,
		});
	}

	for (const group of compactActivities(input.activity ?? [])) {
		rows.push({
			kind: "activity",
			id: `activity:${group.map((item) => item.id).join("+")}`,
			createdAt: group[0]?.startedAt ?? "",
			activities: group,
			status: group.some((item) => item.status === "running") ? "running" : group.at(-1)?.status ?? "completed",
		});
	}

	if (input.status === "running" && !rows.some((row) => row.kind === "message" && row.streaming)) {
		const running = (input.activity ?? []).find((item) => item.status === "running");
		rows.push({ kind: "working", id: "working-indicator-row", createdAt: running?.startedAt, title: running?.title ?? "Working" });
	}

	for (const action of input.pendingActions ?? []) {
		rows.push({ kind: "pending-action", id: `pending:${action.id}`, action });
	}

	return rows;
}

function coalesceAssistantUpdates(messages: readonly ThreadMessage[]): ThreadMessage[] {
	const byId = new Map<string, ThreadMessage>();
	const order: string[] = [];
	for (const message of messages) {
		if (!byId.has(message.id)) order.push(message.id);
		byId.set(message.id, message);
	}
	return order.flatMap((id) => {
		const message = byId.get(id);
		return message ? [message] : [];
	});
}

function findLatestAssistantId(messages: readonly ThreadMessage[]): string | undefined {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const message = messages[index];
		if (message?.role === "assistant") return message.id;
	}
	return undefined;
}

function compactActivities(activities: readonly ThreadActivity[]): ThreadActivity[][] {
	const groups: ThreadActivity[][] = [];
	for (const activity of activities) {
		const previous = groups.at(-1);
		if (previous?.[0]?.kind === activity.kind && activity.kind === "tool") previous.push(activity);
		else groups.push([activity]);
	}
	return groups;
}
