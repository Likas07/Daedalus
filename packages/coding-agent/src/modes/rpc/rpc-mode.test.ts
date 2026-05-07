import { describe, expect, test } from "bun:test";
import { createRpcSessionState, promptRpcSession, setRpcFastMode } from "./rpc-mode.js";
import type { RpcCommand, RpcResponse } from "./rpc-types.js";

describe("RPC fast mode", () => {
	test("get_state includes fastMode", () => {
		const state = createRpcSessionState(
			{
				model: undefined,
				thinkingLevel: "off",
				fastMode: true,
				isStreaming: false,
				isCompacting: false,
				steeringMode: "all",
				followUpMode: "one-at-a-time",
				sessionId: "session-1",
				autoCompactionEnabled: true,
				messages: [{ role: "user", content: "hello" }],
				pendingMessageCount: 2,
			},
			{ workspaceTarget: undefined },
		);

		expect(state.fastMode).toBe(true);
		expect(state.messageCount).toBe(1);
		expect(state.pendingMessageCount).toBe(2);
	});

	test("set_fast_mode command and success response are part of the RPC protocol", () => {
		const command = { id: "fast-1", type: "set_fast_mode", enabled: true } satisfies RpcCommand;
		const response = { id: command.id, type: "response", command: command.type, success: true } satisfies RpcResponse;

		expect(command.enabled).toBe(true);
		expect(response).toEqual({ id: "fast-1", type: "response", command: "set_fast_mode", success: true });
	});

	test("setRpcFastMode calls the session fast-mode mutator", () => {
		const calls: boolean[] = [];
		const session = {
			fastMode: false,
			setFastMode(enabled: boolean) {
				this.fastMode = enabled;
				calls.push(enabled);
			},
		};

		setRpcFastMode(session, true);
		setRpcFastMode(session, false);

		expect(calls).toEqual([true, false]);
		expect(session.fastMode).toBe(false);
	});

	test("promptRpcSession resolves only after the session prompt completes", async () => {
		let resolvePrompt: (() => void) | undefined;
		let completed = false;
		const calls: unknown[] = [];
		const session = {
			messages: [] as unknown[],
			async prompt(message: string, options?: unknown) {
				calls.push({ message, options });
				await new Promise<void>((resolve) => {
					resolvePrompt = resolve;
				});
			},
		};

		const promise = promptRpcSession(session, {
			id: "prompt-1",
			type: "prompt",
			message: "hello",
			streamingBehavior: "followUp",
		}).then(() => {
			completed = true;
		});
		await Promise.resolve();

		expect(completed).toBe(false);
		expect(calls).toEqual([
			{
				message: "hello",
				options: { images: undefined, streamingBehavior: "followUp", source: "rpc" },
			},
		]);
		resolvePrompt?.();
		await promise;
		expect(completed).toBe(true);
	});

	test("promptRpcSession returns messages appended during the prompt", async () => {
		const existingMessage = {
			type: "message",
			message: { role: "user", content: [{ type: "text", text: "hello" }] },
		};
		const assistantMessage = {
			type: "message",
			message: { role: "assistant", content: [{ type: "text", text: "hello back" }] },
		};
		const completionEvent = { type: "turn.completed" };
		const session = {
			messages: [existingMessage] as unknown[],
			async prompt() {
				this.messages.push(assistantMessage, completionEvent);
			},
		};

		const events = await promptRpcSession(session, {
			id: "prompt-1",
			type: "prompt",
			message: "hello",
		});

		expect(events).toEqual([assistantMessage, completionEvent]);
		expect(events[0]).toEqual({
			type: "message",
			message: { role: "assistant", content: [{ type: "text", text: "hello back" }] },
		});
	});
});
