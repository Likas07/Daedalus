import { expect, test } from "bun:test";
import type { AppEvent, ClientRequest } from "@daedalus-pi/app-server-protocol";
import { AppServerClient, AppServerResponseError } from "./client";
import { createInProcessTransport } from "./in-process-transport";
import { getProviderSnapshot } from "./v1/provider-client";
import { rollbackThread } from "./v1/rollback-client";
import {
	generateBranchName,
	generateCommitMessage,
	generatePrContent,
	generateThreadTitle,
} from "./v1/text-generation-client";

test("correlates requests and rejects failed responses", async () => {
	const client = new AppServerClient({
		transport: createInProcessTransport((message, send) => {
			const request = message as ClientRequest;
			if (request.method === "initialize")
				send({
					kind: "response",
					id: request.id,
					ok: true,
					result: { protocolVersion: "0.1.0", server: { name: "test", version: "0" }, capabilities: {} },
				});
			else send({ kind: "response", id: request.id, ok: false, error: { code: "nope", message: "Nope" } });
		}),
	});

	await expect(client.initialize({ protocolVersion: "0.1.0", client: { name: "test" } })).resolves.toMatchObject({
		server: { name: "test" },
	});
	await expect(client.request("project/list", {})).rejects.toBeInstanceOf(AppServerResponseError);
	await client.close();
});

test("dispatches typed extension UI server requests and response helper", async () => {
	let sendToClient: ((message: unknown) => void) | undefined;
	let responseSeen = false;
	const client = new AppServerClient({
		transport: createInProcessTransport((message, send) => {
			sendToClient = send;
			const request = message as ClientRequest;
			if (request.method === "extension/ui/respond") {
				responseSeen = request.params.requestId === "ui-1" && request.params.actionId === "ok";
				send({ kind: "response", id: request.id, ok: true, result: {} });
				return;
			}
			send({ kind: "response", id: request.id, ok: true, result: {} });
		}),
	});

	const seen = new Promise<string>((resolve) => {
		client.onExtensionUiRequest((request) => resolve(request.title));
	});
	await client.request("project/list", {}).catch(() => undefined);
	sendToClient?.({
		kind: "request",
		id: "server-1",
		method: "extension/ui/request",
		params: {
			requestId: "ui-1",
			extensionId: "ext-1",
			title: "Need input",
			fields: [],
			actions: [{ id: "ok", label: "OK" }],
		},
	});
	await expect(seen).resolves.toBe("Need input");
	await client.respondToExtensionUi({ requestId: "ui-1", actionId: "ok", values: {} });
	expect(responseSeen).toBe(true);
	await client.close();
});

test("provides typed GUI protocol helpers", async () => {
	const seenMethods: string[] = [];
	const client = new AppServerClient({
		transport: createInProcessTransport((message, send) => {
			const request = message as ClientRequest;
			seenMethods.push(request.method);
			if (request.method === "shell/snapshot") {
				send({
					kind: "response",
					id: request.id,
					ok: true,
					result: { snapshot: { cursor: { seq: 0, updatedAt: "2026-04-30T00:00:00.000Z" }, threads: [] } },
				});
				return;
			}
			if (request.method === "thread/snapshot") {
				send({
					kind: "response",
					id: request.id,
					ok: true,
					result: {
						snapshot: {
							cursor: { seq: 0, updatedAt: "2026-04-30T00:00:00.000Z" },
							threadId: request.params.threadId,
							sessionId: "session-1",
							title: "Thread",
							status: "idle",
							messages: [],
							activity: [],
							pendingActions: [],
							safetySignals: [],
							diffIds: [],
						},
					},
				});
				return;
			}
			if (request.method === "composer/file-search") {
				send({
					kind: "response",
					id: request.id,
					ok: true,
					result: { files: [{ path: "src/index.ts", label: "index.ts", kind: "file", extension: ".ts" }] },
				});
				return;
			}
			if (request.method === "composer/command-list") {
				send({
					kind: "response",
					id: request.id,
					ok: true,
					result: { commands: [{ name: "plan", label: "Plan", source: "built-in" }] },
				});
				return;
			}
			if (request.method === "composer/attachment/save") {
				send({
					kind: "response",
					id: request.id,
					ok: true,
					result: { attachment: { id: "att-1", kind: "image", filename: request.params.filename, size: 4 } },
				});
				return;
			}
			if (request.method === "access/set") {
				send({
					kind: "response",
					id: request.id,
					ok: true,
					result: {
						policy: {
							mode: request.params.mode,
							autoApproveSoftPrompts: true,
							bypassHardBlocks: false,
							auditRequired: true,
						},
					},
				});
				return;
			}
			if (request.method === "terminal/create") {
				send({
					kind: "response",
					id: request.id,
					ok: true,
					result: {
						terminal: {
							terminalId: "terminal-1",
							projectId: request.params.projectId,
							worktreeId: request.params.worktreeId,
							cwd: request.params.cwd,
							shell: "/bin/sh",
							dimensions: { cols: request.params.cols ?? 80, rows: request.params.rows ?? 24 },
							status: "running",
							history: "",
							cursor: { nextSeq: 1, replayCursor: 0 },
							attached: true,
							createdAt: "2026-04-25T00:00:00.000Z",
							updatedAt: "2026-04-25T00:00:00.000Z",
							elapsedMs: 0,
							guardStatus: request.params.requireRootBoundary ? "valid" : undefined,
							guardTarget: request.params.guardTarget,
						},
					},
				});
				return;
			}
			if (request.method === "terminal/replay") {
				send({
					kind: "response",
					id: request.id,
					ok: true,
					result: { chunks: [{ seq: 1, data: "ready" }], nextSeq: 2, status: "running", replayCursor: 0 },
				});
				return;
			}
			if (request.method === "worktree/list" || request.method === "worktree/create") {
				const worktree = {
					id: "worktree-1",
					projectId: "project-1",
					branch: request.method === "worktree/create" ? request.params.branch : "safe",
					path: "/repo-wt",
					dirty: false,
					dirtyCount: 0,
					activeSessionCount: 0,
					cleanupRequiresConfirmation: false,
				};
				send({
					kind: "response",
					id: request.id,
					ok: true,
					result:
						request.method === "worktree/list"
							? { worktrees: [worktree] }
							: { outcome: "adopted-existing", operationId: "op-create", reason: "already exists", worktree },
				});
				return;
			}
			if (request.method === "worktree/cleanup-scan") {
				send({
					kind: "response",
					id: request.id,
					ok: true,
					result: {
						cleanupRisk: {
							worktreeId: request.params.worktreeId,
							operationId: request.params.operationId ?? "cleanup-op",
							risky: true,
							reasons: [
								{
									kind: "dirty-files",
									severity: "warning",
									message: "Dirty files",
									count: 1,
									files: ["dirty.txt"],
								},
							],
							dirtyFiles: ["dirty.txt"],
							unpushedCommitCount: 0,
							activeSessionIds: [],
							activeTerminalIds: [],
							riskHash: "risk-hash",
							confirmationToken: "cleanup-token",
							confirmationTokenExpiresAt: "2026-04-25T00:05:00.000Z",
							scannedAt: "2026-04-25T00:00:00.000Z",
						},
					},
				});
				return;
			}
			if (request.method === "worktree/cleanup") {
				send({ kind: "response", id: request.id, ok: true, result: { ok: true } });
				return;
			}
			if (request.method === "session/start") {
				send({ kind: "response", id: request.id, ok: true, result: { sessionId: "session-1" } });
				return;
			}
			if (request.method === "session/resume") {
				send({
					kind: "response",
					id: request.id,
					ok: true,
					result: {
						sessionId: request.params.sessionId,
						status: "needs-attention",
						identity: {
							status: "mismatched",
							sessionId: request.params.sessionId,
							storedCwd: "/repo-wt",
							currentCwd: "/repo-moved",
							message: "Session resume identity mismatch",
						},
					},
				});
				return;
			}
			if (request.method === "diff/get") {
				send({
					kind: "response",
					id: request.id,
					ok: true,
					result: {
						diff: {
							branch: "feature",
							upstream: "origin/main",
							ahead: 1,
							behind: 0,
							stagedCount: 0,
							unstagedCount: 1,
							files: [],
							riskyGroups: [],
						},
					},
				});
				return;
			}
			send({ kind: "response", id: request.id, ok: true, result: {} });
		}),
	});

	await expect(client.readShellSnapshot({ projectId: "project-1" })).resolves.toMatchObject({
		snapshot: { cursor: { seq: 0 }, threads: [] },
	});
	await expect(client.readThreadSnapshot({ threadId: "thread-1" })).resolves.toMatchObject({
		snapshot: { threadId: "thread-1", cursor: { seq: 0 } },
	});
	await expect(client.searchComposerFiles({ projectId: "project-1", query: "src", limit: 5 })).resolves.toMatchObject({
		files: [{ path: "src/index.ts" }],
	});
	await expect(
		client.createWorktree({ projectId: "project-1", branch: "safe", setup: false, includeIgnored: false }),
	).resolves.toMatchObject({
		outcome: "adopted-existing",
		operationId: "op-create",
		worktree: { id: "worktree-1", branch: "safe" },
	});
	await expect(client.listWorktrees({ projectId: "project-1" })).resolves.toMatchObject({
		worktrees: [{ id: "worktree-1" }],
	});
	await expect(
		client.startSession({
			startTarget: { mode: "isolated-worktree", projectId: "project-1", worktreeId: "worktree-1" },
			prompt: "hello",
		}),
	).resolves.toMatchObject({ sessionId: "session-1" });
	await expect(
		client.getDiff({ target: { kind: "worktree", projectId: "project-1", worktreeId: "worktree-1" } }),
	).resolves.toMatchObject({ diff: { branch: "feature" } });
	await expect(
		client.scanWorktreeCleanup({ worktreeId: "worktree-1", operationId: "cleanup-op" }),
	).resolves.toMatchObject({
		cleanupRisk: { risky: true, confirmationToken: "cleanup-token" },
	});
	await expect(
		client.cleanupWorktree({
			worktreeId: "worktree-1",
			operationId: "cleanup-op",
			confirmationToken: "cleanup-token",
		}),
	).resolves.toEqual({ ok: true });
	await expect(client.sessions.resume({ sessionId: "session-1", prompt: "continue" })).resolves.toMatchObject({
		status: "needs-attention",
		identity: { status: "mismatched" },
	});
	await expect(client.listComposerCommands()).resolves.toMatchObject({ commands: [{ name: "plan" }] });
	await expect(
		client.saveComposerAttachment({ filename: "image.png", mimeType: "image/png", dataBase64: "AAAA" }),
	).resolves.toMatchObject({ attachment: { id: "att-1", kind: "image" } });
	await expect(client.setAccessMode("unrestricted")).resolves.toMatchObject({
		policy: { mode: "unrestricted", bypassHardBlocks: false, auditRequired: true },
	});
	const guardTarget = {
		projectId: "project-1",
		rootPath: "/repo",
		canonicalRootPath: "/repo",
		targetPath: "/repo-wt",
		canonicalTargetPath: "/repo-wt",
	};
	const createdTerminal = await client.createTerminal({
		cwd: "/tmp/project",
		projectId: "project-1",
		worktreeId: "worktree-1",
		guardTarget,
		requireRootBoundary: true,
		cols: 80,
		rows: 24,
	});
	expect(createdTerminal.terminal).toMatchObject({
		terminalId: "terminal-1",
		status: "running",
		dimensions: { cols: 80, rows: 24 },
	});
	expect(createdTerminal.terminal).toMatchObject({ guardStatus: "valid", guardTarget });
	expect(createdTerminal.terminal).not.toHaveProperty("id");
	await expect(client.replayTerminal({ terminalId: "terminal-1" })).resolves.toMatchObject({
		chunks: [{ seq: 1, data: "ready" }],
	});
	await client.cancelTurn({ sessionId: "session-1", turnId: "turn-1" });
	await client.stopSession({ sessionId: "session-1" });

	expect(seenMethods).toContain("shell/snapshot");
	expect(seenMethods).toContain("thread/snapshot");
	expect(seenMethods).toContain("composer/file-search");
	expect(seenMethods).toContain("access/set");
	expect(seenMethods).toContain("terminal/create");
	expect(seenMethods).toContain("worktree/create");
	expect(seenMethods).toContain("worktree/list");
	expect(seenMethods).toContain("worktree/cleanup-scan");
	expect(seenMethods).toContain("worktree/cleanup");
	expect(seenMethods).toContain("session/resume");
	await client.close();
});

test("reconnect replays missed events once", async () => {
	const server = new ReplayServer();
	const firstTransport = createInProcessTransport(server.handle);
	const client = new AppServerClient({ transport: firstTransport });
	const delivered: string[] = [];
	client.onNotification("event/appended", (params) => {
		const event = params.event as AppEvent & { seq?: number };
		delivered.push(event.id);
	});

	await client.initialize({ protocolVersion: "0.1.0", client: { name: "test" } });
	await client.startSession({
		startTarget: { mode: "isolated-worktree", projectId: "project-1", worktreeId: "worktree-1" },
		prompt: "hello",
	});
	expect(delivered).toEqual(["event-1"]);

	firstTransport.close();
	server.append("event-2");

	await client.reconnect(createInProcessTransport(server.handle));
	expect(delivered).toEqual(["event-1", "event-2"]);

	await client.reconnect(createInProcessTransport(server.handle));
	expect(delivered).toEqual(["event-1", "event-2"]);
	await client.close();
});

class ReplayServer {
	private events: Array<AppEvent & { seq: number }> = [];
	private send: ((message: unknown) => void) | undefined;

	readonly handle = (message: unknown, send: (message: unknown) => void) => {
		this.send = send;
		const request = message as ClientRequest;
		if (request.method === "initialize") {
			send({
				kind: "response",
				id: request.id,
				ok: true,
				result: {
					protocolVersion: "0.1.0",
					server: { name: "test", version: "0" },
					capabilities: { events: true },
				},
			});
			return;
		}
		if (request.method === "session/start") {
			this.append("event-1");
			send({ kind: "response", id: request.id, ok: true, result: { sessionId: "session-1" } });
			return;
		}
		if (request.method === "event/replay") {
			const after = Number(request.params.cursor?.after ?? 0);
			const events = this.events.filter((event) => event.seq > after);
			send({
				kind: "response",
				id: request.id,
				ok: true,
				result: { events, next: events.length ? { after: String(events.at(-1)?.seq) } : undefined },
			});
			return;
		}
		send({ kind: "response", id: request.id, ok: true, result: {} });
	};

	append(id: string): void {
		const event = {
			id,
			seq: this.events.length + 1,
			type: "session/started",
			ts: new Date().toISOString(),
			sessionId: "session-1",
			payload: {},
		};
		this.events.push(event);
		this.send?.({ kind: "notification", method: "event/appended", params: { event } });
	}
}

test("provides v1 adapter-facing provider rollback and text-generation helpers", async () => {
	const seenMethods: string[] = [];
	const client = new AppServerClient({
		transport: createInProcessTransport((message, send) => {
			const request = message as ClientRequest;
			seenMethods.push(request.method);
			const results: Record<string, unknown> = {
				"provider.snapshot": {
					status: "ready",
					server: { name: "daedalus", version: "0", protocolVersion: "1.0.0" },
					capabilities: {
						streamingChat: true,
						cancellation: true,
						approvals: true,
						structuredUserInput: true,
						toolTimeline: true,
						payloadWindows: true,
						diffs: true,
						checkpoints: true,
						rollback: true,
						resume: true,
						modelSwitching: true,
						textGeneration: true,
						terminals: true,
					},
					models: [],
					auth: [],
					commands: [],
				},
				"thread.rollback": {
					threadId: "thread-1",
					restoredCheckpointId: "checkpoint-1",
					status: "completed",
				},
				"text.threadTitle": { title: "Implement v1 contract" },
				"text.branchName": { branch: "implement-v1-contract" },
				"text.commitMessage": { subject: "feat: add v1 contract" },
				"text.prContent": { title: "Add v1 contract", body: "Adds adapter helpers." },
			};
			send({ kind: "response", id: request.id, ok: true, result: results[request.method] ?? {} });
		}),
	});

	await expect(getProviderSnapshot(client)).resolves.toMatchObject({ status: "ready" });
	await expect(
		rollbackThread(client, { threadId: "thread-1", numTurns: 1, workspaceTargetId: "target-1" }),
	).resolves.toMatchObject({
		status: "completed",
	});
	await expect(generateThreadTitle(client, { message: "hello" })).resolves.toMatchObject({
		title: "Implement v1 contract",
	});
	await expect(generateBranchName(client, { message: "hello" })).resolves.toMatchObject({
		branch: "implement-v1-contract",
	});
	await expect(generateCommitMessage(client, { diff: "diff" })).resolves.toMatchObject({
		subject: "feat: add v1 contract",
	});
	await expect(generatePrContent(client, { diff: "diff" })).resolves.toMatchObject({ title: "Add v1 contract" });
	expect(seenMethods).toEqual([
		"provider.snapshot",
		"thread.rollback",
		"text.threadTitle",
		"text.branchName",
		"text.commitMessage",
		"text.prContent",
	]);
	expect(JSON.stringify(seenMethods)).not.toContain("sessionId");
	await client.close();
});
