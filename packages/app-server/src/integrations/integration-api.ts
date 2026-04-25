import type { AppEvent } from "@daedalus-pi/app-server-protocol";

export type IntegrationProvider = "github" | "ci" | "issue-tracker" | (string & {});
export type IntegrationStatus =
	| "unknown"
	| "available"
	| "authenticated"
	| "unauthenticated"
	| "not-configured"
	| "error";

export type CommandRunner = (
	args: readonly string[],
	options?: { readonly cwd?: string; readonly stdin?: string },
) => Promise<{ readonly stdout: string; readonly stderr?: string; readonly exitCode: number }>;

export interface IntegrationRepository {
	readonly owner: string;
	readonly name: string;
	readonly remoteUrl?: string;
}

export interface LinkedIssue {
	readonly id: string;
	readonly title?: string;
	readonly url?: string;
	readonly state?: string;
}
export interface PullRequestStatus {
	readonly number: number;
	readonly title?: string;
	readonly url?: string;
	readonly state?: string;
	readonly checks?: CiCheck[];
}
export interface PullRequestCreateRequest {
	readonly title: string;
	readonly body?: string;
	readonly head: string;
	readonly base?: string;
	readonly draft?: boolean;
}
export interface PullRequestCreateResult {
	readonly number?: number;
	readonly url?: string;
	readonly status: "requested" | "created" | "failed";
	readonly message?: string;
}
export interface CiCheck {
	readonly name: string;
	readonly status: "queued" | "in_progress" | "success" | "failure" | "cancelled" | "unknown";
	readonly url?: string;
	readonly summary?: string;
}
export interface IntegrationSyncError {
	readonly message: string;
	readonly code?: string;
	readonly retryable?: boolean;
	readonly occurredAt: string;
}

export interface IntegrationState {
	readonly provider: IntegrationProvider;
	readonly status: IntegrationStatus;
	readonly repository?: IntegrationRepository;
	readonly issues: readonly LinkedIssue[];
	readonly pullRequests: readonly PullRequestStatus[];
	readonly ciChecks: readonly CiCheck[];
	readonly syncErrors?: readonly IntegrationSyncError[];
	readonly message?: string;
	readonly updatedAt: string;
}

export interface IntegrationAdapter {
	readonly provider: IntegrationProvider;
	getState(input?: { readonly cwd?: string }): Promise<IntegrationState>;
	lookupIssue?(input: { readonly id: string; readonly cwd?: string }): Promise<LinkedIssue | undefined>;
	getPullRequestStatus?(input: {
		readonly number: number;
		readonly cwd?: string;
	}): Promise<PullRequestStatus | undefined>;
	createPullRequest?(input: PullRequestCreateRequest & { readonly cwd?: string }): Promise<PullRequestCreateResult>;
	getCiChecks?(input?: { readonly ref?: string; readonly cwd?: string }): Promise<readonly CiCheck[]>;
}

export function integrationStateEvent(state: IntegrationState): AppEvent {
	return { id: `event-${crypto.randomUUID()}`, type: "integration/state", ts: state.updatedAt, payload: state };
}
