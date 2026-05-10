import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openAppServerDatabase, runMigrations } from "..";
import { AccessPolicyService } from "./access-policy-service";
import { ApprovalService } from "./approval-service";

function makeApprovalService() {
	const database = openAppServerDatabase(join(mkdtempSync(join(tmpdir(), "daedalus-approval-v1-")), "app.sqlite"));
	runMigrations(database);
	database
		.query("INSERT INTO sessions (id, status, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
		.run("thread-1", "active", "Thread", new Date().toISOString(), new Date().toISOString());
	const approvals = new ApprovalService(database, new AccessPolicyService(database));
	return { database, approvals };
}

function requestApproval(approvals: ApprovalService, overrides: Record<string, unknown> = {}) {
	approvals.request({
		id: "approval-1",
		sessionId: "thread-1",
		request: {
			kind: "command",
			turnId: "turn-1",
			workspaceTargetId: "target-1",
			title: "Run command",
			...overrides,
		},
		hardBlock: true,
	});
}

test("v1 approval decisions are idempotent by key", () => {
	const { database, approvals } = makeApprovalService();
	try {
		requestApproval(approvals);
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

test("v1 approval decisions reject wrong turn and workspace target", () => {
	const { database, approvals } = makeApprovalService();
	try {
		requestApproval(approvals);
		const params = {
			approvalId: "approval-1",
			threadId: "thread-1",
			turnId: "turn-1",
			workspaceTargetId: "target-1",
			decision: "approved" as const,
		};
		expect(approvals.decideV1({ ...params, threadId: "thread-2" })).toMatchObject({
			ok: false,
			code: "wrong-thread",
		});
		expect(approvals.decideV1({ ...params, turnId: "turn-2" })).toMatchObject({
			ok: false,
			code: "wrong-turn",
		});
		expect(approvals.decideV1({ ...params, workspaceTargetId: "target-2" })).toMatchObject({
			ok: false,
			code: "wrong-workspace-target",
		});
	} finally {
		database.close();
	}
});

test("v1 approval answers preserve structured answer payloads", () => {
	const { database, approvals } = makeApprovalService();
	try {
		requestApproval(approvals, { kind: "answer-input", question: "Choose branches" });
		const result = approvals.answerInputV1({
			approvalId: "approval-1",
			threadId: "thread-1",
			turnId: "turn-1",
			workspaceTargetId: "target-1",
			answers: { branches: { answers: ["main", "release"] } },
			idempotencyKey: "answer-1",
		});
		expect(result).toMatchObject({
			ok: true,
			answer: {
				answer: JSON.stringify({ branches: { answers: ["main", "release"] } }),
				answers: { branches: { answers: ["main", "release"] } },
			},
		});
		expect(approvals.answerInputV1({
			approvalId: "approval-1",
			threadId: "thread-1",
			turnId: "turn-1",
			workspaceTargetId: "target-1",
			answers: { branches: { answers: ["main", "release"] } },
			idempotencyKey: "answer-1",
		})).toEqual(result);
	} finally {
		database.close();
	}
});
