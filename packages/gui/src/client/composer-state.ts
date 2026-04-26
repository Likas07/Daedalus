import type { AccessMode, ComposerDraftAttachment, ComposerFileMention, ComposerSlashCommand } from "./gui-state-types";

export interface ComposerSubmitContext {
	prompt: string;
	attachmentIds: readonly string[];
	filePaths: readonly string[];
	model?: string;
	effort?: string;
	accessMode: AccessMode;
	mode: string;
	fastMode: boolean;
	projectId?: string;
	worktreeId?: string;
	sessionId?: string;
}

export type ComposerSubmitInput = ComposerSubmitContext & { path?: string };

export function createComposerSubmitContext(input: ComposerSubmitContext): ComposerSubmitContext {
	return {
		prompt: input.prompt,
		attachmentIds: [...input.attachmentIds],
		filePaths: [...new Set(input.filePaths)],
		model: input.model,
		effort: input.effort,
		accessMode: input.accessMode,
		mode: input.mode,
		fastMode: input.fastMode,
		projectId: input.projectId,
		worktreeId: input.worktreeId,
		sessionId: input.sessionId,
	};
}

export interface ComposerDraftState {
	prompt: string;
	mode: "default" | "plan" | "build";
	effort?: string;
	model?: string;
	accessMode: AccessMode;
	attachments: ComposerDraftAttachment[];
	fileMentions: ComposerFileMention[];
	slashCommands: ComposerSlashCommand[];
}

export function createComposerDraftState(input: Partial<ComposerDraftState> = {}): ComposerDraftState {
	return {
		prompt: input.prompt ?? "",
		mode: input.mode ?? "default",
		effort: input.effort,
		model: input.model,
		accessMode: input.accessMode ?? "supervised",
		attachments: [...(input.attachments ?? [])],
		fileMentions: [...(input.fileMentions ?? [])],
		slashCommands: [...(input.slashCommands ?? [])],
	};
}

export function addComposerAttachment(
	state: ComposerDraftState,
	attachment: ComposerDraftAttachment,
): ComposerDraftState {
	return { ...state, attachments: [...state.attachments.filter((item) => item.id !== attachment.id), attachment] };
}

export function removeComposerAttachment(state: ComposerDraftState, attachmentId: string): ComposerDraftState {
	return { ...state, attachments: state.attachments.filter((item) => item.id !== attachmentId) };
}

export function addComposerFileMention(state: ComposerDraftState, mention: ComposerFileMention): ComposerDraftState {
	return { ...state, fileMentions: [...state.fileMentions.filter((item) => item.path !== mention.path), mention] };
}
