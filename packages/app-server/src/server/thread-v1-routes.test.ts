import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openAppServerDatabase } from "../persistence/database";
import { appendEvent, type EventPayload } from "../persistence/event-store";
import { runMigrations } from "../persistence/migrations";
import { projectRuntimeEvents } from "../persistence/projector";
import { AppRouter } from "./router";
import { handleThreadV1Request } from "./thread-v1-routes";

function databaseWithThread() {
	const database = openAppServerDatabase(":memory:");
	runMigrations(database);
	appendEvent(database, {
		streamId: "app",
		type: "project/registered",
		payload: { projectId: "project-1", path: "/repo" },
	});
	appendEvent(database, {
		streamId: "thread-1",
		type: "session/started",
		payload: {
			sessionId: "thread-1",
			projectId: "project-1",
			title: "Thread",
			runsIn: {
				projectId: "project-1",
				canonicalPath: "/repo",
				branch: "main",
				isolationMode: "base-checkout",
				validationStatus: "valid",
			},
		},
	});
	appendEvent(database, {
		streamId: "thread-1",
		type: "turn/started",
		payload: { sessionId: "thread-1", turnId: "turn-1", prompt: "Hello" },
	});
	projectRuntimeEvents(database);
	return database;
}

describe("thread v1 routes", () => {
	test("router handles thread.get and thread.replay without exposing sessionId", async () => {
		const database = databaseWithThread();
		try {
			const router = new AppRouter({
				database,
				publish: () => {},
				controller: {
					readState: () => ({ sessions: [] }),
					startTurn: async () => ({ turnId: "turn-new" }),
					interruptTurn: async () => {},
				} as never,
			});
			const get = (await router.handle({
				kind: "request",
				id: "v1-get",
				method: "thread.get",
				params: { threadId: "thread-1" },
			} as never)) as { thread: { threadId: string }; timeline: { entries: unknown[] } };
			expect(get.thread.threadId).toBe("thread-1");
			expect(JSON.stringify(get)).not.toContain("sessionId");
			const replay = (await router.handle({
				kind: "request",
				id: "v1-replay",
				method: "thread.replay",
				params: { threadId: "thread-1", limit: 1 },
			} as never)) as { entries: unknown[]; nextCursor?: { seq: number } };
			expect(replay.entries).toHaveLength(1);
			expect(replay.nextCursor).toEqual({ seq: 3 });
		} finally {
			database.close();
		}
	});

	test("thread.get and replay hide rolled-back turns while keeping later turns visible", async () => {
		const database = databaseWithThread();
		try {
			appendEvent(database, {
				streamId: "thread-1",
				type: "agent/message_end",
				payload: { sessionId: "thread-1", turnId: "turn-1", messageId: "message-1", content: "first" },
			});
			appendEvent(database, {
				streamId: "thread-1",
				type: "turn/completed",
				payload: { sessionId: "thread-1", turnId: "turn-1" },
			});
			appendEvent(database, {
				streamId: "thread-1",
				type: "turn/started",
				payload: { sessionId: "thread-1", turnId: "turn-2", prompt: "Removed" },
			});
			appendEvent(database, {
				streamId: "thread-1",
				type: "agent/message_end",
				payload: { sessionId: "thread-1", turnId: "turn-2", messageId: "message-removed", content: "removed" },
			});
			appendEvent(database, {
				streamId: "thread-1",
				type: "turn/completed",
				payload: { sessionId: "thread-1", turnId: "turn-2" },
			});
			appendEvent(database, {
				streamId: "session:thread-1",
				type: "thread/rollback",
				payload: {
					threadId: "thread-1",
					workspaceTargetId: "target-1",
					numTurns: 1,
					removedTurnIds: ["turn-2"],
					hiddenEventRange: null,
					idempotencyKey: "rollback-once",
				},
			});
			appendEvent(database, {
				streamId: "thread-1",
				type: "turn/started",
				payload: { sessionId: "thread-1", turnId: "turn-3", prompt: "After rollback" },
			});
			appendEvent(database, {
				streamId: "thread-1",
				type: "agent/message_end",
				payload: { sessionId: "thread-1", turnId: "turn-3", messageId: "message-3", content: "after" },
			});
			projectRuntimeEvents(database);
			const router = new AppRouter({
				database,
				publish: () => {},
				controller: {
					readState: () => ({ sessions: [] }),
					startTurn: async () => ({ turnId: "turn-new" }),
					interruptTurn: async () => {},
				} as never,
			});

			const get = (await router.handle({
				kind: "request",
				id: "v1-get-rollback",
				method: "thread.get",
				params: { threadId: "thread-1" },
			} as never)) as { turns: Array<{ turnId: string }>; timeline: { entries: Array<{ entryId: string }> } };
			const replay = (await router.handle({
				kind: "request",
				id: "v1-replay-rollback",
				method: "thread.replay",
				params: { threadId: "thread-1", limit: 100 },
			} as never)) as { entries: Array<{ entryId: string }> };

			expect(get.turns.map((turn) => turn.turnId)).toEqual(["turn-1", "turn-3"]);
			expect(get.timeline.entries.map((entry) => entry.entryId)).not.toContain("message:message-removed");
			expect(replay.entries.map((entry) => entry.entryId)).toEqual(
				get.timeline.entries.map((entry) => entry.entryId),
			);
			expect(new Set(replay.entries.map((entry) => entry.entryId)).size).toBe(replay.entries.length);
		} finally {
			database.close();
		}
	});

	test("turn.start and turn.cancel route through runtime authority", async () => {
		const database = databaseWithThread();
		const calls: string[] = [];
		try {
			const start = await handleThreadV1Request(
				{
					database,
					authority: {
						startTurn: async (input) => {
							calls.push(`start:${input.threadId}:${input.prompt}`);
							appendEvent(database, {
								streamId: input.threadId,
								type: "turn/started",
								payload: { sessionId: input.threadId, turnId: "turn-2", prompt: input.prompt },
							});
							return { turnId: "turn-2" };
						},
						cancelTurn: async (input) => {
							calls.push(`cancel:${input.threadId}:${input.turnId}`);
							appendEvent(database, {
								streamId: input.threadId,
								type: "turn/interrupted",
								payload: { sessionId: input.threadId, turnId: input.turnId },
							});
						},
					},
				},
				{ method: "turn.start", params: { threadId: "thread-1", prompt: "Next" } },
			);
			expect(calls).toEqual(["start:thread-1:Next"]);
			expect(start.result).toMatchObject({ turn: { turnId: "turn-2", threadId: "thread-1", status: "running" } });
			const cancel = await handleThreadV1Request(
				{
					database,
					authority: {
						startTurn: async () => ({ turnId: "unused" }),
						cancelTurn: async (input) => {
							calls.push(`cancel:${input.threadId}:${input.turnId}`);
							appendEvent(database, {
								streamId: input.threadId,
								type: "turn/interrupted",
								payload: { sessionId: input.threadId, turnId: input.turnId },
							});
						},
					},
				},
				{ method: "turn.cancel", params: { threadId: "thread-1", turnId: "turn-2" } },
			);
			expect(calls.at(-1)).toBe("cancel:thread-1:turn-2");
			expect(cancel.result).toMatchObject({ turn: { turnId: "turn-2", status: "cancelled" } });
		} finally {
			database.close();
		}
	});

	test("payload.window resolves durable terminal, diff, tool, and audit payload refs", async () => {
		const database = databaseWithThread();
		try {
			appendEvent(database, {
				streamId: "thread-1",
				type: "terminal/output",
				payload: { sessionId: "thread-1", terminalId: "terminal-1", data: "terminal output" },
			});
			appendEvent(database, {
				streamId: "thread-1",
				type: "diff/updated",
				payload: { sessionId: "thread-1", diffId: "diff-1", filePath: "src/index.ts", hunk: "@@ diff hunk" },
			});
			appendEvent(database, {
				streamId: "thread-1",
				type: "agent/tool_execution_update",
				payload: { sessionId: "thread-1", turnId: "turn-1", toolCallId: "tool-1", delta: "tool output" },
			});
			appendEvent(database, {
				streamId: "thread-1",
				type: "audit/detail",
				payload: { sessionId: "thread-1", auditId: "audit-1", action: "checked" },
			});
			const context = {
				database,
				authority: {
					startTurn: async () => ({ turnId: "unused" }),
					cancelTurn: async () => {},
				},
			};

			const terminal = await handleThreadV1Request(context, {
				method: "payload.window",
				params: { threadId: "thread-1", terminalId: "terminal-1", limit: 10 },
			});
			expect(terminal.result).toMatchObject({ chunks: [{ text: "terminal output" }], hasMoreAfter: false });

			const diff = await handleThreadV1Request(context, {
				method: "payload.window",
				params: { threadId: "thread-1", diffId: "diff-1", filePath: "src/index.ts", limit: 10 },
			});
			expect(diff.result).toMatchObject({ chunks: [{ filePath: "src/index.ts", hunk: "@@ diff hunk" }] });

			const tool = await handleThreadV1Request(context, {
				method: "payload.window",
				params: { threadId: "thread-1", toolCallId: "tool-1", limit: 10 },
			});
			expect(tool.result).toMatchObject({ chunks: [{ text: "tool output" }] });

			const audit = await handleThreadV1Request(context, {
				method: "payload.window",
				params: { threadId: "thread-1", auditId: "audit-1", limit: 10 },
			});
			expect(audit.result).toMatchObject({ chunks: [{ data: expect.objectContaining({ action: "checked" }) }] });

			await expect(
				handleThreadV1Request(context, {
					method: "payload.window",
					params: { threadId: "thread-1", toolCallId: "missing-tool", limit: 10 },
				}),
			).rejects.toMatchObject({ code: "payload_not_found" });
		} finally {
			database.close();
		}
	});

	test("router sends structured v1 approval answers without flattening metadata", async () => {
		const database = databaseWithThread();
		try {
			appendEvent(database, {
				streamId: "thread-1",
				type: "approval/requested",
				payload: {
					approvalId: "approval-input-1",
					sessionId: "thread-1",
					kind: "answer-input",
					turnId: "turn-1",
					workspaceTargetId: "target-1",
					title: "Need input",
					request: {
						kind: "answer-input",
						turnId: "turn-1",
						workspaceTargetId: "target-1",
						title: "Need input",
						question: "Which branches?",
					},
				},
			});
			projectRuntimeEvents(database);
			const router = new AppRouter({
				database,
				publish: () => {},
				controller: {
					readState: () => ({ sessions: [] }),
					startTurn: async () => ({ turnId: "unused" }),
					interruptTurn: async () => {},
				} as never,
			});

			const answered = (await router.handle({
				kind: "request",
				id: "answer",
				method: "v1.approval.answer",
				params: {
					approvalId: "approval-input-1",
					threadId: "thread-1",
					turnId: "turn-1",
					workspaceTargetId: "target-1",
					answers: { branches: { answers: ["main", "release"] } },
					idempotencyKey: "answer-once",
				},
			} as never)) as { ok: boolean; answer: { answer: string; answers?: unknown } };

			expect(answered).toMatchObject({
				ok: true,
				answer: {
					answer: JSON.stringify({ branches: { answers: ["main", "release"] } }),
					answers: { branches: { answers: ["main", "release"] } },
				},
			});
		} finally {
			database.close();
		}
	});

	test("router handles workspaceTarget list/validate and thread create/list", async () => {
		const dir = mkdtempSync(join(tmpdir(), "daedalus-v1-thread-workspace-"));
		await git(dir, ["init"]);
		const database = openAppServerDatabase(":memory:");
		runMigrations(database);
		const projectId = "project-1";
		appendEvent(database, {
			streamId: `project:${projectId}`,
			type: "project/registered",
			payload: { projectId, path: dir, name: "Project" },
		});
		projectRuntimeEvents(database);
		try {
			const router = new AppRouter({
				database,
				publish: () => {},
				controller: {
					readState: () => ({ sessions: [] }),
					startSession: async (input: {
						projectId: string;
						cwd: string;
						prompt?: string;
						runsIn?: EventPayload;
					}) => {
						appendEvent(database, {
							streamId: "thread-new",
							type: "session/started",
							payload: {
								sessionId: "thread-new",
								projectId: input.projectId,
								title: "Thread",
								...(input.runsIn ? { runsIn: input.runsIn } : {}),
							} satisfies EventPayload,
						});
						if (input.prompt) {
							appendEvent(database, {
								streamId: "thread-new",
								type: "turn/started",
								payload: { sessionId: "thread-new", turnId: "turn-new", prompt: input.prompt },
							});
						}
						return { sessionId: "thread-new" };
					},
					resumeSession: async () => ({ sessionId: "thread-new", status: "active" }),
					startTurn: async () => ({ turnId: "turn-unused" }),
					interruptTurn: async () => {},
				} as never,
			});
			const targets = (await router.handle({
				kind: "request",
				id: "targets",
				method: "workspaceTarget.list",
				params: { projectId },
			} as never)) as { targets: Array<{ id: string; kind: string; projectId: string }> };
			expect(targets.targets).toContainEqual(
				expect.objectContaining({ id: `base:${projectId}`, kind: "base-checkout", projectId }),
			);
			const validated = (await router.handle({
				kind: "request",
				id: "validate",
				method: "workspaceTarget.validate",
				params: { workspaceTargetId: `base:${projectId}` },
			} as never)) as { workspaceTarget: { id: string } };
			expect(validated.workspaceTarget.id).toBe(`base:${projectId}`);
			const created = (await router.handle({
				kind: "request",
				id: "create",
				method: "thread.create",
				params: { projectId, workspaceTargetId: `base:${projectId}`, prompt: "Hello" },
			} as never)) as { thread: { threadId: string; workspaceTargetId: string }; turn?: { turnId: string } };
			expect(created.thread).toMatchObject({ threadId: "thread-new", workspaceTargetId: `base:${projectId}` });
			expect(created.turn).toMatchObject({ turnId: "turn-new" });
			const listed = (await router.handle({
				kind: "request",
				id: "list",
				method: "thread.list",
				params: { projectId, workspaceTargetId: `base:${projectId}` },
			} as never)) as { threads: Array<{ threadId: string }> };
			expect(listed.threads.map((thread) => thread.threadId)).toContain("thread-new");
			const resumed = (await router.handle({
				kind: "request",
				id: "resume",
				method: "thread.resume",
				params: { threadId: "thread-new" },
			} as never)) as { thread: { threadId: string } };
			expect(resumed.thread.threadId).toBe("thread-new");
		} finally {
			database.close();
		}
	});
});

async function git(cwd: string, args: readonly string[]): Promise<void> {
	const proc = Bun.spawn(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	if (exitCode !== 0) throw new Error(`git ${args.join(" ")} failed: ${stderr.trim() || stdout.trim()}`);
}
