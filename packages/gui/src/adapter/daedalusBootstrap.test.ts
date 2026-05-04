import { afterEach, describe, expect, it, vi } from "vitest";
import { loadDaedalusEnvironment } from "./daedalusBootstrap";

function setWindow(value: unknown) {
	vi.stubGlobal("window", value);
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("loadDaedalusEnvironment", () => {
	it("prefers desktop bootstrap over HTTP fallback", async () => {
		const fetch = vi.fn();
		vi.stubGlobal("fetch", fetch);
		setWindow({
			daedalusNative: {
				server: {
					bootstrapEndpoint: vi.fn().mockResolvedValue({
						wsUrl: "ws://127.0.0.1:4815/ws",
						httpUrl: "http://127.0.0.1:4815",
						token: "desktop-token",
						projectRoot: "/tmp/daedalus",
					}),
				},
			},
		});

		await expect(loadDaedalusEnvironment()).resolves.toEqual({
			id: "local-daedalus",
			label: "Daedalus Local",
			httpUrl: "http://127.0.0.1:4815",
			wsUrl: "ws://127.0.0.1:4815/ws",
			token: "desktop-token",
			projectRoot: "/tmp/daedalus",
			authenticated: true,
		});
		expect(fetch).not.toHaveBeenCalled();
	});

	it("falls back to /api/gui/bootstrap and derives httpUrl from wsUrl", async () => {
		setWindow({});
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					wsUrl: "wss://gui.example.test/socket",
					projectRoot: "/workspace",
				}),
			}),
		);

		await expect(loadDaedalusEnvironment()).resolves.toMatchObject({
			id: "local-daedalus",
			label: "Daedalus Local",
			httpUrl: "https://gui.example.test",
			wsUrl: "wss://gui.example.test/socket",
			projectRoot: "/workspace",
			authenticated: true,
		});
		expect(fetch).toHaveBeenCalledWith("/api/gui/bootstrap");
	});
});
