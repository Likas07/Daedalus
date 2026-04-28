import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitMutationDeniedError, GitMutationService, type GitRunner } from "./git-mutation-service";

function service(decision: "approved" | "denied" = "approved") {
	const commands: string[][] = [];
	const approval = { approvalId: "a1", autoApproved: false };
	return {
		commands,
		service: new GitMutationService({
			approvalService: {
				request: () => approval,
				waitForDecision: async () => ({ approvalId: "a1", decision }),
			} as never,
			diffService: {
				get: async () => ({
					branch: "main",
					upstream: null,
					ahead: 0,
					behind: 0,
					stagedCount: 0,
					unstagedCount: 0,
					files: [],
					riskyGroups: [],
					patch: "",
				}),
			} as never,
			git: (async (_cwd, args) => {
				commands.push([...args]);
			}) as GitRunner,
		}),
	};
}

describe("GitMutationService", () => {
	test("stage, discard, and commit use argument-array git commands after approval", async () => {
		const harness = service();
		const cwd = await repo();
		await harness.service.stage({ cwd, paths: ["src/a.ts"] });
		await harness.service.discard({ cwd, paths: ["src/a.ts"] });
		await harness.service.commit({ cwd, message: "save work" });
		expect(harness.commands).toEqual([
			["add", "--", "src/a.ts"],
			["restore", "--worktree", "--", "src/a.ts"],
			["commit", "-m", "save work"],
		]);
	});

	test("deny prevents mutation", async () => {
		const harness = service("denied");
		const cwd = await repo();
		await expect(harness.service.stage({ cwd, paths: ["src/a.ts"] })).rejects.toBeInstanceOf(GitMutationDeniedError);
		expect(harness.commands).toEqual([]);
	});

	test("commit requires non-empty message", async () => {
		const harness = service();
		await expect(harness.service.commit({ cwd: "/repo", message: "  " })).rejects.toThrow(
			"Commit message is required.",
		);
		expect(harness.commands).toEqual([]);
	});

	test("rejects paths outside the git root before requesting approval", async () => {
		const cwd = await repo();
		const harness = service();
		await expect(harness.service.stage({ cwd, paths: ["../outside.ts"] })).rejects.toThrow(
			"git/stage target is outside root",
		);
		expect(harness.commands).toEqual([]);
	});
});

async function repo(): Promise<string> {
	const cwd = await mkdtemp(join(tmpdir(), "daedalus-git-mutation-"));
	await mkdir(join(cwd, "src"), { recursive: true });
	return cwd;
}
