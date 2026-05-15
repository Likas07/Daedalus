import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { getAgentDir } from "@daedalus-pi/coding-agent";
import type { Server } from "bun";
import { openAppServerDatabase, runMigrations } from "..";
import { PromptContextService } from "../composer/prompt-context-service";
import { ExtensionUiRouter } from "../extensions/extension-ui-router";
import type { CommandRunner } from "../integrations/integration-api";
import { AccessPolicyService } from "../runtime/access-policy-service";
import { ApprovalService } from "../runtime/approval-service";
import { createCodingAgentRuntimeFactory } from "../runtime/coding-agent-runtime";
import type { RuntimeFactory } from "../runtime/session-controller";
import { SessionController } from "../runtime/session-controller";
import { SqliteSessionManager } from "../runtime/sqlite-session-manager";
import { SqliteSessionStore } from "../sessions/sqlite-session-store";
import type { PtyAdapter } from "../terminal/pty-adapter";
import { authenticateRequest, createCapabilityToken } from "./auth";
import { AppRouter, type OutboundMessage } from "./router";
import { serveStaticGui } from "./static-gui";
import { type AppServerClientConnection, createWebSocketHandlers, type WebSocketClient } from "./websocket";

export interface CreateAppServerOptions {
	readonly databasePath: string;
	readonly host?: string;
	readonly port?: number;
	readonly token?: string;
	readonly runtimeFactory?: RuntimeFactory;
	readonly agentDir?: string;
	readonly terminalPty?: PtyAdapter;
	readonly integrationRunner?: CommandRunner;
	readonly serveGui?: boolean;
	readonly guiDistDir?: string;
	readonly projectRoot?: string;
}

export interface AppServerInstance {
	readonly server: Server<{ client: WebSocketClient }>;
	readonly router: AppRouter;
	readonly token: string;
	readonly httpUrl: string;
	readonly wsUrl: string;
	stop(): Promise<void>;
}

export interface AppServerCore {
	readonly database: ReturnType<typeof openAppServerDatabase>;
	readonly router: AppRouter;
	readonly clients: Set<AppServerClientConnection>;
	close(): Promise<void>;
}

export async function createAppServerCore(options: CreateAppServerOptions): Promise<AppServerCore> {
	mkdirSync(dirname(options.databasePath), { recursive: true });
	const database = openAppServerDatabase(options.databasePath);
	runMigrations(database);
	const agentDir = options.agentDir ?? getAgentDir();
	const clients = new Set<AppServerClientConnection>();
	const publish = (message: OutboundMessage) => {
		for (const client of clients) client.send(message);
	};
	let router!: AppRouter;
	const sessionStore = new SqliteSessionStore({ database });
	const accessPolicyService = new AccessPolicyService(database);
	const approvalService = new ApprovalService(database, accessPolicyService, (event) =>
		publish(event as OutboundMessage),
	);
	const extensionUiRouter = new ExtensionUiRouter((message) => publish(message));
	const controller = new SessionController({
		runtimeFactory:
			options.runtimeFactory ??
			createCodingAgentRuntimeFactory({ approvalService, accessPolicy: accessPolicyService, extensionUiRouter }),
		eventSink: (message) => {
			if ("id" in message && "type" in message) router.append(message);
			else publish(message);
		},
		makeSessionManager: async ({ cwd, sessionId, sessionPath, parentSession }) =>
			SqliteSessionManager.create({ store: sessionStore, cwd, sessionId, sessionPath, parentSession }).initialized(),
		agentDir,
		promptContextResolver: new PromptContextService(),
	});
	router = new AppRouter({
		database,
		controller,
		publish,
		terminalPty: options.terminalPty,
		integrationRunner: options.integrationRunner,
		accessPolicyService,
		approvalService,
		extensionUiRouter,
		agentDir,
	});
	return {
		database,
		router,
		clients,
		close: async () => {
			database.close();
		},
	};
}

export async function startAppServer(options: CreateAppServerOptions): Promise<AppServerInstance> {
	const host = options.host ?? "127.0.0.1";
	const token = options.token ?? createCapabilityToken();
	const core = await createAppServerCore(options);
	const router = core.router;
	const websocket = createWebSocketHandlers(router, core.clients);
	const server = Bun.serve({
		hostname: host,
		port: options.port ?? 0,
		async fetch(request, server) {
			const url = new URL(request.url);
			if (url.pathname === "/ws") {
				if (!authenticateRequest(request, { token, host, allowSameOriginWebSocket: true }))
					return new Response("Unauthorized", { status: 401 });
				if (server.upgrade(request, { data: { client: undefined as unknown as WebSocketClient } }))
					return undefined;
				return new Response("Upgrade failed", { status: 400 });
			}
			if (url.pathname === "/health") return Response.json({ ok: true });
			if (options.serveGui) {
				const guiResponse = await serveStaticGui(request, {
					distDir: options.guiDistDir,
					wsUrl: `ws://${host}:${server.port}/ws`,
					token,
					projectRoot: options.projectRoot ?? process.cwd(),
				});
				if (guiResponse) return guiResponse;
			}
			return new Response("Not found", { status: 404 });
		},

		websocket,
	});
	const httpUrl = `http://${host}:${server.port}`;
	return {
		server,
		router,
		token,
		httpUrl,
		wsUrl: `ws://${host}:${server.port}/ws`,
		stop: async () => {
			server.stop(true);
			await core.close();
		},
	};
}

const _fakeRuntimeFactory: RuntimeFactory = async (input) => {
	const listeners = new Set<(event: unknown) => void>();
	return {
		cwd: input.cwd,
		session: {
			sessionFile: undefined,
			subscribe(listener) {
				listeners.add(listener);
				return () => listeners.delete(listener);
			},
			async prompt(prompt) {
				for (const listener of listeners) listener({ type: "assistant-message", message: `echo: ${prompt}` });
			},
			async abort() {},
		},
		async dispose() {
			listeners.clear();
		},
	};
};
