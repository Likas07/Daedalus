import { git } from "./git";

export interface WorktreeCreationTransactionInput {
	readonly projectPath: string;
	readonly worktreePath: string;
	readonly branch: string;
	readonly baseBranch?: string;
	afterGitCreate?: () => void | Promise<void>;
}

export interface WorktreeCreationTransactionSuccess {
	readonly ok: true;
}

export interface WorktreeCreationTransactionRolledBack {
	readonly ok: false;
	readonly message: string;
	readonly rollbackPath: string;
	readonly rollbackError?: string;
}

export type WorktreeCreationTransactionResult =
	| WorktreeCreationTransactionSuccess
	| WorktreeCreationTransactionRolledBack;

export async function createWorktreeInTransaction(
	input: WorktreeCreationTransactionInput,
): Promise<WorktreeCreationTransactionResult> {
	const args = ["worktree", "add", "-b", input.branch, input.worktreePath];
	if (input.baseBranch) args.push(input.baseBranch);
	await git(input.projectPath, args);

	try {
		await input.afterGitCreate?.();
		return { ok: true };
	} catch (error) {
		let rollbackError: string | undefined;
		try {
			await git(input.projectPath, ["worktree", "remove", "--force", input.worktreePath]);
		} catch (removeError) {
			rollbackError = errorMessage(removeError);
		}
		return {
			ok: false,
			message: errorMessage(error),
			rollbackPath: input.worktreePath,
			rollbackError,
		};
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
