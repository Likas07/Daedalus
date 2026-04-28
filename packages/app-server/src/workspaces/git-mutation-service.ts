import { resolve } from "node:path";
import type { WorkflowDiffSummary } from "@daedalus-pi/app-server-protocol";
import type { ApprovalService } from "../runtime/approval-service";
import { DiffService } from "./diff-service";
import { git } from "./git";
import { assertPathWithinRoot } from "./root-boundary";

export type GitMutationKind = "stage" | "unstage" | "discard" | "commit" | "checkpoint-restore";
export type GitRunner = (cwd: string, args: readonly string[]) => Promise<unknown>;

export interface GitMutationServiceOptions {
	readonly approvalService: ApprovalService;
	readonly diffService?: DiffService;
	readonly git?: GitRunner;
	readonly approvalTimeoutMs?: number;
}

export interface GitMutationInput {
	readonly cwd: string;
	readonly paths?: readonly string[];
	readonly message?: string;
	readonly checkpointRef?: string;
	readonly sessionId?: string;
}

export interface GitMutationResult {
	readonly ok: true;
	readonly approvalId: string;
	readonly diff: WorkflowDiffSummary;
}

export class GitMutationDeniedError extends Error {
	constructor(readonly approvalId: string) {
		super("Git mutation was denied.");
		this.name = "GitMutationDeniedError";
	}
}

export class GitMutationService {
	private readonly diffService: DiffService;
	private readonly runGit: GitRunner;

	constructor(private readonly options: GitMutationServiceOptions) {
		this.diffService = options.diffService ?? new DiffService();
		this.runGit = options.git ?? git;
	}

	async stage(input: GitMutationInput): Promise<GitMutationResult> {
		const paths = await this.validatedPaths("stage", input);
		return this.withApproval("stage", { ...input, paths }, ["add", "--", ...paths]);
	}

	async unstage(input: GitMutationInput): Promise<GitMutationResult> {
		const paths = await this.validatedPaths("unstage", input);
		return this.withApproval("unstage", { ...input, paths }, ["restore", "--staged", "--", ...paths]);
	}

	async discard(input: GitMutationInput): Promise<GitMutationResult> {
		const paths = await this.validatedPaths("discard", input);
		return this.withApproval("discard", { ...input, paths }, ["restore", "--worktree", "--", ...paths], true);
	}

	async commit(input: GitMutationInput): Promise<GitMutationResult> {
		const message = input.message?.trim();
		if (!message) throw new Error("Commit message is required.");
		return this.withApproval("commit", input, ["commit", "-m", message], true);
	}

	restoreCheckpoint(input: GitMutationInput): Promise<GitMutationResult> {
		if (!input.checkpointRef?.trim()) throw new Error("Checkpoint ref is required.");
		return this.withApproval(
			"checkpoint-restore",
			input,
			["restore", "--source", input.checkpointRef, "--worktree", "--staged", "--", "."],
			true,
		);
	}

	private requirePaths(input: GitMutationInput): readonly string[] {
		if (!input.paths?.length) throw new Error("At least one path is required.");
		return input.paths;
	}

	private async validatedPaths(kind: GitMutationKind, input: GitMutationInput): Promise<readonly string[]> {
		const paths = this.requirePaths(input);
		await Promise.all(
			paths.map((path) =>
				assertPathWithinRoot({
					root: input.cwd,
					candidate: resolve(input.cwd, path),
					purpose: `git/${kind}`,
				}),
			),
		);
		return paths;
	}

	private async withApproval(
		kind: GitMutationKind,
		input: GitMutationInput,
		args: readonly string[],
		hardBlock = false,
	): Promise<GitMutationResult> {
		const { approvalId, autoApproved } = this.options.approvalService.request({
			sessionId: input.sessionId,
			hardBlock,
			request: {
				type: "git/mutation",
				kind,
				cwd: input.cwd,
				paths: input.paths ?? [],
				message: input.message,
				checkpointRef: input.checkpointRef,
				command: ["git", ...args],
			},
		});
		if (!autoApproved) {
			const decision = await this.options.approvalService.waitForDecision(approvalId, {
				timeoutMs: this.options.approvalTimeoutMs,
			});
			if (decision.decision !== "approved") throw new GitMutationDeniedError(approvalId);
		}
		await this.runGit(input.cwd, args);
		return { ok: true, approvalId, diff: await this.diffService.get(input.cwd) };
	}
}
