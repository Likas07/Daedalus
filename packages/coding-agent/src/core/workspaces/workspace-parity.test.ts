import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import workspaceCommands from "../../extensions/daedalus/workflow/workspaces/index.js";
import { type CreateAgentSessionRuntimeFactory, createAgentSessionRuntime } from "../agent-session-runtime.js";
import type { ExtensionAPI } from "../extensions/index.js";
import { SessionManager } from "../session-manager.js";
import { prepareSubagentWorkspace } from "../subagents/workspace-isolation.js";
import type { WorkspaceTarget } from "./types.js";

function tempDir(name: string): string {
	return mkdtempSync(join(tmpdir(), `daedalus-parity-${name}-`));
}

function target(cwd: string, id = "workspace-a"): WorkspaceTarget {
	return {
		id,
		name: id,
		cwd,
		projectRoot: cwd,
		isolationMode: "shared_cwd",
		branch: "main",
		validationStatus: "valid",
	};
}

function fakeSession(sessionManager: SessionManager) {
	return {
		sessionManager,
		sessionFile: sessionManager.getSessionFile(),
		isStreaming: false,
		pendingMessageCount: 0,
		dispose: () => undefined,
	} as never;
}

function loadWorkspaceCommands() {
	const commands = new Map<string, { handler: (args: string, ctx: any) => Promise<void> | void }>();
	workspaceCommands({
		registerCommand(name: string, options: { handler: (args: string, ctx: any) => Promise<void> | void }) {
			commands.set(name, options);
		},
	} as ExtensionAPI);
	return commands;
}

describe("workspace target cross-surface parity", () => {
	test("SDK/runtime creation preserves the same core WorkspaceTarget identity used by session metadata", async () => {
		const cwd = tempDir("sdk-runtime");
		const workspaceTarget = target(cwd, "sdk-runtime-target");
		const seen: Array<{ cwd: string; workspaceTarget?: WorkspaceTarget }> = [];
		const factory: CreateAgentSessionRuntimeFactory = async (options) => {
			seen.push({ cwd: options.cwd, workspaceTarget: options.workspaceTarget });
			return {
				session: fakeSession(options.sessionManager),
				services: {
					cwd: options.cwd,
					agentDir: options.agentDir,
					diagnostics: [],
					workspaceTarget: options.workspaceTarget,
				} as never,
				diagnostics: [],
				extensionsResult: {} as never,
			};
		};

		const runtime = await createAgentSessionRuntime(factory, {
			cwd: tempDir("wrong-cwd"),
			agentDir: join(cwd, ".daedalus"),
			sessionManager: SessionManager.create(cwd, join(cwd, ".daedalus", "sessions")),
			workspaceTarget,
			applyProcessCwd: false,
		});

		expect(runtime.cwd).toBe(cwd);
		expect(runtime.workspaceTarget).toEqual(workspaceTarget);
		expect(seen).toEqual([{ cwd, workspaceTarget }]);
		expect(runtime.session.sessionManager.getWorkspaceIdentity()?.workspace).toEqual(workspaceTarget);
	});

	test("TUI workspace command handlers display and switch through the runtime WorkspaceTarget API", async () => {
		const commands = loadWorkspaceCommands();
		const current = target("/repo", "current");
		const next = {
			...target("/repo/.daedalus/worktrees/feature", "feature"),
			isolationMode: "dedicated_worktree" as const,
			branch: "feature",
		};
		const notifications: string[] = [];
		const switches: unknown[] = [];

		await commands.get("workspace")?.handler("status", {
			workspaceTarget: current,
			getWorkspaceTarget: () => current,
			ui: { notify: (message: string) => notifications.push(message) },
		});
		await commands.get("worktree")?.handler("create feature HEAD", {
			ui: { notify: (message: string) => notifications.push(message) },
			switchWorkspaceTarget: async (input: unknown) => {
				switches.push(input);
				return { previousWorkspaceTarget: current, workspaceTarget: next };
			},
		});

		expect(notifications[0]).toContain("Active workspace");
		expect(notifications[0]).toContain(current.cwd);
		expect(switches).toEqual([{ mode: "create", branch: "feature", baseRef: "HEAD" }]);
		expect(notifications.at(-1)).toContain(next.cwd);
	});

	test("print/json startup metadata and RPC state use the runtime WorkspaceTarget field", () => {
		const printMode = readFileSync(resolve(import.meta.dir, "../../modes/print-mode.ts"), "utf8");
		const rpcMode = readFileSync(resolve(import.meta.dir, "../../modes/rpc/rpc-mode.ts"), "utf8");
		const rpcTypes = readFileSync(resolve(import.meta.dir, "../../modes/rpc/rpc-types.ts"), "utf8");

		expect(printMode).toContain("workspaceTarget: runtimeHost.workspaceTarget");
		expect(rpcMode).toContain("workspaceTarget: runtimeHost.workspaceTarget");
		expect(rpcMode).toContain("runtimeHost.switchWorkspaceTarget");
		expect(rpcTypes).toContain("workspaceTarget?: WorkspaceTarget");
	});

	test("RPC workspace switch and app-server adapter surfaces delegate to core WorkspaceTarget behavior", () => {
		const rpcMode = readFileSync(resolve(import.meta.dir, "../../modes/rpc/rpc-mode.ts"), "utf8");
		const appServerWorktreeService = readFileSync(
			resolve(import.meta.dir, "../../../../app-server/src/workspaces/worktree-service.ts"),
			"utf8",
		);

		expect(rpcMode).toContain('case "workspace_status"');
		expect(rpcMode).toContain('case "workspace_switch"');
		expect(rpcMode).toContain('case "workspace_create"');
		expect(appServerWorktreeService).toContain("WorkspaceService");
		expect(appServerWorktreeService).toContain("removeTarget(this.toCoreTarget");
		expect(appServerWorktreeService).toContain("Keep app-server allocation/idempotency here");
	});

	test("subagent isolation carries core WorkspaceTarget identity into isolated runs", async () => {
		const parent = tempDir("sub-parent");
		const child = tempDir("sub-child");
		const workspaceService = {
			resolveBaseTarget: () => ({ ...target(parent, "parent"), baseCommit: "base" }),
			resolveCurrentTarget: (cwd: string) => ({ ...target(cwd, "shared"), projectRoot: parent }),
			createIsolatedTarget: (options: { branch: string; baseRef?: string }) => ({
				...target(child, "child"),
				projectRoot: parent,
				isolationMode: "dedicated_worktree" as const,
				branch: options.branch,
				baseBranch: options.baseRef,
			}),
		} as never;

		const prepared = await prepareSubagentWorkspace({
			cwd: parent,
			runId: "run-1",
			workspaceService,
			request: {
				agent: { name: "worker", description: "Worker", systemPrompt: "work", source: "bundled" },
				parentSessionFile: join(parent, "session.jsonl"),
				goal: "g",
				assignment: "a",
				isolation: "worktree",
				baseBranch: "main",
				mergeBack: "patch",
			},
		});

		expect(prepared.cwd).toBe(child);
		expect(prepared.workspaceTarget?.cwd).toBe(child);
		expect(prepared.workspaceTarget?.projectRoot).toBe(parent);
		expect(prepared.workspaceTarget?.isolationMode).toBe("dedicated_worktree");
		expect(prepared.metadata?.workspaceTarget).toEqual(prepared.workspaceTarget);
		expect(prepared.metadata?.mergeBack).toBe("patch");
	});
});
