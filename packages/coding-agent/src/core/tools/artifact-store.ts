import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { formatVisiblePath } from "./visible-path.js";

export type ArtifactKind = "stdout" | "stderr" | "fetch";

export interface ArtifactWriteOptions {
	extension?: string;
}

function safeSegment(value: string): string {
	const cleaned = value
		.trim()
		.replace(/\.\.+/g, "-")
		.replace(/[^a-zA-Z0-9_-]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 120);
	return cleaned || "artifact";
}

export class ArtifactStore {
	readonly sessionId: string;
	readonly agentDir: string;
	readonly artifactDir: string;

	constructor(sessionId: string, agentDir: string) {
		this.sessionId = safeSegment(sessionId);
		this.agentDir = resolve(agentDir);
		this.artifactDir = join(this.agentDir, "artifacts", this.sessionId);
	}

	writeArtifact(kind: ArtifactKind, toolCallId: string, content: string, options?: ArtifactWriteOptions): string {
		mkdirSync(this.artifactDir, { recursive: true });
		const safeToolCallId = safeSegment(toolCallId);
		const base = `${safeToolCallId}-${kind}`;
		const extension = normalizeExtension(options?.extension);
		let candidate = join(this.artifactDir, `${base}${extension}`);
		let suffix = 2;
		while (existsSync(candidate)) {
			candidate = join(this.artifactDir, `${base}-${suffix}${extension}`);
			suffix += 1;
		}
		writeFileSync(candidate, content, "utf8");
		return candidate;
	}

	getVisiblePath(artifactPath: string, cwd?: string): string {
		return formatVisiblePath(artifactPath, [cwd, this.agentDir]);
	}
}

function normalizeExtension(extension: string | undefined): string {
	if (!extension) return ".txt";
	const trimmed = extension.trim();
	if (!trimmed) return ".txt";
	const normalized = trimmed.startsWith(".") ? trimmed : `.${trimmed}`;
	return /^[.][a-z0-9]+$/i.test(normalized) ? normalized.toLowerCase() : ".txt";
}
