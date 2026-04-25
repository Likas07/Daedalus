import { contextBridge, ipcRenderer } from "electron";
import { type DaedalusNativeBridge, nativeBridgeApiName } from "./native-bridge";

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
	server: {
		bootstrapEndpoint: () => ipcRenderer.invoke("daedalus:server:bootstrap-endpoint"),
	},
	updates: {
		getState: () => ipcRenderer.invoke("daedalus:updates:get-state"),
	},
};

contextBridge.exposeInMainWorld(nativeBridgeApiName, bridge);
