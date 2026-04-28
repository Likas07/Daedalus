import { describe, expect, test } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import {
	appServerProtocolVersion,
	ClientRequestResultSchemas,
	ClientRequestSchema,
	DesktopBootDiagnosticSchema,
	EventReplayResponseSchema,
	OperationCleanupScanSchema,
	RootBoundaryViolationSchema,
	ServerNotificationSchema,
	ServerRequestSchema,
	SessionResumeResultSchema,
	TerminalCreateParamsSchema,
	TerminalSnapshotSchema,
	WorktreeCreateOutcomeSchema,
} from "./index";

function terminalSnapshot(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		terminalId: "terminal-1",
		projectId: "project-1",
		worktreeId: "worktree-1",
		sessionId: "session-1",
		cwd: "/tmp/project",
		shell: "/bin/sh",
		dimensions: { cols: 80, rows: 24 },
		status: "running",
		history: "ready\n",
		cursor: { nextSeq: 2, replayCursor: 1 },
		attached: true,
		pid: 123,
		createdAt: "2026-04-25T00:00:00.000Z",
		updatedAt: "2026-04-25T00:00:01.000Z",
		elapsedMs: 1000,
		...overrides,
	};
}

describe("app-server protocol schemas", () => {
	test("validates initialize requests", () => {
		expect(
			Value.Check(ClientRequestSchema, {
				kind: "request",
				id: "req-1",
				method: "initialize",
				params: {
					protocolVersion: appServerProtocolVersion,
					client: { name: "gui", version: "0.1.0" },
				},
			}),
		).toBe(true);
	});

	test("validates Safe Worktree Loop session/start targets", () => {
		expect(
			Value.Check(ClientRequestSchema, {
				kind: "request",
				id: "req-2",
				method: "session/start",
				params: {
					startTarget: { mode: "isolated-worktree", projectId: "project-1", worktreeId: "worktree-1" },
					prompt: "implement the feature",
					model: "claude-sonnet-4.5",
				},
			}),
		).toBe(true);
		expect(
			Value.Check(ClientRequestSchema, {
				kind: "request",
				id: "req-3",
				method: "session/start",
				params: {
					startTarget: {
						mode: "base-checkout",
						projectId: "project-1",
						confirmation: { confirmed: true, evidence: "User chose Run on base checkout" },
					},
				},
			}),
		).toBe(true);
		expect(
			Value.Check(ClientRequestSchema, {
				kind: "request",
				id: "req-project-compat",
				method: "session/start",
				params: {
					projectId: "project-1",
					startTarget: { mode: "isolated-worktree", projectId: "project-1", worktreeId: "worktree-1" },
				},
			}),
		).toBe(true);
		expect(
			Value.Check(ClientRequestSchema, {
				kind: "request",
				id: "req-legacy-worktree",
				method: "session/start",
				params: { projectId: "project-1", worktreeId: "worktree-1" },
			}),
		).toBe(false);
		expect(
			Value.Check(ClientRequestSchema, {
				kind: "request",
				id: "req-base-missing-confirmation",
				method: "session/start",
				params: { startTarget: { mode: "base-checkout", projectId: "project-1" } },
			}),
		).toBe(false);
	});

	test("validates structured diff/get targets with transitional diffId compatibility", () => {
		expect(
			Value.Check(ClientRequestSchema, {
				kind: "request",
				id: "req-diff",
				method: "diff/get",
				params: { target: { kind: "worktree", projectId: "project-1", worktreeId: "worktree-1" } },
			}),
		).toBe(true);
		expect(
			Value.Check(ClientRequestSchema, {
				kind: "request",
				id: "req-diff-compat",
				method: "diff/get",
				params: {
					diffId: "diff-1",
					target: { kind: "worktree", projectId: "project-1", worktreeId: "worktree-1" },
				},
			}),
		).toBe(true);
	});

	test("validates turn/start requests", () => {
		expect(
			Value.Check(ClientRequestSchema, {
				kind: "request",
				id: 3,
				method: "turn/start",
				params: {
					sessionId: "session-1",
					prompt: "continue",
				},
			}),
		).toBe(true);
	});

	test("validates extension UI request and response messages", () => {
		expect(
			Value.Check(ServerRequestSchema, {
				kind: "request",
				id: "server-req-1",
				method: "extension/ui/request",
				params: {
					requestId: "ui-1",
					extensionId: "linear",
					sessionId: "session-1",
					title: "Create issue",
					fields: [{ id: "title", label: "Title", type: "text", required: true }],
					actions: [{ id: "submit", label: "Create", style: "primary" }],
				},
			}),
		).toBe(true);

		expect(
			Value.Check(ClientRequestSchema, {
				kind: "request",
				id: "req-4",
				method: "extension/ui/respond",
				params: {
					requestId: "ui-1",
					actionId: "submit",
					values: { title: "Fix protocol" },
				},
			}),
		).toBe(true);
	});

	test("validates event/replay requests and typed responses", () => {
		expect(
			Value.Check(ClientRequestSchema, {
				kind: "request",
				id: "req-5",
				method: "event/replay",
				params: { cursor: { after: "event-1", limit: 100 }, types: ["session.started"] },
			}),
		).toBe(true);

		expect(
			Value.Check(EventReplayResponseSchema, {
				kind: "response",
				id: "req-5",
				ok: true,
				result: {
					events: [
						{
							id: "event-2",
							type: "session.started",
							ts: "2026-04-24T00:00:00.000Z",
							sessionId: "session-1",
							payload: { sessionId: "session-1" },
						},
					],
					next: { after: "event-2" },
				},
			}),
		).toBe(true);
	});

	test("validates GUI composer, access, and terminal contracts", () => {
		expect(
			Value.Check(ClientRequestSchema, {
				kind: "request",
				id: "req-composer-search",
				method: "composer/file-search",
				params: { projectId: "project-1", query: "src", limit: 10 },
			}),
		).toBe(true);

		expect(
			Value.Check(ClientRequestSchema, {
				kind: "request",
				id: "req-attachment",
				method: "composer/attachment/save",
				params: { sessionId: "session-1", filename: "image.png", mimeType: "image/png", dataBase64: "aGVsbG8=" },
			}),
		).toBe(true);

		expect(
			Value.Check(ClientRequestSchema, {
				kind: "request",
				id: "req-access",
				method: "access/set",
				params: { mode: "unrestricted" },
			}),
		).toBe(true);

		expect(
			Value.Check(ClientRequestSchema, {
				kind: "request",
				id: "req-terminal",
				method: "terminal/create",
				params: { cwd: "/tmp/project", cols: 80, rows: 24 },
			}),
		).toBe(true);

		expect(Value.Check(TerminalSnapshotSchema, terminalSnapshot())).toBe(true);

		expect(
			Value.Check(ServerNotificationSchema, {
				kind: "notification",
				method: "terminal/event",
				params: { terminalId: "terminal-1", event: { type: "data", data: "ready\n" } },
			}),
		).toBe(true);
	});

	test("validates safeguard protocol contracts", () => {
		const rootTarget = {
			projectId: "project-1",
			rootPath: "/repo",
			canonicalRootPath: "/repo",
			targetPath: "/repo/.worktrees/feature",
			canonicalTargetPath: "/repo/.worktrees/feature",
		};
		const worktree = {
			id: "worktree-1",
			projectId: "project-1",
			branch: "feature",
			path: "/repo/.worktrees/feature",
			dirty: false,
			dirtyCount: 0,
			activeSessionCount: 0,
			cleanupRequiresConfirmation: false,
		};

		expect(Value.Check(WorktreeCreateOutcomeSchema, { outcome: "created", worktree, operationId: "op-1" })).toBe(
			true,
		);
		expect(Value.Check(WorktreeCreateOutcomeSchema, { outcome: "adopted-existing", worktree })).toBe(true);
		expect(
			Value.Check(WorktreeCreateOutcomeSchema, {
				outcome: "conflict",
				reason: "root-boundary-violation",
				message: "target escapes project root",
				operationId: "op-2",
				boundaryViolation: {
					reason: "target-outside-root",
					message: "resolved path is outside root",
					target: rootTarget,
				},
			}),
		).toBe(true);
		expect(
			Value.Check(WorktreeCreateOutcomeSchema, {
				outcome: "rolled-back",
				message: "removed partial worktree",
				operationId: "op-3",
				reason: "operation-in-progress",
			}),
		).toBe(true);
		expect(
			Value.Check(WorktreeCreateOutcomeSchema, {
				outcome: "failed",
				message: "git worktree add failed",
				reason: "unknown",
				recoverable: true,
			}),
		).toBe(true);
		expect(
			Value.Check(ClientRequestResultSchemas["worktree/create"], {
				outcome: "created",
				worktree,
				operationId: "op-4",
			}),
		).toBe(true);
		expect(Value.Check(ClientRequestResultSchemas["worktree/create"], { worktree })).toBe(true);

		expect(
			Value.Check(OperationCleanupScanSchema, {
				operationId: "op-1",
				root: rootTarget,
				status: "completed",
				candidates: [{ path: "/repo/.worktrees/tmp", reason: "stale operation", safeToRemove: true }],
				startedAt: "2026-04-26T00:00:00.000Z",
				completedAt: "2026-04-26T00:00:01.000Z",
			}),
		).toBe(true);
		expect(
			Value.Check(RootBoundaryViolationSchema, {
				reason: "symlink-escape",
				message: "cwd escapes root",
				target: rootTarget,
				resolvedPath: "/tmp/outside",
			}),
		).toBe(true);
		expect(
			Value.Check(SessionResumeResultSchema, {
				sessionId: "session-1",
				status: "resumed",
				identity: { status: "matched", sessionId: "session-1", storedCwd: "/repo", currentCwd: "/repo" },
			}),
		).toBe(true);
		expect(
			Value.Check(TerminalCreateParamsSchema, {
				cwd: "/repo",
				guardTarget: rootTarget,
				requireRootBoundary: true,
			}),
		).toBe(true);
		expect(
			Value.Check(ClientRequestSchema, {
				kind: "request",
				id: "req-cleanup-scan",
				method: "worktree/cleanup-scan",
				params: { worktreeId: "worktree-1", operationId: "cleanup-op" },
			}),
		).toBe(true);
		expect(
			Value.Check(ClientRequestSchema, {
				kind: "request",
				id: "req-cleanup-confirm",
				method: "worktree/cleanup",
				params: { worktreeId: "worktree-1", operationId: "cleanup-op", confirmationToken: "token" },
			}),
		).toBe(true);
		expect(
			Value.Check(ClientRequestResultSchemas["worktree/cleanup-scan"], {
				cleanupRisk: {
					worktreeId: "worktree-1",
					operationId: "cleanup-op",
					risky: true,
					riskHash: "risk-hash",
					reasons: [{ kind: "dirty-files", severity: "danger", message: "Dirty files", count: 1 }],
					dirtyFiles: ["dirty.txt"],
					unpushedCommitCount: 0,
					activeSessionIds: [],
					activeTerminalIds: [],
					confirmationToken: "token",
					scannedAt: "2026-04-26T00:00:00.000Z",
				},
			}),
		).toBe(true);
		expect(
			Value.Check(TerminalSnapshotSchema, terminalSnapshot({ guardStatus: "valid", guardTarget: rootTarget })),
		).toBe(true);
		expect(
			Value.Check(DesktopBootDiagnosticSchema, {
				stage: "app-server-ready",
				ready: false,
				message: "waiting for GUI",
				updatedAt: "2026-04-26T00:00:00.000Z",
				durationMs: 123,
			}),
		).toBe(true);
		expect(
			Value.Check(DesktopBootDiagnosticSchema, {
				stage: "db-path",
				ready: false,
				message: "migration failed",
				updatedAt: "2026-04-26T00:00:00.000Z",
				stages: [
					{
						name: "db-path",
						status: "failed",
						message: "migration failed",
						at: "2026-04-26T00:00:00.000Z",
						durationMs: 10,
					},
				],
			}),
		).toBe(true);
		expect(Value.Check(TerminalCreateParamsSchema, { cwd: "/repo", requireRootBoundary: true })).toBe(true);
		expect(
			Value.Check(
				TerminalSnapshotSchema,
				terminalSnapshot({ guardStatus: "blocked", rejectedReason: "outside root" }),
			),
		).toBe(true);
	});

	test("validates canonical route result schemas", () => {
		expect(
			Value.Check(ClientRequestResultSchemas["project/list"], {
				projects: [{ id: "project-1", name: "repo", path: "/repo", createdAt: "now", updatedAt: "now" }],
			}),
		).toBe(true);
		expect(Value.Check(ClientRequestResultSchemas["session/start"], { sessionId: "session-1" })).toBe(true);
		expect(
			Value.Check(ClientRequestResultSchemas["session/list"], {
				sessions: [
					{
						id: "session-1",
						cwd: "/repo",
						created: "now",
						modified: "now",
						messageCount: 0,
						firstMessage: "",
						allMessagesText: "",
					},
				],
			}),
		).toBe(true);
		expect(
			Value.Check(ClientRequestResultSchemas["auth/status"], {
				providers: [
					{
						provider: "openai",
						enabled: false,
						authenticated: false,
						status: "missing-auth",
						authMethod: "api-key",
						actionable: false,
						canLogin: false,
						canLogout: false,
						canRelogin: false,
						modelCount: 2,
						models: [
							{ id: "gpt-5", available: true, capabilities: ["reasoning"], diagnostics: [] },
							{ id: "gpt-5-mini", available: true, capabilities: [], diagnostics: [] },
						],
						capabilities: ["reasoning"],
						diagnostics: [],
						updatedAt: "2026-04-26T00:00:00.000Z",
					},
				],
			}),
		).toBe(true);
		expect(
			Value.Check(ClientRequestResultSchemas["model/list"], {
				models: [{ id: "gpt-5", label: "GPT-5", provider: "openai", available: true }],
				selectedModel: "gpt-5",
			}),
		).toBe(true);
		expect(
			Value.Check(ClientRequestResultSchemas["settings/read"], {
				global: {},
				project: {},
				effective: {},
				diagnostics: [],
				models: [{ id: "gpt-5" }],
				thinkingLevels: ["off", "low"],
				keybindings: [],
				schema: [],
			}),
		).toBe(true);
		expect(Value.Check(ClientRequestResultSchemas["terminal/create"], { terminal: terminalSnapshot() })).toBe(true);
		expect(
			Value.Check(ClientRequestResultSchemas["terminal/replay"], {
				chunks: [{ seq: 1, data: "ready" }],
				nextSeq: 2,
				status: "running",
				replayCursor: 1,
			}),
		).toBe(true);
		const diff = {
			branch: "main",
			upstream: null,
			ahead: 0,
			behind: 0,
			stagedCount: 0,
			unstagedCount: 1,
			files: [
				{
					path: "src/index.ts",
					status: "modified",
					staged: false,
					insertions: 1,
					deletions: 0,
					riskGroup: "source",
				},
			],
			patch: "",
			riskyGroups: ["source"],
		};
		expect(Value.Check(ClientRequestResultSchemas["diff/get"], { diff })).toBe(true);
		expect(Value.Check(ClientRequestResultSchemas["git/stage"], { ok: true, approvalId: "approval-1", diff })).toBe(
			true,
		);
		expect(
			Value.Check(ClientRequestResultSchemas["checkpoint/list"], {
				checkpoints: [{ checkpointId: "checkpoint-1", sessionId: "session-1", metadata: {}, createdAt: "now" }],
			}),
		).toBe(true);
		expect(
			Value.Check(ClientRequestResultSchemas["integration/pr-create"], {
				pullRequest: { status: "created", number: 1, url: "https://example.test/pr/1" },
			}),
		).toBe(true);
		expect(
			Value.Check(ClientRequestResultSchemas["orchestration/read"], {
				mode: "build",
				lanes: [],
				checkpoints: [],
				updatedAt: "now",
			}),
		).toBe(true);
		expect(
			Value.Check(ClientRequestResultSchemas["daedalus/workflow/read"], {
				sessionId: "session-1",
				plans: [],
				todos: [],
				questions: [],
				semanticWorkspace: { status: "idle" },
				orchestration: { mode: "build", lanes: [], checkpoints: [] },
				updatedAt: "now",
			}),
		).toBe(true);
	});

	test("validates SQLite session store requests", () => {
		const requests = [
			{ method: "session/list", params: { cwd: "/repo", includeArchived: true, limit: 20 } },
			{ method: "session/import-jsonl", params: { content: "{}\n", cwd: "/repo", overwrite: true } },
			{ method: "session/export-jsonl", params: { sessionId: "session-1" } },
			{ method: "session/export-html", params: { sessionId: "session-1" } },
			{ method: "session/resume", params: { sessionId: "session-1", prompt: "continue" } },
			{ method: "session/fork", params: { sessionId: "session-1", cwd: "/repo" } },
			{ method: "session/rename", params: { sessionId: "session-1", name: "New name" } },
			{ method: "session/archive", params: { sessionId: "session-1", archived: true } },
			{ method: "session/delete", params: { sessionId: "session-1" } },
			{ method: "session/stats", params: { sessionId: "session-1" } },
			{ method: "session/tree", params: { rootSessionId: "session-1", includeArchived: false } },
		];
		for (const request of requests) {
			expect(Value.Check(ClientRequestSchema, { kind: "request", id: `req-${request.method}`, ...request })).toBe(
				true,
			);
		}
	});

	test("validates runtime control requests", () => {
		const requests = [
			{ method: "runtime/get-state", params: { sessionId: "session-1" } },
			{ method: "runtime/set-model", params: { sessionId: "session-1", provider: "openai", modelId: "gpt-5" } },
			{ method: "runtime/cycle-model", params: { sessionId: "session-1" } },
			{ method: "runtime/set-thinking", params: { sessionId: "session-1", level: "high" } },
			{ method: "runtime/cycle-thinking", params: { sessionId: "session-1" } },
			{ method: "runtime/set-tools", params: { sessionId: "session-1", tools: ["read", "grep"] } },
			{ method: "runtime/set-steering-mode", params: { sessionId: "session-1", mode: "one-at-a-time" } },
			{ method: "runtime/set-follow-up-mode", params: { sessionId: "session-1", mode: "all" } },
			{ method: "runtime/compact", params: { sessionId: "session-1", customInstructions: "keep plan" } },
			{ method: "runtime/abort", params: { sessionId: "session-1" } },
			{ method: "runtime/reload-resources", params: { sessionId: "session-1" } },
			{ method: "runtime/get-commands", params: { sessionId: "session-1" } },
			{ method: "runtime/get-keybindings", params: {} },
		];
		for (const request of requests) {
			expect(Value.Check(ClientRequestSchema, { kind: "request", id: `req-${request.method}`, ...request })).toBe(
				true,
			);
		}
	});

	test("rejects invalid GUI protocol values", () => {
		expect(
			Value.Check(ClientRequestSchema, {
				kind: "request",
				id: "req-bad-access",
				method: "access/set",
				params: { mode: "yolo" },
			}),
		).toBe(false);

		expect(
			Value.Check(ClientRequestSchema, {
				kind: "request",
				id: "req-bad-terminal",
				method: "terminal/resize",
				params: { terminalId: "terminal-1", cols: 5, rows: 2 },
			}),
		).toBe(false);

		expect(Value.Check(TerminalSnapshotSchema, terminalSnapshot({ id: "terminal-1", cols: 80, rows: 24 }))).toBe(
			false,
		);
		expect(Value.Check(TerminalSnapshotSchema, { terminalId: "terminal-1", cwd: "/tmp/project" })).toBe(false);
	});
});
