import { describe, expect, test } from "bun:test";
import { isGuiCommand, isLoopbackHost, parseGuiCommand, runGuiCommand } from "./gui-command";

describe("gui command", () => {
	test("detects gui before normal modes", () => {
		expect(isGuiCommand(["gui", "--mode", "json"])).toBe(true);
		expect(isGuiCommand(["--mode", "json"])).toBe(false);
	});

	test("parses supported flags", () => {
		const parsed = parseGuiCommand([
			"gui",
			"--host",
			"0.0.0.0",
			"--port",
			"7331",
			"--no-open",
			"--project",
			"demo",
			"--new-server",
			"--log-file",
			"gui.log",
		], "/tmp/work");
		expect(parsed.host).toBe("0.0.0.0");
		expect(parsed.port).toBe(7331);
		expect(parsed.open).toBe(false);
		expect(parsed.project).toBe("/tmp/work/demo");
		expect(parsed.reuseServer).toBe(false);
		expect(parsed.newServer).toBe(true);
		expect(parsed.logFile).toBe("/tmp/work/gui.log");
	});

	test("headless suppresses browser opening", () => {
		const parsed = parseGuiCommand(["gui", "--headless"]);
		expect(parsed.headless).toBe(true);
		expect(parsed.open).toBe(false);
	});

	test("classifies loopback hosts", () => {
		expect(isLoopbackHost("127.0.0.1")).toBe(true);
		expect(isLoopbackHost("localhost")).toBe(true);
		expect(isLoopbackHost("0.0.0.0")).toBe(false);
	});

	test("reuses an existing server without spawning or opening when no-open", async () => {
		const logs: string[] = [];
		await runGuiCommand(["gui", "--port", "4444", "--no-open"], {
			stdout: { log: (message) => logs.push(String(message)) },
			fetch: async () => new Response("ok"),
			spawn: (() => {
				throw new Error("spawn should not be called");
			}) as typeof Bun.spawn,
			openBrowser: () => {
				throw new Error("browser should not open");
			},
		});
		expect(logs.join("\n")).toContain("reusing app-server");
	});

	test("warns and adds token for non-loopback hosts", async () => {
		const errors: string[] = [];
		let spawned: string[] = [];
		await runGuiCommand(["gui", "--host", "0.0.0.0", "--port", "0", "--headless"], {
			stderr: { error: (message) => errors.push(String(message)) },
			stdout: { log: () => {} },
			randomToken: () => "secret-token",
			spawn: ((cmd: string[]) => {
				spawned = cmd;
				return { stdout: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{"httpUrl":"http://0.0.0.0:1"}\n')); } }) };
			}) as typeof Bun.spawn,
		});
		expect(errors.join("\n")).toContain("non-loopback");
		expect(spawned).toContain("--token");
		expect(spawned).toContain("secret-token");
	});
});
