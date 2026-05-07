import { expect, mock, test } from "bun:test";
import { type RuntimeFactory, SessionController } from "./session-controller";

test("session controller accepts deterministic runtime factory injection", async () => {
	const prompts: string[] = [];
	const factory: RuntimeFactory = async (input) => ({
		cwd: input.cwd,
		session: {
			sessionFile: "fake-session.jsonl",
			subscribe: () => () => {},
			prompt: async (prompt) => {
				prompts.push(prompt);
			},
			abort: async () => {},
		},
		dispose: async () => {},
	});
	const events: unknown[] = [];
	const controller = new SessionController({
		runtimeFactory: factory,
		eventSink: (event) => {
			events.push(event);
		},
		makeSessionManager: () => ({}),
		agentDir: "/tmp/agent",
		nextSessionId: () => "session-test",
		nextTurnId: () => "turn-test",
		nextEventId: () => `event-${events.length}`,
		now: () => new Date("2026-04-25T00:00:00.000Z"),
	});

	expect(await controller.startSession({ cwd: "/tmp/project", prompt: "hello" })).toEqual({
		sessionId: "session-test",
	});
	expect(prompts).toEqual(["hello"]);
	expect(controller.readState().sessions).toEqual([
		{ sessionId: "session-test", cwd: "/tmp/project", sessionFile: "fake-session.jsonl" },
	]);
});

test("applyRuntimeOptions updates the coding-agent fast-mode state", async () => {
	let fastModeState = false;
	const appliedToolSets: unknown[][] = [];
	const session = {
		sessionFile: "fake-session.jsonl",
		agent: { state: {} },
		setActiveTools: (tools: unknown[]) => appliedToolSets.push(tools),
		setFastMode: (enabled: boolean) => {
			fastModeState = enabled;
		},
	};
	const diagnostics: unknown[] = [];
	const services = {
		diagnostics,
		modelRegistry: { getAll: () => [] },
	};

	mock.module("@daedalus-pi/coding-agent", () => ({
		createReadTool: () => ({ name: "read" }),
		createBashTool: () => ({ name: "bash" }),
		createWriteTool: () => ({ name: "write" }),
		createGrepTool: () => ({ name: "grep" }),
		createFindTool: () => ({ name: "find" }),
		createLsTool: () => ({ name: "ls" }),
		getAgentDir: () => "/tmp/agent",
		SessionManager: { create: () => ({}) },
		createAgentSessionServices: async () => services,
		createAgentSessionFromServices: async () => ({ session, services, diagnostics }),
		createAgentSessionRuntime: async (createRuntime: (input: unknown) => Promise<unknown>, input: any) => {
			const created = (await createRuntime({
				cwd: input.cwd,
				sessionManager: input.sessionManager,
				workspaceTarget: input.workspaceTarget,
			})) as { session: unknown; services: unknown; diagnostics: unknown[] };
			return {
				cwd: input.cwd,
				session: created.session,
				diagnostics: created.diagnostics,
				workspaceTarget: input.workspaceTarget,
				switchWorkspaceTarget: async () => {},
				dispose: async () => {},
			};
		},
	}));

	const { createCodingAgentRuntimeFactory } = await import("./coding-agent-runtime");
	const fastModeEntries: boolean[] = [];
	const runtime = await createCodingAgentRuntimeFactory()({
		cwd: "/tmp/project",
		sessionManager: { appendFastModeChange: (enabled: boolean) => String(fastModeEntries.push(enabled)) },
		agentDir: "/tmp/agent",
	});

	expect(fastModeState).toBe(false);
	await runtime.applyRuntimeOptions?.({ fastMode: true });

	expect(fastModeState).toBe(true);
	expect(fastModeEntries).toEqual([true]);
	expect(appliedToolSets.at(-1)?.map((tool: any) => tool.name)).toEqual([
		"read",
		"bash",
		"write",
		"grep",
		"find",
		"ls",
	]);
});
