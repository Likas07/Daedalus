import { describe, expect, it, vi } from "vitest";
import { createDaedalusGitAdapter, mapDaedalusThreadToWorktreeLabels } from "./daedalusGit";

describe("daedalusGit", () => {
	it("maps thread worktree metadata into branch and worktree labels", () => {
		expect(
			mapDaedalusThreadToWorktreeLabels({
				threadId: "thread-1",
				branch: "feature/gui",
				worktreePath: "/repo/.worktrees/gui",
			} as never),
		).toEqual({
			branch: "feature/gui",
			worktreePath: "/repo/.worktrees/gui",
			statusLabel: "Worktree",
		});
	});

	it("maps branch-only metadata", () => {
		expect(mapDaedalusThreadToWorktreeLabels({ branch: "main", worktreePath: null } as never)).toEqual({
			branch: "main",
			worktreePath: null,
			statusLabel: "Branch",
		});
	});

	it("gates unsupported Git and PR mutations without fake success", async () => {
		const adapter = createDaedalusGitAdapter({ request: vi.fn() } as never);

		await expect(adapter.push()).resolves.toMatchObject({ ok: false, capability: "git-push" });
		await expect(adapter.pull()).resolves.toMatchObject({ ok: false, capability: "git-remote-mutation" });
		await expect(adapter.createBranch()).resolves.toMatchObject({ ok: false, capability: "git-branch-mutation" });
		await expect(adapter.resolvePullRequest()).resolves.toMatchObject({
			ok: false,
			capability: "pull-request-mutation",
		});
	});

	it("passes approval-gated stage and unstage through to Daedalus", async () => {
		const request = vi.fn(async () => ({ ok: true }));
		const adapter = createDaedalusGitAdapter({ request } as never);

		await adapter.stage({ diffId: "project-1", paths: ["a.ts"] } as never);
		await adapter.unstage({ diffId: "project-1", paths: ["a.ts"] } as never);

		expect(request).toHaveBeenNthCalledWith(1, "git/stage", { diffId: "project-1", paths: ["a.ts"] });
		expect(request).toHaveBeenNthCalledWith(2, "git/unstage", { diffId: "project-1", paths: ["a.ts"] });
	});
});
