import type { IntegrationProviderState } from "@daedalus-pi/app-server-protocol";

export interface IntegrationArtifactChip {
	readonly id: string;
	readonly kind: "issue" | "pr" | "link";
	readonly label: string;
	readonly url?: string;
}

export interface IntegrationPanelViewModel {
	readonly provider: string;
	readonly status: string;
	readonly repositoryLabel: string;
	readonly backendStatus: string;
	readonly issueCount: number;
	readonly pullRequestCount: number;
	readonly ciSummary: string;
	readonly loading: boolean;
	readonly error?: string;
}

export interface IntegrationLoadState {
	readonly loading?: boolean;
	readonly error?: string;
}

export function summarizeIntegration(state: IntegrationProviderState): string {
	const repo = state.repository ? `${state.repository.owner}/${state.repository.name}` : "No repository";
	return `${state.provider}: ${state.status} · ${repo}`;
}

export function integrationArtifactChips(state: IntegrationProviderState): readonly IntegrationArtifactChip[] {
	return [
		...state.issues.map((issue) => ({
			id: `${state.provider}:issue:${issue.id}`,
			kind: "issue" as const,
			label: issue.title ?? `#${issue.number ?? issue.id}`,
			url: issue.url,
		})),
		...state.pullRequests.map((pr) => ({
			id: `${state.provider}:pr:${pr.number}`,
			kind: "pr" as const,
			label: `#${pr.number}${pr.title ? ` ${pr.title}` : ""}`,
			url: pr.url,
		})),
	];
}

export function integrationPanelViewModel(
	state: IntegrationProviderState,
	load: IntegrationLoadState = {},
): IntegrationPanelViewModel {
	const repo = state.repository ? `${state.repository.owner}/${state.repository.name}` : "No repository detected";
	const failures = state.ciChecks.filter((check) => check.status === "failure").length;
	const pending = state.ciChecks.filter((check) => check.status === "queued" || check.status === "in_progress").length;
	return {
		provider: state.provider,
		status: state.status,
		repositoryLabel: repo,
		backendStatus:
			state.message ??
			state.syncErrors?.[0]?.message ??
			(state.status === "authenticated" ? "GitHub CLI connected" : "GitHub CLI needs attention"),
		issueCount: state.issues.length,
		pullRequestCount: state.pullRequests.length,
		ciSummary:
			state.ciChecks.length === 0
				? "No CI checks"
				: `${state.ciChecks.length} checks · ${failures} failing · ${pending} pending`,
		loading: load.loading === true,
		error: load.error ?? state.syncErrors?.[0]?.message,
	};
}

export function prCreateApprovalSummary(input: {
	readonly title: string;
	readonly head: string;
	readonly base?: string;
}): string {
	return `Create GitHub pull request \"${input.title}\" from ${input.head}${input.base ? ` into ${input.base}` : ""}`;
}

export function canCreateOrUpdatePullRequest(input: { readonly safePushEnabled?: boolean }): boolean {
	return input.safePushEnabled === true;
}

export function reconnectMessage(connected: boolean, endpoint?: string): string | undefined {
	return connected ? undefined : `Disconnected from ${endpoint ?? "app server"}. Reconnect or export diagnostics.`;
}
