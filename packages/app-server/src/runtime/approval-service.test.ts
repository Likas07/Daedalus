import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openAppServerDatabase, runMigrations } from "..";
import { AccessPolicyService } from "./access-policy-service";
import { ApprovalService } from "./approval-service";

test("v1 approval decisions are idempotent by key", () => {
	const database = openAppServerDatabase(join(mkdtempSync(join(tmpdir(), "daedalus-approval-v1-")), "app.sqlite"));
	runMigrations(database);
	try {
		database
			.query("INSERT INTO sessions (id, status, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
			.run("thread-1", "active", "Thread", new Date().toISOString(), new Date().toISOString());
		const approvals = new ApprovalService(database, new AccessPolicyService(database));
		approvals.request({
			id: "approval-1",
			sessionId: "thread-1",
			request: {
				kind: "command",
				turnId: "turn-1",
				workspaceTargetId: "target-1",
				title: "Run command",
			},
			hardBlock: true,
		});
		const params = {
			approvalId: "approval-1",
			threadId: "thread-1",
			turnId: "turn-1",
			workspaceTargetId: "target-1",
			decision: "approved" as const,
			idempotencyKey: "decision-1",
		};
		const first = approvals.decideV1(params);
		const second = approvals.decideV1(params);
		expect(first).toEqual(second);
		expect(first).toMatchObject({ ok: true, decision: { decision: "approved" } });
		expect(
			approvals.decideV1({
				...params,
				idempotencyKey: "decision-2",
			}),
		).toMatchObject({ ok: false, code: "duplicate" });
	} finally {
		database.close();
	}
});
