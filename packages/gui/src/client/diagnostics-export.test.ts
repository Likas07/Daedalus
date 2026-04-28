import { describe, expect, test } from "bun:test";
import { AppServerClient, type AppServerTransport } from "@daedalus-pi/app-server-client";
import { bootReadinessRows, withDesktopBootDiagnostics } from "./diagnostics-export";
import { createGuiRuntime } from "./runtime";

class MockTransport implements AppServerTransport {
	listener?: (message: unknown) => void;
	sent: unknown[] = [];
	send(message: unknown): void {
		this.sent.push(message);
		const request = message as { kind?: string; id?: string; method?: string };
		if (request.kind !== "request" || !request.id) return;
		const result =
			request.method === "diagnostics/export"
				? {
						export: {
							exportedAt: "now",
							kind: "jsonl-session",
							transcript: [],
							toolLogs: [],
							appServerLogs: [],
							environment: { platform: "test", arch: "x64" },
							versions: {},
							integrationStatus: [],
							recentProtocolEvents: [],
						},
						filename: "s1.jsonl",
						content: "{}",
					}
				: request.method === "event/replay"
					? { events: [] }
					: request.method === "project/list"
						? { projects: [] }
						: request.method === "session/list"
							? { sessions: [] }
							: request.method === "terminal/list"
								? { terminals: [] }
								: request.method === "model/list"
									? { models: [] }
									: request.method === "auth/status"
										? { providers: [] }
										: request.method === "access/get"
											? {
													policy: {
														mode: "prompt",
														autoApproveSoftPrompts: false,
														bypassHardBlocks: false,
														auditRequired: true,
													},
												}
											: {};
		this.listener?.({ kind: "response", id: request.id, ok: true, result });
	}
	onMessage(listener: (message: unknown) => void): () => void {
		this.listener = listener;
		return () => {
			this.listener = undefined;
		};
	}
	close(): void {}
}

describe("diagnostics export runtime", () => {
	test("requests diagnostics export with selected session and options", async () => {
		const transport = new MockTransport();
		const runtime = await createGuiRuntime({
			client: new AppServerClient({ transport }),
			bootstrap: { projectRoot: "/repo" },
		});
		runtime.selectSession("s1");
		const result = await runtime.exportDiagnosticsBundle?.({
			kind: "jsonl-session",
			includeToolLogs: true,
			recentEventLimit: 5,
		});
		expect(result?.filename).toBe("s1.jsonl");
		expect(transport.sent).toContainEqual({
			kind: "request",
			id: "client-1",
			method: "diagnostics/export",
			params: {
				kind: "jsonl-session",
				sessionId: "s1",
				includeTranscripts: undefined,
				includeToolLogs: true,
				recentEventLimit: 5,
			},
		});
	});
});

describe("desktop boot diagnostics projection", () => {
	test("merges boot readiness details and renders support rows", () => {
		const diagnostics = {
			exportedAt: "now",
			transcript: [],
			toolLogs: [],
			appServerLogs: [],
			environment: { platform: "test", arch: "x64" },
			versions: {},
			integrationStatus: [],
			recentProtocolEvents: [],
		};
		const merged = withDesktopBootDiagnostics(diagnostics, {
			stage: "ready",
			ready: true,
			updatedAt: "now",
			manifestReused: false,
			pidHealthy: true,
			tokenFilePath: "/state/<redacted>",
			dbPath: "/state/app-server.sqlite",
			spawnCommand: ["bun", "--token-file", "/state/<redacted>"],
			readinessJson: { httpUrl: "http://127.0.0.1:1" },
		});

		expect(merged.desktopBoot?.ready).toBe(true);
		expect(bootReadinessRows(merged.desktopBoot).map((row) => row.label)).toContain("spawn command");
		expect(bootReadinessRows(merged.desktopBoot).find((row) => row.label === "token file")?.value).toBe(
			"/state/<redacted>",
		);
	});
});
