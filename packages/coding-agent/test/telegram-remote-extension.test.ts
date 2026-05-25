import { describe, expect, it, vi } from "vitest";
import daedalusBundle from "../src/extensions/daedalus/bundle.js";
import telegramRemoteExtension, {
	type TelegramRemoteExtensionOptions,
} from "../src/extensions/telegram-remote/index.js";
import type { TelegramRuntime, TelegramTextUpdate } from "../src/extensions/telegram-remote/telegram-runtime.js";
import type { TelegramOutboundMessage } from "../src/extensions/telegram-remote/types.js";

class FakeTelegramRuntime implements TelegramRuntime {
	sent: TelegramOutboundMessage[] = [];
	startCalls = 0;
	stopCalls = 0;
	private handler: ((update: TelegramTextUpdate) => Promise<void>) | undefined;

	onTextMessage(handler: (update: TelegramTextUpdate) => Promise<void>): void {
		this.handler = handler;
	}

	async start(): Promise<void> {
		this.startCalls += 1;
	}

	async stop(): Promise<void> {
		this.stopCalls += 1;
	}

	async sendMessage(message: TelegramOutboundMessage): Promise<void> {
		this.sent.push(message);
	}

	async receive(update: Partial<TelegramTextUpdate> & Pick<TelegramTextUpdate, "updateId" | "chatId" | "text">) {
		if (!this.handler) throw new Error("Telegram text handler was not registered");
		await this.handler({
			chatType: "private",
			messageId: update.updateId + 1000,
			userId: 200,
			...update,
		});
	}
}

function createFakePi() {
	const commands = new Map<string, any>();
	const handlers = new Map<string, Array<(event: any, ctx: any) => any>>();
	const sentUserMessages: Array<{ content: string; options?: { deliverAs?: "steer" | "followUp" } }> = [];

	const pi = new Proxy(
		{
			registerCommand(name: string, options: any) {
				commands.set(name, options);
			},
			on(event: string, handler: (event: any, ctx: any) => any) {
				const existing = handlers.get(event) ?? [];
				existing.push(handler);
				handlers.set(event, existing);
			},
			sendUserMessage(content: string, options?: { deliverAs?: "steer" | "followUp" }) {
				sentUserMessages.push({ content, options });
			},
			getFlag: () => undefined,
		},
		{
			get(target, prop: string | symbol) {
				if (prop in target) return target[prop as keyof typeof target];
				return () => undefined;
			},
		},
	) as any;

	return { pi, commands, handlers, sentUserMessages };
}

function createCommandContext(overrides: { idle?: boolean; pending?: boolean } = {}) {
	const notifications: Array<{ message: string; type?: "info" | "warning" | "error" }> = [];
	const statuses: Array<{ key: string; text: string | undefined }> = [];
	let aborted = false;

	const ctx = {
		cwd: "/tmp/daedalus-telegram-remote-test",
		ui: {
			notify(message: string, type?: "info" | "warning" | "error") {
				notifications.push({ message, type });
			},
			setStatus(key: string, text: string | undefined) {
				statuses.push({ key, text });
			},
		},
		sessionManager: {
			getSessionId: () => "session-1",
			getSessionName: () => "Spec session",
		},
		isIdle: () => overrides.idle ?? true,
		hasPendingMessages: () => overrides.pending ?? false,
		abort: () => {
			aborted = true;
		},
	} as any;

	return {
		ctx,
		notifications,
		statuses,
		get aborted() {
			return aborted;
		},
	};
}

function installTelegramRemote(options: TelegramRemoteExtensionOptions = {}) {
	const runtime = new FakeTelegramRuntime();
	let lockAcquireCount = 0;
	let lockReleaseCount = 0;
	const harness = createFakePi();
	telegramRemoteExtension(harness.pi, {
		env: { DAEDALUS_TELEGRAM_BOT_TOKEN: "123456:test-token" },
		runtimeFactory: () => runtime,
		lockFactory: async (path) => {
			lockAcquireCount += 1;
			return {
				path,
				release: async () => {
					lockReleaseCount += 1;
				},
			};
		},
		now: () => 1_700_000_000_000,
		...options,
	});
	return {
		...harness,
		runtime,
		get lockAcquireCount() {
			return lockAcquireCount;
		},
		get lockReleaseCount() {
			return lockReleaseCount;
		},
	};
}

async function emitHandlers(
	handlers: Map<string, Array<(event: any, ctx: any) => any>>,
	event: string,
	payload: any,
	ctx: any,
) {
	for (const handler of handlers.get(event) ?? []) {
		await handler(payload, ctx);
	}
}

describe("telegram remote-control extension", () => {
	it("registers commands without starting Telegram or requiring config", () => {
		const harness = createFakePi();
		const runtimeFactory = vi.fn(() => new FakeTelegramRuntime());
		const lockFactory = vi.fn();

		telegramRemoteExtension(harness.pi, { env: {}, runtimeFactory, lockFactory });

		expect(harness.commands.has("remote-control")).toBe(true);
		expect(harness.commands.has("rc")).toBe(true);
		expect(runtimeFactory).not.toHaveBeenCalled();
		expect(lockFactory).not.toHaveBeenCalled();
	});

	it("loads in the Daedalus bundle while dormant when Telegram env is absent", () => {
		const harness = createFakePi();

		expect(() => daedalusBundle(harness.pi)).not.toThrow();
		expect(harness.commands.has("remote-control")).toBe(true);
		expect(harness.commands.has("rc")).toBe(true);
	});

	it("starts from /remote-control telegram, pairs, forwards final answers, and stops on shutdown", async () => {
		const harness = installTelegramRemote();
		const commandContext = createCommandContext();

		await harness.commands.get("remote-control").handler("telegram", commandContext.ctx);

		expect(harness.lockAcquireCount).toBe(1);
		expect(harness.runtime.startCalls).toBe(1);
		expect(commandContext.statuses.at(-1)).toEqual({ key: "telegram-remote", text: "Telegram RC: pairing" });
		const startNotice = commandContext.notifications.map((entry) => entry.message).join("\n");
		const pairingCode = startNotice.match(/Pairing code: (\d{6})/)?.[1];
		expect(pairingCode).toBeDefined();

		await harness.runtime.receive({ updateId: 1, chatId: 100, userId: 200, text: pairingCode! });
		expect(harness.runtime.sent.at(-1)?.text).toContain("Telegram remote control paired");

		await emitHandlers(
			harness.handlers,
			"message_end",
			{
				type: "message_end",
				message: { role: "assistant", content: [{ type: "text", text: "final answer" }] },
			},
			commandContext.ctx,
		);
		await emitHandlers(harness.handlers, "turn_end", { type: "turn_end" }, commandContext.ctx);

		expect(harness.runtime.sent).toContainEqual({ chatId: 100, text: "final answer" });

		await emitHandlers(harness.handlers, "session_shutdown", { type: "session_shutdown" }, commandContext.ctx);

		expect(harness.runtime.stopCalls).toBe(1);
		expect(harness.lockReleaseCount).toBe(1);
		expect(commandContext.statuses.at(-1)).toEqual({ key: "telegram-remote", text: undefined });
	});

	it("supports /rc start, status, and stop lifecycle commands", async () => {
		const harness = installTelegramRemote({
			configOverrides: { dmPolicy: "allowlist", pairingRequired: false, allowUserIds: [200] },
		});
		const commandContext = createCommandContext();

		await harness.commands.get("rc").handler("", commandContext.ctx);
		expect(harness.runtime.startCalls).toBe(1);
		expect(commandContext.statuses.at(-1)).toEqual({ key: "telegram-remote", text: "Telegram RC: active" });

		await harness.commands.get("rc").handler("status", commandContext.ctx);
		expect(commandContext.notifications.at(-1)?.message).toBe("Telegram remote control is running.");

		await harness.commands.get("rc").handler("stop", commandContext.ctx);
		expect(harness.runtime.stopCalls).toBe(1);
		expect(harness.lockReleaseCount).toBe(1);
		expect(commandContext.notifications.at(-1)?.message).toBe("Telegram remote control stopped.");
	});
});
