import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import type { ImageContent } from "@daedalus-pi/ai";
import type { PromptContextInput, PromptContextResolver } from "../runtime/session-controller";
import { AttachmentService } from "./attachment-service";

const MAX_CONTEXT_FILE_BYTES = 64 * 1024;

export class PromptContextService implements PromptContextResolver {
	constructor(private readonly attachments = new AttachmentService()) {}

	async resolve(input: PromptContextInput & { cwd: string }): Promise<{ preamble?: string; images?: ImageContent[] }> {
		const sections: string[] = [];
		const images: ImageContent[] = [];
		for (const filePath of input.filePaths ?? []) {
			const absolute = resolve(input.cwd, filePath);
			if (!absolute.startsWith(resolve(input.cwd))) continue;
			const data = await readFile(absolute).catch(() => undefined);
			if (!data) continue;
			const text = data.subarray(0, MAX_CONTEXT_FILE_BYTES).toString("utf8");
			sections.push(`File context: ${relative(input.cwd, absolute)}\n\n${text}`);
		}
		for (const attachmentId of input.attachmentIds ?? []) {
			const metadata = await this.attachments.get(attachmentId);
			const data = await this.attachments.read(attachmentId);
			if (metadata.kind === "image" && metadata.mimeType) {
				images.push({ type: "image", data: data.toString("base64"), mimeType: metadata.mimeType });
			} else if (metadata.kind === "text") {
				sections.push(
					`Attachment context: ${metadata.filename}\n\n${data.subarray(0, MAX_CONTEXT_FILE_BYTES).toString("utf8")}`,
				);
			} else {
				sections.push(`Attached file: ${metadata.filename} (${metadata.size} bytes)`);
			}
		}
		const metadata: string[] = [];
		if (input.projectId) metadata.push(`projectId=${input.projectId}`);
		if (input.worktreeId) metadata.push(`worktreeId=${input.worktreeId}`);
		if (input.sessionId) metadata.push(`sessionId=${input.sessionId}`);
		if (input.model) metadata.push(`model=${input.model}`);
		if (input.effort) metadata.push(`effort=${input.effort}`);
		if (input.accessMode) metadata.push(`accessMode=${input.accessMode}`);
		if (typeof input.fastMode === "boolean") metadata.push(`fastMode=${input.fastMode}`);
		if (input.draftState) metadata.push(`draftState=${JSON.stringify(input.draftState)}`);
		if (metadata.length) sections.unshift(`GUI submission context: ${metadata.join("; ")}`);
		if (input.mode && input.mode !== "daedalus") {
			const role =
				input.mode === "sage"
					? "Sage (read-only investigator)"
					: input.mode === "muse"
						? "Muse (markdown-only planner)"
						: input.mode;
			sections.unshift(`Operating role: ${role}. Runtime tool restrictions are applied before the prompt.`);
		}

		return {
			preamble: sections.length ? `<gui-context>\n${sections.join("\n\n---\n\n")}\n</gui-context>` : undefined,
			images,
		};
	}
}
