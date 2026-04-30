import type { protocolV1 } from "@daedalus-pi/app-server-protocol";
import type { AppServerClient } from "../client";

export type TerminalV1RequestClient =
	| Pick<AppServerClient, "request">
	| { readonly request: (method: string, params: unknown) => Promise<unknown> };

export type TerminalV1NotificationClient = TerminalV1RequestClient &
	(
		| Pick<AppServerClient, "onNotification">
		| {
				readonly onNotification: (
					method: string,
					listener: (params: unknown, message: unknown) => void,
				) => () => void;
		  }
	);

export type TerminalV1CommandResult = protocolV1.TerminalCommandResult;
export type TerminalV1ReplayResult = protocolV1.TerminalReplayResult;

export async function openTerminal(
	client: TerminalV1RequestClient,
	params: protocolV1.TerminalOpenParams,
): Promise<TerminalV1CommandResult> {
	return (await sendTerminalV1Request(client, "v1.terminal.open", params)) as TerminalV1CommandResult;
}

export async function sendTerminalInput(
	client: TerminalV1RequestClient,
	params: protocolV1.TerminalInputParams,
): Promise<TerminalV1CommandResult> {
	return (await sendTerminalV1Request(client, "v1.terminal.input", params)) as TerminalV1CommandResult;
}

export async function resizeTerminal(
	client: TerminalV1RequestClient,
	params: protocolV1.TerminalResizeParams,
): Promise<TerminalV1CommandResult> {
	return (await sendTerminalV1Request(client, "v1.terminal.resize", params)) as TerminalV1CommandResult;
}

export async function closeTerminal(
	client: TerminalV1RequestClient,
	params: protocolV1.TerminalCloseParams,
): Promise<TerminalV1CommandResult> {
	return (await sendTerminalV1Request(client, "v1.terminal.close", params)) as TerminalV1CommandResult;
}

export async function replayTerminalOutput(
	client: TerminalV1RequestClient,
	params: protocolV1.TerminalReplayParams,
): Promise<TerminalV1ReplayResult> {
	return (await sendTerminalV1Request(client, "v1.terminal.replay", params)) as TerminalV1ReplayResult;
}

export function onTerminalChanged(
	client: TerminalV1NotificationClient,
	listener: (params: protocolV1.TerminalContextNotification, message: unknown) => void,
): () => void {
	return onTerminalV1Notification(
		client,
		"v1.terminal.changed",
		listener as (params: unknown, message: unknown) => void,
	);
}

export function onTerminalOutput(
	client: TerminalV1NotificationClient,
	listener: (params: protocolV1.TerminalOutputNotification, message: unknown) => void,
): () => void {
	return onTerminalV1Notification(
		client,
		"v1.terminal.output",
		listener as (params: unknown, message: unknown) => void,
	);
}

function sendTerminalV1Request(client: TerminalV1RequestClient, method: string, params: unknown): Promise<unknown> {
	return (client.request as (method: string, params: unknown) => Promise<unknown>)(method, params);
}

function onTerminalV1Notification(
	client: TerminalV1NotificationClient,
	method: string,
	listener: (params: unknown, message: unknown) => void,
): () => void {
	return (
		client.onNotification as (method: string, listener: (params: unknown, message: unknown) => void) => () => void
	)(method, listener);
}
