import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	AppServerClient,
	cancelTurn,
	createWebSocketTransport,
	getThread,
	replayThread,
	startTurn,
} from "@daedalus-pi/app-server-client";
import type { protocolV1 } from "@daedalus-pi/app-server-protocol";

const runtimeFactory = async (input: { cwd: string }) => ({
	cwd: input.cwd,
	session: {
		subscribe: () => () => {},
		async prompt() {},
		async abort() {},
	},
	control: {
		readState: () => ({ status: "idle" }),
		async setModel() {},
		async setThinking() {},
	},
	async applyRuntimeOptions() {},
	async dispose() {},
});

function waitForNotification(client: AppServerClient): Promise<protocolV1.TimelineEntryNotification> {
	return new Promise((resolve) => {
		const unsubscribe = (
			client.onNotification as (method: string, listener: (params: unknown) => void) => () => void
		)("thread.timeline", (params) => {
			unsubscribe();
			resolve(params as protocolV1.TimelineEntryNotification);
		});
	});
}

async function git(cwd: string, ...args: string[]): Promise<void> {
	const child = Bun.spawn(["git", ...args], { cwd, stdout: "ignore", stderr: "pipe" });
	const code = await child.exited;
	if (code !== 0) throw new Error(`git ${args.join(" ")} failed: ${await new Response(child.stderr).text()}`);
}

describe("React thread loop smoke", () => {
	let server:
		| { httpUrl: string; wsUrl: string; router: { append(event: unknown): void }; stop(): Promise<void> }
		| undefined;
	let client: AppServerClient | undefined;
	let tempDir: string | undefined;

	afterEach(async () => {
		await client?.close();
		await server?.stop();
		client = undefined;
		server = undefined;
		if (tempDir) rmSync(tempDir, { recursive: true, force: true });
		tempDir = undefined;
	});

	test("boots, connects, opens a thread, replays, sends, streams, and cancels", async () => {
		const appServerSpecifier = "@daedalus-pi/app-server";
		const { startAppServer } = (await import(appServerSpecifier)) as {
			startAppServer: (options: Record<string, unknown>) => Promise<NonNullable<typeof server>>;
		};
		tempDir = mkdtempSync(join(tmpdir(), "daedalus-react-thread-smoke-"));
		const distDir = join(tempDir, "react-dist");
		mkdirSync(distDir);
		writeFileSync(join(distDir, "index.html"), "<html><title>Daedalus React GUI</title><div id='root'></div></html>");
		await git(tempDir, "init");
		await git(tempDir, "config", "user.email", "smoke@example.invalid");
		await git(tempDir, "config", "user.name", "React Smoke");
		server = await startAppServer({
			databasePath: join(tempDir, "app.sqlite"),
			token: "react-smoke-token",
			serveGui: true,
			projectRoot: tempDir,
			guiDistDir: distDir,
			runtimeFactory,
		});

		const html = await (await fetch(server.httpUrl)).text();
		expect(html).toContain("<html");
		const bootstrap = (await (await fetch(`${server.httpUrl}/api/gui/bootstrap`)).json()) as {
			wsUrl: string;
			token: string;
		};
		expect(bootstrap.wsUrl).toBe(server.wsUrl);
		expect(bootstrap.token).toBe("react-smoke-token");

		client = new AppServerClient({
			transport: createWebSocketTransport({ url: `${bootstrap.wsUrl}?token=${bootstrap.token}` }),
			requestIdPrefix: "react-smoke",
		});
		expect(
			await client.initialize({ protocolVersion: "0.1.0", client: { name: "react-thread-smoke" } }),
		).toHaveProperty("server");

		const opened = (await client.request("project/open", { path: tempDir })) as { projectId: string };
		const started = (await client.request("session/start", {
			projectId: opened.projectId,
			startTarget: {
				mode: "base-checkout",
				projectId: opened.projectId,
				confirmation: { confirmed: true, evidence: "React thread loop smoke uses a temp checkout" },
			},
		})) as { sessionId: string };
		const threadId = started.sessionId;
		server.router.append({
			id: crypto.randomUUID(),
			type: "turn/started",
			ts: new Date().toISOString(),
			sessionId: threadId,
			turnId: "turn-initial-smoke",
			prompt: "initial smoke prompt",
		} as never);

		const loaded = await getThread(client, { threadId });
		expect(loaded.thread.threadId).toBe(threadId);
		expect(loaded.timeline.entries.some((entry) => entry.kind === "user-message")).toBe(true);
		const replayed = await replayThread(client, { threadId, limit: 10 });
		expect(replayed.entries.length).toBeGreaterThan(0);

		const running = await startTurn(client, { threadId, prompt: "continue smoke" });
		expect(running.turn.turnId).toBeTruthy();

		const streamed = waitForNotification(client);
		server.router.append({
			id: crypto.randomUUID(),
			type: "agent/message_end",
			ts: new Date().toISOString(),
			sessionId: threadId,
			turnId: running.turn.turnId,
			message: { role: "assistant", content: "streamed smoke reply" },
		} as never);
		expect((await streamed).entry).toMatchObject({ kind: "assistant-message", threadId });

		const cancelled = await cancelTurn(client, { threadId, turnId: running.turn.turnId });
		expect(cancelled.turn.status).toBe("cancelled");
	});
});
