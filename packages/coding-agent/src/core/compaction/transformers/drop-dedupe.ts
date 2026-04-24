import type { OperationFrame, SummaryMessageEntry } from "../operation-frame.js";

export function dropSystem(frame: OperationFrame): OperationFrame {
	return { ...frame, messages: frame.messages.filter((message) => message.role !== "system") };
}

function contentsKey(message: SummaryMessageEntry): string {
	return JSON.stringify(message.contents);
}

export function dedupeConsecutiveUsers(frame: OperationFrame): OperationFrame {
	const messages: SummaryMessageEntry[] = [];
	for (const message of frame.messages) {
		const last = messages[messages.length - 1];
		if (message.role === "user" && last?.role === "user" && contentsKey(message) === contentsKey(last)) {
			continue;
		}
		messages.push(message);
	}
	return { ...frame, messages };
}
