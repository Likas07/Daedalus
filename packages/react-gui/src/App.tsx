import type { AppServerClient } from "@daedalus-pi/app-server-client";
import type { InitializeResult } from "@daedalus-pi/app-server-protocol";
import { EmptyTimeline, ShellFrame } from "@daedalus-pi/gui-components";
import { createEmptyGuiShellState } from "@daedalus-pi/gui-core";
import React, { type ReactNode } from "react";
import { ThreadRoute } from "./thread/ThreadRoute";

export interface AppProps {
	readonly client?: AppServerClient;
	readonly server?: Pick<InitializeResult, "server" | "capabilities">;
	readonly threadId?: string;
	readonly error?: string;
}

export function App({ client, server, threadId, error }: AppProps): ReactNode {
	const state = createEmptyGuiShellState();
	const serverLabel = server?.server.name ?? "local app server";

	return React.createElement(
		ShellFrame,
		{ state },
		React.createElement("p", { className: "daedalus-shell-status" }, `Connected to ${serverLabel}`),
		error ? React.createElement(EmptyTimeline, { error }) : null,
		client && threadId
			? React.createElement(ThreadRoute, { client, threadId })
			: React.createElement("p", null, "Open a Daedalus thread to start replaying the React thread loop."),
	);
}
