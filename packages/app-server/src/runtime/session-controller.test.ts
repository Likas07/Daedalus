import { describe, expect, test } from "bun:test";
import { type ControlledSessionRuntime, type RuntimeControllerMessage, SessionController } from "./session-controller";

class FakeRuntime implements ControlledSessionRuntime {
	readonly cwd: string;
	readonly session: ControlledSessionRuntime["session"];
	prompts: string[] = [];
	aborted = false;
	disposed = false;
	private listeners: Array<(event: unknown) => void> = [];

	constructor(
		cwd: string,
		readonly sessionFile?: string,
	) {
		this.cwd = cwd;
		this.session = {
			sessionFile,
			subscribe: (listener) => {
				this.listeners.push(listener);
				return () => {
					this.listeners = this.listeners.filter((current) => current !== listener);
				};
			},
			prompt: async (prompt) => {
				this.prompts.push(prompt);
				this.emit({ type: "agent_start" });
				this.emit({ type: "agent_end" });
			},
			abort: async () => {
				this.aborted = true;
			},
		};
	}

	async dispose(): Promise<void> {
		this.disposed = true;
	}

	emit(event: unknown): void {
		for (const listener of this.listeners) listener(event);
	}
}

describe("SessionController", () => {
	test("starts sessions and turns through an injected runtime without changing process cwd", async () => {
		const originalCwd = process.cwd();
		const messages: RuntimeControllerMessage[] = [];
		const runtimes: FakeRuntime[] = [];
		const factoryInputs: unknown[] = [];
		let eventId = 0;
		const controller = new SessionController({
			agentDir: "/agent",
			eventSink: (message) => {
				messages.push(message);
			},
			makeSessionManager: ({ cwd }) => ({ cwd }),
			nextSessionId: () => "session-1",
			nextTurnId: () => "turn-1",
			nextEventId: () => `event-${++eventId}`,
			now: () => new Date("2026-01-02T03:04:05.000Z"),
			runtimeFactory: async (input) => {
				factoryInputs.push(input);
				const runtime = new FakeRuntime(input.cwd, "/session.jsonl");
				runtimes.push(runtime);
				return runtime;
			},
		});

		const started = await controller.startSession({ cwd: "/tmp/project", prompt: "hello" });

		expect(started).toEqual({ sessionId: "session-1" });
		expect(process.cwd()).toBe(originalCwd);
		expect(factoryInputs).toEqual([
			expect.objectContaining({ cwd: "/tmp/project", agentDir: "/agent", applyProcessCwd: false }),
		]);
		expect(runtimes[0]?.prompts).toEqual(["hello"]);
		expect(controller.readState()).toEqual({
			sessions: [{ sessionId: "session-1", cwd: "/tmp/project", sessionFile: "/session.jsonl" }],
		});
		expect(messages).toContainEqual(
			expect.objectContaining({
				kind: "notification",
				method: "session/changed",
				params: { sessionId: "session-1", status: "active" },
			}),
		);
		expect(messages).toContainEqual(
			expect.objectContaining({
				kind: "notification",
				method: "turn/changed",
				params: { sessionId: "session-1", turnId: "turn-1", status: "completed" },
			}),
		);
	});

	test("interrupts and disposes sessions", async () => {
		const messages: RuntimeControllerMessage[] = [];
		let runtime: FakeRuntime | undefined;
		const controller = new SessionController({
			agentDir: "/agent",
			eventSink: (message) => {
				messages.push(message);
			},
			makeSessionManager: ({ cwd }) => ({ cwd }),
			nextSessionId: () => "session-2",
			nextTurnId: () => "turn-2",
			nextEventId: () => "event",
			runtimeFactory: async (input) => {
				runtime = new FakeRuntime(input.cwd);
				return runtime;
			},
		});

		await controller.startSession({ cwd: "/tmp/project" });
		await controller.startTurn({ sessionId: "session-2", prompt: "work", turnId: "turn-2" });
		await controller.interruptTurn({ sessionId: "session-2" });
		await controller.disposeSession("session-2");

		expect(runtime?.aborted).toBe(true);
		expect(runtime?.disposed).toBe(true);
		expect(controller.readState()).toEqual({ sessions: [] });
		expect(messages).toContainEqual(
			expect.objectContaining({
				kind: "notification",
				method: "turn/changed",
				params: { sessionId: "session-2", turnId: "turn-2", status: "interrupted" },
			}),
		);
		expect(messages).toContainEqual(
			expect.objectContaining({
				kind: "notification",
				method: "session/changed",
				params: { sessionId: "session-2", status: "disposed" },
			}),
		);
	});
});
