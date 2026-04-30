import { AppServerClient, createWebSocketTransport } from "@daedalus-pi/app-server-client";

import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

interface GuiBootstrap {
	readonly wsUrl: string;
	readonly token?: string;
	readonly projectRoot?: string;
}

interface NativeServerBridge {
	readonly server?: {
		bootstrapEndpoint(): Promise<{ readonly endpoint: string; readonly wsEndpoint?: string; readonly token: string }>;
	};
}

declare global {
	interface Window {
		readonly daedalusNative?: NativeServerBridge;
	}
}

const rootElement = document.getElementById("root");

if (!rootElement) throw new Error("Missing #root mount point for Daedalus React GUI");

const root = createRoot(rootElement);
root.render(React.createElement(App));

void boot().catch((error) => {
	root.render(React.createElement(App, { error: error instanceof Error ? error.message : String(error) }));
});

async function boot(): Promise<void> {
	const bootstrap = await readBootstrap();
	const client = new AppServerClient({
		transport: createWebSocketTransport({ url: withToken(bootstrap.wsUrl, bootstrap.token) }),
	});
	const server = await client.initialize({ protocolVersion: "0.1.0", client: { name: "react-gui" } });
	root.render(React.createElement(App, { client, server, threadId: readThreadId() }));
}

async function readBootstrap(): Promise<GuiBootstrap> {
	const nativeBootstrap = await window.daedalusNative?.server?.bootstrapEndpoint();
	if (nativeBootstrap)
		return {
			wsUrl: nativeBootstrap.wsEndpoint ?? websocketUrl(nativeBootstrap.endpoint),
			token: nativeBootstrap.token,
		};

	const response = await fetch("/api/gui/bootstrap", { cache: "no-store" });
	if (!response.ok) throw new Error(`Unable to load Daedalus GUI bootstrap: HTTP ${response.status}`);
	return (await response.json()) as GuiBootstrap;
}

function websocketUrl(endpoint: string): string {
	const url = new URL(endpoint);
	url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
	url.pathname = "/ws";
	return url.toString();
}

function withToken(wsUrl: string, token: string | undefined): string {
	if (!token) return wsUrl;
	const url = new URL(wsUrl);
	url.searchParams.set("token", token);
	return url.toString();
}

function readThreadId(): string | undefined {
	const url = new URL(window.location.href);
	const explicit = url.searchParams.get("threadId");
	if (explicit) return explicit;
	const match = /^\/threads?\/([^/?#]+)/.exec(url.pathname);
	return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}
