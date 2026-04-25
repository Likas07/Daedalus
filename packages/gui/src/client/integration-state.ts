import type { IntegrationProviderState } from "@daedalus-pi/app-server-protocol";

export interface IntegrationArtifactChip {
	readonly id: string;
	readonly kind: "issue" | "pr" | "link";
	readonly label: string;
	readonly url?: string;
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
			label: issue.title,
			url: issue.url,
		})),
		...state.pullRequests.map((pr) => ({
			id: `${state.provider}:pr:${pr.number}`,
			kind: "pr" as const,
			label: `#${pr.number} ${pr.title}`,
			url: pr.url,
		})),
	];
}

export function canCreateOrUpdatePullRequest(input: { readonly safePushEnabled?: boolean }): boolean {
	return input.safePushEnabled === true;
}

export function reconnectMessage(connected: boolean, endpoint?: string): string | undefined {
	return connected ? undefined : `Disconnected from ${endpoint ?? "app server"}. Reconnect or export diagnostics.`;
}
