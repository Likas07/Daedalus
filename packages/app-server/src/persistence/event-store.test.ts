import { afterEach, describe, expect, test } from "bun:test";
import type { SessionController } from "../runtime/session-controller";
import { AppRouter } from "../server/router";
import type { AppServerDatabase } from "./database";
import { openAppServerDatabase } from "./database";
import { appendEvent, readEvents, readEventsAfter } from "./event-store";
import { runMigrations } from "./migrations";

let database: AppServerDatabase | undefined;

afterEach(() => {
	database?.close();
	database = undefined;
});

function migratedInMemoryDatabase(): AppServerDatabase {
	database = openAppServerDatabase(":memory:");
	runMigrations(database);
	return database;
}

describe("SQLite event store", () => {
	test("appends events with monotonic global order and reads by stream", () => {
		const db = migratedInMemoryDatabase();

		const first = appendEvent(db, {
			streamId: "session:one",
			type: "session.created",
			payload: { sessionId: "one" },
		});
		const second = appendEvent(db, {
			streamId: "session:two",
			type: "session.created",
			payload: { sessionId: "two" },
		});
		const third = appendEvent(db, { streamId: "session:one", type: "turn.created", payload: { turnId: "turn-one" } });

		expect([first.seq, second.seq, third.seq]).toEqual([1, 2, 3]);
		expect(readEvents(db).map((event) => event.seq)).toEqual([1, 2, 3]);
		expect(readEvents(db).map((event) => event.streamId)).toEqual(["session:one", "session:two", "session:one"]);
		expect(readEvents(db, { streamId: "session:one" }).map((event) => event.seq)).toEqual([1, 3]);
	});

	test("reads events after a global sequence", () => {
		const db = migratedInMemoryDatabase();

		appendEvent(db, { streamId: "stream:a", type: "a.first", payload: { order: 1 } });
		const cursor = appendEvent(db, { streamId: "stream:b", type: "b.first", payload: { order: 2 } });
		appendEvent(db, { streamId: "stream:a", type: "a.second", payload: { order: 3 } });
		appendEvent(db, { streamId: "stream:b", type: "b.second", payload: { order: 4 } });

		expect(readEventsAfter(db, cursor.seq).map((event) => event.seq)).toEqual([3, 4]);
		expect(readEventsAfter(db, cursor.seq, { streamId: "stream:b" }).map((event) => event.type)).toEqual([
			"b.second",
		]);
	});

	test("phase 4 router requests return shaped projections", async () => {
		const db = migratedInMemoryDatabase();
		const router = new AppRouter({
			database: db,
			controller: { readState: () => ({ sessions: [] }) } as unknown as SessionController,
			publish: () => {},
		});
		router.append({
			id: "e-router",
			type: "tool/file_edit",
			ts: "2026-04-24T00:00:00.000Z",
			sessionId: "s-router",
			payload: { title: "Edit", path: "src/a.ts", summary: "changed" },
		});

		const orchestration = await router.handle({ kind: "request", id: "o", method: "orchestration/read", params: {} });
		const audit = await router.handle({ kind: "request", id: "a", method: "audit/query", params: { text: "edit" } });
		const automation = await router.handle({ kind: "request", id: "r", method: "automation/read", params: {} });

		expect(orchestration).toMatchObject({ mode: "build", lanes: expect.any(Array), checkpoints: expect.any(Array) });
		expect(audit).toMatchObject({ entries: [expect.objectContaining({ target: "src/a.ts" })] });
		expect(automation).toMatchObject({
			rules: expect.arrayContaining([expect.objectContaining({ id: "cleanup-suggestions" })]),
		});
	});
});
