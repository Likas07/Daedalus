import { describe, expect, test } from "bun:test";
import { runGuiCommand } from "./gui-command";

describe("daedalus gui E2E smoke", () => {
	test("reports --no-open readiness without opening a browser when an app-server is already ready", async () => {
		const logs: string[] = [];
		let opened = false;
		await runGuiCommand(["gui", "--port", "7331", "--no-open"], {
			stdout: { log: (message) => logs.push(String(message)) },
			fetch: async (input) => {
				expect(String(input)).toBe("http://127.0.0.1:7331/health");
				return new Response(JSON.stringify({ ok: true }), { status: 200 });
			},
			openBrowser: () => {
				opened = true;
			},
			spawn: (() => {
				throw new Error("ready existing server should be reused");
			}) as typeof Bun.spawn,
		});

		expect(opened).toBe(false);
		expect(logs.join("\n")).toContain("Daedalus GUI ready: http://127.0.0.1:7331");
	});

	test("spawns a new headless GUI app-server and redacts capability token from logs", async () => {
		const logs: string[] = [];
		const errors: string[] = [];
		let spawned: string[] = [];
		await runGuiCommand(["gui", "--host", "0.0.0.0", "--port", "0", "--headless", "--project", "."], {
			stdout: { log: (message) => logs.push(String(message)) },
			stderr: { error: (message) => errors.push(String(message)) },
			randomToken: () => "gui-e2e-token",
			spawn: ((cmd: string[]) => {
				spawned = cmd;
				return {
					stdout: new ReadableStream({
						start(controller) {
							controller.enqueue(new TextEncoder().encode('{"httpUrl":"http://0.0.0.0:4173","token":"<redacted>"}\n'));
							controller.close();
						},
					}),
					stderr: new ReadableStream(),
				};
			}) as typeof Bun.spawn,
		});

		expect(errors.join("\n")).toContain("non-loopback");
		expect(spawned).toContain("--token");
		expect(spawned).toContain("gui-e2e-token");
		expect(logs.join("\n")).toContain("Daedalus GUI ready: http://0.0.0.0:4173/?token=gui-e2e-token");
	});
});
