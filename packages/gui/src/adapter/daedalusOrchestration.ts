import type { AppServerClient } from "@daedalus-pi/app-server-client";
import type { OrchestrationShellStreamItem, OrchestrationThreadDetailSnapshot } from "@t3tools/contracts";
import { createDaedalusCommandAdapter } from "./daedalusCommands";
import { createDaedalusComposerAdapter } from "./daedalusComposer";
import { getT3FullThreadDiff, getT3TurnDiff } from "./daedalusDiff";
import { createDaedalusGitAdapter } from "./daedalusGit";
import { loadDaedalusT3Providers } from "./daedalusModels";
import {
	applyThreadEventToT3Thread,
	mapShellEventToT3Event,
	mapShellSnapshotItem,
	mapThreadDetailToT3Thread,
} from "./daedalusProjectionMappers";
import { daedalusTerminalApi } from "./daedalusTerminal";
import { unsupported } from "./unsupportedCapabilities";

export function createServerApi(client: AppServerClient) {
	return {
		getConfig: () => client.request("config/get", {}),
		refreshProviders: () => loadDaedalusT3Providers(client),
		expose: () => Promise.resolve(unsupported("server-exposure")),
		installProviderCli: () => Promise.resolve(unsupported("provider-cli-install")),
	};
}

type Unsubscribe = () => void;

export function createOrchestrationApi(client: AppServerClient) {
	return {
		dispatchCommand: createDaedalusCommandAdapter(client),
		getFullThreadDiff: (input: Parameters<typeof getT3FullThreadDiff>[1]) => getT3FullThreadDiff(client, input),
		getTurnDiff: (input: Parameters<typeof getT3TurnDiff>[1]) => getT3TurnDiff(client, input),
		subscribeShell: (listener: (item: OrchestrationShellStreamItem) => void): Unsubscribe => {
			let active = true;
			const unsubscribe = client.onNotification("shell/event", (event) => {
				if (!active) return;
				const mapped = mapShellEventToT3Event(event as never);
				if (mapped) listener(mapped);
			});

			void Promise.all([client.request("project/list", {}), client.request("shell/snapshot", {} as never)]).then(
				([projectList, shell]) => {
					if (!active) return;
					listener(mapShellSnapshotItem(shell.snapshot, projectList.projects));
				},
			);

			return () => {
				active = false;
				unsubscribe();
			};
		},
		subscribeThread: (
			input: { threadId: string },
			listener: (item: OrchestrationThreadDetailSnapshot) => void,
		): Unsubscribe => {
			let active = true;
			let current: OrchestrationThreadDetailSnapshot["thread"] | null = null;
			const publish = (thread: OrchestrationThreadDetailSnapshot["thread"], sequence: number) => {
				current = thread;
				listener({ snapshotSequence: sequence, thread });
			};

			const unsubscribe = client.onNotification("thread/event", (event) => {
				if (!active || event.threadId !== input.threadId || !current) return;
				const next = applyThreadEventToT3Thread(current, event as never);
				if (next) publish(next, event.seq);
				else {
					void client.request("thread/snapshot", { threadId: input.threadId } as never).then(({ snapshot }) => {
						if (active) publish(mapThreadDetailToT3Thread(snapshot), snapshot.cursor.seq);
					});
				}
			});

			void client.request("thread/snapshot", { threadId: input.threadId } as never).then(({ snapshot }) => {
				if (!active) return;
				publish(mapThreadDetailToT3Thread(snapshot), snapshot.cursor.seq);
				void client.request("event/replay", { cursor: { after: snapshot.cursor.seq } } as never);
			});

			return () => {
				active = false;
				unsubscribe();
			};
		},
	};
}

export function createTerminalApi(client: AppServerClient) {
	return {
		open: (input: Parameters<typeof daedalusTerminalApi.open>[1]) => daedalusTerminalApi.open(client, input),
		write: (input: Parameters<typeof daedalusTerminalApi.write>[1]) => daedalusTerminalApi.write(client, input),
		resize: (input: Parameters<typeof daedalusTerminalApi.resize>[1]) => daedalusTerminalApi.resize(client, input),
		clear: (input: Parameters<typeof daedalusTerminalApi.clear>[1]) => daedalusTerminalApi.clear(client, input),
		restart: (input?: Parameters<typeof daedalusTerminalApi.restart>[1]) =>
			daedalusTerminalApi.restart(client, input),
		close: (input: Parameters<typeof daedalusTerminalApi.close>[1]) => daedalusTerminalApi.close(client, input),
		replay: (params: Parameters<AppServerClient["request"]>[1]) => client.request("terminal/replay", params as never),
		onEvent: (
			input: { terminalId: string; threadId?: string; afterSeq?: number },
			listener: Parameters<typeof daedalusTerminalApi.subscribe>[2],
		) => daedalusTerminalApi.subscribe(client, input, listener),
	};
}

export function createGitApi(client: AppServerClient) {
	return createDaedalusGitAdapter(client);
}

export function createProjectsApi(client: AppServerClient) {
	return createDaedalusComposerAdapter(client);
}

export function createFilesystemApi(client: AppServerClient) {
	return {
		resourcesList: (params: Parameters<AppServerClient["request"]>[1]) =>
			client.request("resources/list", params as never),
	};
}

export function createShellApi(client: AppServerClient) {
	return {
		snapshot: (params: Parameters<AppServerClient["request"]>[1]) =>
			client.request("shell/snapshot", params as never),
	};
}

export interface DaedalusT3Api {
	readonly server: ReturnType<typeof createServerApi>;
	readonly orchestration: ReturnType<typeof createOrchestrationApi>;
	readonly terminal: ReturnType<typeof createTerminalApi>;
	readonly git: ReturnType<typeof createGitApi>;
	readonly projects: ReturnType<typeof createProjectsApi>;
	readonly filesystem: ReturnType<typeof createFilesystemApi>;
	readonly shell: ReturnType<typeof createShellApi>;
}

export function createDaedalusT3Api(client: AppServerClient): DaedalusT3Api {
	return {
		server: createServerApi(client),
		orchestration: createOrchestrationApi(client),
		terminal: createTerminalApi(client),
		git: createGitApi(client),
		projects: createProjectsApi(client),
		filesystem: createFilesystemApi(client),
		shell: createShellApi(client),
	};
}
