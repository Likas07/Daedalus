import { lstat } from "node:fs/promises";
import { resolve } from "node:path";
import type { WorkflowRunsInTarget } from "@daedalus-pi/app-server-protocol";
import type { AppServerDatabase } from "..";
import { gitStatus, listGitWorktrees } from "./git";
import { ProjectService } from "./project-service";
import { assertPathWithinRoot } from "./root-boundary";
import { WorktreeService } from "./worktree-service";

export type WorktreeRecoveryAction = "repair" | "locate" | "archive";

export type WorktreeValidationResult =
	| { readonly status: "valid"; readonly runsIn: WorkflowRunsInTarget; readonly dirtyCount: number }
	| {
			readonly status: "needs-attention";
			readonly reason: string;
			readonly recoveryActions: readonly WorktreeRecoveryAction[];
	  };

export interface ValidateWorktreeTargetInput {
	readonly database: AppServerDatabase;
	readonly projectId: string;
	readonly worktreeId: string;
}

export async function validateWorktreeTarget(input: ValidateWorktreeTargetInput): Promise<WorktreeValidationResult> {
	const projects = new ProjectService({ database: input.database });
	const project = projects.get(input.projectId);
	if (!project) return needsAttention(`Unknown project: ${input.projectId}`, ["locate", "archive"]);

	const worktree = new WorktreeService({ database: input.database }).open(input.worktreeId);
	if (!worktree) return needsAttention(`Unknown worktree: ${input.worktreeId}`, ["locate", "archive"]);
	if (worktree.projectId !== input.projectId) {
		return needsAttention(`Worktree ${input.worktreeId} does not belong to project ${input.projectId}`, [
			"locate",
			"archive",
		]);
	}

	let projectCanonical: string;
	let worktreeCanonical: string;
	try {
		const scopedProject = await assertPathWithinRoot({
			root: project.path,
			candidate: project.path,
			purpose: "project",
			projectId: input.projectId,
		});
		projectCanonical = scopedProject.canonicalRootPath;
	} catch {
		return needsAttention(`Project path is missing: ${project.path}`, ["locate", "archive"]);
	}
	try {
		const stat = await lstat(worktree.path);
		if (stat.isSymbolicLink())
			return needsAttention(`Worktree path is a symlink: ${worktree.path}`, ["locate", "archive"]);
		const scopedWorktree = await assertPathWithinRoot({
			root: worktree.path,
			candidate: worktree.path,
			purpose: "worktree",
			projectId: input.projectId,
		});
		worktreeCanonical = scopedWorktree.canonicalRootPath;
	} catch {
		return needsAttention(`Worktree path is missing: ${worktree.path}`, ["locate", "archive"]);
	}

	let gitWorktrees: Awaited<ReturnType<typeof listGitWorktrees>>;
	try {
		gitWorktrees = await listGitWorktrees(projectCanonical);
	} catch (error) {
		return needsAttention(`Unable to list git worktrees: ${errorMessage(error)}`, ["repair", "locate"]);
	}
	const gitEntry = gitWorktrees.find((entry) => resolve(entry.path) === worktreeCanonical);
	if (!gitEntry) {
		return needsAttention(`Worktree path is not registered with git worktree list: ${worktree.path}`, [
			"repair",
			"locate",
			"archive",
		]);
	}
	if (worktree.branch && gitEntry.branch && gitEntry.branch !== worktree.branch) {
		return needsAttention(`Worktree branch mismatch: expected ${worktree.branch}, found ${gitEntry.branch}`, [
			"repair",
			"locate",
		]);
	}

	let status: Awaited<ReturnType<typeof gitStatus>>;
	try {
		status = await gitStatus(worktreeCanonical);
	} catch (error) {
		return needsAttention(`Unable to read worktree status: ${errorMessage(error)}`, ["repair", "locate"]);
	}
	if (worktree.branch && status.branch && status.branch !== worktree.branch) {
		return needsAttention(`Worktree branch mismatch: expected ${worktree.branch}, found ${status.branch}`, [
			"repair",
			"locate",
		]);
	}

	return {
		status: "valid",
		dirtyCount: status.files.length,
		runsIn: {
			projectId: input.projectId,
			worktreeId: input.worktreeId,
			path: worktree.path,
			canonicalPath: worktreeCanonical,
			branch: status.branch ?? gitEntry.branch ?? worktree.branch,
			isolationMode: "isolated-worktree",
			validationStatus: "valid",
		},
	};
}

function needsAttention(reason: string, recoveryActions: readonly WorktreeRecoveryAction[]): WorktreeValidationResult {
	return { status: "needs-attention", reason, recoveryActions };
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
