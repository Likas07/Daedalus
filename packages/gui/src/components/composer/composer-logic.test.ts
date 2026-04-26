import { describe, expect, test } from "bun:test";
import { attachmentIds, commandReplacement, detectComposerTrigger, fileMentionPaths, mentionReplacement, parseStandaloneSlashCommand, replaceTextRange, shouldSubmitComposerKey, validateAttachmentFile } from "./composer-logic";

describe("composer logic", () => {
	test("detects path and slash triggers", () => {
		expect(detectComposerTrigger("read @src/app", 13)).toEqual({ kind: "path", query: "src/app", rangeStart: 5, rangeEnd: 13 });
		expect(detectComposerTrigger("/pla", 4)).toEqual({ kind: "slash-command", query: "pla", rangeStart: 0, rangeEnd: 4 });
		expect(detectComposerTrigger("hello /pla", 10)).toBeNull();
	});
	test("replaces ranges and parses commands", () => {
		expect(replaceTextRange("ask @sr", 4, 7, "@src/index.ts ")).toEqual({ text: "ask @src/index.ts ", cursor: 18 });
		expect(parseStandaloneSlashCommand("/plan build it")).toBe("plan");
		expect(parseStandaloneSlashCommand("please /plan")).toBeUndefined();
	});
	test("maps keyboard parity for Enter-to-send and Shift+Enter newline", () => {
		expect(shouldSubmitComposerKey({ key: "Enter", shiftKey: false, isComposing: false } as KeyboardEvent)).toBe(true);
		expect(shouldSubmitComposerKey({ key: "Enter", shiftKey: true, isComposing: false } as KeyboardEvent)).toBe(false);
		expect(shouldSubmitComposerKey({ key: "Enter", shiftKey: false, isComposing: true } as KeyboardEvent)).toBe(false);
		expect(shouldSubmitComposerKey({ key: "Tab", shiftKey: false, isComposing: false } as KeyboardEvent)).toBe(false);
	});
	test("normalizes context", () => {
		expect(mentionReplacement({ path: "src/App.svelte", label: "App", kind: "file" })).toBe("@src/App.svelte ");
		expect(commandReplacement({ name: "plan", label: "Plan", source: "core" })).toBe("/plan ");
		expect(attachmentIds([{ id: "a", kind: "text", filename: "a.txt", size: 1 }])).toEqual(["a"]);
		expect(fileMentionPaths([{ path: "a", label: "a", kind: "file" }, { path: "a", label: "a", kind: "file" }])).toEqual(["a"]);
	});
	test("validates attachments", () => {
		expect(validateAttachmentFile({ name: "x.bin", size: 1, type: "application/octet-stream" } as File)).toContain("not a supported");
		expect(validateAttachmentFile({ name: "x.txt", size: 1, type: "text/plain" } as File)).toBeUndefined();
	});
});
