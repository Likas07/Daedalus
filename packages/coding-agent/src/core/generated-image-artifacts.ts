import { mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export interface GeneratedImageArtifactInput {
	id: string;
	providerItemId?: string;
	mimeType: string;
	data?: string;
}

export interface SavedGeneratedImageArtifact {
	path: string;
	fileUri: string;
	visiblePath: string;
	persisted: true;
}

export function sanitizeGeneratedImagePathSegment(value: string): string {
	const sanitized = value
		.trim()
		.replace(/\.\.+/g, "-")
		.replace(/[^a-zA-Z0-9_-]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-+/, "")
		.replace(/-+$/, "")
		.slice(0, 120);
	return sanitized || "image";
}

export async function saveGeneratedImageArtifact(options: {
	cwd: string;
	sessionId: string;
	image: GeneratedImageArtifactInput;
}): Promise<SavedGeneratedImageArtifact> {
	if (options.image.mimeType !== "image/png") {
		throw new Error(`Generated image artifact must be image/png, got ${options.image.mimeType}`);
	}
	if (!options.image.data) {
		throw new Error("Generated image artifact is missing base64 PNG data");
	}

	const cwd = resolve(options.cwd);
	const sessionId = sanitizeGeneratedImagePathSegment(options.sessionId);
	const imageId = sanitizeGeneratedImagePathSegment(options.image.id || options.image.providerItemId || "image");
	const dir = resolve(cwd, ".daedalus", "generated_images", sessionId);
	const filePath = resolve(dir, `${imageId}.png`);
	const generatedRoot = resolve(cwd, ".daedalus", "generated_images");
	if (!filePath.startsWith(`${generatedRoot}/`) && filePath !== generatedRoot) {
		throw new Error("Generated image artifact path escaped project artifact directory");
	}

	await mkdir(dir, { recursive: true });
	await writeFile(filePath, Buffer.from(options.image.data, "base64"));

	const visiblePath = toVisiblePath(cwd, filePath);
	return {
		path: filePath,
		fileUri: pathToFileURL(filePath).href,
		visiblePath,
		persisted: true,
	};
}

function toVisiblePath(cwd: string, filePath: string): string {
	const rel = relative(cwd, filePath);
	if (rel && !rel.startsWith("..") && !isAbsolute(rel)) return rel;
	return filePath;
}
