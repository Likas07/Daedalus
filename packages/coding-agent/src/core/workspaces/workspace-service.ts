import { existsSync, mkdirSync, realpathSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
	GitError,
	type GitWorktreeEntry,
	gitConfigSet,
	gitCurrentBranch,
	gitRepositoryRoot,
	gitRevParse,
	gitStatus,
	gitWorktreeAdd,
	gitWorktreeList,
	gitWorktreePrune,
	gitWorktreeRemove,
} from "./git.js";
import type { WorkspaceCleanupRisk, WorkspaceResumeValidation, WorkspaceTarget } from "./types.js";
import { runWorktreeSetup } from "./worktree-bootstrap.js";
import { createWorktreeMetadata, worktreeMetadataPath, writeWorktreeMetadata } from "./worktree-metadata.js";

export interface WorkspaceServiceOptions {
	projectRoot?: string;
}

export interface OpenWorkspaceTargetOptions {
	cwd?: string;
	branch?: string;
	id?: string;
}

export interface CreateIsolatedWorkspaceOptions {
	branch: string;
	baseRef?: string;
	mergeTarget?: string;
	slug?: string;
	id?: string;
	name?: string;
	setup?: boolean;
	includeIgnored?: boolean;
}

export interface FinalizeManagedWorktreeOptions {
	projectRoot: string;
	worktreePath: string;
	branch: string;
	baseRef: string;
	baseCommit: string;
	mergeTarget?: string;
	id?: string;
	name?: string;
	setup?: boolean;
	includeIgnored?: boolean;
}

function canonical(path: string): string {
	return realpathSync(path);
}

function slugify(value: string): string {
	return (
		value
			.toLowerCase()
			.replace(/[^a-z0-9._-]+/g, "-")
			.replace(/^-+|-+$/g, "") || "workspace"
	);
}

const notGitRepositoryPattern = /not a git repository|not a git worktree|rev-parse|fatal/i;

function isNotGitRepositoryError(error: unknown): boolean {
	return error instanceof GitError && notGitRepositoryPattern.test(error.stderr || error.message);
}

const missingRevisionPattern = /ambiguous argument|unknown revision|needed a single revision|bad revision/i;

function gitRevParseOptional(cwd: string, ref: string): string | undefined {
	try {
		return gitRevParse(cwd, ref);
	} catch (error) {
		if (error instanceof GitError && missingRevisionPattern.test(error.stderr || error.message)) return undefined;
		throw error;
	}
}

function workspaceDirtyStatus(porcelain: string): string {
	return porcelain
		.split("\n")
		.filter((line) => line && line !== "?? .daedalus/" && !line.endsWith(" .daedalus/worktree.json"))
		.join("\n");
}

export function finalizeManagedWorktree(options: FinalizeManagedWorktreeOptions): WorkspaceTarget {
	const projectRoot = canonical(options.projectRoot);
	const canonicalWorktreePath = canonical(options.worktreePath);
	gitConfigSet(canonicalWorktreePath, "push.autoSetupRemote", "true");
	writeWorktreeMetadata(
		canonicalWorktreePath,
		createWorktreeMetadata({
			branch: options.branch,
			baseRef: options.baseRef,
			baseCommit: options.baseCommit,
			mergeTarget: options.mergeTarget,
			setupStatus: options.setup === false ? "created" : "setup_pending",
		}),
	);
	if (options.setup !== false) {
		runWorktreeSetup({
			projectRoot,
			worktreePath: canonicalWorktreePath,
			includeIgnored: options.includeIgnored,
		});
	}
	return {
		id: options.id,
		name: options.name,
		cwd: canonicalWorktreePath,
		projectRoot,
		isolationMode: "dedicated_worktree",
		repositoryRoot: gitRepositoryRoot(canonicalWorktreePath),
		branch: options.branch,
		worktreePath: canonicalWorktreePath,
		baseBranch: options.baseRef,
		baseCommit: options.baseCommit,
		mergeBack: options.mergeTarget
			? {
					baseBranch: options.baseRef,
					baseCommit: options.baseCommit,
					targetBranch: options.mergeTarget,
					status: "not_started",
				}
			: undefined,
		setup: { status: options.setup === false ? "created" : "setup_complete" },
		validationStatus: "valid",
	};
}

export class WorkspaceService {
	readonly projectRoot: string;

	constructor(options: WorkspaceServiceOptions = {}) {
		this.projectRoot = canonical(options.projectRoot ?? process.cwd());
	}

	listWorktrees(): GitWorktreeEntry[] {
		return gitWorktreeList(this.projectRoot);
	}

	pruneStaleWorktrees(): void {
		gitWorktreePrune(this.projectRoot);
	}

	resolveCurrentTarget(cwd = process.cwd()): WorkspaceTarget {
		const actualCwd = canonical(cwd);
		let repositoryRoot: string;
		try {
			repositoryRoot = gitRepositoryRoot(actualCwd);
		} catch (error) {
			if (!isNotGitRepositoryError(error)) throw error;
			return {
				cwd: actualCwd,
				projectRoot: actualCwd,
				isolationMode: "detached",
				validationStatus: "valid",
			};
		}
		const branch = gitCurrentBranch(actualCwd);
		return {
			cwd: actualCwd,
			projectRoot: this.projectRoot,
			isolationMode: repositoryRoot === actualCwd ? "shared_cwd" : "external_worktree",
			repositoryRoot,
			branch,
			worktreePath: actualCwd,
			baseCommit: gitRevParseOptional(actualCwd, "HEAD"),
			validationStatus: "valid",
		};
	}

	resolveBaseTarget(baseBranch = gitCurrentBranch(this.projectRoot) ?? "HEAD"): WorkspaceTarget {
		return {
			...this.resolveCurrentTarget(this.projectRoot),
			baseBranch,
			baseCommit: gitRevParseOptional(this.projectRoot, baseBranch),
		};
	}

	openTarget(options: OpenWorkspaceTargetOptions): WorkspaceTarget {
		const worktrees = gitWorktreeList(this.projectRoot);
		const expectedPath = options.cwd ? canonical(options.cwd) : undefined;
		const entry = worktrees.find((candidate) => {
			if (expectedPath && candidate.path === expectedPath) return true;
			if (options.branch && candidate.branch === options.branch) return true;
			if (options.id && slugify(candidate.branch ?? candidate.path.split(/[\\/]/).pop() ?? "") === options.id)
				return true;
			return false;
		});
		if (!entry) throw new Error("No matching git worktree found");
		if (options.cwd && entry.path !== expectedPath) throw new Error("Workspace path does not match requested path");
		if (options.branch && entry.branch !== options.branch)
			throw new Error("Workspace branch does not match requested branch");
		return {
			id: options.id ?? slugify(entry.branch ?? entry.path.split(/[\\/]/).pop() ?? "workspace"),
			cwd: entry.path,
			projectRoot: this.projectRoot,
			isolationMode: entry.path === this.projectRoot ? "shared_cwd" : "external_worktree",
			repositoryRoot: gitRepositoryRoot(entry.path),
			branch: entry.branch,
			worktreePath: entry.path,
			baseCommit: entry.head,
			validationStatus: "valid",
			adoption: { adoptedFromPath: entry.path, adoptedAt: new Date().toISOString() },
		};
	}

	createIsolatedTarget(options: CreateIsolatedWorkspaceOptions): WorkspaceTarget {
		const slug = slugify(options.slug ?? options.branch);
		const worktreePath = resolve(this.projectRoot, ".daedalus", "worktrees", slug);
		const existing = gitWorktreeList(this.projectRoot);
		if (existing.some((entry) => entry.path === worktreePath) || existsSync(worktreePath))
			throw new Error(`Worktree path already exists: ${worktreePath}`);
		if (existing.some((entry) => entry.branch === options.branch))
			throw new Error(`Worktree branch already exists: ${options.branch}`);
		const baseRef = options.baseRef ?? "HEAD";
		const baseCommit = gitRevParse(this.projectRoot, baseRef);
		mkdirSync(dirname(worktreePath), { recursive: true });
		gitWorktreeAdd(this.projectRoot, worktreePath, options.branch, baseRef);
		return {
			...finalizeManagedWorktree({
				projectRoot: this.projectRoot,
				worktreePath,
				branch: options.branch,
				baseRef,
				baseCommit,
				mergeTarget: options.mergeTarget,
				id: options.id ?? slug,
				name: options.name,
				setup: options.setup,
				includeIgnored: options.includeIgnored,
			}),
		};
	}

	validateTarget(target: WorkspaceTarget): WorkspaceResumeValidation {
		if (!existsSync(target.cwd))
			return { status: "workspace_missing", valid: false, message: "Workspace directory is missing", target };
		const actualCwd = canonical(target.cwd);
		if (target.worktreePath && canonical(target.worktreePath) !== actualCwd)
			return { status: "cwd_mismatch", valid: false, message: "Workspace path moved", target, actualCwd };
		if (!target.branch)
			return {
				status: "resumable",
				valid: true,
				message: "Workspace is valid",
				target: { ...target, cwd: actualCwd },
			};
		const branch = gitCurrentBranch(actualCwd);
		if (branch !== target.branch)
			return { status: "invalid", valid: false, message: "Workspace branch mismatch", target, actualBranch: branch };
		return {
			status: "resumable",
			valid: true,
			message: "Workspace is valid",
			target: { ...target, cwd: actualCwd, branch },
		};
	}

	cleanupTargetRisk(target: WorkspaceTarget): WorkspaceCleanupRisk {
		if (!existsSync(target.cwd)) return { safe: true, level: "none", reasons: ["workspace missing"] };
		const status = gitStatus(target.cwd);
		const dirtyStatus = workspaceDirtyStatus(status.porcelain);
		if (dirtyStatus)
			return {
				safe: false,
				level: "dirty",
				reasons: ["workspace has uncommitted changes"],
				dirtyStatus,
			};
		const insideDaedalus = canonical(target.cwd).startsWith(join(this.projectRoot, ".daedalus", "worktrees"));
		return {
			safe: insideDaedalus,
			level: insideDaedalus ? "safe" : "external",
			reasons: insideDaedalus ? [] : ["workspace is outside managed worktree directory"],
		};
	}

	removeTarget(target: WorkspaceTarget, options: { force?: boolean } = {}): void {
		const risk = this.cleanupTargetRisk(target);
		if (!risk.safe && !options.force) throw new Error(`Refusing to remove workspace: ${risk.reasons.join(", ")}`);
		if (existsSync(target.cwd)) {
			rmSync(worktreeMetadataPath(target.cwd), { force: true });
			gitWorktreeRemove(this.projectRoot, target.cwd, options.force);
		} else if (target.worktreePath?.startsWith(join(this.projectRoot, ".daedalus", "worktrees")))
			rmSync(target.worktreePath, { recursive: true, force: true });
	}
}
