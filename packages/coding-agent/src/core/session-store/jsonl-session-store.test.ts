import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { SessionEntry, SessionHeader } from "../session-manager.js";
import { JSONL_SESSION_STORE_ARCHIVE_ERROR, JsonlSessionStore } from "./jsonl-session-store.js";
import type { SessionStoreSession } from "./types.js";

const tempDirs: string[] = [];

function tempSessionDir(): { cwd: string; sessionDir: string } {
	const root = mkdtempSync(join(tmpdir(), "daedalus-jsonl-session-store-"));
	tempDirs.push(root);
	return { cwd: join(root, "workspace"), sessionDir: join(root, "sessions") };
}

function messageEntry(id = "entry-user", parentId: string | null = null): SessionEntry {
	return {
		type: "message",
		id,
		parentId,
		timestamp: "2026-04-26T00:00:01.000Z",
		message: { role: "user", content: "hello", timestamp: 1777161601000 },
	};
}

function assistantEntry(id = "entry-assistant", parentId = "entry-user"): SessionEntry {
	return {
		type: "message",
		id,
		parentId,
		timestamp: "2026-04-26T00:00:02.000Z",
		message: {
			role: "assistant",
			content: [{ type: "text", text: "hi" }],
			api: "anthropic-messages",
			provider: "anthropic",
			model: "claude",
			usage: {
				input: 1,
				output: 1,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 2,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			stopReason: "stop",
			timestamp: 1777161602000,
		},
	};
}

function importedSession(cwd: string): SessionStoreSession {
	const header: SessionHeader = {
		type: "session",
		version: 3,
		id: "imported-session",
		timestamp: "2026-04-26T00:00:00.000Z",
		cwd,
	};
	return { header, entries: [messageEntry(), assistantEntry()] };
}

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

describe("JsonlSessionStore", () => {
	test("creates and opens sessions through SessionManager JSONL files", async () => {
		const { cwd, sessionDir } = tempSessionDir();
		const store = new JsonlSessionStore({ cwd, sessionDir });

		const created = await store.create({ cwd, id: "created-session", timestamp: "2026-04-26T00:00:00.000Z" });
		const opened = await store.open({ id: "created-session" });

		expect(created.header.id).toBe("created-session");
		expect(opened).toEqual(created);
	});

	test("appends and reads entries without rewriting their JSONL semantics", async () => {
		const { cwd, sessionDir } = tempSessionDir();
		const store = new JsonlSessionStore({ cwd, sessionDir });
		await store.create({ cwd, id: "append-session" });
		const entries = [messageEntry(), assistantEntry()];

		await store.append({ sessionId: "append-session", entries });
		const read = await store.read({ sessionId: "append-session" });

		expect(read.entries).toEqual(entries);
	});

	test("renames sessions by appending session_info through SessionManager", async () => {
		const { cwd, sessionDir } = tempSessionDir();
		const store = new JsonlSessionStore({ cwd, sessionDir });
		await store.create({ cwd, id: "rename-session" });

		await store.rename({ sessionId: "rename-session", name: "Renamed" });
		const [summary] = await store.list();

		expect(summary.id).toBe("rename-session");
		expect(summary.name).toBe("Renamed");
	});

	test("exports and imports complete JSONL sessions", async () => {
		const { cwd, sessionDir } = tempSessionDir();
		const store = new JsonlSessionStore({ cwd, sessionDir });
		const session = importedSession(cwd);

		const imported = await store.import({ session });
		const exported = await store.export({ sessionId: session.header.id });

		expect(imported).toEqual(session);
		expect(exported).toEqual(session);
	});

	test("lists and deletes sessions using the JSONL session directory", async () => {
		const { cwd, sessionDir } = tempSessionDir();
		const store = new JsonlSessionStore({ cwd, sessionDir });
		await store.import({ session: importedSession(cwd) });

		expect((await store.list()).map((session) => session.id)).toEqual(["imported-session"]);
		await store.delete({ sessionId: "imported-session" });
		expect(await store.list()).toEqual([]);
	});

	test("rejects archive with a precise unsupported-operation error", async () => {
		const { cwd, sessionDir } = tempSessionDir();
		const store = new JsonlSessionStore({ cwd, sessionDir });

		await expect(store.archive({ sessionId: "missing", archived: true })).rejects.toThrow(
			JSONL_SESSION_STORE_ARCHIVE_ERROR,
		);
		await expect(store.list({ includeArchived: true })).rejects.toThrow(JSONL_SESSION_STORE_ARCHIVE_ERROR);
	});
});
