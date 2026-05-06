export interface DaedalusGuiBootstrap {
	readonly wsUrl: string;
	readonly token?: string;
	readonly projectRoot: string;
	readonly httpUrl?: string;
}

export interface T3CompatibleEnvironment {
	readonly id: "local-daedalus";
	readonly label: "Daedalus Local";
	readonly httpUrl: string;
	readonly wsUrl: string;
	readonly token?: string;
	readonly projectRoot: string;
	readonly authenticated: true;
}

interface DaedalusNativeBootstrap {
	readonly endpoint?: string;
	readonly wsEndpoint?: string;
	readonly token?: string;
	readonly dbPath?: string;
	readonly projectRoot?: string;
	httpUrl?: string;
	wsUrl?: string;
}

declare global {
	interface Window {
		daedalusNative?: {
			server?: {
				bootstrapEndpoint?: () => Promise<DaedalusNativeBootstrap | DaedalusGuiBootstrap>;
			};
		};
	}
}

function httpOriginFromWsUrl(wsUrl: string): string {
	const url = new URL(wsUrl);
	if (url.protocol === "ws:") url.protocol = "http:";
	if (url.protocol === "wss:") url.protocol = "https:";
	return url.origin;
}
function normalizeBootstrap(raw: DaedalusNativeBootstrap | DaedalusGuiBootstrap): DaedalusGuiBootstrap {
	const wsUrl = "wsUrl" in raw && raw.wsUrl ? raw.wsUrl : "wsEndpoint" in raw ? raw.wsEndpoint : undefined;
	if (!wsUrl) {
		throw new Error("Daedalus bootstrap response did not include a WebSocket URL.");
	}
	const httpUrl = raw.httpUrl ?? ("endpoint" in raw ? raw.endpoint : undefined) ?? httpOriginFromWsUrl(wsUrl);
	return {
		wsUrl,
		httpUrl,
		token: raw.token,
		projectRoot: raw.projectRoot ?? ("dbPath" in raw ? raw.dbPath : undefined) ?? "",
	};
}

async function fetchHttpBootstrap(): Promise<DaedalusNativeBootstrap | DaedalusGuiBootstrap> {
	const response = await fetch("/api/gui/bootstrap");
	if (!response.ok) {
		throw new Error(`Failed to load Daedalus GUI bootstrap: ${response.status} ${response.statusText}`);
	}
	return response.json() as Promise<DaedalusNativeBootstrap | DaedalusGuiBootstrap>;
}

export async function loadDaedalusEnvironment(): Promise<T3CompatibleEnvironment> {
	const nativeBootstrap = await window.daedalusNative?.server?.bootstrapEndpoint?.();
	const bootstrap = normalizeBootstrap(nativeBootstrap ?? (await fetchHttpBootstrap()));
	const httpUrl = bootstrap.httpUrl ?? httpOriginFromWsUrl(bootstrap.wsUrl);

	return {
		id: "local-daedalus",
		label: "Daedalus Local",
		httpUrl,
		wsUrl: bootstrap.wsUrl,
		token: bootstrap.token,
		projectRoot: bootstrap.projectRoot,
		authenticated: true,
	};
}
