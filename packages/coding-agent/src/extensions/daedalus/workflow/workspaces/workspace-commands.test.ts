import { describe, expect, test } from "bun:test";
import type { ExtensionAPI } from "@daedalus-pi/coding-agent";
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
});
