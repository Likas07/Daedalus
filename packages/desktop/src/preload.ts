import { contextBridge, ipcRenderer } from "electron";
import type { DaedalusNativeBridge } from "./native-bridge";
import type { NativeCommandEnvelope } from "./native-command-router";

const nativeBridgeApiName = "daedalusNative";
const nativeCommandChannel = "daedalus:native-command";

const bridge: DaedalusNativeBridge = {
	app: {
		getBranding: () => ipcRenderer.invoke("daedalus:app:get-branding"),
		getEnvironment: () => ipcRenderer.invoke("daedalus:app:get-environment"),
		confirm: (message, title) => ipcRenderer.invoke("daedalus:app:confirm", { message, title }),
	},
	shell: {
		openFolder: (path) => ipcRenderer.invoke("daedalus:shell:open-folder", { path }),
		openFile: (path) => ipcRenderer.invoke("daedalus:shell:open-file", { path }),
		openExternalUrl: (url) => ipcRenderer.invoke("daedalus:shell:open-external-url", { url }),
		openExternalEditor: (
			input?: string | { path?: string; projectId?: string; sessionId?: string; worktreeId?: string },
		) =>
			ipcRenderer.invoke(
				"daedalus:shell:open-external-editor",
				typeof input === "string" || input === undefined ? { path: input } : input,
			),
	},
	notifications: {
		show: (kind, body) => ipcRenderer.invoke("daedalus:notifications:show", { kind, body }),
	},
	recentProjects: {
		list: () => ipcRenderer.invoke("daedalus:recent-projects:list"),
		add: (path) => ipcRenderer.invoke("daedalus:recent-projects:add", { path }),
		clear: () => ipcRenderer.invoke("daedalus:recent-projects:clear"),
	},
	deepLinks: {
		open: (input) => ipcRenderer.invoke("daedalus:deep-links:open", input),
	},
	commands: {
		onCommand: (listener) => {
			const handler = (_event: unknown, command: NativeCommandEnvelope) => listener(command);
			ipcRenderer.on(nativeCommandChannel, handler);
			return () => ipcRenderer.removeListener(nativeCommandChannel, handler);
		},
	},
	server: {
		bootstrapEndpoint: () => ipcRenderer.invoke("daedalus:server:bootstrap-endpoint"),
	},
	updates: {
		getState: () => ipcRenderer.invoke("daedalus:updates:get-state"),
	},
};

const disabledUpdateState = {
	enabled: false,
	status: "disabled",
	channel: "latest",
	currentVersion: "0.1.0",
	hostArch: "other",
	appArch: "other",
	runningUnderArm64Translation: false,
	availableVersion: null,
	downloadedVersion: null,
	downloadPercent: null,
	checkedAt: null,
	message: "Daedalus update bridge is not implemented yet",
	errorContext: null,
	canRetry: false,
} as const;

const desktopBridge = {
	getAppBranding: () => ({ baseName: "Daedalus", stageLabel: "Dev", displayName: "Daedalus" }),
	getLocalEnvironmentBootstrap: async () => {
		const bootstrap = await bridge.server.bootstrapEndpoint();
		return {
			label: "Daedalus Local",
			httpBaseUrl: bootstrap.endpoint ?? null,
			wsBaseUrl: bootstrap.wsEndpoint ?? null,
			bootstrapToken: bootstrap.token,
		};
	},
	getClientSettings: async () => null,
	setClientSettings: async () => undefined,
	getSavedEnvironmentRegistry: async () => [],
	setSavedEnvironmentRegistry: async () => undefined,
	getSavedEnvironmentSecret: async () => null,
	setSavedEnvironmentSecret: async () => false,
	removeSavedEnvironmentSecret: async () => undefined,
	getServerExposureState: async () => ({ mode: "local-only", endpointUrl: null, advertisedHost: null }),
	setServerExposureMode: async () => ({ mode: "local-only", endpointUrl: null, advertisedHost: null }),
	pickFolder: () => bridge.shell.openFolder().then((path) => path ?? null),
	confirm: (message: string) => bridge.app.confirm(message),
	setTheme: async () => undefined,
	showContextMenu: async () => null,
	openExternal: (url: string) => bridge.shell.openExternalUrl(url).then(() => true),
	onMenuAction: () => () => undefined,
	getUpdateState: async () => disabledUpdateState,
	setUpdateChannel: async () => disabledUpdateState,
	checkForUpdate: async () => ({ checked: false, state: disabledUpdateState }),
	downloadUpdate: async () => ({ accepted: false, completed: false, state: disabledUpdateState }),
	installUpdate: async () => ({ accepted: false, completed: false, state: disabledUpdateState }),
	onUpdateState: () => () => undefined,
};

contextBridge.exposeInMainWorld(nativeBridgeApiName, bridge);
contextBridge.exposeInMainWorld("desktopBridge", desktopBridge);
