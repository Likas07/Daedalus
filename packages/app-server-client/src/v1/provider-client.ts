import type { protocolV1 } from "@daedalus-pi/app-server-protocol";
import type { Static } from "@sinclair/typebox";
import type { AppServerClient } from "../client";

export type ProviderV1RequestClient =
	| Pick<AppServerClient, "request">
	| { readonly request: (method: string, params: unknown) => Promise<unknown> };

export type ProviderV1SnapshotParams = Static<typeof protocolV1.ProviderSnapshotParamsSchema>;
export type ProviderV1SnapshotResult = protocolV1.ProviderSnapshotResult;

export async function getProviderSnapshot(
	client: ProviderV1RequestClient,
	params: ProviderV1SnapshotParams = {},
): Promise<ProviderV1SnapshotResult> {
	return (await sendProviderV1Request(client, "provider.snapshot", params)) as ProviderV1SnapshotResult;
}

function sendProviderV1Request(client: ProviderV1RequestClient, method: string, params: unknown): Promise<unknown> {
	return (client.request as (method: string, params: unknown) => Promise<unknown>)(method, params);
}
