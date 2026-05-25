import type { TelegramOutboundMessage } from "./types.js";

export interface TelegramTextUpdate {
	updateId: number;
	chatId: number;
	chatType: "private" | "group" | "supergroup" | "channel";
	userId?: number;
	text: string;
	messageId: number;
}

export interface TelegramRuntime {
	start(): Promise<void>;
	stop(): Promise<void>;
	sendMessage(message: TelegramOutboundMessage): Promise<void>;
	onTextMessage(handler: (update: TelegramTextUpdate) => Promise<void>): void;
}

export interface GrammyTelegramRuntimeOptions {
	botToken: string;
	nonPrivateChatReply?: string;
	onPollingError?: (error: unknown) => void;
}

type GrammyBot = {
	on(event: "message:text", handler: (ctx: any) => Promise<void>): void;
	init(): Promise<void>;
	start(options: { allowed_updates: string[] }): Promise<void>;
	stop(): Promise<void>;
	api: {
		sendMessage(chatId: number, text: string, options?: { reply_parameters?: { message_id: number } }): Promise<void>;
	};
};

type GrammyBotConstructor = new (botToken: string) => GrammyBot;

export class GrammyTelegramRuntime implements TelegramRuntime {
	private readonly botToken: string;
	private readonly nonPrivateChatReply: string;
	private readonly onPollingError: (error: unknown) => void;
	private bot: GrammyBot | undefined;
	private textHandler: ((update: TelegramTextUpdate) => Promise<void>) | undefined;
	private pollingPromise: Promise<void> | undefined;
	private started = false;

	constructor(options: GrammyTelegramRuntimeOptions) {
		this.botToken = options.botToken;
		this.nonPrivateChatReply =
			options.nonPrivateChatReply ?? "Daedalus Telegram remote control only supports private DM chats in v1.";
		this.onPollingError = options.onPollingError ?? (() => undefined);
	}

	onTextMessage(handler: (update: TelegramTextUpdate) => Promise<void>): void {
		this.textHandler = handler;
	}

	async start(): Promise<void> {
		if (this.started) return;
		const bot = await this.getBot();
		await bot.init();
		this.started = true;
		this.pollingPromise = bot.start({ allowed_updates: ["message"] }).catch((error: unknown) => {
			if (this.started) {
				this.onPollingError(error);
			}
		});
	}

	async stop(): Promise<void> {
		if (!this.started) return;
		this.started = false;
		await this.bot?.stop();
		await this.pollingPromise;
		this.pollingPromise = undefined;
	}

	async sendMessage(message: TelegramOutboundMessage): Promise<void> {
		const bot = await this.getBot();
		await bot.api.sendMessage(message.chatId, message.text, {
			reply_parameters: message.replyToMessageId ? { message_id: message.replyToMessageId } : undefined,
		});
	}

	private async getBot(): Promise<GrammyBot> {
		if (this.bot) return this.bot;
		const { Bot } = (await importExternal("grammy")) as { Bot: GrammyBotConstructor };
		const bot = new Bot(this.botToken);
		bot.on("message:text", async (ctx: any) => {
			const { message } = ctx;
			if (!isSupportedTelegramChatType(message.chat.type)) {
				return;
			}

			if (message.chat.type !== "private") {
				await ctx.reply(this.nonPrivateChatReply);
				return;
			}

			const handler = this.textHandler;
			if (!handler) return;

			await handler({
				updateId: ctx.update.update_id,
				chatId: message.chat.id,
				chatType: message.chat.type,
				userId: message.from?.id,
				text: message.text,
				messageId: message.message_id,
			});
		});
		this.bot = bot;
		return bot;
	}
}

function isSupportedTelegramChatType(type: string): type is TelegramTextUpdate["chatType"] {
	return type === "private" || type === "group" || type === "supergroup" || type === "channel";
}

const importExternal = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<unknown>;
