import type { protocolV1 } from "@daedalus-pi/app-server-protocol";
import type { AppServerClient } from "../client";

export type UserInputV1RequestClient =
	| Pick<AppServerClient, "request">
	| { readonly request: (method: string, params: unknown) => Promise<unknown> };

export type UserInputV1ResponseResult = protocolV1.UserInputResponseResult;

export async function respondToUserInput(
	client: UserInputV1RequestClient,
	params: protocolV1.UserInputResponseParams,
): Promise<UserInputV1ResponseResult> {
	return (await sendUserInputV1Request(client, "v1.userInput.respond", params)) as UserInputV1ResponseResult;
}

function sendUserInputV1Request(client: UserInputV1RequestClient, method: string, params: unknown): Promise<unknown> {
	return (client.request as (method: string, params: unknown) => Promise<unknown>)(method, params);
}
