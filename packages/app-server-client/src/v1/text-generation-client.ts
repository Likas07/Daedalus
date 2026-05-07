import type { protocolV1 } from "@daedalus-pi/app-server-protocol";
import type { AppServerClient } from "../client";

export type TextGenerationV1RequestClient =
	| Pick<AppServerClient, "request">
	| { readonly request: (method: string, params: unknown) => Promise<unknown> };

export async function generateThreadTitle(
	client: TextGenerationV1RequestClient,
	params: protocolV1.TextGenerateThreadTitleParams,
): Promise<protocolV1.TextGenerateThreadTitleResult> {
	return (await sendTextGenerationV1Request(client, "text.threadTitle", params)) as protocolV1.TextGenerateThreadTitleResult;
}

export async function generateBranchName(
	client: TextGenerationV1RequestClient,
	params: protocolV1.TextGenerateBranchNameParams,
): Promise<protocolV1.TextGenerateBranchNameResult> {
	return (await sendTextGenerationV1Request(client, "text.branchName", params)) as protocolV1.TextGenerateBranchNameResult;
}

export async function generateCommitMessage(
	client: TextGenerationV1RequestClient,
	params: protocolV1.TextGenerateCommitMessageParams,
): Promise<protocolV1.TextGenerateCommitMessageResult> {
	return (await sendTextGenerationV1Request(
		client,
		"text.commitMessage",
		params,
	)) as protocolV1.TextGenerateCommitMessageResult;
}

export async function generatePrContent(
	client: TextGenerationV1RequestClient,
	params: protocolV1.TextGeneratePrContentParams,
): Promise<protocolV1.TextGeneratePrContentResult> {
	return (await sendTextGenerationV1Request(client, "text.prContent", params)) as protocolV1.TextGeneratePrContentResult;
}

function sendTextGenerationV1Request(
	client: TextGenerationV1RequestClient,
	method: string,
	params: unknown,
): Promise<unknown> {
	return (client.request as (method: string, params: unknown) => Promise<unknown>)(method, params);
}
