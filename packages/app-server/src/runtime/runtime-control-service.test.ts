import { describe, expect, test } from "bun:test";
import { RuntimeControlService } from "./runtime-control-service";
import type { ControlledSessionRuntime, SessionController } from "./session-controller";

function makeHarness() {
	const events: unknown[] = [];
	const calls: string[] = [];
	const model = { provider: "openai", id: "gpt-5", name: "GPT 5" };
	const session: any = {
		model: { provider: "openai", id: "gpt-4" },
		thinkingLevel: "low",
		isStreaming: false,
		isCompacting: false,
		steeringMode: "all",
		followUpMode: "all",
		sessionId: "session-1",
		messages: [{ role: "user" }],
		pendingMessageCount: 0,
		modelRegistry: { getAvailable: async () => [model] },
		setModel: async (next: unknown) => {
			session.model = next;
			calls.push("setModel");
		},
		cycleModel: async () => {
			session.model = model;
			return model;
		},
		setThinkingLevel: (level: string) => {
			session.thinkingLevel = level;
			calls.push("setThinkingLevel");
		},
		cycleThinkingLevel: () => {
			session.thinkingLevel = "medium";
			return "medium";
		},
		setActiveTools: (tools: unknown[]) => calls.push(`setTools:${tools.length}`),
		tools: [{ name: "read" }, { name: "grep" }],
		setSteeringMode: (mode: string) => (session.steeringMode = mode),
		setFollowUpMode: (mode: string) => (session.followUpMode = mode),
		compact: async (customInstructions?: string) => ({ ok: true, customInstructions }),
		abort: async () => calls.push("abort"),
		reload: async () => calls.push("reload"),
		extensionRunner: { getRegisteredCommands: () => [{ invocationName: "fix", description: "Fix it" }] },
		promptTemplates: [{ name: "plan", description: "Plan" }],
		resourceLoader: { getSkills: () => ({ skills: [{ name: "debug", description: "Debug" }] }) },
	};
	const runtime: ControlledSessionRuntime = {
		cwd: "/repo",
		session,
		dispose: async () => {},
	};
	const controller = {
		getSessionRuntime: () => runtime,
		emitRuntimeControlChanged: async (_sessionId: string, control: string, payload: unknown) =>
			events.push({ control, payload }),
	} as unknown as SessionController;
	return { service: new RuntimeControlService(controller), session, events, calls };
}

describe("RuntimeControlService", () => {
	test("changes model and thinking", async () => {
		const { service, session, events } = makeHarness();
		expect(await service.setModel("session-1", "openai", "gpt-5")).toEqual({
			model: { provider: "openai", id: "gpt-5", name: "GPT 5" },
		});
		expect(session.model.id).toBe("gpt-5");
		expect(await service.cycleModel("session-1")).toEqual({
			result: { provider: "openai", id: "gpt-5", name: "GPT 5" },
		});
		expect(await service.setThinking("session-1", "high")).toEqual({ level: "high" });
		expect(await service.cycleThinking("session-1")).toEqual({ level: "medium" });
		expect(events.length).toBe(4);
	});

	test("compacts and aborts", async () => {
		const { service, calls } = makeHarness();
		expect(await service.compact("session-1", "keep goals")).toEqual({
			result: { ok: true, customInstructions: "keep goals" },
		});
		expect(await service.abort("session-1")).toEqual({});
		expect(calls).toContain("abort");
	});

	test("lists commands and keybindings", () => {
		const { service } = makeHarness();
		expect(service.getCommands("session-1").commands.map((command) => command.name)).toEqual([
			"fix",
			"plan",
			"skill:debug",
		]);
		expect(service.getKeybindings().keybindings.some((binding) => binding.action === "app.interrupt")).toBe(true);
	});

	test("sets tools, steering, follow-up, and reloads diagnostics", async () => {
		const { service, session, calls } = makeHarness();
		expect(await service.setTools("session-1", ["read"])).toEqual({ tools: ["read"] });
		expect(calls).toContain("setTools:1");
		expect(await service.setSteeringMode("session-1", "one-at-a-time")).toEqual({ mode: "one-at-a-time" });
		expect(await service.setFollowUpMode("session-1", "one-at-a-time")).toEqual({ mode: "one-at-a-time" });
		expect(session.steeringMode).toBe("one-at-a-time");
		expect(await service.reloadResources("session-1")).toEqual({ diagnostics: [] });
		expect(calls).toContain("reload");
	});
});
