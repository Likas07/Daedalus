import { expect, test } from "bun:test";
import { buildShellSnapshot, openAppServerDatabase, runMigrations } from "..";

function db() { const database = openAppServerDatabase(":memory:"); runMigrations(database); return database; }
function seed(database: ReturnType<typeof db>) {
	database.query("INSERT INTO projects (id,name,path,created_at,updated_at) VALUES ('p1','Proj','/repo','2026-01-01','2026-01-02')").run();
	database.query("INSERT INTO worktrees (id,project_id,path,branch,base_branch,status,created_at,updated_at) VALUES ('w1','p1','/repo-w','feat','main','active','2026-01-01','2026-01-02')").run();
}

test("shell snapshot preserves runsIn target and pending approval counts", () => {
	const database = db(); seed(database);
	database.query("INSERT INTO sessions (id,project_id,worktree_id,status,title,runs_in_json,validation_status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)").run("s1","p1","w1","active","Build UI",JSON.stringify({ projectId:"p1", worktreeId:"w1", branch:"feat", isolationMode:"isolated-worktree", validationStatus:"valid" }),"valid","2026-01-01","2026-01-03");
	database.query("INSERT INTO approvals (id,session_id,status,request,created_at,updated_at) VALUES ('a1','s1','pending',?, '2026-01-03','2026-01-03')").run(JSON.stringify({ summary:"Approve tool" }));
	const snapshot = buildShellSnapshot({ database, projectId: "p1" });
	expect(snapshot.threads[0]).toMatchObject({ threadId: "s1", projectId: "p1", worktreeId: "w1", pendingActionCount: 1, status: "waiting" });
	expect(snapshot.threads[0].safetySignals.map((s) => s.code)).toContain("pending-approval");
	database.close();
});

test("shell snapshot reports empty state and selected thread without mutating stale selection", () => {
	const database = db(); seed(database);
	database.query("INSERT INTO workspace_active_selection (project_id, session_id) VALUES ('p1','missing')").run();
	const snapshot = buildShellSnapshot({ database, projectId: "p1" });
	expect(snapshot.threads).toEqual([]);
	expect(snapshot.selectedThreadId).toBe("missing");
	expect(database.query<{ session_id: string }, []>("SELECT session_id FROM workspace_active_selection").get()?.session_id).toBe("missing");
	database.close();
});

test("shell snapshot labels base checkout and needs-attention reasons", () => {
	const database = db(); seed(database);
	database.query("INSERT INTO sessions (id,project_id,status,title,runs_in_json,validation_status,needs_attention_reason,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)").run("s2","p1","needs-attention",null,JSON.stringify({ projectId:"p1", branch:"main", isolationMode:"base-checkout", validationStatus:"needs-attention" }),"needs-attention","identity mismatch","2026-01-01","2026-01-04");
	const thread = buildShellSnapshot({ database }).threads[0];
	expect(thread.title).toBe("Base: main");
	expect(thread.safetySignals.map((s) => s.message)).toContain("identity mismatch");
	expect(thread.safetySignals.map((s) => s.code)).toContain("base-checkout");
	database.close();
});
