import type { RemoteControlCommand } from "./types.js";

const SAFE_COMMANDS = new Set([
	"/status",
	"/last",
	"/abort",
	"/steer",
	"/follow-up",
	"/followup",
	"/help",
	"/disconnect",
]);
const MESSAGE_COMMANDS = new Set(["/steer", "/follow-up", "/followup"]);

export function isUnsafeRemoteSlash(input: string): boolean {
	const trimmed = input.trim();
	return trimmed.startsWith("/") && !SAFE_COMMANDS.has(trimmed.split(/\s+/, 1)[0] ?? "");
}

export function parseRemoteControlCommand(input: string): RemoteControlCommand {
	const trimmed = input.trim();
	if (!trimmed) return { type: "unknown", reason: "empty", input: "" };

	if (!trimmed.startsWith("/")) {
		return { type: "prompt", message: trimmed };
	}

	const command = trimmed.split(/\s+/, 1)[0] ?? "";
	if (!SAFE_COMMANDS.has(command)) {
		return { type: "unknown", reason: "unsafe_slash", input: trimmed };
	}

	const message = trimmed.slice(command.length).trim();

	switch (command) {
		case "/status":
			return message ? unknownCommand(trimmed) : { type: "status" };
		case "/last":
			return message ? unknownCommand(trimmed) : { type: "last" };
		case "/abort":
			return message ? unknownCommand(trimmed) : { type: "abort" };
		case "/help":
			return message ? unknownCommand(trimmed) : { type: "help" };
		case "/disconnect":
			return message ? unknownCommand(trimmed) : { type: "disconnect" };
		case "/steer":
			return parseMessageCommand("steer", message, trimmed);
		case "/follow-up":
		case "/followup":
			return parseMessageCommand("follow_up", message, trimmed);
		default:
			return MESSAGE_COMMANDS.has(command) ? missingMessage(trimmed) : unknownCommand(trimmed);
	}
}

function parseMessageCommand(
	type: "steer" | "follow_up",
	message: string,
	input: string,
): Extract<RemoteControlCommand, { type: "steer" | "follow_up" }> | Extract<RemoteControlCommand, { type: "unknown" }> {
	if (!message) return missingMessage(input);
	return { type, message };
}

function missingMessage(input: string): Extract<RemoteControlCommand, { type: "unknown" }> {
	return { type: "unknown", reason: "missing_message", input };
}

function unknownCommand(input: string): Extract<RemoteControlCommand, { type: "unknown" }> {
	return { type: "unknown", reason: "unknown_command", input };
}
