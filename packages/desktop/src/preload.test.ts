import { afterEach, describe, expect, it, mock } from "bun:test";

const exposed = new Map<string, unknown>();
const invokeCalls: Array<{ channel: string; payload?: unknown }> = [];

mock.module("electron", () => ({
	contextBridge: {
		exposeInMainWorld: (name: string, api: unknown) => {
			exposed.set(name, api);
		},
	},
	ipcRenderer: {
		invoke: async (channel: string, payload?: unknown) => {
			invokeCalls.push({ channel, payload });
			if (channel === "daedalus:server:bootstrap-endpoint") {
				return {
					endpoint: "http://127.0.0.1:4815",
					wsEndpoint: "ws://127.0.0.1:4815/ws",
					token: "test-token",
				};
			}
			if (channel === "daedalus:app:confirm") return true;
			if (channel === "daedalus:shell:open-external-url") return undefined;
			if (channel === "daedalus:shell:open-folder") return "/tmp/project";
			return undefined;
		},
		on: () => undefined,
		removeListener: () => undefined,
	},
}));

afterEach(() => {
	exposed.clear();
	invokeCalls.length = 0;
});

describe("preload", () => {
	async function loadPreload() {
		await import(`./preload.ts?test=${Date.now()}-${Math.random()}`);
	}

	it("exposes Daedalus native and T3-compatible desktop bridges", async () => {
		await loadPreload();

		expect(exposed.has("daedalusNative")).toBe(true);
		expect(exposed.has("desktopBridge")).toBe(true);
	});

	it("maps desktopBridge bootstrap, confirm, openExternal, context menu, and updates", async () => {
		await loadPreload();
		const desktopBridge = exposed.get("desktopBridge") as {
			getAppBranding: () => unknown;
			getLocalEnvironmentBootstrap: () => Promise<unknown>;
			confirm: (message: string) => Promise<boolean>;
			openExternal: (url: string) => Promise<boolean>;
			showContextMenu: () => Promise<unknown>;
			getUpdateState: () => Promise<{ enabled: boolean; status: string; message: string }>;
		};

		expect(desktopBridge.getAppBranding()).toEqual({
			baseName: "Daedalus",
			stageLabel: "Dev",
			displayName: "Daedalus",
		});
		await expect(desktopBridge.getLocalEnvironmentBootstrap()).resolves.toEqual({
			label: "Daedalus Local",
			httpBaseUrl: "http://127.0.0.1:4815",
			wsBaseUrl: "ws://127.0.0.1:4815/ws",
			bootstrapToken: "test-token",
		});
		await expect(desktopBridge.confirm("Continue?")).resolves.toBe(true);
		await expect(desktopBridge.openExternal("https://example.test")).resolves.toBe(true);
		await expect(desktopBridge.showContextMenu()).resolves.toBeNull();
		await expect(desktopBridge.getUpdateState()).resolves.toMatchObject({
			enabled: false,
			status: "disabled",
			message: "Daedalus update bridge is not implemented yet",
		});
		expect(invokeCalls).toContainEqual({
			channel: "daedalus:app:confirm",
			payload: { message: "Continue?", title: undefined },
		});
		expect(invokeCalls).toContainEqual({
			channel: "daedalus:shell:open-external-url",
			payload: { url: "https://example.test" },
		});
	});
});
