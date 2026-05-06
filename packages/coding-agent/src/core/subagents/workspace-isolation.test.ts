import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionManager } from "../session-manager.js";
import { createSubagentTools } from "./policy.js";
import { type CreateSubagentSessionOptions, SubagentRunner } from "./runner.js";
import type { SubagentDefinition } from "./types.js";
import { prepareSubagentWorkspace } from "./workspace-isolation.js";

const agent: SubagentDefinition = {
	name: "worker",
	description: "Worker",
	systemPrompt: "work",
	source: "bundled",
	tools: ["bash", "read", "ls"],
	toolPolicy: { allowedTools: ["bash", "read", "ls"], writableGlobs: [], spawns: [] },
};

function tempDir(name: string): string {
	return mkdtempSync(join(tmpdir(), `daedalus-${name}-`));
}

function fakeWorkspaceService(
	parent: string,
	child: string,
	onCreate?: (options: { branch: string; baseRef?: string; setup?: boolean; includeIgnored?: boolean }) => void,
) {
	return {
		resolveBaseTarget: () => ({
			cwd: parent,
			projectRoot: parent,
			isolationMode: "shared_cwd",
			branch: "main",
			baseCommit: "base",
			validationStatus: "valid",
		}),
		resolveCurrentTarget: (cwd: string) => ({
			cwd,
			projectRoot: parent,
			isolationMode: "shared_cwd",
			branch: "main",
			baseCommit: "head",
			validationStatus: "valid",
		}),
		createIsolatedTarget: (options: {
			branch: string;
			baseRef?: string;
			setup?: boolean;
			includeIgnored?: boolean;
		}) => {
			onCreate?.(options);
			return {
				cwd: child,
				projectRoot: parent,
				isolationMode: "dedicated_worktree",
				branch: options.branch,
				baseBranch: options.baseRef,
				baseCommit: "base",
				validationStatus: "valid",
			};
		},
	} as any;
}

describe("subagent workspace isolation", () => {
	test("isolation:'worktree' prepares a dedicated WorkspaceTarget", async () => {
		const parent = tempDir("parent");
		const child = tempDir("child");
		const prepared = await prepareSubagentWorkspace({
			cwd: parent,
			runId: "abc123",
			workspaceService: fakeWorkspaceService(parent, child),
			request: {
				agent,
				parentSessionFile: join(parent, "parent.jsonl"),
				goal: "g",
				assignment: "a",
				isolation: "worktree",
				baseBranch: "main",
				mergeBack: "branch",
			},
		});

		expect(prepared.cwd).toBe(child);
		expect(prepared.workspaceTarget?.cwd).toBe(child);
		expect(prepared.workspaceTarget?.isolationMode).toBe("dedicated_worktree");
		expect(prepared.metadata?.isolation).toBe("worktree");
		expect(prepared.metadata?.mergeBack).toBe("branch");
	});

	test("worktree isolation defaults omitted mergeBack to patch", async () => {
		const parent = tempDir("default-parent");
		const child = tempDir("default-child");
		const prepared = await prepareSubagentWorkspace({
			cwd: parent,
			runId: "def123",
			workspaceService: fakeWorkspaceService(parent, child),
			request: {
				agent,
				parentSessionFile: join(parent, "parent.jsonl"),
				goal: "g",
				assignment: "a",
				isolation: "worktree",
			},
		});

		expect(prepared.metadata?.mergeBack).toBe("patch");
		expect(prepared.workspaceTarget?.mergeBack?.strategy).toBe("patch");
	});

	test("worktree setup options default to true", async () => {
		const parent = tempDir("setup-default-parent");
		const child = tempDir("setup-default-child");
		let createOptions: { setup?: boolean; includeIgnored?: boolean } | undefined;
		await prepareSubagentWorkspace({
			cwd: parent,
			runId: "setup-default",
			workspaceService: fakeWorkspaceService(parent, child, (options) => {
				createOptions = options;
			}),
			request: {
				agent,
				parentSessionFile: join(parent, "parent.jsonl"),
				goal: "g",
				assignment: "a",
				isolation: "worktree",
			},
		});

		expect(createOptions?.setup).toBe(true);
		expect(createOptions?.includeIgnored).toBe(true);
	});

	test("worktree setup options support explicit false overrides", async () => {
		const parent = tempDir("setup-false-parent");
		const child = tempDir("setup-false-child");
		let createOptions: { setup?: boolean; includeIgnored?: boolean } | undefined;
		await prepareSubagentWorkspace({
			cwd: parent,
			runId: "setup-false",
			workspaceService: fakeWorkspaceService(parent, child, (options) => {
				createOptions = options;
			}),
			request: {
				agent,
				parentSessionFile: join(parent, "parent.jsonl"),
				goal: "g",
				assignment: "a",
				isolation: "worktree",
				setupWorktree: false,
				includeIgnored: false,
			},
		});

		expect(createOptions?.setup).toBe(false);
		expect(createOptions?.includeIgnored).toBe(false);
	});

	test("worktree target is passed to child SessionManager cwd, nested agent cwd, and tool cwd", async () => {
		const parent = tempDir("runner-parent");
		const child = tempDir("runner-child");
		const seen: { sessionManagerCwd?: string; nestedCwd?: string; toolCwd?: string; workspaceCwd?: string } = {};
		const runner = new SubagentRunner({
			cwd: parent,
			workspaceService: fakeWorkspaceService(parent, child),
			createSession: async (options: CreateSubagentSessionOptions) => {
				seen.workspaceCwd = options.workspace.workspaceTarget?.cwd;
				const sessionManager = SessionManager.create(options.workspace.cwd, join(parent, ".sessions"));
				seen.sessionManagerCwd = sessionManager.getCwd();
				seen.nestedCwd = options.workspace.cwd;
				const bash = createSubagentTools(options.workspace.cwd, {
					allowedTools: ["bash"],
					writableGlobs: [],
					spawns: [],
				}).find((tool) => tool.name === "bash");
				const result = await bash?.execute(
					"tool",
					{ command: "pwd" } as never,
					new AbortController().signal,
					undefined,
				);
				seen.toolCwd = String((result as any)?.output ?? (result as any)?.content?.[0]?.text ?? "").trim();
				options.onSubmit({ task: "g", status: "completed", summary: "done", output: "ok" });
				return { prompt: async () => {}, waitForIdle: async () => {}, abort: async () => {}, dispose: () => {} };
			},
		});

		const result = await runner.run({
			agent,
			parentSessionFile: join(parent, "parent.jsonl"),
			goal: "g",
			assignment: "a",
			isolation: "worktree",
			mergeBack: "patch",
		});
		expect(result.workspaceTarget?.cwd).toBe(child);
		expect(seen.workspaceCwd).toBe(child);
		expect(seen.sessionManagerCwd).toBe(child);
		expect(seen.nestedCwd).toBe(child);
		expect(seen.toolCwd).toContain(child);
	});

	test("inherit and shared behavior remain available", async () => {
		const parent = tempDir("shared");
		const child = tempDir("unused-child");
		const service = fakeWorkspaceService(parent, child);
		const inherited = await prepareSubagentWorkspace({
			cwd: parent,
			runId: "r1",
			workspaceService: service,
			request: { agent, parentSessionFile: join(parent, "p"), goal: "g", assignment: "a", isolation: "inherit" },
		});
		const shared = await prepareSubagentWorkspace({
			cwd: parent,
			runId: "r2",
			workspaceService: service,
			request: { agent, parentSessionFile: join(parent, "p"), goal: "g", assignment: "a", isolation: "shared" },
		});
		const legacy = await prepareSubagentWorkspace({
			cwd: parent,
			runId: "r3",
			workspaceService: service,
			request: {
				agent,
				parentSessionFile: join(parent, "p"),
				goal: "g",
				assignment: "a",
				isolationMode: "shared-branch",
			},
		});

		expect(inherited.cwd).toBe(parent);
		expect(inherited.workspaceTarget).toBeUndefined();
		expect(shared.cwd).toBe(parent);
		expect(shared.workspaceTarget?.cwd).toBe(parent);
		expect(legacy.metadata?.isolation).toBe("shared");
	});
});
