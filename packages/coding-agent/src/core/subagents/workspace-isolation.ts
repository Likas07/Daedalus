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

export async function prepareSubagentWorkspace(
	input: PrepareSubagentWorkspaceInput,
): Promise<PreparedSubagentWorkspace> {
	const isolation = resolveIsolation(input.request);
	const service = input.workspaceService ?? new WorkspaceService({ projectRoot: input.cwd });

	if (isolation === "worktree") {
		const base = service.resolveBaseTarget(input.request.baseBranch);
		const target = service.createIsolatedTarget({
			branch: branchName({
				request: input.request,
				runId: input.runId,
				parentBranch: base.branch ?? base.baseBranch,
			}),
			baseRef: input.request.baseBranch ?? base.branch ?? "HEAD",
			slug: `subagent-${input.request.agent.name}-${input.runId}`,
			name: `Subagent ${input.request.agent.name} ${input.runId}`,
		});
		const workspaceTarget: WorkspaceTarget = {
			...target,
			mergeBack: input.request.mergeBack
				? { strategy: input.request.mergeBack, baseBranch: input.request.baseBranch, status: "not_started" }
				: target.mergeBack,
		};
		return {
			cwd: workspaceTarget.cwd,
			workspaceTarget,
			metadata: {
				isolation,
				workspaceTarget,
				baseBranch: input.request.baseBranch,
				mergeBack: input.request.mergeBack,
			},
		};
	}

	if (isolation === "shared") {
		const workspaceTarget = service.resolveCurrentTarget(input.cwd);
		return { cwd: input.cwd, workspaceTarget, metadata: { isolation, workspaceTarget } };
	}

	return { cwd: input.cwd, metadata: { isolation } };
}
