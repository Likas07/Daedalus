import { readFileSync } from "node:fs";
import type { NativeCommandEnvelope } from "./native-command-router";
import type { AppServerEndpoint } from "./server-process";

export interface LocalEnvironmentBootstrap {
	readonly platform: NodeJS.Platform;
	readonly arch: string;
	readonly homeDir: string;
}

export interface UpdateState {
	readonly status: "idle" | "checking" | "available" | "downloading" | "ready" | "error";
	readonly version?: string;
	readonly message?: string;
}

export interface AppServerRendererBootstrap {
	readonly endpoint: string;
	readonly wsEndpoint?: string;
	readonly token: string;
	readonly dbPath?: string;
	readonly appServerVersion?: string;
}

export interface DaedalusNativeBridge {
	readonly app: {
		getBranding(): Promise<{ name: string; version: string }>;
		getEnvironment(): Promise<LocalEnvironmentBootstrap>;
		confirm(message: string, title?: string): Promise<boolean>;
	};
	readonly shell: {
		openFolder(path?: string): Promise<string | undefined>;
		openExternalUrl(url: string): Promise<void>;
		openFile(path?: string): Promise<string | undefined>;
		openExternalEditor(path?: string): Promise<void>;
	};

	readonly notifications: {
		show(kind: "approval" | "run-completed" | "run-failed" | "provider-error", body?: string): Promise<boolean>;
	};
	readonly recentProjects: {
		list(): Promise<readonly { path: string; openedAt: string }[]>;
		add(path: string): Promise<readonly { path: string; openedAt: string }[]>;
		clear(): Promise<void>;
	};
	readonly deepLinks: {
		open(input: { projectId?: string; sessionId?: string; worktreeId?: string }): Promise<void>;
	};
	readonly commands: {
		onCommand(listener: (command: NativeCommandEnvelope) => void): () => void;
	};
	readonly server: {
		bootstrapEndpoint(): Promise<AppServerRendererBootstrap>;
	};
	readonly updates: {
		getState(): Promise<UpdateState>;
	};
}

export const nativeBridgeApiName = "daedalusNative";

export function toRendererServerBootstrap(endpoint: AppServerEndpoint): AppServerRendererBootstrap {
	return {
		endpoint: endpoint.endpoint,
		wsEndpoint: endpoint.wsEndpoint,
		token: readFileSync(endpoint.tokenFile, "utf8").trim(),
		dbPath: endpoint.dbPath,
		appServerVersion: endpoint.appServerVersion,
	};
}

export function isSafeExternalUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return url.protocol === "https:" || url.protocol === "http:";
	} catch {
		return false;
	}
}
