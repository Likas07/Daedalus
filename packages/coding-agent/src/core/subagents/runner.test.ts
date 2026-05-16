import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getSubagentArtifactPaths } from "./artifacts.js";
import { SubagentRunner } from "./runner.js";
import type { SubagentDefinition } from "./types.js";

const agent: SubagentDefinition = {
	name: "worker",
	description: "Worker",
	systemPrompt: "work",
	source: "bundled",
	toolPolicy: { allowedTools: ["read"], writableGlobs: [], spawns: [] },
};

const git = (cwd: string, args: string[]) => {
	const r = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
	if (r.exitCode !== 0) throw new Error(r.stderr.toString());
	return r.stdout.toString().trim();
};
describe("SubagentRunner", () => {
	test("returns submitted result envelope", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "daedalus-runner-"));
		const runner = new SubagentRunner({
			cwd,
			createSession: async (options) => {
				options.onSubmit({ task: "task", status: "completed", summary: "done", output: "output" });
				return { prompt: async () => {}, waitForIdle: async () => {}, abort: async () => {}, dispose: () => {} };
			},
		});

		const taskBinding = {
			type: "plan-task" as const,
			planPath: "docs/plans/2026_05_15/example.plan.json",
			taskId: "task-3",
			taskTitle: "Task binding types",
			files: ["src/auth.ts"],
		};
		const result = await runner.run({
			agent,
			parentSessionFile: join(cwd, "parent.jsonl"),
			goal: "goal",
			assignment: "assignment",
			taskBinding,
		});
		expect(result.status).toBe("completed");
		expect(result.summary).toBe("done");
		expect(result.output).toBe("output");
		expect(result.taskBinding).toEqual(taskBinding);
		const meta = JSON.parse(
			await readFile(getSubagentArtifactPaths(join(cwd, "parent.jsonl"), result.runId).metaFile, "utf8"),
		);
		expect(meta.taskBinding).toEqual(taskBinding);
		expect(meta.data.taskBinding).toEqual(taskBinding);
		expect(result.reference).toMatchObject({
			resultId: result.resultId,
			agentId: "worker",
			status: "completed",
			summary: "done",
			note: `If you want the full output, use read_agent_result_output(${result.resultId}).`,
		});
		expect(JSON.stringify(result.reference)).not.toContain('"output"');
	});

	test("persists parent session lineage in returned result and run meta", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "daedalus-runner-lineage-"));
		const parentSessionFile = join(cwd, "parent.jsonl");
		const runner = new SubagentRunner({
			cwd,
			createSession: async (options) => {
				options.onSubmit({ task: "task", status: "completed", summary: "done", output: "output" });
				return { prompt: async () => {}, waitForIdle: async () => {}, abort: async () => {}, dispose: () => {} };
			},
		});

		const result = await runner.run({
			agent,
			parentSessionFile,
			goal: "goal",
			assignment: "assignment",
		});
		const meta = JSON.parse(
			await readFile(getSubagentArtifactPaths(parentSessionFile, result.runId).metaFile, "utf8"),
		);

		expect(result.parentSessionFile).toBe(parentSessionFile);
		expect(meta.parentSessionFile).toBe(parentSessionFile);
	});

	test("auto-applies patch merge-back for completed worktree subagents", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "daedalus-runner-merge-"));
		git(cwd, ["init", "-b", "main"]);
		git(cwd, ["config", "user.email", "test@example.com"]);
		git(cwd, ["config", "user.name", "Test"]);
		await writeFile(join(cwd, "base.txt"), "base\n");
		git(cwd, ["add", "."]);
		git(cwd, ["commit", "-m", "base"]);

		const runner = new SubagentRunner({
			cwd,
			createSession: async (options) => {
				await writeFile(join(options.workspace.cwd, "child.txt"), "child\n");
				options.onSubmit({ task: "task", status: "completed", summary: "done", output: "output" });
				return { prompt: async () => {}, waitForIdle: async () => {}, abort: async () => {}, dispose: () => {} };
			},
		});

		const result = await runner.run({
			agent,
			parentSessionFile: join(cwd, "parent.jsonl"),
			goal: "goal",
			assignment: "assignment",
			isolation: "worktree",
		});

		expect(result.status).toBe("completed");
		expect(result.mergeBack).toBe("patch");
		expect(result.mergeBackResult?.status).toBe("applied");
		expect(result.workspaceMetadata?.mergeBackArtifactPath).toBeTruthy();
		expect(await readFile(join(cwd, "child.txt"), "utf8")).toBe("child\n");
	});

	test("propagates and subtracts parent staged, unstaged, and untracked baseline", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "daedalus-runner-baseline-"));
		git(cwd, ["init", "-b", "main"]);
		git(cwd, ["config", "user.email", "test@example.com"]);
		git(cwd, ["config", "user.name", "Test"]);
		await writeFile(join(cwd, "base.txt"), "base\n");
		git(cwd, ["add", "."]);
		git(cwd, ["commit", "-m", "base"]);

		await writeFile(join(cwd, "base.txt"), "parent unstaged\n");
		await writeFile(join(cwd, "staged.txt"), "parent staged\n");
		git(cwd, ["add", "staged.txt"]);
		await writeFile(join(cwd, "untracked.txt"), "parent untracked\n");

		const seen: Record<string, string> = {};
		const runner = new SubagentRunner({
			cwd,
			createSession: async (options) => {
				seen.unstaged = await readFile(join(options.workspace.cwd, "base.txt"), "utf8");
				seen.staged = await readFile(join(options.workspace.cwd, "staged.txt"), "utf8");
				seen.untracked = await readFile(join(options.workspace.cwd, "untracked.txt"), "utf8");
				await writeFile(join(options.workspace.cwd, "child.txt"), "child delta\n");
				options.onSubmit({ task: "task", status: "completed", summary: "done", output: "output" });
				return { prompt: async () => {}, waitForIdle: async () => {}, abort: async () => {}, dispose: () => {} };
			},
		});

		const result = await runner.run({
			agent,
			parentSessionFile: join(cwd, "parent.jsonl"),
			goal: "goal",
			assignment: "assignment",
			isolation: "worktree",
		});

		expect(result.status).toBe("completed");
		expect(result.mergeBackResult?.status).toBe("applied");
		expect(seen.unstaged).toBe("parent unstaged\n");
		expect(seen.staged).toBe("parent staged\n");
		expect(seen.untracked).toBe("parent untracked\n");
		expect(await readFile(join(cwd, "base.txt"), "utf8")).toBe("parent unstaged\n");
		expect(await readFile(join(cwd, "staged.txt"), "utf8")).toBe("parent staged\n");
		expect(await readFile(join(cwd, "untracked.txt"), "utf8")).toBe("parent untracked\n");
		expect(await readFile(join(cwd, "child.txt"), "utf8")).toBe("child delta\n");

		const patch = await readFile(result.mergeBackResult?.artifactPath ?? "", "utf8");
		expect(patch).toContain("child.txt");
		expect(patch).not.toContain("base.txt");
		expect(patch).not.toContain("staged.txt");
		expect(patch).not.toContain("untracked.txt");
	});

	test("branch merge-back blocks when a dirty parent baseline overlaps task files", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "daedalus-runner-branch-baseline-"));
		git(cwd, ["init", "-b", "main"]);
		git(cwd, ["config", "user.email", "test@example.com"]);
		git(cwd, ["config", "user.name", "Test"]);
		await writeFile(join(cwd, "base.txt"), "base\n");
		git(cwd, ["add", "."]);
		git(cwd, ["commit", "-m", "base"]);
		await writeFile(join(cwd, "base.txt"), "parent baseline\n");

		const runner = new SubagentRunner({
			cwd,
			createSession: async (options) => {
				expect(await readFile(join(options.workspace.cwd, "base.txt"), "utf8")).toBe("parent baseline\n");
				await writeFile(join(options.workspace.cwd, "base.txt"), "child branch delta\n");
				options.onSubmit({ task: "task", status: "completed", summary: "done", output: "output" });
				return { prompt: async () => {}, waitForIdle: async () => {}, abort: async () => {}, dispose: () => {} };
			},
		});

		const result = await runner.run({
			agent,
			parentSessionFile: join(cwd, "parent.jsonl"),
			goal: "goal",
			assignment: "assignment",
			isolation: "worktree",
			mergeBack: "branch",
		});

		expect(result.status).toBe("blocked");
		expect(result.mergeBack).toBe("branch");
		expect(result.mergeBackResult?.status).toBe("blocked");
		expect(result.mergeBackResult?.branchName).toBeTruthy();
		expect(result.workspaceMetadata?.mergeBackArtifactPath).toBeTruthy();
		expect(await readFile(join(cwd, "base.txt"), "utf8")).toBe("parent baseline\n");
		expect(git(cwd, ["rev-parse", "--verify", result.mergeBackResult?.branchName ?? ""])).toBeTruthy();
	});
});

test("returns blocked degraded sidecar when subagent never submits", async () => {
	const cwd = mkdtempSync(join(tmpdir(), "daedalus-runner-degraded-"));
	const prompts: string[] = [];
	const runner = new SubagentRunner({
		cwd,
		createSession: async () => {
			return {
				prompt: async (text) => {
					prompts.push(text);
				},
				waitForIdle: async () => {},
				abort: async () => {},
				dispose: () => {},
			};
		},
	});

	const result = await runner.run({
		agent,
		parentSessionFile: join(cwd, "parent.jsonl"),
		goal: "goal",
		assignment: "assignment",
	});

	expect(result.status).toBe("blocked");
	expect(result.summary).toBe("Degraded subagent result preserved: no valid submit_result envelope was received.");
	expect(result.reference).toMatchObject({ status: "blocked", summary: result.summary });
	expect(result.resultArtifactPath).toBeTruthy();
	expect(result.degraded).toEqual({
		reason: "no-valid-submit-result",
		validationErrors: [],
		invalidSubmitAttempts: 0,
		childSessionFile: result.childSessionFile,
	});
	expect(prompts).toHaveLength(3);
	const sidecar = JSON.parse(await readFile(result.resultArtifactPath ?? "", "utf8"));
	expect(sidecar).toMatchObject({
		resultId: result.resultId,
		agentId: "worker",
		status: "blocked",
		degraded: result.degraded,
	});
	const output = JSON.parse(sidecar.output);
	expect(output).toMatchObject({
		degraded: true,
		reason: "no-valid-submit-result",
		childSessionFile: result.childSessionFile,
		validationErrors: [],
		invalidSubmitAttempts: 0,
	});
	expect(output.recentActivity).toEqual(result.recentActivity);
});

test("records rejected submit attempts in degraded fallback", async () => {
	const cwd = mkdtempSync(join(tmpdir(), "daedalus-runner-rejected-"));
	const runner = new SubagentRunner({
		cwd,
		createSession: async (options) => {
			options.onInvalidSubmit?.({
				rawParams: { task: "task", status: "failed", summary: "bad", output: "output" },
				error: "Invalid status",
				repairs: [],
				attempt: 1,
				maxAttempts: 3,
			});
			return { prompt: async () => {}, waitForIdle: async () => {}, abort: async () => {}, dispose: () => {} };
		},
	});

	const result = await runner.run({
		agent,
		parentSessionFile: join(cwd, "parent.jsonl"),
		goal: "goal",
		assignment: "assignment",
	});

	expect(result.status).toBe("blocked");
	expect(result.degraded?.invalidSubmitAttempts).toBe(1);
	expect(result.degraded?.validationErrors).toEqual(["Invalid status"]);
	expect(result.degraded?.lastRejectedSubmit).toMatchObject({ error: "Invalid status", attempt: 1 });
	const output = JSON.parse(result.output ?? "{}");
	expect(output).toMatchObject({
		degraded: true,
		reason: "no-valid-submit-result",
		invalidSubmitAttempts: 1,
		validationErrors: ["Invalid status"],
	});
	const sidecar = JSON.parse(await readFile(result.resultArtifactPath ?? "", "utf8"));
	expect(sidecar.degraded.lastRejectedSubmit).toMatchObject({ error: "Invalid status", attempt: 1 });
});
