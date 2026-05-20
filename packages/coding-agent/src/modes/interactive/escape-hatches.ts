import type { AssistantResponseSlice } from "../../core/transcript-export.js";

export type EscapeHatchExportFormat = "html" | "jsonl" | "markdown";

export function getExportFormat(outputPath: string | undefined): EscapeHatchExportFormat {
	if (outputPath?.endsWith(".jsonl")) return "jsonl";
	if (outputPath?.endsWith(".md") || outputPath?.endsWith(".markdown")) return "markdown";
	return "html";
}

export function selectAssistantResponseForCopy(options: {
	current?: AssistantResponseSlice;
	last?: AssistantResponseSlice;
	preferCurrent?: boolean;
}): AssistantResponseSlice | undefined {
	if (options.preferCurrent && options.current?.text) return options.current;
	return options.last?.text ? options.last : undefined;
}

export function parseEscapeHatchCommand(
	text: string,
):
	| { kind: "copy"; target: "current" | "last" }
	| { kind: "editor"; target: "response" | "transcript" }
	| { kind: "dump" }
	| undefined {
	const parts = text.trim().split(/\s+/);
	if (parts[0] === "/copy") {
		return { kind: "copy", target: parts[1] === "current" ? "current" : "last" };
	}
	if (parts[0] === "/editor") {
		return { kind: "editor", target: parts[1] === "transcript" ? "transcript" : "response" };
	}
	if (parts[0] === "/dump") return { kind: "dump" };
	return undefined;
}

export function getEditorUnavailableMessage(): string {
	return "No editor configured. Set $VISUAL or $EDITOR to open response or transcript views.";
}

export function getNativeDumpUnavailableMessage(): string {
	return "Native scrollback dump is explicit and unavailable in the fixed-frame TUI; use /export path.md, /export path.html, or /editor transcript instead.";
}
