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

contextBridge.exposeInMainWorld(nativeBridgeApiName, bridge);
