import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openAppServerDatabase, readEvents, runMigrations } from "..";
import { AccessPolicyService } from "./access-policy-service";
import { ApprovalService } from "./approval-service";
import { classifyToolRisk, ToolApprovalGate } from "./tool-approval-gate";

function setup() {
	const database = openAppServerDatabase(join(mkdtempSync(join(tmpdir(), "daedalus-gate-")), "app.sqlite"));
	runMigrations(database);
	database
		.query("INSERT INTO sessions (id, status, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
		.run("session-1", "active", "Test", new Date().toISOString(), new Date().toISOString());
	const access = new AccessPolicyService(database);
	const approvals = new ApprovalService(database, access);
	const gate = new ToolApprovalGate({
		sessionId: "session-1",
		approvalService: approvals,
		accessPolicy: access,
		timeoutMs: 1_000,
	});
	return { database, access, approvals, gate };
}

test("classifies read-only tools as safe and risky tools as approval-sensitive", () => {
	expect(classifyToolRisk("read")).toBe("safe");
	expect(classifyToolRisk("grep")).toBe("safe");
	expect(classifyToolRisk("write")).toBe("soft");
	expect(classifyToolRisk("bash", { command: "echo ok" })).toBe("soft");
	expect(classifyToolRisk("fetch")).toBe("soft");
	expect(classifyToolRisk("extension/foo")).toBe("soft");
	expect(classifyToolRisk("bash", { command: "sudo rm -rf /" })).toBe("hard");
});

test("supervised mode waits for approval", async () => {
	const { database, gate } = setup();
	let settled = false;
	const pending = gate
		.beforeToolCall({
			toolName: "write",
			toolCallId: "call-1",
			args: { path: "a" },
		})
		.then(() => {
			settled = true;
		});
	await Bun.sleep(20);
	expect(settled).toBe(false);
	expect(readEvents(database).map((event) => event.type)).toContain("approval/requested");
	gate.dispose();
	await pending;
	database.close();
});

test("tool approvals include stable turn and workspace metadata", async () => {
	const { database, gate } = setup();
	gate.setContext({ getTurnId: () => "turn-1", workspaceTargetId: "target-1" });
	const pending = gate.beforeToolCall({
		toolName: "bash",
		toolCallId: "call-meta",
		args: { command: "git status" },
	});
	await Bun.sleep(10);
	const event = readEvents(database).find((event) => event.type === "approval/requested");
	expect(event?.payload).toMatchObject({
		approvalId: "tool-call-meta",
		sessionId: "session-1",
		kind: "command",
		turnId: "turn-1",
		workspaceTargetId: "target-1",
	});
	gate.dispose();
	await pending;
	database.close();
});

test("tool approval metadata falls back to non-empty ids", async () => {
	const { database, gate } = setup();
	const pending = gate.beforeToolCall({
		toolName: "bash",
		toolCallId: "call-fallback",
		args: { command: "git status" },
	});
	await Bun.sleep(10);
	const event = readEvents(database).find((event) => event.type === "approval/requested");
	expect(event?.payload).toMatchObject({
		approvalId: "tool-call-fallback",
		turnId: "turn:unknown",
		workspaceTargetId: "base:session-1",
	});
	gate.dispose();
	await pending;
	database.close();
});

test("approve resumes tool execution", async () => {
	const { database, approvals, gate } = setup();
	const pending = gate.beforeToolCall({
		toolName: "write",
		toolCallId: "call-approve",
		args: { path: "a" },
	});
	await Bun.sleep(10);
	approvals.resolve({ approvalId: "tool-call-approve", decision: "approved" });
	expect(await pending).toBeUndefined();
	database.close();
});

test("deny blocks tool execution", async () => {
	const { database, approvals, gate } = setup();
	const pending = gate.beforeToolCall({
		toolName: "write",
		toolCallId: "call-deny",
		args: { path: "a" },
	});
	await Bun.sleep(10);
	approvals.resolve({
		approvalId: "tool-call-deny",
		decision: "denied",
		message: "revise please",
	});
	expect(await pending).toEqual({ block: true, reason: "revise please" });
	database.close();
});

test("unrestricted auto-approves soft prompts", async () => {
	const { database, access, gate } = setup();
	access.setMode("unrestricted");
	expect(
		await gate.beforeToolCall({
			toolName: "write",
			toolCallId: "call-auto",
			args: { path: "a" },
		}),
	).toBeUndefined();
	expect(readEvents(database).map((event) => event.type)).toContain("access/auto-approved");
	database.close();
});

test("hard blocks remain blocked", async () => {
	const { database, access, gate } = setup();
	access.setMode("unrestricted");
	expect(
		await gate.beforeToolCall({
			toolName: "bash",
			toolCallId: "call-hard",
			args: { command: "sudo rm -rf /" },
		}),
	).toEqual({
		block: true,
		reason: "Blocked by access policy: bash is not allowed from the GUI.",
	});
	database.close();
});
