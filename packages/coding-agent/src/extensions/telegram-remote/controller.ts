import type { AgentMessage } from "@daedalus-pi/agent-core";
import type { TextContent } from "@daedalus-pi/ai";
import { parseRemoteControlCommand } from "./command-parser.js";
import type { TelegramRemotePairingStore } from "./pairing.js";
import {
	remoteAbortText,
	remoteBusyPromptText,
	remoteDisconnectedText,
	remoteDmOnlyText,
	remoteEmptyMessageText,
	remoteHelpText,
	remoteMissingMessageText,
	remoteNoLastAnswerText,
	remotePairedText,
	remotePairingInstructionsText,
	remoteQueuedText,
	remoteRejectedText,
	remoteStatusText,
	remoteUnknownCommandText,
	remoteUnsafeSlashText,
} from "./replies.js";
import { PerChatSequencer } from "./sequencer.js";
import type { TelegramRuntime, TelegramTextUpdate } from "./telegram-runtime.js";
import type { RemoteControlCommand, TelegramRemoteChatBinding, TelegramRemoteConfig } from "./types.js";

export interface TelegramRemoteStatus {
	isIdle: boolean;
	pendingMessageCount: number;
	sessionId: string;
	sessionName?: string;
}

export interface TelegramRemoteSessionActions {
	getStatus(): TelegramRemoteStatus;
	sendPrompt(message: string): Promise<void> | void;
	steer(message: string): Promise<void> | void;
	followUp(message: string): Promise<void> | void;
	abort(): Promise<void> | void;
	disconnect(): Promise<void>;
}

export interface TelegramRemoteControllerOptions {
	runtime: TelegramRuntime;
	config: TelegramRemoteConfig;
	pairingStore: TelegramRemotePairingStore;
	actions: TelegramRemoteSessionActions;
	sequencer?: PerChatSequencer;
	dedupe?: RecentUpdateDedupe;
	now?: () => number;
}

export class RecentUpdateDedupe {
	private readonly seen = new Set<number>();
	private readonly order: number[] = [];

	constructor(private readonly limit = 256) {}

	mark(updateId: number): boolean {
		if (this.seen.has(updateId)) return false;
		this.seen.add(updateId);
		this.order.push(updateId);
		while (this.order.length > this.limit) {
			const oldest = this.order.shift();
			if (oldest !== undefined) this.seen.delete(oldest);
		}
		return true;
	}
}

export class TelegramRemoteController {
	private readonly runtime: TelegramRuntime;
	private readonly config: TelegramRemoteConfig;
	private readonly pairingStore: TelegramRemotePairingStore;
	private readonly actions: TelegramRemoteSessionActions;
	private readonly sequencer: PerChatSequencer;
	private readonly dedupe: RecentUpdateDedupe;
	private readonly now: () => number;
	private started = false;
	private allowlistBinding: TelegramRemoteChatBinding | undefined;
	private lastAssistantText: string | undefined;
	private lastFinalSentText: string | undefined;

	constructor(options: TelegramRemoteControllerOptions) {
		this.runtime = options.runtime;
		this.config = options.config;
		this.pairingStore = options.pairingStore;
		this.actions = options.actions;
		this.sequencer = options.sequencer ?? new PerChatSequencer();
		this.dedupe = options.dedupe ?? new RecentUpdateDedupe();
		this.now = options.now ?? Date.now;
	}

	async start(): Promise<void> {
		if (this.started) return;
		this.runtime.onTextMessage((update) => this.handleTextUpdate(update));
		await this.runtime.start();
		this.started = true;
	}

	async stop(_reason?: string): Promise<void> {
		if (!this.started) return;
		this.started = false;
		await this.runtime.stop();
	}

	onMessageEnd(message: AgentMessage): void {
		if (message.role !== "assistant") return;
		const text = extractTextFromMessage(message);
		if (!text) return;
		this.lastAssistantText = text;
	}

	async onTurnEnd(): Promise<void> {
		const binding = this.getActiveBinding();
		const text = this.lastAssistantText;
		if (!binding || !text || text === this.lastFinalSentText) return;
		this.lastFinalSentText = text;
		await this.runtime.sendMessage({ chatId: binding.chatId, text });
	}

	private async handleTextUpdate(update: TelegramTextUpdate): Promise<void> {
		if (!this.dedupe.mark(update.updateId)) return;
		await this.sequencer.enqueue(update.chatId, () => this.handleSequencedTextUpdate(update));
	}

	private async handleSequencedTextUpdate(update: TelegramTextUpdate): Promise<void> {
		if (update.chatType !== "private") {
			await this.reply(update, remoteDmOnlyText());
			return;
		}

		if (!this.isAllowedUser(update.userId)) {
			await this.reply(update, remoteRejectedText());
			return;
		}

		const wasUnpaired = this.config.pairingRequired && !this.pairingStore.getBinding();
		const binding = await this.ensureBinding(update);
		if (!binding || wasUnpaired) return;

		if (binding.chatId !== update.chatId || binding.userId !== update.userId) {
			await this.reply(update, remoteRejectedText());
			return;
		}

		const command = parseRemoteControlCommand(update.text);
		await this.routeCommand(update, command);
	}

	private async ensureBinding(update: TelegramTextUpdate): Promise<TelegramRemoteChatBinding | undefined> {
		const userId = update.userId;
		if (userId === undefined) {
			await this.reply(update, remoteRejectedText());
			return undefined;
		}

		if (!this.config.pairingRequired) {
			return this.ensureAllowlistBinding(update, userId);
		}

		const existing = this.pairingStore.getBinding();
		if (existing) return existing;

		const maybeCode = update.text.trim();
		if (/^\d{6}$/.test(maybeCode)) {
			const result = this.pairingStore.tryPair({
				code: maybeCode,
				chatId: update.chatId,
				userId,
				sessionId: this.actions.getStatus().sessionId,
				now: this.now(),
			});
			if (result.ok) {
				await this.reply(update, remotePairedText(this.config));
				return result.binding;
			}
		}

		await this.reply(update, remotePairingInstructionsText(this.config));
		return undefined;
	}

	private ensureAllowlistBinding(update: TelegramTextUpdate, userId: number): TelegramRemoteChatBinding {
		if (!this.allowlistBinding) {
			this.allowlistBinding = {
				chatId: update.chatId,
				userId,
				pairedAt: this.now(),
				sessionId: this.actions.getStatus().sessionId,
			};
		}
		return this.allowlistBinding;
	}

	private async routeCommand(update: TelegramTextUpdate, command: RemoteControlCommand): Promise<void> {
		switch (command.type) {
			case "status":
				await this.reply(
					update,
					remoteStatusText({ ...this.actions.getStatus(), sessionLabel: this.config.sessionLabel }),
				);
				return;
			case "last":
				await this.reply(update, this.lastAssistantText ?? remoteNoLastAnswerText());
				return;
			case "abort":
				await this.actions.abort();
				await this.reply(update, remoteAbortText());
				return;
			case "steer":
				await this.actions.steer(command.message);
				await this.reply(update, remoteQueuedText("steer"));
				return;
			case "follow_up":
				await this.actions.followUp(command.message);
				await this.reply(update, remoteQueuedText("follow-up"));
				return;
			case "help":
				await this.reply(update, remoteHelpText());
				return;
			case "disconnect":
				this.pairingStore.clear();
				this.allowlistBinding = undefined;
				await this.reply(update, remoteDisconnectedText());
				await this.actions.disconnect();
				return;
			case "prompt":
				await this.routePrompt(update, command.message);
				return;
			case "unknown":
				await this.reply(update, unknownReplyText(command));
				return;
		}
	}

	private async routePrompt(update: TelegramTextUpdate, message: string): Promise<void> {
		if (!this.actions.getStatus().isIdle) {
			await this.reply(update, remoteBusyPromptText());
			return;
		}
		await this.actions.sendPrompt(message);
		await this.reply(update, remoteQueuedText("prompt"));
	}

	private getActiveBinding(): TelegramRemoteChatBinding | undefined {
		return this.pairingStore.getBinding() ?? this.allowlistBinding;
	}

	private isAllowedUser(userId: number | undefined): boolean {
		if (userId === undefined) return false;
		return this.config.allowUserIds.length === 0 || this.config.allowUserIds.includes(userId);
	}

	private async reply(update: TelegramTextUpdate, text: string): Promise<void> {
		await this.runtime.sendMessage({ chatId: update.chatId, text, replyToMessageId: update.messageId });
	}
}

function unknownReplyText(command: Extract<RemoteControlCommand, { type: "unknown" }>): string {
	switch (command.reason) {
		case "empty":
			return remoteEmptyMessageText();
		case "missing_message":
			return remoteMissingMessageText(command.input.split(/\s+/, 1)[0] ?? "command");
		case "unsafe_slash":
			return remoteUnsafeSlashText();
		case "unknown_command":
			return remoteUnknownCommandText();
	}
}

function extractTextFromMessage(message: AgentMessage): string | undefined {
	if (message.role !== "assistant") return undefined;
	const parts = message.content
		.filter((part): part is TextContent => part.type === "text")
		.map((part) => part.text.trim());
	const text = parts.filter(Boolean).join("\n").trim();
	return text || undefined;
}
