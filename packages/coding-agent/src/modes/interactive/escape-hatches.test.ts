import { describe, expect, test } from "bun:test";
import type { AssistantResponseSlice } from "../../core/transcript-export.js";
import {
	getEditorUnavailableMessage,
	getExportFormat,
	getNativeDumpUnavailableMessage,
	parseEscapeHatchCommand,
	selectAssistantResponseForCopy,
} from "./escape-hatches.js";

const last = { text: "last response" } as AssistantResponseSlice;
const current = { text: "current response" } as AssistantResponseSlice;

describe("interactive escape hatches", () => {
	test("keeps /copy backward compatible as last-assistant copy", () => {
		expect(parseEscapeHatchCommand("/copy")).toEqual({ kind: "copy", target: "last" });
		expect(selectAssistantResponseForCopy({ last, preferCurrent: false })?.text).toBe("last response");
	});

	test("copy-current falls back to last assistant when no current anchor exists", () => {
		expect(selectAssistantResponseForCopy({ current, last, preferCurrent: true })?.text).toBe("current response");
		expect(selectAssistantResponseForCopy({ last, preferCurrent: true })?.text).toBe("last response");
	});

	test("routes /export extensions to markdown, html, and jsonl", () => {
		expect(getExportFormat("session.md")).toBe("markdown");
		expect(getExportFormat("session.markdown")).toBe("markdown");
		expect(getExportFormat("session.html")).toBe("html");
		expect(getExportFormat(undefined)).toBe("html");
		expect(getExportFormat("session.jsonl")).toBe("jsonl");
	});

	test("reports a visible editor error when $EDITOR/$VISUAL is unset", () => {
		expect(getEditorUnavailableMessage()).toContain("Set $VISUAL or $EDITOR");
	});

	test("native dump is explicit and not the default long-response UX", () => {
		expect(parseEscapeHatchCommand("/dump")).toEqual({ kind: "dump" });
		expect(getNativeDumpUnavailableMessage()).toContain("explicit");
		expect(getNativeDumpUnavailableMessage()).toContain("/export path.md");
	});
});
