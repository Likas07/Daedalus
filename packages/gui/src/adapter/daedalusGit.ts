import type { AppServerClient } from "@daedalus-pi/app-server-client";
import type { ThreadDetailSnapshot } from "@daedalus-pi/app-server-protocol";
import { unsupported } from "./unsupportedCapabilities";

export interface DaedalusWorktreeLabels {
	readonly branch: string | null;
	readonly worktreePath: string | null;
	readonly statusLabel: string | null;
}

interface ThreadWorktreeMetadata {
	readonly branch?: string | null;
	readonly worktreePath?: string | null;
	readonly cwd?: string | null;
	readonly status?: string | null;
}

type ThreadLike = ThreadDetailSnapshot | ThreadWorktreeMetadata;

function readMetadata(thread: ThreadLike): ThreadWorktreeMetadata {
	return thread as ThreadWorktreeMetadata;
}

export function mapDaedalusThreadToWorktreeLabels(thread: ThreadLike): DaedalusWorktreeLabels {
	const metadata = readMetadata(thread);
	const branch = metadata.branch ?? null;
	const worktreePath = metadata.worktreePath ?? null;
	const statusLabel = worktreePath ? "Worktree" : branch ? "Branch" : null;

	return { branch, worktreePath, statusLabel };
}

export function createDaedalusGitAdapter(client: AppServerClient) {
	return {
		worktreeList: (params: Parameters<AppServerClient["request"]>[1]) =>
			client.request("worktree/list", params as never),
		worktreeCreate: (params: Parameters<AppServerClient["request"]>[1]) =>
			client.request("worktree/create", params as never),
		worktreeRemove: (params: Parameters<AppServerClient["request"]>[1]) =>
			client.request("worktree/cleanup", params as never),
		stage: (params: Parameters<AppServerClient["request"]>[1]) => client.request("git/stage", params as never),
		unstage: (params: Parameters<AppServerClient["request"]>[1]) => client.request("git/unstage", params as never),
		push: () => Promise.resolve(unsupported("git-push")),
		pull: () => Promise.resolve(unsupported("git-remote-mutation")),
		createBranch: () => Promise.resolve(unsupported("git-branch-mutation")),
		checkout: () => Promise.resolve(unsupported("git-branch-mutation")),
		resolvePullRequest: () => Promise.resolve(unsupported("pull-request-mutation")),
		preparePullRequestThread: () => Promise.resolve(unsupported("pull-request-mutation")),
	};
}
