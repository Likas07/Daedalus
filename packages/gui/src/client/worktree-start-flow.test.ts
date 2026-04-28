import { expect, test } from "bun:test";
import type { SessionStartParams, WorkflowWorktreeMetadata } from "@daedalus-pi/app-server-protocol";
import { createNewBuildStateMachine } from "./new-build-state-machine";

const worktree = (overrides: Partial<WorkflowWorktreeMetadata> = {}): WorkflowWorktreeMetadata => ({
	id: "wt-1",
	projectId: "project-1",
	branch: "task/safe",
	path: "/repo-wt",
	status: "ready",
	dirty: false,
	dirtyCount: 0,
	activeSessionCount: 0,
	cleanupRequiresConfirmation: false,
	createdAt: "2026-04-28T00:00:00.000Z",
	updatedAt: "2026-04-28T00:00:00.000Z",
	...overrides,
});

test("creates and verifies a worktree before starting a build session", async () => {
	const calls: string[] = [];
	const states: string[] = [];
	const flow = createNewBuildStateMachine({
		createWorktree: async () => {
			calls.push("worktree/create");
			return worktree();
		},
		listWorktrees: async () => {
			calls.push("worktree/list");
			return [worktree()];
		},
		startSession: async (params) => {
			calls.push(`session/start:${params.startTarget?.mode}`);
			expect(params.startTarget).toEqual({ mode: "isolated-worktree", projectId: "project-1", worktreeId: "wt-1" });
			return { sessionId: "s1" };
		},
		onState: (state) => states.push(state.kind),
	});

	await expect(flow.start({ projectId: "project-1", prompt: "make it safe" })).resolves.toEqual({ sessionId: "s1" });
	expect(calls).toEqual(["worktree/create", "worktree/list", "session/start:isolated-worktree"]);
	expect(states).toEqual([
		"derivingTarget",
		"creatingWorktree",
		"verifyingWorktree",
		"readyToStart",
		"startingSession",
		"running",
	]);
});

test("adopts an existing typed worktree outcome before starting", async () => {
	const states: string[] = [];
	const flow = createNewBuildStateMachine({
		createWorktree: async () => ({
			outcome: "adopted-existing",
			worktree: worktree({ id: "wt-adopted" }),
			operationId: "op-adopt",
			reason: "matching path",
		}),
		listWorktrees: async () => [worktree({ id: "wt-adopted" })],
		startSession: async (params) => {
			expect(params.startTarget).toEqual({
				mode: "isolated-worktree",
				projectId: "project-1",
				worktreeId: "wt-adopted",
			});
			return { sessionId: "s-adopted" };
		},
		onState: (state) => states.push(state.kind),
	});

	await expect(flow.start({ projectId: "project-1", prompt: "adopt it" })).resolves.toEqual({
		sessionId: "s-adopted",
	});
	expect(states).toContain("readyToStart");
});

test("renders typed conflict and rollback/failed outcomes as setup failures", async () => {
	for (const outcome of [
		{
			outcome: "conflict" as const,
			message: "path already exists",
			reason: "path-exists" as const,
			operationId: "op-conflict",
		},
		{
			outcome: "rolled-back" as const,
			message: "removed partial worktree",
			reason: "unknown" as const,
			operationId: "op-rollback",
		},
		{
			outcome: "failed" as const,
			message: "git worktree add failed",
			reason: "unknown" as const,
			operationId: "op-failed",
		},
	]) {
		const flow = createNewBuildStateMachine({
			createWorktree: async () => outcome,
			startSession: async () => {
				throw new Error("should not start");
			},
		});

		await expect(flow.start({ projectId: "project-1", prompt: "safe" })).resolves.toBeUndefined();
		expect(flow.state).toMatchObject({ kind: "setupFailed", outcome });
		if (flow.state.kind !== "setupFailed") throw new Error("expected setupFailed");
		expect(flow.state.message).toContain(outcome.operationId);
		expect(flow.state.message).toContain(outcome.reason);
	}
});

test("setup failure preserves the original prompt and does not start a session", async () => {
	const calls: string[] = [];
	const flow = createNewBuildStateMachine({
		createWorktree: async () => {
			calls.push("worktree/create");
			throw new Error("git refused");
		},
		startSession: async () => {
			calls.push("session/start");
			return { sessionId: "s1" };
		},
	});

	await expect(flow.start({ projectId: "project-1", prompt: "original prompt" })).resolves.toBeUndefined();
	expect(calls).toEqual(["worktree/create"]);
	expect(flow.state).toMatchObject({ kind: "setupFailed", prompt: "original prompt", message: "git refused" });
});

test("session start failure is surfaced as setupFailed with the exact error", async () => {
	const states: string[] = [];
	const flow = createNewBuildStateMachine({
		createWorktree: async () => worktree(),
		listWorktrees: async () => [worktree()],
		startSession: async () => {
			throw new Error("session route rejected prompt");
		},
		onState: (state) => states.push(state.kind),
	});

	await expect(flow.start({ projectId: "project-1", prompt: "hello" })).resolves.toBeUndefined();
	expect(states).toContain("startingSession");
	expect(flow.state).toEqual({
		kind: "setupFailed",
		prompt: "hello",
		message: "session route rejected prompt",
		retryAction: "retry",
	});
});

test("base checkout requires confirmation before passing explicit startTarget", async () => {
	const starts: SessionStartParams[] = [];
	const flow = createNewBuildStateMachine({
		createWorktree: async () => worktree(),
		startSession: async (params) => {
			starts.push(params);
			return { sessionId: "s-base" };
		},
	});

	await expect(
		flow.start({
			projectId: "project-1",
			prompt: "use base",
			target: { mode: "base-checkout", path: "/repo", branch: "main", dirtyCount: 2 },
		}),
	).resolves.toBeUndefined();
	expect(flow.state).toEqual({
		kind: "baseCheckoutConfirming",
		prompt: "use base",
		path: "/repo",
		branch: "main",
		dirtyCount: 2,
	});
	expect(starts).toEqual([]);

	await flow.confirmBaseCheckout({
		projectId: "project-1",
		prompt: "use base",
		target: { mode: "base-checkout", confirmed: true, path: "/repo", branch: "main", dirtyCount: 2 },
	});
	expect(starts[0]?.startTarget).toEqual({
		mode: "base-checkout",
		projectId: "project-1",
		confirmation: { confirmed: true, evidence: "GUI confirmed base checkout /repo@main" },
	});
});
