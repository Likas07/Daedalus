import { type AppServerDatabase, appendEvent, type EventPayload } from "..";
import { projectRuntimeEvents } from "../persistence/projector";
import { listWorktrees, type WorktreeReadModel } from "../persistence/read-model";
import { git, gitStatus } from "./git";
import { ProjectService } from "./project-service";

export interface WorktreeServiceOptions {
	readonly database: AppServerDatabase;
}

export interface CreateWorktreeInput {
	readonly projectId: string;
	readonly branch: string;
	readonly path?: string;
	readonly baseBranch?: string;
}

export interface WorktreeLifecycleMetadata extends WorktreeReadModel {
	readonly upstream: string | null;
	readonly dirty: boolean;
	readonly dirtyCount: number;
	readonly activeSessionCount: number;
	readonly cleanupRequiresConfirmation: boolean;
}

export class WorktreeService {
	private readonly projects: ProjectService;
	constructor(private readonly options: WorktreeServiceOptions) {
		this.projects = new ProjectService(options);
	}

	async create(input: CreateWorktreeInput): Promise<WorktreeReadModel> {
		const project = this.projects.get(input.projectId);
		if (!project) throw new Error(`Unknown project: ${input.projectId}`);
		const path =
			input.path ?? `${project.path.replace(/[\\/]$/, "")}-${input.branch.replace(/[^A-Za-z0-9._-]/g, "-")}`;
		const args = ["worktree", "add", "-b", input.branch, path];
		if (input.baseBranch) args.push(input.baseBranch);
		await git(project.path, args);
		const worktreeId = `worktree-${crypto.randomUUID()}`;
		appendEvent(this.options.database, {
			streamId: `project:${input.projectId}`,
			type: "worktree/created",
			payload: {
				worktreeId,
				projectId: input.projectId,
				path,
				branch: input.branch,
				baseBranch: input.baseBranch ?? null,
				status: "active",
			} satisfies EventPayload,
		});
		projectRuntimeEvents(this.options.database);
		const worktree = listWorktrees(this.options.database, input.projectId).find((row) => row.id === worktreeId);
		if (!worktree) throw new Error(`Failed to project worktree: ${worktreeId}`);
		return worktree;
	}

	async gitList(
		projectId: string,
	): Promise<Array<{ readonly path: string; readonly branch: string | null; readonly head: string | null }>> {
		const project = this.projects.get(projectId);
		if (!project) throw new Error(`Unknown project: ${projectId}`);
		const { stdout } = await git(project.path, ["worktree", "list", "--porcelain"]);
		const entries: Array<{ path: string; branch: string | null; head: string | null }> = [];
		let current: { path?: string; branch?: string | null; head?: string | null } = {};
		for (const line of stdout.split("\n")) {
			if (line.startsWith("worktree ")) {
				if (current.path)
					entries.push({ path: current.path, branch: current.branch ?? null, head: current.head ?? null });
				current = { path: line.slice("worktree ".length) };
			} else if (line.startsWith("HEAD ")) current.head = line.slice(5);
			else if (line.startsWith("branch ")) current.branch = line.slice("branch refs/heads/".length);
		}
		if (current.path)
			entries.push({ path: current.path, branch: current.branch ?? null, head: current.head ?? null });
		return entries;
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
		options: { readonly confirm?: boolean; readonly force?: boolean } = {},
	): Promise<void> {
		const metadata = await this.metadata(worktreeId);
		if (metadata.cleanupRequiresConfirmation && !options.confirm && !options.force) {
			throw new Error(`Cleanup requires confirmation for dirty worktree ${worktreeId}`);
		}
		await this.remove(worktreeId, { force: options.force ?? metadata.dirty });
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
		return Promise.all(this.list(projectId).map((worktree) => this.withMetadata(worktree)));
	}

	private async withMetadata(worktree: WorktreeReadModel): Promise<WorktreeLifecycleMetadata> {
		const status = await gitStatus(worktree.path);
		return {
			...worktree,
			branch: status.branch ?? worktree.branch,
			upstream: status.upstream,
			dirty: status.files.length > 0,
			dirtyCount: status.files.length,
			activeSessionCount: 0,
			cleanupRequiresConfirmation: status.files.length > 0,
		};
	}
}
