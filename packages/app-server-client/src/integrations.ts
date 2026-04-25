import type {
	IntegrationConnectParams,
	IntegrationDisconnectParams,
	IntegrationImportParams,
	IntegrationListResult,
	IntegrationManualLinkParams,
	IntegrationProviderState,
} from "@daedalus-pi/app-server-protocol";
import type { AppServerClient } from "./client";

export async function listIntegrations(client: AppServerClient, projectId?: string): Promise<IntegrationListResult> {
	return client.request(
		"integration/list",
		projectId ? ({ projectId } as never) : ({} as never),
	) as Promise<IntegrationListResult>;
}

export async function connectIntegration(
	client: AppServerClient,
	params: IntegrationConnectParams,
): Promise<{ readonly integration: IntegrationProviderState }> {
	return client.request("integration/connect", params as never) as Promise<{
		readonly integration: IntegrationProviderState;
	}>;
}

export async function disconnectIntegration(
	client: AppServerClient,
	params: IntegrationDisconnectParams,
): Promise<IntegrationListResult> {
	return client.request("integration/disconnect" as never, params as never) as Promise<IntegrationListResult>;
}

export async function linkIntegrationArtifact(
	client: AppServerClient,
	params: IntegrationManualLinkParams,
): Promise<{ readonly integration: IntegrationProviderState }> {
	return client.request("integration/link" as never, params as never) as Promise<{
		readonly integration: IntegrationProviderState;
	}>;
}

export async function importIntegrationArtifacts(
	client: AppServerClient,
	params: IntegrationImportParams,
): Promise<{ readonly integration: IntegrationProviderState }> {
	return client.request("integration/import" as never, params as never) as Promise<{
		readonly integration: IntegrationProviderState;
	}>;
}
