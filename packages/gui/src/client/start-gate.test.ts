import { describe, expect, test } from "bun:test";
import type { WorkflowWorktreeMetadata } from "@daedalus-pi/app-server-protocol";
import { computeStartGate } from "./start-gate";

const ready = {
	prompt: "Build it",
	projectPath: "/repo",
	requireProject: true,
	models: [{ id: "model-a", provider: "test", available: true }],
	selectedModel: "model-a",
	providerStatuses: [{ provider: "test", authenticated: true, status: "ready" as const }],
};

function worktree(overrides: Partial<WorkflowWorktreeMetadata> = {}): WorkflowWorktreeMetadata {
	return {
		id: "wt-1",
		projectId: "project-1",
		branch: "task/safe",
		path: "/repo-wt",
		status: "ready",
		dirty: false,
		dirtyCount: 0,
		activeSessionCount: 0,
		cleanupRequiresConfirmation: false,
		...overrides,
	};
}

describe("computeStartGate", () => {
	test("allows a ready prompt, project, target, and provider", () => {
		expect(computeStartGate(ready)).toEqual({
			canSend: true,
			canStartBuild: true,
			requiredAction: "none",
			targetStatus: "ready",
		});
	});

	test("blocks empty prompt, upload in progress, and missing project", () => {
		expect(computeStartGate({ ...ready, prompt: "  " })).toMatchObject({
			canSend: false,
			requiredAction: "enter-prompt",
		});
		expect(computeStartGate({ ...ready, uploading: true })).toMatchObject({
			canSend: false,
			requiredAction: "wait-for-upload",
		});
		expect(computeStartGate({ ...ready, projectPath: "", projectId: undefined })).toMatchObject({
			canSend: false,
			requiredAction: "choose-project",
		});
	});

	test("blocks unresolved worktree needs-attention and cleanup risk", () => {
		expect(
			computeStartGate({
				...ready,
				worktrees: [worktree({ status: "needs-attention" })],
				activeWorktreeId: "wt-1",
			}),
		).toMatchObject({ canStartBuild: false, requiredAction: "resolve-worktree", targetStatus: "needs-attention" });
		expect(
			computeStartGate({
				...ready,
				worktrees: [worktree({ cleanupRequiresConfirmation: true })],
				activeWorktreeId: "wt-1",
			}),
		).toMatchObject({ canStartBuild: false, requiredAction: "resolve-worktree" });
	});

	test("blocks unavailable provider and already-starting build", () => {
		expect(
			computeStartGate({
				...ready,
				models: [{ id: "model-a", provider: "test", available: false }],
			}),
		).toMatchObject({ canSend: false, requiredAction: "configure-provider" });
		expect(computeStartGate({ ...ready, newBuildKind: "startingSession" })).toMatchObject({
			canSend: false,
			requiredAction: "wait-for-start",
			targetStatus: "starting",
		});
	});
});
