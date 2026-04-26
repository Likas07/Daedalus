import type { ComposerDraftAttachment, ComposerFileMention, ComposerSlashCommand } from "../../client/gui-state-types";

export type ComposerTrigger =
	| { kind: "path"; query: string; rangeStart: number; rangeEnd: number }
	| { kind: "slash-command"; query: string; rangeStart: number; rangeEnd: number };

export type ComposerMode = "daedalus" | "sage" | "muse";
export const composerModes: readonly ComposerMode[] = ["daedalus", "sage", "muse"];

export const composerModeLabels: Record<ComposerMode, string> = {
	daedalus: "Build",
	sage: "Investigate",
	muse: "Plan",
};

export const composerModeRoleNames: Record<ComposerMode, string> = {
	daedalus: "Daedalus",
	sage: "Sage",
	muse: "Muse",
};

export const composerModeDescriptions: Record<ComposerMode, string> = {
	daedalus: "Full toolset · edit, run, ship",
	sage: "Read-only · investigate & answer",
	muse: "Markdown-only · plan & document",
};

export const composerModeShortcuts: Record<ComposerMode, string> = {
	daedalus: "Shift+B",
	sage: "Shift+I",
	muse: "Shift+P",
};

export const composerEfforts = ["minimal", "low", "medium", "high", "xhigh"] as const;

export function detectComposerTrigger(text: string, cursor: number): ComposerTrigger | null {
	const safeCursor = Math.max(0, Math.min(cursor, text.length));
	const before = text.slice(0, safeCursor);
	const tokenStart = Math.max(before.lastIndexOf(" "), before.lastIndexOf("\t"), before.lastIndexOf("\n")) + 1;
	const token = text.slice(tokenStart, safeCursor);
	if (token.startsWith("@") && (tokenStart === 0 || /\s/.test(text[tokenStart - 1] ?? ""))) {
		return { kind: "path", query: token.slice(1), rangeStart: tokenStart, rangeEnd: safeCursor };
	}
	const lineStart = before.lastIndexOf("\n") + 1;
	const linePrefix = text.slice(lineStart, safeCursor);
	if (linePrefix.startsWith("/") && !linePrefix.includes(" ")) {
		return { kind: "slash-command", query: linePrefix.slice(1), rangeStart: lineStart, rangeEnd: safeCursor };
	}
	return null;
}

export function replaceTextRange(
	text: string,
	rangeStart: number,
	rangeEnd: number,
	replacement: string,
): { text: string; cursor: number } {
	const next = `${text.slice(0, rangeStart)}${replacement}${text.slice(rangeEnd)}`;
	return { text: next, cursor: rangeStart + replacement.length };
}

export function parseStandaloneSlashCommand(text: string): string | undefined {
	const trimmed = text.trim();
	const match = /^\/([a-z][\w-]*)(?:\s|$)/i.exec(trimmed);
	return match?.[1];
}

export function mentionReplacement(file: ComposerFileMention): string {
	return `@${file.path} `;
}

export function commandReplacement(command: ComposerSlashCommand): string {
	return `/${command.name} `;
}

export function attachmentIds(attachments: readonly ComposerDraftAttachment[]): string[] {
	return attachments.filter((item) => !item.loading).map((item) => item.id);
}

export function fileMentionPaths(files: readonly ComposerFileMention[]): string[] {
	return [...new Set(files.map((file) => file.path))];
}

export function shouldSubmitComposerKey(event: Pick<KeyboardEvent, "key" | "shiftKey" | "isComposing">): boolean {
	return event.key === "Enter" && !event.shiftKey && !event.isComposing;
}

export function validateAttachmentFile(
	file: Pick<File, "size" | "type" | "name">,
	maxBytes = 10 * 1024 * 1024,
): string | undefined {
	if (file.size > maxBytes) return `${file.name} is larger than ${Math.round(maxBytes / 1024 / 1024)}MB.`;
	if (
		file.type &&
		!file.type.startsWith("image/") &&
		!file.type.startsWith("text/") &&
		file.type !== "application/json"
	)
		return `${file.name} is not a supported attachment type.`;
	return undefined;
}
