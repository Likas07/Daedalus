import { afterEach, describe, expect, test } from "bun:test";
import type { AppEvent } from "@daedalus-pi/app-server-protocol";
import type { AppServerDatabase } from "./database";
import { openAppServerDatabase } from "./database";
import { runMigrations } from "./migrations";
import { RuntimeEventLog } from "./runtime-event-log";

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

describe("RuntimeEventLog", () => {
	test("append owns projection after app-server writes", () => {
		const db = migratedInMemoryDatabase();
		const log = new RuntimeEventLog({ database: db });

		log.append({
			streamId: "project:project-1",
			type: "project/registered",
			payload: { projectId: "project-1", name: "Daedalus", path: "/repo" },
		});

		const project = db.query<{ id: string; name: string }, []>("SELECT id, name FROM projects").get();
		expect(project).toEqual({ id: "project-1", name: "Daedalus" });
	});

	test("appendAndPublishAppEvent publishes app, v1, shell, and thread notifications once", () => {
		const db = migratedInMemoryDatabase();
		const messages: unknown[] = [];
		const log = new RuntimeEventLog({ database: db, publish: (message) => messages.push(message) });
		log.append({
			streamId: "project:project-1",
			type: "project/registered",
			payload: { projectId: "project-1", name: "Daedalus", path: "/repo" },
		});
		log.append({
			streamId: "thread-1",
			type: "session/started",
			payload: { sessionId: "thread-1", projectId: "project-1", title: "Thread" },
		});
		const event = {
			id: "event-1",
			type: "turn/started",
			ts: "2026-05-25T00:00:00.000Z",
			sessionId: "thread-1",
			payload: { sessionId: "thread-1", turnId: "turn-1", prompt: "Hello" },
		} as unknown as AppEvent;

		log.appendAndPublishAppEvent(event);

		expect(messages.map((message) => (message as { method?: string }).method)).toEqual([
			"event/appended",
			"thread.timeline",
			"shell/event",
			"thread/event",
		]);
	});
});
