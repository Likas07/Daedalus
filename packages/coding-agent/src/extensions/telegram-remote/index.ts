import type { AgentMessage } from "@daedalus-pi/agent-core";
import type { ExtensionAPI, ExtensionCommandContext } from "../../core/extensions/types.js";
import { readTelegramRemoteConfig, type TelegramRemoteConfigOverrides, type TelegramRemoteEnv } from "./config.js";
import { TelegramRemoteController } from "./controller.js";
import { TelegramRemotePairingStore } from "./pairing.js";
import { acquireTelegramPollerLock, type TelegramPollerLock } from "./poller-lock.js";
import type { TelegramRuntime } from "./telegram-runtime.js";
import type { TelegramRemoteConfig } from "./types.js";

export interface TelegramRemoteExtensionOptions {
	env?: TelegramRemoteEnv;
	configOverrides?: TelegramRemoteConfigOverrides | ((ctx: ExtensionCommandContext) => TelegramRemoteConfigOverrides);
	runtimeFactory?: (config: TelegramRemoteConfig) => TelegramRuntime | Promise<TelegramRuntime>;
	lockFactory?: (lockPath: string) => Promise<TelegramPollerLock>;
	now?: () => number;
}

interface ActiveTelegramBridge {
	controller: TelegramRemoteController;
	lock: TelegramPollerLock;
	config: TelegramRemoteConfig;
	pairingStore: TelegramRemotePairingStore;
	pairingCode?: string;
}

const STATUS_KEY = "telegram-remote";
type TelegramRemoteUiContext = Pick<ExtensionCommandContext, "ui">;

export default function telegramRemoteExtension(pi: ExtensionAPI, options: TelegramRemoteExtensionOptions = {}) {
	let activeBridge: ActiveTelegramBridge | undefined;
	const now = options.now ?? Date.now;
	const lockFactory = options.lockFactory ?? acquireTelegramPollerLock;
	const runtimeFactory =
		options.runtimeFactory ??
		(async (config: TelegramRemoteConfig) => {
			const { GrammyTelegramRuntime } = await import("./telegram-runtime.js");
			return new GrammyTelegramRuntime({
				botToken: config.botToken,
				onPollingError: (error) => {
					console.warn(`Telegram remote control polling failed: ${formatError(error)}`);
				},
			});
		});

	pi.registerCommand("remote-control", {
		description: "Remote-control integrations: /remote-control telegram [status|stop]",
		handler: async (args, ctx) => {
			const { target, rest } = splitFirstArg(args);
			if (target !== "telegram") {
				ctx.ui.notify("Usage: /remote-control telegram [status|stop]", "warning");
				return;
			}
			await handleTelegramCommand(rest, ctx);
		},
	});

	pi.registerCommand("rc", {
		description: "Start or manage Telegram remote control: /rc [status|stop]",
		handler: async (args, ctx) => {
			let commandArgs = args.trim();
			if (commandArgs === "telegram" || commandArgs.startsWith("telegram ")) {
				commandArgs = commandArgs.slice("telegram".length).trim();
			}
			await handleTelegramCommand(commandArgs, ctx);
		},
	});

	pi.on("message_end", (event) => {
		activeBridge?.controller.onMessageEnd(event.message as AgentMessage);
	});

	pi.on("turn_end", async () => {
		await activeBridge?.controller.onTurnEnd();
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		await stopBridge(ctx, { notify: false });
	});

	async function handleTelegramCommand(args: string, ctx: ExtensionCommandContext): Promise<void> {
		const { target } = splitFirstArg(args);
		switch (target) {
			case "":
			case "start":
			case "on":
				await startBridge(ctx);
				return;
			case "status":
				showStatus(ctx);
				return;
			case "stop":
			case "disconnect":
			case "off":
				await stopBridge(ctx, { notify: true });
				return;
			case "help":
				ctx.ui.notify("Usage: /remote-control telegram [status|stop] or /rc [status|stop]", "info");
				return;
			default:
				ctx.ui.notify("Usage: /remote-control telegram [status|stop] or /rc [status|stop]", "warning");
		}
	}

	async function startBridge(ctx: ExtensionCommandContext): Promise<void> {
		if (activeBridge) {
			ctx.ui.notify(activeStatusText(activeBridge), "info");
			setActiveStatus(ctx, activeBridge);
			return;
		}

		let lock: TelegramPollerLock | undefined;
		try {
			const config = readTelegramRemoteConfig(getEnv(), ctx.cwd, getConfigOverrides(ctx));
			lock = await lockFactory(config.lockPath);
			const pairingStore = new TelegramRemotePairingStore();
			const pairingCode = config.pairingRequired
				? pairingStore.createPairingCode(ctx.sessionManager.getSessionId(), now())
				: undefined;
			const runtime = await runtimeFactory(config);
			const controller = new TelegramRemoteController({
				runtime,
				config,
				pairingStore,
				now,
				actions: {
					getStatus: () => ({
						isIdle: ctx.isIdle(),
						pendingMessageCount: ctx.hasPendingMessages() ? 1 : 0,
						sessionId: ctx.sessionManager.getSessionId(),
						sessionName: ctx.sessionManager.getSessionName(),
					}),
					sendPrompt: (message) => pi.sendUserMessage(message),
					steer: (message) => pi.sendUserMessage(message, { deliverAs: "steer" }),
					followUp: (message) => pi.sendUserMessage(message, { deliverAs: "followUp" }),
					abort: () => ctx.abort(),
					disconnect: async () => {
						await stopBridge(ctx, { notify: true });
					},
				},
			});

			activeBridge = { controller, lock, config, pairingStore, pairingCode };
			await controller.start();
			setActiveStatus(ctx, activeBridge);
			ctx.ui.notify(startedText(activeBridge), "info");
		} catch (error) {
			activeBridge = undefined;
			if (lock) await lock.release().catch(() => undefined);
			ctx.ui.setStatus(STATUS_KEY, undefined);
			ctx.ui.notify(`Telegram remote control did not start: ${formatError(error)}`, "error");
		}
	}

	async function stopBridge(ctx: TelegramRemoteUiContext, opts: { notify: boolean }): Promise<void> {
		const bridge = activeBridge;
		if (!bridge) {
			if (opts.notify) ctx.ui.notify("Telegram remote control is not running.", "info");
			ctx.ui.setStatus(STATUS_KEY, undefined);
			return;
		}

		activeBridge = undefined;
		let stopError: unknown;
		try {
			await bridge.controller.stop("command");
		} catch (error) {
			stopError = error;
		}
		try {
			await bridge.lock.release();
		} catch (error) {
			stopError ??= error;
		}

		ctx.ui.setStatus(STATUS_KEY, undefined);
		if (opts.notify) {
			if (stopError) {
				ctx.ui.notify(`Telegram remote control stopped with cleanup warning: ${formatError(stopError)}`, "warning");
			} else {
				ctx.ui.notify("Telegram remote control stopped.", "info");
			}
		}
	}

	function showStatus(ctx: TelegramRemoteUiContext): void {
		if (!activeBridge) {
			ctx.ui.notify("Telegram remote control is not running.", "info");
			ctx.ui.setStatus(STATUS_KEY, undefined);
			return;
		}
		setActiveStatus(ctx, activeBridge);
		ctx.ui.notify(activeStatusText(activeBridge), "info");
	}

	function setActiveStatus(ctx: TelegramRemoteUiContext, bridge: ActiveTelegramBridge): void {
		ctx.ui.setStatus(
			STATUS_KEY,
			bridge.config.pairingRequired && !bridge.pairingStore.getBinding()
				? "Telegram RC: pairing"
				: "Telegram RC: active",
		);
	}

	function getEnv(): TelegramRemoteEnv {
		const env = options.env ?? process.env;
		return {
			DAEDALUS_TELEGRAM_BOT_TOKEN: env.DAEDALUS_TELEGRAM_BOT_TOKEN,
			DAEDALUS_TELEGRAM_ALLOW_USER_IDS: env.DAEDALUS_TELEGRAM_ALLOW_USER_IDS,
			DAEDALUS_TELEGRAM_DM_POLICY: env.DAEDALUS_TELEGRAM_DM_POLICY,
		};
	}

	function getConfigOverrides(ctx: ExtensionCommandContext): TelegramRemoteConfigOverrides {
		return typeof options.configOverrides === "function"
			? options.configOverrides(ctx)
			: (options.configOverrides ?? {});
	}
}

function splitFirstArg(args: string): { target: string; rest: string } {
	const trimmed = args.trim();
	if (!trimmed) return { target: "", rest: "" };
	const spaceIndex = trimmed.search(/\s/);
	if (spaceIndex === -1) return { target: trimmed, rest: "" };
	return {
		target: trimmed.slice(0, spaceIndex),
		rest: trimmed.slice(spaceIndex).trim(),
	};
}

function startedText(bridge: ActiveTelegramBridge): string {
	if (bridge.pairingCode) {
		return [
			"Telegram remote control started.",
			`Pairing code: ${bridge.pairingCode}`,
			"Send this six-digit code to your Telegram bot DM to connect.",
		].join("\n");
	}
	return "Telegram remote control started. Send /help to your Telegram bot DM for remote commands.";
}

function activeStatusText(bridge: ActiveTelegramBridge): string {
	const binding = bridge.pairingStore.getBinding();
	if (bridge.config.pairingRequired && !binding) {
		return bridge.pairingCode
			? `Telegram remote control is running and waiting for pairing code ${bridge.pairingCode}.`
			: "Telegram remote control is running and waiting for pairing.";
	}
	return "Telegram remote control is running.";
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
