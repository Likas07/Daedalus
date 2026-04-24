import { normalize, resolve } from "node:path";
import type { AssistantMessage } from "@daedalus-pi/ai";
import type { SessionEntry } from "../session-manager.js";

export const READ_BEFORE_EDIT_ERROR = (action: string): string =>
	`You must read the file with the read tool before attempting to ${action}.`;

export interface ReadLedgerSnapshotEntry {
	path: string;
	hash?: string;
}

export interface ReadLedgerLike {
	markRead(path: string, hash?: string): void;
	hasRead(path: string): boolean;
	getHash(path: string): string | undefined;
}

export class ReadLedger implements ReadLedgerLike {
	private readonly cwd: string;
	private readonly reads = new Map<string, string | undefined>();

	constructor(cwd: string = process.cwd(), entries?: SessionEntry[]) {
		this.cwd = normalize(resolve(cwd));
		if (entries) {
			this.reconstruct(entries);
		}
	}

	markRead(path: string, hash?: string): void {
		this.reads.set(this.normalizePath(path), hash);
	}

	hasRead(path: string): boolean {
		return this.reads.has(this.normalizePath(path));
	}

	getHash(path: string): string | undefined {
		return this.reads.get(this.normalizePath(path));
	}

	entries(): ReadLedgerSnapshotEntry[] {
		return Array.from(this.reads.entries()).map(([path, hash]) => ({ path, ...(hash ? { hash } : {}) }));
	}

	reconstruct(entries: SessionEntry[]): void {
		const readCalls = new Map<string, { path: string; hash?: string }>();
		for (const entry of entries) {
			if (entry.type !== "message") continue;
			const message = entry.message as any;
			if (message?.role === "assistant") {
				for (const block of normalizeContentArray((message as AssistantMessage).content)) {
					if (block?.type !== "toolCall" || block.name !== "read" || typeof block.id !== "string") continue;
					const rawPath = extractPath(block.arguments);
					if (rawPath) readCalls.set(block.id, { path: rawPath });
				}
				continue;
			}
			if (message?.role === "toolResult" && message.toolName === "read" && message.isError !== true) {
				const call = typeof message.toolCallId === "string" ? readCalls.get(message.toolCallId) : undefined;
				const detailsPath = extractPath(message.details) ?? extractPath((message.details as any)?.readLedger);
				const path = detailsPath ?? call?.path;
				const hash = extractHash(message.details) ?? call?.hash;
				if (path) this.markRead(path, hash);
			}
		}
	}

	private normalizePath(path: string): string {
		return normalize(resolve(this.cwd, path));
	}
}

export function requirePriorRead(
	ledger: ReadLedgerLike | undefined,
	absolutePath: string,
	action: string,
): { content: Array<{ type: "text"; text: string }>; isError: true; details: undefined } | undefined {
	if (!ledger || ledger.hasRead(absolutePath)) return undefined;
	return { content: [{ type: "text", text: READ_BEFORE_EDIT_ERROR(action) }], isError: true, details: undefined };
}

function normalizeContentArray(content: unknown): any[] {
	return Array.isArray(content) ? content : [];
}

function extractPath(value: unknown): string | undefined {
	if (!value || typeof value !== "object") return undefined;
	const record = value as Record<string, unknown>;
	const candidate = record.absolutePath ?? record.path ?? record.file_path;
	return typeof candidate === "string" && candidate.length > 0 ? candidate : undefined;
}

function extractHash(value: unknown): string | undefined {
	if (!value || typeof value !== "object") return undefined;
	const record = value as Record<string, unknown>;
	const candidate = record.contentHash ?? record.hash;
	return typeof candidate === "string" && candidate.length > 0 ? candidate : undefined;
}
