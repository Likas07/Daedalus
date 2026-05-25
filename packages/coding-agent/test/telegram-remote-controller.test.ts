import type { AgentMessage } from "@daedalus-pi/agent-core";
import { describe, expect, it } from "vitest";
import {
	RecentUpdateDedupe,
	TelegramRemoteController,
	type TelegramRemoteSessionActions,
} from "../src/extensions/telegram-remote/controller.js";
import { TelegramRemotePairingStore } from "../src/extensions/telegram-remote/pairing.js";
import type { TelegramRuntime, TelegramTextUpdate } from "../src/extensions/telegram-remote/telegram-runtime.js";
import type { TelegramOutboundMessage, TelegramRemoteConfig } from "../src/extensions/telegram-remote/types.js";

class FakeTelegramRuntime implements TelegramRuntime {
	sent: TelegramOutboundMessage[] = [];
	started = false;
	stopped = false;
	private handler: ((update: TelegramTextUpdate) => Promise<void>) | undefined;

	onTextMessage(handler: (update: TelegramTextUpdate) => Promise<void>): void {
		this.handler = handler;
	}

	async start(): Promise<void> {
		this.started = true;
	}

	async stop(): Promise<void> {
		this.stopped = true;
	}

	async sendMessage(message: TelegramOutboundMessage): Promise<void> {
		this.sent.push(message);
	}

	async receive(update: Partial<TelegramTextUpdate> & Pick<TelegramTextUpdate, "updateId" | "chatId" | "text">) {
		if (!this.handler) throw new Error("handler not registered");
		await this.handler({
			chatType: "private",
			messageId: update.updateId + 1000,
			userId: 200,
			...update,
		});
	}
}

function createActions(
	overrides: Partial<TelegramRemoteSessionActions["getStatus"] extends () => infer T ? T : never> = {},
) {
	const calls: Array<{ method: string; message?: string }> = [];
	let disconnected = false;
	const actions: TelegramRemoteSessionActions = {
		getStatus: () => ({
			isIdle: true,
			pendingMessageCount: 0,
			sessionId: "session-1",
			sessionName: "Spec session",
			...overrides,
		}),
		sendPrompt: async (message) => {
			calls.push({ method: "sendPrompt", message });
		},
		steer: async (message) => {
			calls.push({ method: "steer", message });
		},
		followUp: async (message) => {
			calls.push({ method: "followUp", message });
		},
		abort: () => {
			calls.push({ method: "abort" });
		},
		disconnect: async () => {
			disconnected = true;
			calls.push({ method: "disconnect" });
		},
	};
	return {
		actions,
		calls,
		get disconnected() {
			return disconnected;
		},
	};
}

function createConfig(overrides: Partial<TelegramRemoteConfig> = {}): TelegramRemoteConfig {
	return {
		enabled: true,
		botToken: "token",
		dmPolicy: "pairing",
		allowUserIds: [200],
		pairingRequired: true,
		lockPath: "/tmp/telegram.lock",
		sessionLabel: "Daedalus CLI",
		...overrides,
	};
}

function createHarness(
	options: { config?: Partial<TelegramRemoteConfig>; status?: Parameters<typeof createActions>[0] } = {},
) {
	const runtime = new FakeTelegramRuntime();
	const pairingStore = new TelegramRemotePairingStore();
	const { actions, calls, disconnected } = createActions(options.status);
	const controller = new TelegramRemoteController({
		runtime,
		config: createConfig(options.config),
		pairingStore,
		actions,
		now: () => 1_700_000_000_000,
	});
	return { runtime, pairingStore, actions, calls, disconnected, controller };
}

async function pairHarness(harness: ReturnType<typeof createHarness>) {
	const code = harness.pairingStore.createPairingCode("session-1", 1_700_000_000_000);
	await harness.controller.start();
	await harness.runtime.receive({ updateId: 1, chatId: 100, userId: 200, text: code });
	return code;
}

describe("TelegramRemoteController access control and pairing", () => {
	it("starts and stops the injected runtime without network access", async () => {
		const { controller, runtime } = createHarness();

		await controller.start();
		await controller.stop();

		expect(runtime.started).toBe(true);
		expect(runtime.stopped).toBe(true);
	});

	it("rejects non-private chats", async () => {
		const { controller, runtime } = createHarness();
		await controller.start();

		await runtime.receive({ updateId: 1, chatId: -100, chatType: "group", userId: 200, text: "/status" });

		expect(runtime.sent.at(-1)?.text).toContain("only supports private DM chats");
	});

	it("sends pairing instructions to an unpaired allowlisted user", async () => {
		const { controller, runtime, pairingStore } = createHarness();
		pairingStore.createPairingCode("session-1", 1_700_000_000_000);
		await controller.start();

		await runtime.receive({ updateId: 1, chatId: 100, userId: 200, text: "/status" });

		expect(runtime.sent.at(-1)?.text).toContain("Pair this chat");
		expect(runtime.sent.at(-1)?.text).toContain("six-digit code");
	});

	it("binds the chat when the allowlisted user sends the correct pairing code", async () => {
		const { controller, runtime, pairingStore } = createHarness();
		const code = pairingStore.createPairingCode("session-1", 1_700_000_000_000);
		await controller.start();

		await runtime.receive({ updateId: 1, chatId: 100, userId: 200, text: code });

		expect(pairingStore.getBinding()).toEqual({
			chatId: 100,
			userId: 200,
			pairedAt: 1_700_000_000_000,
			sessionId: "session-1",
		});
		expect(runtime.sent.at(-1)?.text).toContain("paired");
	});

	it("rejects a non-allowlisted user even with a valid pairing code", async () => {
		const { controller, runtime, pairingStore } = createHarness();
		const code = pairingStore.createPairingCode("session-1", 1_700_000_000_000);
		await controller.start();

		await runtime.receive({ updateId: 1, chatId: 101, userId: 999, text: code });

		expect(pairingStore.getBinding()).toBeUndefined();
		expect(runtime.sent.at(-1)?.text).toContain("not authorized");
	});

	it("disconnect clears the binding and stops accepting commands", async () => {
		const harness = createHarness();
		await pairHarness(harness);

		await harness.runtime.receive({ updateId: 2, chatId: 100, userId: 200, text: "/disconnect" });
		await harness.runtime.receive({ updateId: 3, chatId: 100, userId: 200, text: "/status" });

		expect(harness.pairingStore.getBinding()).toBeUndefined();
		expect(harness.calls).toContainEqual({ method: "disconnect" });
		expect(harness.runtime.sent.at(-1)?.text).toContain("Pair this chat");
	});
});

describe("TelegramRemoteController command routing", () => {
	it("replies to /status with the session state", async () => {
		const harness = createHarness({ status: { pendingMessageCount: 2, isIdle: false } });
		await pairHarness(harness);

		await harness.runtime.receive({ updateId: 2, chatId: 100, userId: 200, text: "/status" });

		expect(harness.runtime.sent.at(-1)?.text).toContain("busy");
		expect(harness.runtime.sent.at(-1)?.text).toContain("Pending messages: 2");
	});

	it("resends the last assistant answer for /last", async () => {
		const harness = createHarness();
		await pairHarness(harness);
		harness.controller.onMessageEnd(assistantMessage("Last answer."));

		await harness.runtime.receive({ updateId: 2, chatId: 100, userId: 200, text: "/last" });

		expect(harness.runtime.sent.at(-1)?.text).toBe("Last answer.");
	});

	it("aborts the current turn for /abort", async () => {
		const harness = createHarness();
		await pairHarness(harness);

		await harness.runtime.receive({ updateId: 2, chatId: 100, userId: 200, text: "/abort" });

		expect(harness.calls).toContainEqual({ method: "abort" });
		expect(harness.runtime.sent.at(-1)?.text).toContain("Abort requested");
	});

	it("routes /steer and /follow-up to queue-specific actions", async () => {
		const harness = createHarness();
		await pairHarness(harness);

		await harness.runtime.receive({ updateId: 2, chatId: 100, userId: 200, text: "/steer focus on tests" });
		await harness.runtime.receive({ updateId: 3, chatId: 100, userId: 200, text: "/follow-up summarize" });

		expect(harness.calls).toContainEqual({ method: "steer", message: "focus on tests" });
		expect(harness.calls).toContainEqual({ method: "followUp", message: "summarize" });
	});

	it("starts a plain-text prompt only while Daedalus is idle", async () => {
		const idleHarness = createHarness();
		await pairHarness(idleHarness);

		await idleHarness.runtime.receive({ updateId: 2, chatId: 100, userId: 200, text: "inspect the diff" });

		expect(idleHarness.calls).toContainEqual({ method: "sendPrompt", message: "inspect the diff" });

		const busyHarness = createHarness({ status: { isIdle: false } });
		await pairHarness(busyHarness);
		await busyHarness.runtime.receive({ updateId: 2, chatId: 100, userId: 200, text: "inspect the diff" });

		expect(busyHarness.calls).not.toContainEqual({ method: "sendPrompt", message: "inspect the diff" });
		expect(busyHarness.runtime.sent.at(-1)?.text).toContain("Use /steer");
	});

	it("shows help text with the supported commands", async () => {
		const harness = createHarness();
		await pairHarness(harness);

		await harness.runtime.receive({ updateId: 2, chatId: 100, userId: 200, text: "/help" });

		expect(harness.runtime.sent.at(-1)?.text).toContain("/status - show session state");
		expect(harness.runtime.sent.at(-1)?.text).toContain("/follow-up <message> - queue a follow-up");
		expect(harness.runtime.sent.at(-1)?.text).toContain("remote approvals are not enabled in v1");
	});

	it("rejects unsafe slash commands without routing them into Daedalus", async () => {
		const harness = createHarness();
		await pairHarness(harness);

		await harness.runtime.receive({ updateId: 2, chatId: 100, userId: 200, text: "/model gpt-5" });
		await harness.runtime.receive({ updateId: 3, chatId: 100, userId: 200, text: "/bash rm -rf" });

		expect(harness.calls.filter((call) => call.method === "sendPrompt")).toHaveLength(0);
		expect(harness.runtime.sent.at(-1)?.text).toContain("not available over Telegram");
	});

	it("sends the final assistant text to the paired chat on turn end", async () => {
		const harness = createHarness();
		await pairHarness(harness);
		harness.controller.onMessageEnd(assistantMessage("Final answer from Daedalus."));

		await harness.controller.onTurnEnd();

		expect(harness.runtime.sent.at(-1)).toMatchObject({ chatId: 100, text: "Final answer from Daedalus." });
	});
});

describe("RecentUpdateDedupe", () => {
	it("marks duplicate update IDs as already handled", () => {
		const dedupe = new RecentUpdateDedupe(2);

		expect(dedupe.mark(1)).toBe(true);
		expect(dedupe.mark(1)).toBe(false);
		expect(dedupe.mark(2)).toBe(true);
		expect(dedupe.mark(3)).toBe(true);
		expect(dedupe.mark(1)).toBe(true);
	});

	it("prevents duplicate Telegram deliveries from duplicating prompts", async () => {
		const harness = createHarness();
		await pairHarness(harness);

		await harness.runtime.receive({ updateId: 2, chatId: 100, userId: 200, text: "run tests" });
		await harness.runtime.receive({ updateId: 2, chatId: 100, userId: 200, text: "run tests" });

		expect(harness.calls.filter((call) => call.method === "sendPrompt")).toEqual([
			{ method: "sendPrompt", message: "run tests" },
		]);
	});
});

function assistantMessage(text: string): AgentMessage {
	return {
		role: "assistant",
		content: [{ type: "text", text }],
		api: "openai-responses",
		provider: "openai",
		model: "gpt-5",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: 1_700_000_000_100,
	};
}
