import { expect, test } from "bun:test";
import { openAppServerDatabase, runMigrations } from "..";
import { WorkspaceSelectionService } from "./workspace-selection-service";

function insertProject(database: ReturnType<typeof openAppServerDatabase>, id: string): void {
	database
		.query("INSERT INTO projects (id, name, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
		.run(id, id, `/tmp/${id}`, "2026-04-29T00:00:00.000Z", "2026-04-29T00:00:00.000Z");
}

function insertSession(database: ReturnType<typeof openAppServerDatabase>, id: string, projectId: string): void {
	database
		.query("INSERT INTO sessions (id, project_id, status, created_at, updated_at) VALUES (?, ?, 'active', ?, ?)")
		.run(id, projectId, "2026-04-29T00:00:00.000Z", "2026-04-29T00:00:00.000Z");
}

test("workspace selection persists one active session per project", () => {
	const database = openAppServerDatabase(":memory:");
	runMigrations(database);
	insertProject(database, "project-1");
	insertSession(database, "session-1", "project-1");
	const service = new WorkspaceSelectionService({ database });

	const set = service.set({ projectId: "project-1", sessionId: "session-1" });
	expect(set).toMatchObject({ degraded: false, selection: { projectId: "project-1", sessionId: "session-1" } });
	expect(service.get("project-1")).toMatchObject({
		degraded: false,
		selection: { projectId: "project-1", sessionId: "session-1" },
	});
	database.close();
});

test("workspace selection rejects cross-project sessions", () => {
	const database = openAppServerDatabase(":memory:");
	runMigrations(database);
	insertProject(database, "project-1");
	insertProject(database, "project-2");
	insertSession(database, "session-1", "project-2");
	const service = new WorkspaceSelectionService({ database });

	expect(() => service.set({ projectId: "project-1", sessionId: "session-1" })).toThrow("does not belong to project");
	database.close();
});

test("workspace selection degrades stale pointers to no selection", () => {
	const database = openAppServerDatabase(":memory:");
	runMigrations(database);
	insertProject(database, "project-1");
	database
		.query("INSERT INTO workspace_active_selection (project_id, session_id) VALUES (?, ?)")
		.run("project-1", "missing-session");
	const service = new WorkspaceSelectionService({ database });

	expect(service.get("project-1")).toMatchObject({
		degraded: true,
		reason: "Selected session is stale: missing-session",
	});
	expect(service.get("project-1")).toEqual({ degraded: false });
	database.close();
});
