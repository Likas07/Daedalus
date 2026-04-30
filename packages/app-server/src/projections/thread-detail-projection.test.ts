import { expect, test } from "bun:test";
import { buildThreadDetailSnapshot, openAppServerDatabase, runMigrations } from "..";

test("thread detail projects messages, approvals, target metadata, and labels", () => {
	const database = openAppServerDatabase(":memory:");
	runMigrations(database);
	database
		.query(
			"INSERT INTO projects (id,name,path,created_at,updated_at) VALUES ('p1','Proj','/repo','2026-01-01','2026-01-02')",
		)
		.run();
	database
		.query(
			"INSERT INTO worktrees (id,project_id,path,branch,base_branch,status,created_at,updated_at) VALUES ('w1','p1','/repo-w','feat','main','active','2026-01-01','2026-01-02')",
		)
		.run();
	database
		.query(
			"INSERT INTO sessions (id,project_id,worktree_id,status,title,validation_status,created_at,updated_at) VALUES ('s1','p1','w1','waiting_for_approval','Thread title','valid','2026-01-01','2026-01-03')",
		)
		.run();
	database
		.query(
			"INSERT INTO turns (id,session_id,role,content,created_at) VALUES ('t1','s1','user','Hello','2026-01-02'),('t2','s1','assistant','Hi','2026-01-03')",
		)
		.run();
	database
		.query(
			"INSERT INTO approvals (id,session_id,status,request,created_at,updated_at) VALUES ('a1','s1','pending',?, '2026-01-03','2026-01-03')",
		)
		.run(JSON.stringify({ summary: "Run command" }));
	const snapshot = buildThreadDetailSnapshot({ database, threadId: "s1" });
	expect(snapshot).toMatchObject({
		threadId: "s1",
		sessionId: "s1",
		projectId: "p1",
		worktreeId: "w1",
		title: "Thread title",
		status: "waiting",
	});
	expect(snapshot.messages.map((m) => [m.role, m.content])).toEqual([
		["user", "Hello"],
		["assistant", "Hi"],
	]);
	expect(snapshot.pendingActions[0]).toMatchObject({ kind: "approval", title: "Run command", approvalId: "a1" });
	expect(snapshot.activity[0]).toMatchObject({ kind: "approval", status: "running", title: "Run command" });
	expect(snapshot.diffIds).toEqual(["w1"]);
	database.close();
});

test("thread detail reports degraded target state", () => {
	const database = openAppServerDatabase(":memory:");
	runMigrations(database);
	database
		.query(
			"INSERT INTO projects (id,name,path,created_at,updated_at) VALUES ('p1','Proj','/repo','2026-01-01','2026-01-02')",
		)
		.run();
	database
		.query(
			"INSERT INTO sessions (id,project_id,status,validation_status,needs_attention_reason,created_at,updated_at) VALUES ('s1','p1','needs-attention','stale','target missing','2026-01-01','2026-01-03')",
		)
		.run();
	const snapshot = buildThreadDetailSnapshot({ database, threadId: "s1" });
	expect(snapshot.status).toBe("failed");
	expect(snapshot.safetySignals.map((s) => s.code)).toEqual(["needs-attention", "target-validation"]);
	database.close();
});
