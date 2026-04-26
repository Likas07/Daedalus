import { describe, expect, test } from "bun:test";
import { NativeCommandRouter, validateNativeCommand } from "./native-command-router";

describe("native command router", () => {
	test("routes menu commands to renderer channel", () => {
		const sent: unknown[] = [];
		const router = new NativeCommandRouter({
			getMainWindow: () => ({
				webContents: { send: (_channel: string, payload: unknown) => sent.push(payload) } as never,
			}),
		});
		router.send("toggle-terminal", {});
		router.send("open-project", { path: "/repo" });
		expect(sent).toEqual([
			{ id: "toggle-terminal", payload: {} },
			{ id: "open-project", payload: { path: "/repo" } },
		]);
	});

	test("accepts daedalus deep links and safe http URLs", () => {
		expect(() =>
			validateNativeCommand({ id: "open-deep-link", payload: { url: "daedalus://open?project=p" } }),
		).not.toThrow();
		expect(() =>
			validateNativeCommand({ id: "open-deep-link", payload: { url: "https://daedalus.local/open" } }),
		).not.toThrow();
	});

	test("rejects unsafe URL and empty path commands", () => {
		expect(() => validateNativeCommand({ id: "open-deep-link", payload: { url: "javascript:alert(1)" } })).toThrow(
			"Unsupported native command URL",
		);
		expect(() => validateNativeCommand({ id: "open-project", payload: { path: "" } })).toThrow(
			"path must not be empty",
		);
	});
});
