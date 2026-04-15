import type { Message, TextContent } from "@daedalus-pi/ai";
import type { IntentEntry, SessionEntry, SessionMessageEntry } from "../../../../core/session-manager.js";

type UserMessageEntry = SessionMessageEntry & { message: Message & { role: "user" } };

export function isIntentEntry(entry: SessionEntry): entry is IntentEntry {
	return entry.type === "intent";
}

export function isUserMessageEntry(entry: SessionEntry): entry is UserMessageEntry {
	return entry.type === "message" && entry.message.role === "user";
}

export function extractMessageText(message: Message): string {
	if (typeof message.content === "string") {
		return message.content;
	}

	return message.content
		.filter((block): block is TextContent => block.type === "text")
		.map((block) => block.text)
		.join("\n")
		.trim();
}

export function findPairedUserEntry(branch: SessionEntry[], intentEntryIndex: number): UserMessageEntry | undefined {
	const intentEntry = branch[intentEntryIndex];
	if (!intentEntry || !isIntentEntry(intentEntry) || !intentEntry.userMessageId) {
		return undefined;
	}

	return branch.find((entry): entry is UserMessageEntry => isUserMessageEntry(entry) && entry.id === intentEntry.userMessageId);
}
