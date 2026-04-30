import type { AppServerClient } from "@daedalus-pi/app-server-client";
import type { InitializeResult } from "@daedalus-pi/app-server-protocol";
import { EmptyTimeline, ShellFrame } from "@daedalus-pi/gui-components";
import { createEmptyGuiShellState, type GuiShellState } from "@daedalus-pi/gui-core";
import React, { type ReactNode } from "react";
import { ThreadRoute } from "./thread/ThreadRoute";

export interface AppProps {
	readonly client?: AppServerClient;
	readonly server?: Pick<InitializeResult, "server" | "capabilities">;
	readonly threadId?: string;
	readonly error?: string;
}

export function App({ client, server, threadId, error }: AppProps): ReactNode {
	const serverLabel = formatServerLabel(server);
	const connectionLabel = formatConnectionLabel({ client: Boolean(client), error, server, serverLabel });
	const activeThreadTitle = threadId ? `Thread ${threadId}` : undefined;
	const state = createShellState(threadId, activeThreadTitle);

	return React.createElement(
		ShellFrame,
		{ activeThreadTitle, connectionLabel, state },
		React.createElement("p", { className: "daedalus-shell-status" }, `${connectionLabel} · Protocol v1`),
		error ? React.createElement(EmptyTimeline, { error }) : null,
		client && threadId
			? React.createElement(ThreadRoute, { client, threadId })
			: React.createElement(
					"p",
					{ className: "daedalus-thread-route-empty" },
					"Open a Daedalus thread to start replaying the React thread loop.",
				),
	);
}

function createShellState(threadId: string | undefined, activeThreadTitle: string | undefined): GuiShellState {
	const state = createEmptyGuiShellState();
	if (!threadId) return state;

	return {
		...state,
		activeThreadId: threadId,
		threads: [
			{
				id: threadId,
				projectId: "active-project",
				title: activeThreadTitle ?? threadId,
				updatedAt: "1970-01-01T00:00:00.000Z",
			},
		],
	};
}

function formatServerLabel(server: Pick<InitializeResult, "server" | "capabilities"> | undefined): string {
	if (!server) return "local app server";
	const version = server.server.version.trim();
	const enabledCapabilityCount = Object.values(server.capabilities).filter(Boolean).length;
	const capabilityLabel = `${enabledCapabilityCount} ${enabledCapabilityCount === 1 ? "capability" : "capabilities"}`;
	return `${server.server.name}${version ? ` ${version}` : ""} · ${capabilityLabel}`;
}

function formatConnectionLabel({
	client,
	error,
	server,
	serverLabel,
}: {
	readonly client: boolean;
	readonly error?: string;
	readonly server?: Pick<InitializeResult, "server" | "capabilities">;
	readonly serverLabel: string;
}): string {
	if (error) return `Connection error: ${serverLabel}`;
	if (client) return `Connected to ${serverLabel}`;
	if (server) return `Ready: ${serverLabel}`;
	return "Connection pending";
}
