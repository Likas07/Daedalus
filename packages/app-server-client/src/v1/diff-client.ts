import type { protocolV1 } from "@daedalus-pi/app-server-protocol";
import type { AppServerClient } from "../client";

export type DiffV1RequestClient =
	| Pick<AppServerClient, "request">
	| { readonly request: (method: string, params: unknown) => Promise<unknown> };

export type DiffV1SummaryResult = protocolV1.DiffSummaryResult;
export type DiffV1FileWindowResult = protocolV1.DiffFileWindowResult;

export async function getDiffSummary(
	client: DiffV1RequestClient,
	params: protocolV1.DiffSummaryParams,
): Promise<DiffV1SummaryResult> {
	return (await sendDiffV1Request(client, "v1.diff.summary", params)) as DiffV1SummaryResult;
}

export async function getDiffFileWindow(
	client: DiffV1RequestClient,
	params: protocolV1.DiffFileWindowParams,
): Promise<DiffV1FileWindowResult> {
	return (await sendDiffV1Request(client, "v1.diff.fileWindow", params)) as DiffV1FileWindowResult;
}

function sendDiffV1Request(client: DiffV1RequestClient, method: string, params: unknown): Promise<unknown> {
	return (client.request as (method: string, params: unknown) => Promise<unknown>)(method, params);
}
