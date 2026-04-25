export type IntegrationProvider = "github" | "ci" | "issue-tracker" | (string & {});
export type IntegrationStatus =
	| "unknown"
	| "available"
	| "authenticated"
	| "unauthenticated"
	| "not-configured"
	| "error";

export interface IntegrationRepositoryBinding {
	readonly provider: IntegrationProvider;
	readonly owner: string;
	readonly name: string;
	readonly remoteUrl?: string;
	readonly projectId?: string;
}

export interface IntegrationIssue {
	readonly id: string;
	readonly number?: number;
	readonly title: string;
	readonly url?: string;
	readonly state: "open" | "closed" | string;
	readonly labels?: readonly string[];
}

export interface IntegrationPullRequest {
	readonly number: number;
	readonly title: string;
	readonly url?: string;
	readonly state: "open" | "closed" | "merged" | "draft" | string;
	readonly head?: string;
	readonly base?: string;
	readonly createUpdateGuarded?: boolean;
	readonly checks?: readonly IntegrationCiCheck[];
}

export interface IntegrationCiCheck {
	readonly name: string;
	readonly status: "queued" | "in_progress" | "success" | "failure" | "cancelled" | "unknown";
	readonly url?: string;
	readonly summary?: string;
}

export interface IntegrationSyncError {
	readonly provider: IntegrationProvider;
	readonly message: string;
	readonly code?: string;
	readonly retryable?: boolean;
	readonly occurredAt: string;
}

export interface IntegrationProviderState {
	readonly provider: IntegrationProvider;
	readonly status: IntegrationStatus;
	readonly repository?: IntegrationRepositoryBinding;
	readonly issues: readonly IntegrationIssue[];
	readonly pullRequests: readonly IntegrationPullRequest[];
	readonly ciChecks: readonly IntegrationCiCheck[];
	readonly syncErrors: readonly IntegrationSyncError[];
	readonly message?: string;
	readonly updatedAt: string;
}

export interface IntegrationListResult {
	readonly integrations: readonly IntegrationProviderState[];
}

export interface IntegrationConnectParams {
	readonly provider: IntegrationProvider;
	readonly projectId?: string;
	readonly config?: Record<string, unknown>;
}

export interface IntegrationDisconnectParams {
	readonly provider: IntegrationProvider;
	readonly projectId?: string;
}

export interface IntegrationManualLinkParams {
	readonly provider: IntegrationProvider;
	readonly projectId?: string;
	readonly url: string;
	readonly kind?: "issue" | "pull-request" | "repository" | "link";
}

export interface IntegrationImportParams {
	readonly provider: IntegrationProvider;
	readonly projectId?: string;
	readonly source: "remote" | "manual" | "cache";
}
