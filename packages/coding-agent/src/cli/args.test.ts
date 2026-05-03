import { describe, expect, test } from "bun:test";
import { parseArgs } from "./args.js";

describe("parseArgs workspace flags", () => {
	test("parses workspace startup flags", () => {
		const args = parseArgs([
			"--project",
			"../repo",
			"--worktree",
			".daedalus/worktrees/feature",
			"--workspace-target",
			"feature",
			"--new-worktree",
			"agent/feature",
			"--confirm-base-checkout",
		]);

		expect(args.project).toBe("../repo");
		expect(args.worktree).toBe(".daedalus/worktrees/feature");
		expect(args.workspaceTarget).toBe("feature");
		expect(args.newWorktree).toBe("agent/feature");
		expect(args.confirmBaseCheckout).toBe(true);
	});
});
