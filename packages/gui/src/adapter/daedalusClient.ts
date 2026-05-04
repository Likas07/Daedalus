import {
	AppServerClient,
	type AppServerTransport,
	createWebSocketTransport,
	type WebSocketTransportOptions,
} from "@daedalus-pi/app-server-client";

import type { T3CompatibleEnvironment } from "./daedalusBootstrap";

export interface DaedalusGuiClientOptions {
	readonly WebSocketImpl?: WebSocketTransportOptions["WebSocketImpl"];
	readonly requestIdPrefix?: string;
}

export interface DaedalusGuiClientConnection {
	readonly client: AppServerClient;
	readonly transport: AppServerTransport;
}

export function createDaedalusGuiClient(
	environment: T3CompatibleEnvironment,
	options: DaedalusGuiClientOptions = {},
): DaedalusGuiClientConnection {
	const transport = createWebSocketTransport({
		url: environment.wsUrl,
		protocols: environment.token ? ["daedalus", `bearer.${environment.token}`] : undefined,
		WebSocketImpl: options.WebSocketImpl,
	});

	return {
		transport,
		client: new AppServerClient({
			transport,
			requestIdPrefix: options.requestIdPrefix ?? environment.id,
		}),
	};
}
