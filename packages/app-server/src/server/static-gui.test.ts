import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createGuiAuthSessionState,
	createGuiBootstrap,
	createGuiEnvironmentDescriptor,
	defaultGuiDistDir,
	guiDistDir,
	serveStaticGui,
} from "./static-gui";

describe("static gui", () => {
	test("creates bootstrap without redacting fields in payload", () => {
		expect(createGuiBootstrap({ wsUrl: "ws://127.0.0.1:1/ws", token: "token", projectRoot: "/repo" })).toEqual({
			wsUrl: "ws://127.0.0.1:1/ws",
			token: "token",
			projectRoot: "/repo",
		});
	});

	test("serves index and assets from dist", async () => {
		const distDir = await mkdtemp(join(tmpdir(), "daedalus-gui-dist-"));
		await writeFile(join(distDir, "index.html"), "<html>gui</html>");
		await writeFile(join(distDir, "app.js"), "console.log('gui')");
		const index = await serveStaticGui(new Request("http://localhost/"), {
			distDir,
			wsUrl: "ws://localhost/ws",
			projectRoot: "/repo",
		});
		expect(await index?.text()).toBe("<html>gui</html>");
		const asset = await serveStaticGui(new Request("http://localhost/app.js?token=secret"), {
			distDir,
			wsUrl: "ws://localhost/ws",
			projectRoot: "/repo",
		});
		expect(asset?.headers.get("content-type")).toContain("text/javascript");
		expect(await asset?.text()).toBe("console.log('gui')");
	});

	test("defaults to the canonical GUI artifact path without fallback", () => {
		expect(guiDistDir()).toContain(join("packages", "gui", "dist"));
		expect(defaultGuiDistDir()).toBe(guiDistDir());
	});

	test("serves bootstrap endpoint", async () => {
		const response = await serveStaticGui(new Request("http://localhost/api/gui/bootstrap?token=secret"), {
			wsUrl: "ws://localhost/ws",
			token: "secret",
			projectRoot: "/repo",
		});
		expect(await response?.json()).toEqual({ wsUrl: "ws://localhost/ws", token: "secret", projectRoot: "/repo" });
	});

	test("serves T3-compatible environment descriptor", async () => {
		const response = await serveStaticGui(new Request("http://localhost/.well-known/t3/environment"), {
			wsUrl: "ws://localhost/ws",
			projectRoot: "/repo",
		});
		expect(await response?.json()).toEqual(createGuiEnvironmentDescriptor());
	});

	test("serves authenticated local auth state for browser smoke", async () => {
		const response = await serveStaticGui(new Request("http://localhost/api/auth/session"), {
			wsUrl: "ws://localhost/ws",
			projectRoot: "/repo",
		});
		expect(await response?.json()).toEqual(createGuiAuthSessionState());
	});

	test("blocks path traversal", async () => {
		const distDir = await mkdtemp(join(tmpdir(), "daedalus-gui-dist-"));
		const response = await serveStaticGui(new Request("http://localhost/%2e%2e%2fsecret"), {
			distDir,
			wsUrl: "ws://localhost/ws",
			projectRoot: "/repo",
		});
		expect(response?.status).toBe(403);
	});
});
