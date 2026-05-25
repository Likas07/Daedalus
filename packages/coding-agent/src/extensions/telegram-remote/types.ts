export type RemoteControlCommand =
	| { type: "status" }
	| { type: "last" }
	| { type: "abort" }
	| { type: "steer"; message: string }
	| { type: "follow_up"; message: string }
	| { type: "help" }
	| { type: "disconnect" }
	| { type: "prompt"; message: string }
	| { type: "unknown"; reason: "empty" | "unsafe_slash" | "missing_message" | "unknown_command"; input: string };

export type TelegramDmPolicy = "pairing" | "allowlist" | "disabled";

export interface TelegramRemoteConfig {
	enabled: boolean;
	botToken: string;
	/**
	 * Daedalus v1 intentionally supports only DM pairing, explicit numeric-user allowlists, or disabled startup.
	 * Open/public Telegram DM access is excluded so one active CLI session remains under one owner's control.
	 */
	dmPolicy: TelegramDmPolicy;
	allowUserIds: readonly number[];
	pairingRequired: boolean;
	lockPath: string;
	sessionLabel: string;
}

export interface TelegramRemoteChatBinding {
	chatId: number;
	userId: number;
	pairedAt: number;
	sessionId: string;
}

export interface TelegramOutboundMessage {
	chatId: number;
	text: string;
	replyToMessageId?: number;
}

/**
 * V1 accepts Telegram private DM commands only. Group chats, remote tool approvals, and message-edit streaming
 * are intentionally not accepted command targets in this MVP.
 */
export type TelegramRemoteV1Scope = "private_dm_current_session";
