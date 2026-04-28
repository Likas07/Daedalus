import { access } from "node:fs/promises";
import { resolve } from "node:path";
import type { WorktreeConflictReason, WorktreeCreateOutcome } from "@daedalus-pi/app-server-protocol";
import { type AppServerDatabase, appendEvent, type EventPayload, readEvents } from "..";
import { projectRuntimeEvents } from "../persistence/projector";
import { listWorktrees, type WorktreeReadModel } from "../persistence/read-model";
import { git, gitStatus, listGitWorktrees } from "./git";
import { ProjectService } from "./project-service";
import {
	scanWorktreeCleanupRisk,
	validateCleanupConfirmationToken,
	type WorktreeCleanupRiskScan,
} from "./worktree-cleanup-risk";
import { createWorktreeInTransaction } from "./worktree-creation-transaction";

export interface WorktreeServiceOptions {
	readonly database: AppServerDatabase;
	readonly afterGitCreate?: (input: {
		readonly operationId: string;
		readonly path: string;
		readonly branch: string;
	}) => void | Promise<void>;
	readonly listActiveSessionIds?: (worktreeId: string) => readonly string[] | Promise<readonly string[]>;
	readonly listActiveTerminalIds?: (worktreeId: string) => readonly string[] | Promise<readonly string[]>;
}

export interface CreateWorktreeInput {
	readonly projectId: string;
	readonly branch: string;
	readonly path?: string;
	readonly baseBranch?: string;
	readonly operationId?: string;
}

export interface WorktreeLifecycleMetadata extends WorktreeReadModel {
	readonly upstream: string | null;
	readonly dirty: boolean;
	readonly dirtyCount: number;
	readonly activeSessionCount: number;
	readonly cleanupRequiresConfirmation: boolean;
	readonly cleanupRisk?: WorktreeCleanupRiskScan;
}

export class WorktreeService {
	private readonly projects: ProjectService;
	constructor(private readonly options: WorktreeServiceOptions) {
		this.projects = new ProjectService(options);
	}

	async create(input: CreateWorktreeInput): Promise<WorktreeLifecycleMetadata> {
		const project = this.projects.get(input.projectId);
		if (!project) throw new Error(`Unknown project: ${input.projectId}`);
		const target = await this.allocateTarget(project.path, input);
		await git(project.path, [
			"worktree",
			"add",
			"-b",
			target.branch,
			target.path,
			...(input.baseBranch ? [input.baseBranch] : []),
		]);
		return this.registerWorktree(input, target, input.operationId);
	}

	async createOrAdoptWorktree(input: CreateWorktreeInput): Promise<WorktreeCreateOutcome> {
		const project = this.projects.get(input.projectId);
		if (!project) throw new Error(`Unknown project: ${input.projectId}`);
		const operationId = input.operationId ?? `worktree-create-${crypto.randomUUID()}`;
		const operationWorktree = this.findWorktreeCreatedByOperation(input.projectId, operationId);
		if (operationWorktree) {
			return {
				outcome: "adopted-existing",
				worktree: await this.withMetadata(operationWorktree),
				operationId,
				reason: "operation already created this worktree",
			};
		}

		if (input.path) {
			const existing = await this.findExistingTarget(input.projectId, resolve(input.path), input.branch);
			if (existing.kind === "adopt") {
				return {
					outcome: "adopted-existing",
					worktree: await this.withMetadata(existing.worktree),
					operationId,
					reason: "exact path, branch, and project already exist",
				};
			}
			if (existing.kind === "conflict") {
				return {
					outcome: "conflict",
					reason: existing.reason,
					message: existing.message,
					operationId,
					existingPath: existing.existingPath,
					existingBranch: existing.existingBranch,
				};
			}
		}

		const target = await this.allocateTarget(project.path, input);
		const result = await createWorktreeInTransaction({
			projectPath: project.path,
			worktreePath: target.path,
			branch: target.branch,
			baseBranch: input.baseBranch,
			afterGitCreate: () => this.options.afterGitCreate?.({ operationId, path: target.path, branch: target.branch }),
		});
		if (!result.ok) {
			return {
				outcome: "rolled-back",
				message: result.rollbackError
					? `${result.message}; rollback failed: ${result.rollbackError}`
					: result.message,
				operationId,
				rollbackPath: result.rollbackPath,
			};
		}

		return { outcome: "created", worktree: await this.registerWorktree(input, target, operationId), operationId };
	}

	async gitList(
		projectId: string,
	): Promise<Array<{ readonly path: string; readonly branch: string | null; readonly head: string | null }>> {
		const project = this.projects.get(projectId);
		if (!project) throw new Error(`Unknown project: ${projectId}`);
		return listGitWorktrees(project.path);
	}

	open(worktreeId: string): WorktreeReadModel | undefined {
		projectRuntimeEvents(this.options.database);
		return listWorktrees(this.options.database).find((worktree) => worktree.id === worktreeId);
	}

	async metadata(worktreeId: string): Promise<WorktreeLifecycleMetadata> {
		const worktree = this.open(worktreeId);
		if (!worktree) throw new Error(`Unknown worktree: ${worktreeId}`);
		return this.withMetadata(worktree);
	}

	async switch(worktreeId: string): Promise<WorktreeLifecycleMetadata> {
		return this.metadata(worktreeId);
	}

	async cleanup(
		worktreeId: string,
		options: {
			readonly confirm?: boolean;
			readonly force?: boolean;
			readonly operationId?: string;
			readonly confirmationToken?: string;
		} = {},
	): Promise<void> {
		const scan = await this.cleanupRiskScan(worktreeId, options.operationId);
		if (scan.risky && !options.force) {
			const validToken = options.confirmationToken
				? validateCleanupConfirmationToken({
						token: options.confirmationToken,
						worktreeId,
						operationId: scan.operationId,
						riskHash: scan.riskHash,
					})
				: false;
			if (!validToken)
				throw new Error(`Cleanup requires a valid confirmation token for risky worktree ${worktreeId}`);
		}
		await this.remove(worktreeId, { force: options.force ?? scan.dirtyFiles.length > 0 });
	}

	async cleanupRiskScan(worktreeId: string, operationId?: string): Promise<WorktreeCleanupRiskScan> {
		const worktree = this.open(worktreeId);
		if (!worktree) throw new Error(`Unknown worktree: ${worktreeId}`);
		const [activeSessionIds, activeTerminalIds] = await Promise.all([
			this.activeSessionIds(worktreeId),
			this.activeTerminalIds(worktreeId),
		]);
		return scanWorktreeCleanupRisk({
			worktreeId,
			worktreePath: worktree.path,
			operationId,
			activeSessionIds,
			activeTerminalIds,
		});
	}

	async remove(worktreeId: string, options: { readonly force?: boolean } = {}): Promise<void> {
		const worktree = this.open(worktreeId);
		if (!worktree) throw new Error(`Unknown worktree: ${worktreeId}`);
		const project = this.projects.get(worktree.projectId);
		if (!project) throw new Error(`Unknown project: ${worktree.projectId}`);
		await git(project.path, ["worktree", "remove", ...(options.force ? ["--force"] : []), worktree.path]);
	}

	list(projectId?: string): WorktreeReadModel[] {
		projectRuntimeEvents(this.options.database);
		return listWorktrees(this.options.database, projectId);
	}

	async listMetadata(projectId?: string): Promise<WorktreeLifecycleMetadata[]> {
		const rows = this.list(projectId);
		const settled = await Promise.allSettled(rows.map((worktree) => this.withMetadata(worktree)));
		return settled.map((result, index) =>
			result.status === "fulfilled" ? result.value : this.fallbackMetadata(rows[index] as WorktreeReadModel),
		);
	}

	private async registerWorktree(
		input: CreateWorktreeInput,
		target: { readonly branch: string; readonly path: string },
		operationId?: string,
	): Promise<WorktreeLifecycleMetadata> {
		const worktreeId = `worktree-${crypto.randomUUID()}`;
		appendEvent(this.options.database, {
			streamId: `project:${input.projectId}`,
			type: "worktree/created",
			payload: {
				worktreeId,
				projectId: input.projectId,
				path: target.path,
				branch: target.branch,
				baseBranch: input.baseBranch ?? null,
				status: "active",
				operationId: operationId ?? null,
			} satisfies EventPayload,
		});
		projectRuntimeEvents(this.options.database);
		const worktree = listWorktrees(this.options.database, input.projectId).find((row) => row.id === worktreeId);
		if (!worktree) throw new Error(`Failed to project worktree: ${worktreeId}`);
		return this.withMetadata(worktree);
	}

	private findWorktreeCreatedByOperation(projectId: string, operationId: string): WorktreeReadModel | undefined {
		projectRuntimeEvents(this.options.database);
		const event = readEvents(this.options.database, { streamId: `project:${projectId}` })
			.filter((candidate) => candidate.type === "worktree/created")
			.find((candidate) => {
				const payload = candidate.payload;
				return (
					payload && typeof payload === "object" && !Array.isArray(payload) && payload.operationId === operationId
				);
			});
		if (!event?.payload || typeof event.payload !== "object" || Array.isArray(event.payload)) return undefined;
		const worktreeId = typeof event.payload.worktreeId === "string" ? event.payload.worktreeId : undefined;
		if (!worktreeId) return undefined;
		return listWorktrees(this.options.database, projectId).find((worktree) => worktree.id === worktreeId);
	}

	private async findExistingTarget(
		projectId: string,
		requestedPath: string,
		requestedBranch: string,
	): Promise<
		| { readonly kind: "none" }
		| { readonly kind: "adopt"; readonly worktree: WorktreeReadModel }
		| {
				readonly kind: "conflict";
				readonly reason: WorktreeConflictReason;
				readonly message: string;
				readonly existingPath?: string;
				readonly existingBranch?: string;
		  }
	> {
		projectRuntimeEvents(this.options.database);
		const allWorktrees = listWorktrees(this.options.database);
		const sameProject = allWorktrees.find(
			(worktree) =>
				worktree.projectId === projectId &&
				resolve(worktree.path) === requestedPath &&
				worktree.branch === requestedBranch,
		);
		if (sameProject) return { kind: "adopt", worktree: sameProject };

		const pathOwner = allWorktrees.find((worktree) => resolve(worktree.path) === requestedPath);
		if (pathOwner) {
			return {
				kind: "conflict",
				reason: "path-exists",
				message: `Worktree path is already registered for ${pathOwner.branch ?? "detached"}`,
				existingPath: pathOwner.path,
				existingBranch: pathOwner.branch ?? undefined,
			};
		}

		const project = this.projects.get(projectId);
		if (!project) throw new Error(`Unknown project: ${projectId}`);
		for (const entry of await listGitWorktrees(project.path)) {
			if (resolve(entry.path) === requestedPath && entry.branch === requestedBranch) {
				const registered = await this.registerWorktree(
					{ projectId, branch: requestedBranch, path: entry.path },
					{ branch: requestedBranch, path: entry.path },
				);
				return { kind: "adopt", worktree: registered };
			}
			if (resolve(entry.path) === requestedPath) {
				return {
					kind: "conflict",
					reason: "path-exists",
					message: `Git worktree path already exists for ${entry.branch ?? "detached"}`,
					existingPath: entry.path,
					existingBranch: entry.branch ?? undefined,
				};
			}
		}

		if (await pathExists(requestedPath)) {
			return {
				kind: "conflict",
				reason: "path-exists",
				message: `Path already exists: ${requestedPath}`,
				existingPath: requestedPath,
			};
		}

		const branchOwner = allWorktrees.find(
			(worktree) =>
				worktree.projectId === projectId &&
				worktree.branch === requestedBranch &&
				resolve(worktree.path) !== requestedPath,
		);
		if (branchOwner) {
			return {
				kind: "conflict",
				reason: "branch-exists",
				message: `Branch is already registered at ${branchOwner.path}`,
				existingPath: branchOwner.path,
				existingBranch: branchOwner.branch ?? undefined,
			};
		}

		const branches = await this.localBranches(project.path);
		if (branches.has(requestedBranch)) {
			return {
				kind: "conflict",
				reason: "branch-exists",
				message: `Branch already exists: ${requestedBranch}`,
				existingBranch: requestedBranch,
			};
		}

		return { kind: "none" };
	}

	private async allocateTarget(
		projectPath: string,
		input: CreateWorktreeInput,
	): Promise<{ readonly branch: string; readonly path: string }> {
		const branches = await this.localBranches(projectPath);
		const gitWorktrees = await listGitWorktrees(projectPath);
		for (const entry of gitWorktrees) {
			if (entry.branch) branches.add(entry.branch);
		}
		const knownPaths = new Set([
			...gitWorktrees.map((entry) => resolve(entry.path)),
			...listWorktrees(this.options.database, input.projectId).map((worktree) => resolve(worktree.path)),
		]);

		for (let suffix = 1; suffix <= 1000; suffix++) {
			const branch = suffix === 1 ? input.branch : suffixName(input.branch, suffix);
			const path = input.path ? suffixPath(input.path, suffix) : defaultWorktreePath(projectPath, branch);
			if (branches.has(branch) || knownPaths.has(resolve(path)) || (await pathExists(path))) continue;
			return { branch, path };
		}

		throw new Error(`Unable to allocate unique worktree target for branch ${input.branch}`);
	}

	private async localBranches(projectPath: string): Promise<Set<string>> {
		const result = await git(projectPath, ["for-each-ref", "--format=%(refname:short)", "refs/heads"]);
		return new Set(result.stdout.split("\n").filter(Boolean));
	}

	private async withMetadata(worktree: WorktreeReadModel): Promise<WorktreeLifecycleMetadata> {
		const [status, activeSessionIds, activeTerminalIds] = await Promise.all([
			gitStatus(worktree.path),
			this.activeSessionIds(worktree.id),
			this.activeTerminalIds(worktree.id),
		]);
		const cleanupRisk = await scanWorktreeCleanupRisk({
			worktreeId: worktree.id,
			worktreePath: worktree.path,
			status,
			activeSessionIds,
			activeTerminalIds,
		});
		return {
			...worktree,
			branch: status.branch ?? worktree.branch,
			upstream: status.upstream,
			dirty: cleanupRisk.dirtyFiles.length > 0,
			dirtyCount: cleanupRisk.dirtyFiles.length,
			activeSessionCount: cleanupRisk.activeSessionIds.length,
			cleanupRequiresConfirmation: cleanupRisk.risky,
			cleanupRisk,
		};
	}

	private activeSessionIds(worktreeId: string): Promise<readonly string[]> | readonly string[] {
		return this.options.listActiveSessionIds?.(worktreeId) ?? [];
	}

	private activeTerminalIds(worktreeId: string): Promise<readonly string[]> | readonly string[] {
		return this.options.listActiveTerminalIds?.(worktreeId) ?? [];
	}

	private fallbackMetadata(worktree: WorktreeReadModel): WorktreeLifecycleMetadata {
		return {
			...worktree,
			upstream: null,
			dirty: false,
			dirtyCount: 0,
			activeSessionCount: 0,
			cleanupRequiresConfirmation: false,
		};
	}
}

function defaultWorktreePath(projectPath: string, branch: string): string {
	return `${projectPath.replace(/[\\/]$/, "")}-${branch.replace(/[^A-Za-z0-9._-]/g, "-")}`;
}

function suffixName(value: string, suffix: number): string {
	return `${value}-${suffix}`;
}

function suffixPath(path: string, suffix: number): string {
	return suffix === 1 ? path : `${path}-${suffix}`;
}

async function pathExists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}
