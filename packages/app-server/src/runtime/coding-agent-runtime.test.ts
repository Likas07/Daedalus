import { expect, test } from "bun:test";
import { SessionController, type RuntimeFactory } from "./session-controller";

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

	expect(await controller.startSession({ cwd: "/tmp/project", prompt: "hello" })).toEqual({ sessionId: "session-test" });
	expect(prompts).toEqual(["hello"]);
	expect(controller.readState().sessions).toEqual([
		{ sessionId: "session-test", cwd: "/tmp/project", sessionFile: "fake-session.jsonl" },
	]);
});
