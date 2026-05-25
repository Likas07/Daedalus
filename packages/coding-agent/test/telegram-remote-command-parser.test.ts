import { describe, expect, it } from "vitest";
import { isUnsafeRemoteSlash, parseRemoteControlCommand } from "../src/extensions/telegram-remote/command-parser.js";

describe("telegram remote command parser", () => {
	it.each([
		["/status", { type: "status" }],
		["/last", { type: "last" }],
		["/abort", { type: "abort" }],
		["/help", { type: "help" }],
		["/disconnect", { type: "disconnect" }],
	])("parses safe payload-free command %s", (input, expected) => {
		expect(parseRemoteControlCommand(input)).toEqual(expected);
	});

	it("ignores extra whitespace around safe commands", () => {
		expect(parseRemoteControlCommand("  /status  ")).toEqual({ type: "status" });
	});

	it("parses /steer with a required message payload", () => {
		expect(parseRemoteControlCommand("/steer focus on the failing test")).toEqual({
			type: "steer",
			message: "focus on the failing test",
		});
	});

	it("requires /steer to include a non-empty payload", () => {
		expect(parseRemoteControlCommand("/steer   ")).toEqual({
			type: "unknown",
			reason: "missing_message",
			input: "/steer",
		});
	});

	it.each(["/follow-up", "/followup"])("parses %s with a required message payload", (command) => {
		expect(parseRemoteControlCommand(`${command} summarize what changed`)).toEqual({
			type: "follow_up",
			message: "summarize what changed",
		});
	});

	it("requires /follow-up to include a non-empty payload", () => {
		expect(parseRemoteControlCommand("/follow-up")).toEqual({
			type: "unknown",
			reason: "missing_message",
			input: "/follow-up",
		});
	});

	it("parses plain non-slash text as a prompt", () => {
		expect(parseRemoteControlCommand("please inspect the current diff")).toEqual({
			type: "prompt",
			message: "please inspect the current diff",
		});
	});

	it("returns empty unknown for blank input", () => {
		expect(parseRemoteControlCommand("   ")).toEqual({ type: "unknown", reason: "empty", input: "" });
	});

	it.each([
		"/model sonnet",
		"/login",
		"/bash ls",
		"/workspace",
		"/remote-control telegram on",
		"/rc-help",
	])("rejects unsafe remote slash command %s", (input) => {
		expect(parseRemoteControlCommand(input)).toEqual({
			type: "unknown",
			reason: "unsafe_slash",
			input,
		});
	});

	it("flags only unrecognized slash-prefixed inputs as unsafe", () => {
		expect(isUnsafeRemoteSlash("/model sonnet")).toBe(true);
		expect(isUnsafeRemoteSlash("/status")).toBe(false);
		expect(isUnsafeRemoteSlash("ask normally")).toBe(false);
	});
});
