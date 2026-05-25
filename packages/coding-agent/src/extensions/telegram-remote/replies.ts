import type { TelegramRemoteConfig } from "./types.js";

export interface RemoteStatusDetails {
	isIdle: boolean;
	pendingMessageCount: number;
	sessionId: string;
	sessionName?: string;
	sessionLabel?: string;
}

export function remoteHelpText(): string {
	return [
		"Daedalus Telegram remote control is active for this CLI session.",
		"Commands:",
		"/status - show session state",
		"/last - resend the last assistant answer",
		"/abort - interrupt the current turn",
		"/steer <message> - steer the current turn",
		"/follow-up <message> - queue a follow-up",
		"/disconnect - stop this Telegram bridge",
		"Plain text starts a new turn only when Daedalus is idle.",
		"Group chats and remote approvals are not enabled in v1.",
	].join("\n");
}

export function remoteStatusText(status: RemoteStatusDetails): string {
	return [
		`${status.sessionLabel ?? "Daedalus CLI"}: ${status.isIdle ? "idle" : "busy"}`,
		`Session: ${status.sessionName ?? status.sessionId}`,
		`Pending messages: ${status.pendingMessageCount}`,
	].join("\n");
}

export function remotePairingInstructionsText(config: TelegramRemoteConfig): string {
	return [
		`Pair this chat with ${config.sessionLabel}.`,
		"Send the six-digit code shown in the Daedalus CLI to connect.",
		"Only private DM chats are supported; group chats are not enabled in v1.",
	].join("\n");
}

export function remotePairedText(config: TelegramRemoteConfig): string {
	return [`Telegram remote control paired with ${config.sessionLabel}.`, "Use /help to see supported commands."].join(
		"\n",
	);
}

export function remoteRejectedText(): string {
	return "This Telegram user is not authorized for this Daedalus remote-control session.";
}

export function remoteDmOnlyText(): string {
	return "Daedalus Telegram remote control only supports private DM chats in v1.";
}

export function remoteDisconnectedText(): string {
	return "Telegram remote control disconnected for this Daedalus session.";
}

export function remoteUnsafeSlashText(): string {
	return "That slash command is not available over Telegram. Use /help to see supported remote commands.";
}

export function remoteUnknownCommandText(): string {
	return "Unsupported Telegram remote command. Use /help to see supported commands.";
}

export function remoteMissingMessageText(commandName = "command"): string {
	return `Missing message for ${commandName}. Use /help to see supported commands.`;
}

export function remoteEmptyMessageText(): string {
	return "Send a command or plain text prompt. Use /help to see supported commands.";
}

export function remoteBusyPromptText(): string {
	return "Daedalus is busy. Use /steer <message> for the current turn or /follow-up <message> to queue the next turn.";
}

export function remoteQueuedText(kind: "prompt" | "steer" | "follow-up"): string {
	switch (kind) {
		case "prompt":
			return "Prompt sent to Daedalus.";
		case "steer":
			return "Steering message queued for the current turn.";
		case "follow-up":
			return "Follow-up queued for the next turn.";
	}
}

export function remoteAbortText(): string {
	return "Abort requested for the current Daedalus turn.";
}

export function remoteNoLastAnswerText(): string {
	return "No assistant answer is available yet.";
}
