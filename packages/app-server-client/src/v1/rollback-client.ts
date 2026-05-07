import type { protocolV1 } from "@daedalus-pi/app-server-protocol";
import type { AppServerClient } from "../client";

export type RollbackV1RequestClient =
	| Pick<AppServerClient, "request">
	| { readonly request: (method: string, params: unknown) => Promise<unknown> };

export type ThreadV1RollbackResult = protocolV1.ThreadRollbackResult;

export async function rollbackThread(
	client: RollbackV1RequestClient,
	params: protocolV1.ThreadRollbackParams,
): Promise<ThreadV1RollbackResult> {
	return (await sendRollbackV1Request(client, "thread.rollback", params)) as ThreadV1RollbackResult;
}

function sendRollbackV1Request(client: RollbackV1RequestClient, method: string, params: unknown): Promise<unknown> {
	return (client.request as (method: string, params: unknown) => Promise<unknown>)(method, params);
}
