import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ServerNotification, ServerRequest } from "@daedalus-pi/app-server-protocol";
import { openAppServerDatabase, runMigrations } from "..";
import { AccessPolicyService } from "../runtime/access-policy-service";
import { ApprovalService } from "../runtime/approval-service";
import { ExtensionUIBridge } from "./extension-ui-bridge";

describe("ExtensionUIBridge", () => {
	test("blocks confirm until an extension UI response arrives", async () => {
		const messages: Array<ServerRequest | ServerNotification> = [];
		const bridge = new ExtensionUIBridge({
			extensionId: "ext.test",
			sessionId: "session-1",
			nextRequestId: () => "request-1",
			emit: (message) => {
				messages.push(message);
			},
		});

		let resolved: boolean | undefined;
		const promise = bridge.confirm("Confirm action", "Continue?").then((value) => {
			resolved = value;
			return value;
		});
		await Promise.resolve();

		expect(resolved).toBeUndefined();
		expect(messages).toEqual([
			{
				kind: "request",
				id: "request-1",
				method: "extension/ui/request",
				params: {
					requestId: "request-1",
					extensionId: "ext.test",
					sessionId: "session-1",
					title: "Confirm action",
					description: "Continue?",
					fields: [],
					actions: [
						{ id: "confirm", label: "Confirm", style: "primary" },
						{ id: "cancel", label: "Cancel", style: "secondary" },
					],
				},
			},
		]);

		expect(bridge.respond({ requestId: "request-1", actionId: "confirm", values: {} })).toBe(true);
		expect(await promise).toBe(true);
		expect(resolved).toBe(true);
	});

	test("bridges structured user input through v1 approval answers", async () => {
		const database = openAppServerDatabase(join(mkdtempSync(join(tmpdir(), "daedalus-extension-ui-")), "app.sqlite"));
		runMigrations(database);
		database
			.query("INSERT INTO sessions (id, status, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
			.run("thread-1", "active", "Thread", new Date().toISOString(), new Date().toISOString());
		const messages: unknown[] = [];
		const approvals = new ApprovalService(database, new AccessPolicyService(database), (message) =>
			messages.push(message),
		);
		const bridge = new ExtensionUIBridge({
			extensionId: "ext.test",
			sessionId: "thread-1",
			approvalService: approvals,
			getTurnId: () => "turn-1",
			getWorkspaceTargetId: () => "target-1",
			emit: () => {},
		});

		try {
			const pending = bridge.requestUserInput({
				title: "Questionnaire",
				questions: [
					{
						id: "scope",
						header: "Scope",
						question: "Which scope?",
						options: [{ value: "small", label: "Small", description: "Small scope" }],
					},
				],
			});
			await Promise.resolve();
			const notification = messages.find(
				(message) =>
					typeof message === "object" &&
					message !== null &&
					(message as { method?: string }).method === "user-input.requested",
			) as { params: { approvalId: string } } | undefined;
			expect(notification?.params).toMatchObject({
				threadId: "thread-1",
				turnId: "turn-1",
				workspaceTargetId: "target-1",
				requestKind: "answer-input",
				request: expect.objectContaining({
					questions: [
						expect.objectContaining({
							id: "scope",
							header: "Scope",
							question: "Which scope?",
						}),
					],
				}),
			});
			approvals.answerInputV1({
				approvalId: notification!.params.approvalId,
				threadId: "thread-1",
				turnId: "turn-1",
				workspaceTargetId: "target-1",
				answers: { scope: { answers: ["small"] } },
			});
			await expect(pending).resolves.toEqual({
				answers: { scope: { answers: ["small"] } },
				cancelled: false,
			});
		} finally {
			database.close();
		}
	});
});
