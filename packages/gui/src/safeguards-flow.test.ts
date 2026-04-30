import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AppServerClient, type AppServerTransport } from "@daedalus-pi/app-server-client";
import type { ClientRequest, WorkflowWorktreeMetadata, WorktreeCreateResult } from "@daedalus-pi/app-server-protocol";
import { Window } from "happy-dom";
import { createGuiRuntime } from "./client/runtime";
import { computeStartGate } from "./client/start-gate";

class SafeguardTransport implements AppServerTransport {
	private listener: ((message: unknown) => void) | undefined;
	readonly sent: unknown[] = [];
	createResult: WorktreeCreateResult = { outcome: "adopted-existing", worktree: worktree(), operationId: "op-adopt" };
	listResult: WorkflowWorktreeMetadata[] = [worktree()];

	send(message: unknown): void {
		this.sent.push(message);
		const request = message as ClientRequest;
		if (request.kind !== "request") return;
		queueMicrotask(() =>
			this.listener?.({ kind: "response", id: request.id, ok: true, result: this.responseFor(request) }),
		);
	}

	onMessage(listener: (message: unknown) => void): () => void {
		this.listener = listener;
		return () => {
			this.listener = undefined;
		};
	}

	close(): void {}

	private responseFor(request: ClientRequest): unknown {
		switch (request.method) {
			case "initialize":
				return { protocolVersion: "0.1.0", server: { name: "test", version: "0" }, capabilities: { events: true } };
			case "project/list":
				return { projects: [{ id: "project-1", path: "/repo", name: "repo" }] };
			case "project/open":
				return { projectId: "project-1", path: "/repo", name: "repo" };
			case "session/list":
				return { sessions: [] };
			case "terminal/list":
				return { terminals: [] };
			case "model/list":
				return { models: [], selectedModel: undefined };
			case "auth/status":
				return { providers: [] };
			case "config/get":
				return { config: {} };
			case "access/get":
				return {
					policy: {
						mode: "supervised",
						autoApproveSoftPrompts: false,
						bypassHardBlocks: false,
						auditRequired: true,
					},
				};
			case "event/replay":
				return { events: [] };
			case "worktree/create":
				return this.createResult;
			case "worktree/list":
				return { worktrees: this.listResult };
			case "session/start":
				return {
					sessionId: "session-1",
					runsIn: {
						projectId: "project-1",
						worktreeId: "wt-1",
						path: "/repo-wt",
						canonicalPath: "/repo-wt",
						branch: "build/safe-task",
						isolationMode: "isolated-worktree",
						validationStatus: "valid",
					},
				};
			default:
				return {};
		}
	}
}

function worktree(overrides: Partial<WorkflowWorktreeMetadata> = {}): WorkflowWorktreeMetadata {
	return {
		id: "wt-1",
		projectId: "project-1",
		branch: "build/safe-task",
		path: "/repo-wt",
		status: "ready",
		dirty: false,
		dirtyCount: 0,
		activeSessionCount: 0,
		cleanupRequiresConfirmation: false,
		createdAt: "now",
		updatedAt: "now",
		...overrides,
	};
}

let window: Window;

beforeEach(() => {
	window = new Window({ url: "http://localhost/" });
	Object.assign(globalThis, {
		window,
		document: window.document,
		HTMLElement: window.HTMLElement,
		Element: window.Element,
		SVGElement: window.SVGElement,
		Node: window.Node,
		Text: window.Text,
		Comment: window.Comment,
		Event: window.Event,
		CustomEvent: window.CustomEvent,
	});
});

afterEach(() => {
	window.close();
});

describe("safeguard GUI flow regressions", () => {
	test("shared start gate blocks unsafe starts for needs-attention and cleanup-risk worktrees", () => {
		expect(
			computeStartGate({
				prompt: "ship it",
				projectPath: "/repo",
				projectId: "project-1",
				worktrees: [worktree({ status: "needs-attention" })],
				activeWorktreeId: "wt-1",
			}),
		).toMatchObject({
			canSend: false,
			canStartBuild: false,
			requiredAction: "resolve-worktree",
			targetStatus: "needs-attention",
		});

		expect(
			computeStartGate({
				prompt: "ship it",
				projectPath: "/repo",
				projectId: "project-1",
				worktrees: [worktree({ cleanupRequiresConfirmation: true })],
				activeWorktreeId: "wt-1",
			}),
		).toMatchObject({ canSend: false, canStartBuild: false, requiredAction: "resolve-worktree" });
	});

	test("runtime accepts adopted worktree create outcomes and starts only after verifying the shared target", async () => {
		const transport = new SafeguardTransport();
		const runtime = await createGuiRuntime({ client: new AppServerClient({ transport }) });
		await runtime.initialize();

		await runtime.startSessionFromPrompt({ path: "/repo", projectId: "project-1", prompt: "Safe task" });

		expect(runtime.state.newBuild).toMatchObject({ kind: "running", sessionId: "session-1" });
		expect(runtime.state.worktrees).toContainEqual(expect.objectContaining({ id: "wt-1", path: "/repo-wt" }));
		expect(transport.sent).toContainEqual(
			expect.objectContaining({
				method: "session/start",
				params: expect.objectContaining({
					startTarget: { mode: "isolated-worktree", projectId: "project-1", worktreeId: "wt-1" },
				}),
			}),
		);
	});

	test("runtime blocks conflict outcomes before session/start and exposes recovery state", async () => {
		const transport = new SafeguardTransport();
		transport.createResult = {
			outcome: "conflict",
			reason: "path-exists",
			message: "Path already exists",
			operationId: "op-conflict",
			existingPath: "/repo-wt",
		};
		const runtime = await createGuiRuntime({ client: new AppServerClient({ transport }) });
		await runtime.initialize();

		await runtime.startSessionFromPrompt({ path: "/repo", projectId: "project-1", prompt: "Conflict task" });

		expect(runtime.state.newBuild).toMatchObject({
			kind: "setupFailed",
			retryAction: "edit-branch",
			outcome: { outcome: "conflict", operationId: "op-conflict" },
		});
		expect(transport.sent).not.toContainEqual(expect.objectContaining({ method: "session/start" }));
	});

	test("renders adopted-ready, conflict, and NeedsAttention safeguard states", () => {
		const setupSource = readFileSync(join(import.meta.dir, "components/NewBuildSetupSheet.svelte"), "utf8");
		const recoverySource = readFileSync(join(import.meta.dir, "components/NeedsAttentionRecovery.svelte"), "utf8");

		expect(setupSource).toContain("Worktree ready");
		expect(setupSource).toContain("worktree.path");
		expect(setupSource).toContain("Setup failed");
		expect(setupSource).toContain("worktree-create-outcome");
		expect(setupSource).toContain("failedOutcome.operationId");
		expect(setupSource).toContain("failedOutcome.reason");
		expect(recoverySource).toContain("needsAttention");
		expect(recoverySource).toContain("Continue is unavailable until validation passes");
	});

	test("Thread-first safety signals remain compact in header/composer and detailed in inspector", () => {
		const header = readFileSync(join(import.meta.dir, "components/projection/ThreadHeader.svelte"), "utf8");
		const composerActions = readFileSync(
			join(import.meta.dir, "components/composer/ComposerPendingActions.svelte"),
			"utf8",
		);
		const inspector = readFileSync(join(import.meta.dir, "components/projection/ThreadInspector.svelte"), "utf8");
		const workspace = readFileSync(join(import.meta.dir, "components/projection/ThreadWorkspace.svelte"), "utf8");
		expect(header).toContain("continue in worktree");
		expect(workspace).toContain("getContinueDisabledReason");
		expect(workspace).toContain("selectedSession.runsIn");
		expect(composerActions).toContain("composer-pending-actions");
		expect(inspector).toMatch(/Unrestricted|accessMode|Target validation/i);
		expect(`${header}\n${workspace}`).toMatch(/unrestricted|validation|dirty/i);
	});
});
