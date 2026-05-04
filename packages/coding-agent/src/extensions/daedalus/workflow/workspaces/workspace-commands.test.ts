import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@daedalus-pi/coding-agent";
import { AuthStorage } from "../../../../core/auth-storage.js";
import { ExtensionRunner } from "../../../../core/extensions/runner.js";
import { ModelRegistry } from "../../../../core/model-registry.js";
import { SessionManager } from "../../../../core/session-manager.js";
import type { WorkspaceTarget } from "../../../../core/workspaces/types.js";
import workspaceCommands from "./index.js";

function loadCommands() {
	const commands = new Map<string, any>();
	workspaceCommands({
		registerCommand(name: string, options: any) {
			commands.set(name, options);
		},
	} as ExtensionAPI);
	return commands;
}

const tempDirs: string[] = [];

function sh(cwd: string, args: string[]): string {
	const result = Bun.spawnSync(args, { cwd, stdout: "pipe", stderr: "pipe" });
	if (result.exitCode !== 0) throw new Error(result.stderr.toString());
	return result.stdout.toString().trim();
}

function tempRepo(): string {
	const dir = mkdtempSync(join(tmpdir(), "daedalus-worktree-command-"));
	tempDirs.push(dir);
	sh(dir, ["git", "init", "-b", "main"]);
	sh(dir, ["git", "config", "user.email", "test@example.com"]);
	sh(dir, ["git", "config", "user.name", "Test User"]);
	writeFileSync(join(dir, "README.md"), "hello\n");
	sh(dir, ["git", "add", "README.md"]);
	sh(dir, ["git", "commit", "-m", "initial"]);
	return realpathSync(dir);
}

afterEach(() => {
	for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
describe("workspace commands", () => {
	test("registers workspace and worktree commands", () => {
		const commands = loadCommands();
		expect(commands.has("workspace")).toBe(true);
		expect(commands.has("worktree")).toBe(true);
	});

	test("/workspace status reads current workspace target from context", async () => {
		const commands = loadCommands();
		const notifications: string[] = [];
		await commands.get("workspace").handler("status", {
			workspaceTarget: { cwd: "/repo", isolationMode: "shared_cwd", branch: "main" },
			ui: { notify: (message: string) => notifications.push(message) },
		});
		expect(notifications[0]).toContain("Active workspace");
		expect(notifications[0]).toContain("/repo");
	});

	test("/worktree create delegates to runtime workspace API", async () => {
		const commands = loadCommands();
		const calls: any[] = [];
		await commands.get("worktree").handler("create feature HEAD", {
			ui: { notify: () => undefined },
			switchWorkspaceTarget: async (input: any) => {
				calls.push(input);
				return {
					workspaceTarget: {
						cwd: "/repo/.daedalus/worktrees/feature",
						isolationMode: "dedicated_worktree",
						branch: "feature",
					},
				};
			},
		});
		expect(calls).toEqual([{ mode: "create", branch: "feature", baseRef: "HEAD" }]);
	});

	test("/worktree list displays path branch and head without switching API", async () => {
		const repo = tempRepo();
		const child = join(repo, ".daedalus", "worktrees", "list-child");
		sh(repo, ["git", "worktree", "add", "-b", "agent/list-child", child, "HEAD"]);
		const commands = loadCommands();
		const notifications: string[] = [];
		await commands.get("worktree").handler("list", {
			workspaceTarget: {
				cwd: repo,
				projectRoot: repo,
				repositoryRoot: repo,
				isolationMode: "shared_cwd",
				branch: "main",
			},
			ui: { notify: (message: string) => notifications.push(message) },
		});
		expect(notifications[0]).toContain("Git worktrees");
		expect(notifications[0]).toContain(repo);
		expect(notifications[0]).toContain(realpathSync(child));
		expect(notifications[0]).toContain("branch: main");
		expect(notifications[0]).toContain("branch: agent/list-child");
		expect(notifications[0]).toMatch(/head: [0-9a-f]{12}/);
	});

	test("/worktree list reports clearly when no workspace target is available", async () => {
		const commands = loadCommands();
		const notifications: Array<{ message: string; type?: string }> = [];
		await commands.get("worktree").handler("list", {
			ui: { notify: (message: string, type?: string) => notifications.push({ message, type }) },
		});
		expect(notifications[0]).toEqual({
			message: "No workspace target or project root is available for listing worktrees",
			type: "warning",
		});
	});

	test("ExtensionRunner exposes bound workspace switching actions to slash command contexts", async () => {
		const cwd = tempRepo();
		const sessionManager = SessionManager.create(cwd, join(cwd, ".daedalus", "sessions"));
		const runner = new ExtensionRunner(
			[],
			{} as any,
			cwd,
			sessionManager,
			ModelRegistry.inMemory(AuthStorage.inMemory()),
		);
		const current: WorkspaceTarget = { cwd, isolationMode: "shared_cwd", branch: "main" };
		const next: WorkspaceTarget = {
			cwd: join(cwd, ".daedalus", "worktrees", "feature"),
			isolationMode: "dedicated_worktree",
			branch: "feature",
		};
		const switches: unknown[] = [];

		runner.bindCommandContext({
			waitForIdle: async () => undefined,
			newSession: async () => ({ cancelled: false }),
			fork: async () => ({ cancelled: false }),
			navigateTree: async () => ({ cancelled: false }),
			switchSession: async () => ({ cancelled: false }),
			getWorkspaceTarget: () => current,
			switchWorkspaceTarget: async (input) => {
				switches.push(input);
				return { previousWorkspaceTarget: current, workspaceTarget: next };
			},
			reload: async () => undefined,
		});

		const ctx = runner.createCommandContext();
		expect(ctx.getWorkspaceTarget?.()).toEqual(current);
		expect(ctx.workspaceTarget).toEqual(current);
		await expect(ctx.switchWorkspaceTarget?.({ branch: "feature" })).resolves.toEqual({
			previousWorkspaceTarget: current,
			workspaceTarget: next,
		});
		expect(switches).toEqual([{ branch: "feature" }]);
	});

	test("/worktree without subcommand reports usage even when switching API is absent", async () => {
		const commands = loadCommands();
		const notifications: Array<{ message: string; type?: string }> = [];
		await commands.get("worktree").handler("", {
			ui: { notify: (message: string, type?: string) => notifications.push({ message, type }) },
		});
		expect(notifications[0]).toEqual({
			message: "Usage: /worktree list|enter|create|exit|cleanup",
			type: "error",
		});
	});

	test("/worktree cleanup does not require workspace switching API", async () => {
		const commands = loadCommands();
		const notifications: Array<{ message: string; type?: string }> = [];
		await commands.get("worktree").handler("cleanup --force", {
			workspaceTarget: { cwd: "/repo", isolationMode: "dedicated_worktree", branch: "feature" },
			ui: { notify: (message: string, type?: string) => notifications.push({ message, type }) },
		});
		expect(notifications[0]).toEqual({
			message: "Cleanup requested for /repo (force). Use SDK/RPC cleanup risk before removal.",
			type: "warning",
		});
	});

	test("/worktree enter and exit delegate to runtime workspace API", async () => {
		const commands = loadCommands();
		const calls: any[] = [];
		const current = {
			cwd: "/repo/.daedalus/worktrees/feature",
			projectRoot: "/repo",
			isolationMode: "dedicated_worktree",
			branch: "feature",
		};
		const resultTarget = { cwd: "/repo", isolationMode: "shared_cwd", branch: "main" };
		const ctx = {
			getWorkspaceTarget: () => current,
			ui: { notify: () => undefined },
			switchWorkspaceTarget: async (input: any) => {
				calls.push(input);
				return { workspaceTarget: resultTarget };
			},
		};

		await commands.get("worktree").handler("enter feature", ctx);
		await commands.get("worktree").handler("enter ./relative-worktree", ctx);
		await commands.get("worktree").handler("exit", ctx);

		expect(calls).toEqual([{ branch: "feature" }, { cwd: "./relative-worktree" }, { cwd: "/repo" }]);
	});
});
