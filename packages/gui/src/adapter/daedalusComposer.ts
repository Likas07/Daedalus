import type { AppServerClient } from "@daedalus-pi/app-server-client";
import type {
	ComposerAttachmentResult,
	ComposerAttachmentSaveParams,
	ComposerCommandListParams,
	ComposerCommandListResult,
	ComposerFileSearchParams,
	ComposerFileSearchResult,
} from "@daedalus-pi/app-server-protocol";

export interface T3ComposerFileSearchInput {
	readonly projectId: string;
	readonly worktreeId?: string;
	readonly query: string;
	readonly limit?: number;
}

export interface T3ComposerCommandListInput {
	readonly sessionId?: string;
}

export interface T3AttachmentSaveInput {
	readonly sessionId?: string;
	readonly filename: string;
	readonly mimeType?: string;
	readonly dataBase64: string;
}

export function toDaedalusFileSearchParams(input: T3ComposerFileSearchInput): ComposerFileSearchParams {
	return {
		projectId: input.projectId,
		...(input.worktreeId ? { worktreeId: input.worktreeId } : {}),
		query: input.query,
		...(input.limit ? { limit: input.limit } : {}),
	};
}

export function toDaedalusCommandListParams(input: T3ComposerCommandListInput = {}): ComposerCommandListParams {
	return input.sessionId ? { sessionId: input.sessionId } : {};
}

export function toDaedalusAttachmentSaveParams(input: T3AttachmentSaveInput): ComposerAttachmentSaveParams {
	return {
		...(input.sessionId ? { sessionId: input.sessionId } : {}),
		filename: input.filename,
		...(input.mimeType ? { mimeType: input.mimeType } : {}),
		dataBase64: input.dataBase64,
	};
}

export function createDaedalusComposerAdapter(client: AppServerClient) {
	return {
		fileSearch(input: T3ComposerFileSearchInput): Promise<ComposerFileSearchResult> {
			return client.request("composer/file-search", toDaedalusFileSearchParams(input));
		},
		commandList(input: T3ComposerCommandListInput = {}): Promise<ComposerCommandListResult> {
			return client.request("composer/command-list", toDaedalusCommandListParams(input));
		},
		saveAttachment(input: T3AttachmentSaveInput): Promise<ComposerAttachmentResult> {
			return client.request("composer/attachment/save", toDaedalusAttachmentSaveParams(input));
		},
	};
}
