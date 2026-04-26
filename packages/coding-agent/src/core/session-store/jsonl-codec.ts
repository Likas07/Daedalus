import type { FileEntry, SessionEntry, SessionHeader } from "../session-manager.js";
import type { SessionStoreSession } from "./types.js";

export class SessionJsonlParseError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "SessionJsonlParseError";
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function parseJsonLine(line: string, lineNumber: number): FileEntry {
	try {
		const value = JSON.parse(line) as unknown;
		if (!isRecord(value) || typeof value.type !== "string") {
			throw new SessionJsonlParseError(`Invalid session JSONL line ${lineNumber}: expected object with type`);
		}
		return value as unknown as FileEntry;
	} catch (error) {
		if (error instanceof SessionJsonlParseError) throw error;
		throw new SessionJsonlParseError(`Malformed session JSONL line ${lineNumber}`);
	}
}

export function parseSessionJsonl(content: string): SessionStoreSession {
	const parsedEntries: FileEntry[] = [];
	const lines = content.split(/\r?\n/);

	for (const [index, line] of lines.entries()) {
		if (!line.trim()) continue;
		parsedEntries.push(parseJsonLine(line, index + 1));
	}

	const [header, ...entries] = parsedEntries;
	if (!header || header.type !== "session") {
		throw new SessionJsonlParseError("Session JSONL is missing a session header");
	}

	for (const [index, entry] of entries.entries()) {
		if (entry.type === "session") {
			throw new SessionJsonlParseError(`Unexpected session header at entry ${index + 2}`);
		}
	}

	return {
		header: header as SessionHeader,
		entries: entries as SessionEntry[],
	};
}

export function serializeSessionJsonl(session: SessionStoreSession): string {
	const entries: FileEntry[] = [session.header, ...session.entries];
	return `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`;
}

export function assertRoundTripStable(content: string): SessionStoreSession {
	const parsed = parseSessionJsonl(content);
	const serialized = serializeSessionJsonl(parsed);
	const reparsed = parseSessionJsonl(serialized);
	const reserialized = serializeSessionJsonl(reparsed);

	if (serialized !== reserialized) {
		throw new Error("Session JSONL round trip is not stable");
	}

	return parsed;
}
