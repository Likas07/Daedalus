import { mkdir, readFile, stat, writeFile, readdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import type { ComposerAttachment } from "@daedalus-pi/app-server-protocol";

export const MAX_GUI_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"]);
const ALLOWED_TEXT_MIME_TYPES = new Set(["text/plain", "text/markdown", "application/json"]);

export interface StoredComposerAttachment extends ComposerAttachment {
	readonly storagePath: string;
}

export class AttachmentService {
	constructor(private readonly rootDir = resolve(process.cwd(), ".daedalus", "gui-attachments")) {}

	async save(input: { filename: string; mimeType?: string; dataBase64: string }): Promise<ComposerAttachment> {
		const data = Buffer.from(input.dataBase64, "base64");
		if (data.byteLength > MAX_GUI_ATTACHMENT_BYTES) throw new Error("Attachment exceeds 10 MiB");
		const mimeType = input.mimeType ?? "application/octet-stream";
		const kind = this.kindFor(mimeType);
		if (kind === "file" && mimeType !== "application/octet-stream") throw new Error(`Unsupported attachment type: ${mimeType}`);
		const id = `attachment-${crypto.randomUUID()}`;
		const safeName = basename(input.filename).replaceAll(/[^\w. -]/g, "_") || "attachment";
		await mkdir(this.rootDir, { recursive: true });
		const storagePath = join(this.rootDir, `${id}-${safeName}`);
		await writeFile(storagePath, data);
		const attachment = { id, kind, filename: safeName, mimeType, size: data.byteLength } satisfies ComposerAttachment;
		await writeFile(`${storagePath}.json`, JSON.stringify(attachment));
		return attachment;
	}

	async get(attachmentId: string): Promise<StoredComposerAttachment> {
		const dir = await readdirSafe(this.rootDir);
		const filename = dir.find((entry) => entry.startsWith(`${attachmentId}-`) && !entry.endsWith(".json"));
		if (!filename) throw new Error(`Unknown attachment: ${attachmentId}`);
		const storagePath = join(this.rootDir, filename);
		const size = (await stat(storagePath)).size;
		const metadata = await readFile(`${storagePath}.json`, "utf8").then((text) => JSON.parse(text) as ComposerAttachment).catch(() => undefined);
		const original = filename.slice(attachmentId.length + 1);
		return { id: attachmentId, kind: metadata?.kind ?? "file", filename: metadata?.filename ?? original, mimeType: metadata?.mimeType, size: metadata?.size ?? size, storagePath };
	}

	async read(attachmentId: string): Promise<Buffer> {
		return readFile((await this.get(attachmentId)).storagePath);
	}

	private kindFor(mimeType: string): "image" | "text" | "file" {
		if (ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) return "image";
		if (mimeType.startsWith("text/") || ALLOWED_TEXT_MIME_TYPES.has(mimeType)) return "text";
		return "file";
	}
}

async function readdirSafe(path: string): Promise<string[]> {
	try {
		return await readdir(path);
	} catch {
		return [];
	}
}
