import { expect, test } from "bun:test";
import { openAppServerDatabase, runMigrations } from "..";
import { AppRouter } from "./router";

function makeRouter() {
	const database = openAppServerDatabase(":memory:");
	runMigrations(database);
	const router = new AppRouter({
		database,
		publish: () => {},
		controller: {
			readState: () => ({ sessions: [] }),
			startSession: async () => ({}),
			startTurn: async () => ({}),
			interruptTurn: async () => {},
			disposeSession: async () => {},
		} as never,
	});
	return { router, database };
}

test("projection routes return read-only shell and thread snapshots", async () => {
	const { router, database } = makeRouter();
	database
		.query(
			"INSERT INTO projects (id,name,path,created_at,updated_at) VALUES ('p1','Proj','/repo','2026-01-01','2026-01-02')",
		)
		.run();
	database
		.query(
			"INSERT INTO sessions (id,project_id,status,title,validation_status,created_at,updated_at) VALUES ('s1','p1','active','Thread','valid','2026-01-01','2026-01-03')",
		)
		.run();
	database.query("INSERT INTO workspace_active_selection (project_id, session_id) VALUES ('p1','s1')").run();
	const shell = await router.handle({
		kind: "request",
		id: "r1",
		method: "shell/snapshot",
		params: { projectId: "p1" },
	});
	expect(shell).toMatchObject({
		snapshot: { selectedThreadId: "s1", threads: [{ threadId: "s1", title: "Thread" }] },
	});
	const thread = await router.handle({
		kind: "request",
		id: "r2",
		method: "thread/snapshot",
		params: { threadId: "s1" },
	});
	expect(thread).toMatchObject({ snapshot: { threadId: "s1", sessionId: "s1", title: "Thread" } });
	expect(
		database.query<{ session_id: string }, []>("SELECT session_id FROM workspace_active_selection").get()?.session_id,
	).toBe("s1");
	database.close();
});

test("thread snapshot does not fabricate missing thread state", async () => {
	const { router, database } = makeRouter();
	expect(
		router.handle({ kind: "request", id: "r1", method: "thread/snapshot", params: { threadId: "missing" } }),
	).rejects.toThrow("Unknown thread");
	database.close();
});
