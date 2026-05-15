import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type AppEvent,
	appServerProtocolVersion,
	type protocolV1,
	type ServerNotification,
} from "@daedalus-pi/app-server-protocol";
import { appendEvent, openAppServerDatabase, projectRuntimeEvents } from "..";
import type { ControlledSessionRuntime, RuntimeFactory } from "../runtime/session-controller";
import { type AppServerInstance, startAppServer } from "./app-server";

const servers: AppServerInstance[] = [];

afterEach(async () => {
	await Promise.all(servers.splice(0).map((server) => server.stop()));
});

describe("app-server Codex parity gate", () => {
	test("runs a WebSocket fake-runtime transcript with replay, payload refs, and method errors", async () => {
		const dir = mkdtempSync(join(tmpdir(), "daedalus-parity-gate-"));
		await git(dir, ["init"]);
		writeFileSync(join(dir, "tracked.txt"), "before\n");
		await git(dir, ["add", "tracked.txt"]);
		await git(dir, ["commit", "-m", "initial"]);
		writeFileSync(join(dir, "tracked.txt"), "before\nafter\n");

		let terminalOutput: ((data: string) => void) | undefined;
		const runtimeFactory: RuntimeFactory = async (input) => new FakeRuntime(input.cwd);
		const databasePath = join(dir, "app.sqlite");
		const server = await startAppServer({
			databasePath,
			token: "test-token",
			runtimeFactory,
			terminalPty: {
				spawn: () => ({
					pid: 4242,
					write: () => {},
					resize: () => {},
					kill: () => {},
					onData: (listener) => {
						terminalOutput = listener;
						return () => {};
					},
					onExit: () => () => {},
				}),
			},
		});
		servers.push(server);

		const messages: unknown[] = [];
		let ws = await connect(server, messages);
		send(ws, "init", "initialize", { protocolVersion: appServerProtocolVersion, client: { name: "parity-gate" } });
		const initialized = await response(messages, "init");
		expect(initialized.ok).toBe(true);
		expect((initialized.result as { capabilities: Record<string, boolean> }).capabilities).toMatchObject({
			strictRequestValidation: true,
			initializedGate: true,
			requestSerialization: true,
			threadWorkspaceContract: true,
			threadTimeline: true,
			timelineDeltas: true,
			payloadWindows: true,
			approvalRequests: true,
			userInputRequests: true,
			reconnectReplay: true,
			typedClientTransport: true,
		});

		send(ws, "open", "project/open", { path: dir });
		const opened = await response(messages, "open");
		expect(opened.ok).toBe(true);
		const projectId = (opened.result as { projectId: string }).projectId;
		const workspaceTargetId = `base:${projectId}`;

		send(ws, "create", "thread.create", { projectId, workspaceTargetId, prompt: "start parity run" });
		const created = await response(messages, "create");
		expect(created.ok).toBe(true);
		const threadId = (created.result as protocolV1.ThreadCreateResult).thread.threadId;
		const turnId = (created.result as protocolV1.ThreadCreateResult).turn?.turnId;
		expect(turnId).toBeTruthy();
		const activeTurnId = turnId!;
		await waitFor(() =>
			messages.find(
				(message) => isNotification(message, "thread.timeline.delta") && JSON.stringify(message).includes("Hello"),
			),
		);
		await waitFor(() =>
			messages.find(
				(message) =>
					isNotification(message, "thread.timeline.delta") && JSON.stringify(message).includes("tool chunk"),
			),
		);

		send(ws, "terminal", "v1.terminal.open", {
			workspaceTargetId,
			threadId,
			turnId: activeTurnId,
			rows: 24,
			cols: 80,
			route: "agent-command",
		});
		const terminal = await response(messages, "terminal");
		expect(terminal.ok).toBe(true);
		const terminalId = (terminal.result as protocolV1.TerminalCommandResult & { ok: true }).context.terminalId;
		terminalOutput?.("terminal chunk\n");
		server.router.append({
			id: "terminal-output-parity",
			type: "terminal/output",
			ts: new Date().toISOString(),
			sessionId: threadId,
			terminalId,
			payload: { sessionId: threadId, terminalId, data: "terminal chunk\n" },
		} as AppEvent);
		await waitFor(() =>
			messages.find(
				(message) =>
					isNotification(message, "terminal/output") && JSON.stringify(message).includes("terminal chunk"),
			),
		);

		send(ws, "diff", "v1.diff.summary", {
			workspaceTargetId,
			threadId,
			turnId: activeTurnId,
			checkpointId: "checkpoint-1",
		});
		const diff = await response(messages, "diff");
		expect(diff.ok).toBe(true);
		const diffResult = diff.result as protocolV1.DiffSummaryResult;
		expect(diffResult.ok).toBe(true);
		const diffFile = diffResult.ok ? diffResult.summary.files.find((file) => file.payloadRef) : undefined;
		expect(diffFile?.payloadRef).toBeTruthy();

		const approvalId = "approval-parity";
		const approvalDatabase = openAppServerDatabase(databasePath);
		appendEvent(approvalDatabase, {
			streamId: threadId,
			type: "approval/requested",
			payload: {
				approvalId,
				sessionId: threadId,
				kind: "answer-input",
				turnId: activeTurnId,
				workspaceTargetId,
				title: "Need structured input",
				question: "Which branch?",
				request: {
					kind: "answer-input",
					turnId: activeTurnId,
					workspaceTargetId,
					title: "Need structured input",
					question: "Which branch?",
				},
			},
		});
		projectRuntimeEvents(approvalDatabase);
		approvalDatabase.close();
		send(ws, "approvals", "v1.approval.list", {
			threadId,
			turnId: activeTurnId,
			workspaceTargetId,
			status: "pending",
		});
		const approvals = await response(messages, "approvals");
		expect(approvals.ok).toBe(true);
		expect(
			(approvals.result as protocolV1.ApprovalListResult).requests.map((request) => request.approvalId),
		).toContain(approvalId);
		send(ws, "answer", "v1.approval.answer", {
			approvalId,
			threadId,
			turnId: activeTurnId,
			workspaceTargetId,
			answer: "main",
			idempotencyKey: "answer-once",
		});
		const answer = await response(messages, "answer");
		expect(answer.ok).toBe(true);

		ws.close();
		await Bun.sleep(20);

		ws = await connect(server, messages);
		send(ws, "init-2", "initialize", { protocolVersion: appServerProtocolVersion, client: { name: "parity-gate" } });
		await response(messages, "init-2");
		send(ws, "replay", "thread.replay", { threadId, limit: 100 });
		const replay = await response(messages, "replay");
		expect(replay.ok).toBe(true);
		const replayEntries = (replay.result as protocolV1.TimelineWindowResult).entries;
		expect(replayEntries.length).toBeGreaterThan(0);
		expect(new Set(replayEntries.map((entry) => entry.entryId)).size).toBe(replayEntries.length);
		expect(replayEntries.filter((entry) => entry.kind === "assistant-message")).toHaveLength(1);
		expect(replayEntries.some((entry) => entry.entryId.includes(":delta:"))).toBe(false);

		const payloadRefs = replayEntries.flatMap((entry) => payloadRefsForEntry(entry));
		if (diffFile?.payloadRef) payloadRefs.push(diffFile.payloadRef);
		payloadRefs.push({ kind: "terminal-output", terminalId, cursor: { seq: 1 }, byteLength: 15 });
		expect(payloadRefs.length).toBeGreaterThanOrEqual(3);
		for (const [index, ref] of payloadRefs.entries()) {
			send(ws, `payload-${index}`, "payload.window", payloadParams(threadId, ref));
			const payload = await response(messages, `payload-${index}`);
			expect(payload.ok, JSON.stringify({ ref, payload })).toBe(true);
			expect(
				(payload.result as { chunks: unknown[] }).chunks.length,
				JSON.stringify({ ref, payload }),
			).toBeGreaterThan(0);
		}

		send(ws, "unsupported", "definitely.unsupported", {});
		const unsupported = await response(messages, "unsupported");
		expect(unsupported.ok).toBe(false);
		expect((unsupported as unknown as { error: { code: string } }).error.code).toBe("method_not_found");
		ws.close();
	});
});

class FakeRuntime implements ControlledSessionRuntime {
	readonly session: ControlledSessionRuntime["session"];
	private listener: ((event: unknown) => void) | undefined;

	constructor(readonly cwd: string) {
		this.session = {
			subscribe: (listener) => {
				this.listener = listener;
				return () => {
					this.listener = undefined;
				};
			},
			prompt: async () => {
				this.listener?.({ type: "message_update", messageId: "assistant-1", delta: "Hello " });
				this.listener?.({ type: "tool_execution_start", toolCallId: "tool-1", toolName: "shell" });
				this.listener?.({
					type: "tool_execution_update",
					toolCallId: "tool-1",
					toolName: "shell",
					delta: "tool chunk",
				});
				this.listener?.({
					type: "tool_execution_end",
					toolCallId: "tool-1",
					toolName: "shell",
					output: "tool result",
				});
				this.listener?.({
					type: "message_end",
					message: { id: "assistant-1", role: "assistant", content: "Hello from fake runtime" },
				});
				this.listener?.({ type: "agent_end" });
			},
			abort: async () => {},
		};
	}

	async dispose(): Promise<void> {}
}

async function connect(server: AppServerInstance, messages: unknown[]): Promise<WebSocket> {
	const ws = new WebSocket(`${server.wsUrl}?token=test-token`);
	ws.addEventListener("message", (event) => messages.push(JSON.parse(String(event.data))));
	await new Promise<void>((resolve, reject) => {
		ws.addEventListener("open", () => resolve(), { once: true });
		ws.addEventListener("error", () => reject(new Error("websocket error")), { once: true });
	});
	return ws;
}

function send(ws: WebSocket, id: string, method: string, params: unknown): void {
	ws.send(JSON.stringify({ kind: "request", id, method, params }));
}

async function response(
	messages: readonly unknown[],
	id: string,
): Promise<{ kind: "response"; id: string; ok: boolean; result: unknown }> {
	return waitFor(() => messages.find((message) => isResponse(message, id)) as never);
}

function isResponse(message: unknown, id: string): boolean {
	return (
		typeof message === "object" &&
		message !== null &&
		(message as { kind?: unknown }).kind === "response" &&
		(message as { id?: unknown }).id === id
	);
}

function isNotification(message: unknown, method: string): message is ServerNotification {
	return (
		typeof message === "object" &&
		message !== null &&
		(message as { kind?: unknown }).kind === "notification" &&
		(message as { method?: unknown }).method === method
	);
}

function payloadRefsForEntry(entry: protocolV1.TimelineEntry): protocolV1.PayloadReference[] {
	const record = entry as { payloadRef?: protocolV1.PayloadReference };
	return record.payloadRef ? [record.payloadRef] : [];
}

function payloadParams(threadId: string, ref: protocolV1.PayloadReference): protocolV1.PayloadWindowParams {
	const base = { threadId, limit: 10 };
	switch (ref.kind) {
		case "terminal-output":
			return { ...base, terminalId: ref.terminalId };
		case "diff-content":
			return { ...base, diffId: ref.diffId, filePath: ref.filePath };
		case "tool-output":
			return { ...base, toolCallId: ref.toolCallId };
		case "audit-detail":
			return { ...base, auditId: ref.auditId };
	}
}

async function git(cwd: string, args: readonly string[]): Promise<void> {
	const proc = Bun.spawn(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	if (exitCode !== 0) throw new Error(`git ${args.join(" ")} failed: ${stderr.trim() || stdout.trim()}`);
}

async function waitFor<T>(fn: () => T | undefined | false, timeoutMs = 3000): Promise<T> {
	const started = Date.now();
	while (Date.now() - started < timeoutMs) {
		const value = fn();
		if (value) return value;
		await Bun.sleep(20);
	}
	throw new Error("Timed out waiting for condition");
}
