import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WorkspaceTarget } from "../workspaces/types.js";
import { WorkspaceService } from "../workspaces/workspace-service.js";
import { buildChildBranchName } from "./branch-isolation.js";
import type { SubagentRunRequest, SubagentWorkspaceIsolation, SubagentWorkspaceMetadata } from "./types.js";

export interface PrepareSubagentWorkspaceInput {
	request: SubagentRunRequest;
	runId: string;
	cwd: string;
	workspaceService?: WorkspaceService;
}

export interface PreparedSubagentWorkspace {
	cwd: string;
	workspaceTarget?: WorkspaceTarget;
	metadata?: SubagentWorkspaceMetadata;
}

function resolveIsolation(request: SubagentRunRequest): SubagentWorkspaceIsolation {
	if (request.isolation) return request.isolation;
	if (request.isolationMode === "child-branch") return "worktree";
	if (request.isolationMode === "shared-branch") return "shared";
	return request.agent.isolationPreference === "child-branch" ? "worktree" : "inherit";
}

function branchName(input: { request: SubagentRunRequest; runId: string; parentBranch?: string }): string {
	const explicit = input.request.baseBranch;
	const template = input.request.branchTemplate ?? "daedalus/subagents/{parentBranch}/{agent}-{runId}";
	return buildChildBranchName({
		parentBranch: explicit ?? input.parentBranch ?? "HEAD",
		agent: input.request.agent.name,
		runId: input.runId,
		template,
	});
}

function resolveMergeBack(input: {
	request: SubagentRunRequest;
	isolation: SubagentWorkspaceIsolation;
}): SubagentRunRequest["mergeBack"] {
	if (input.request.mergeBack) return input.request.mergeBack;
	return input.isolation === "worktree" ? "patch" : undefined;
}

function runGit(
	cwd: string,
	args: string[],
	input?: string,
	env?: Record<string, string>,
): { ok: boolean; stdout: string; stderr: string } {
	const result = Bun.spawnSync(["git", ...args], {
		cwd,
		env: env ? { ...process.env, ...env } : undefined,
		stdin: input === undefined ? undefined : new TextEncoder().encode(input),
		stdout: "pipe",
		stderr: "pipe",
	});
	return { ok: result.exitCode === 0, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
}

function filesFromPatch(text: string): string[] {
	const files = new Set<string>();
	for (const line of text.split("\n")) {
		const match = /^diff --git a\/(.*) b\/(.*)$/.exec(line);
		if (match) files.add(match[2] || match[1]);
	}
	return [...files];
}

interface ParentBaseline {
	patch: string;
	files: string[];
}

async function captureParentBaseline(cwd: string, baseRef: string): Promise<ParentBaseline> {
	const tempIndex = join(tmpdir(), `daedalus-parent-baseline-${randomUUID()}`);
	try {
		const readTree = runGit(cwd, ["read-tree", baseRef], undefined, { GIT_INDEX_FILE: tempIndex });
		if (!readTree.ok) return { patch: "", files: [] };

		const add = runGit(cwd, ["add", "-A", "--", "."], undefined, { GIT_INDEX_FILE: tempIndex });
		if (!add.ok) return { patch: "", files: [] };

		const diff = runGit(cwd, ["diff", "--cached", "--binary", baseRef, "--"], undefined, {
			GIT_INDEX_FILE: tempIndex,
		});
		if (!diff.ok) return { patch: "", files: [] };
		return { patch: diff.stdout, files: filesFromPatch(diff.stdout) };
	} finally {
		await fs.rm(tempIndex, { force: true });
	}
}

function applyParentBaseline(cwd: string, baseline: ParentBaseline): void {
	if (!baseline.patch.trim()) return;
	const applied = runGit(cwd, ["apply", "--binary"], baseline.patch);
	if (!applied.ok) throw new Error(applied.stderr.trim() || "Failed to apply parent baseline to child worktree");
}

export async function prepareSubagentWorkspace(
	input: PrepareSubagentWorkspaceInput,
): Promise<PreparedSubagentWorkspace> {
	const isolation = resolveIsolation(input.request);
	const service = input.workspaceService ?? new WorkspaceService({ projectRoot: input.cwd });
	const mergeBack = resolveMergeBack({ request: input.request, isolation });

	if (isolation === "worktree") {
		const base = service.resolveBaseTarget(input.request.baseBranch);
		const baseRef = input.request.baseBranch ?? base.branch ?? "HEAD";
		const baseline = await captureParentBaseline(input.cwd, base.baseCommit ?? baseRef);
		const target = service.createIsolatedTarget({
			branch: branchName({
				request: input.request,
				runId: input.runId,
				parentBranch: base.branch ?? base.baseBranch,
			}),
			baseRef,
			slug: `subagent-${input.request.agent.name}-${input.runId}`,
			name: `Subagent ${input.request.agent.name} ${input.runId}`,
			setup: input.request.setupWorktree ?? true,
			includeIgnored: input.request.includeIgnored ?? true,
		});
		applyParentBaseline(target.cwd, baseline);
		const workspaceTarget: WorkspaceTarget = {
			...target,
			mergeBack: mergeBack
				? {
						strategy: mergeBack,
						baseBranch: target.baseBranch ?? input.request.baseBranch,
						baseCommit: target.baseCommit,
						parentBaselinePatch: baseline.patch || undefined,
						parentBaselineFiles: baseline.files,
						status: "not_started",
					}
				: target.mergeBack,
		};
		return {
			cwd: workspaceTarget.cwd,
			workspaceTarget,
			metadata: {
				isolation,
				workspaceTarget,
				baseBranch: workspaceTarget.baseBranch ?? input.request.baseBranch,
				baseCommit: workspaceTarget.baseCommit,
				mergeBack,
			},
		};
	}

	if (isolation === "shared") {
		const workspaceTarget = service.resolveCurrentTarget(input.cwd);
		return { cwd: input.cwd, workspaceTarget, metadata: { isolation, workspaceTarget } };
	}

	return { cwd: input.cwd, metadata: { isolation } };
}
