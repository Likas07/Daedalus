import type { protocolV1 } from "@daedalus-pi/app-server-protocol";

export type TextGenerationKind = "threadTitle" | "branchName" | "commitMessage" | "prContent";

export interface TextGenerationProviderRequest {
	readonly kind: TextGenerationKind;
	readonly prompt: string;
	readonly context: TextGenerationContext;
}

export interface TextGenerationProvider {
	generate(request: TextGenerationProviderRequest): Promise<string>;
}

export interface TextGenerationContext {
	readonly message?: string;
	readonly diff?: string;
	readonly files?: readonly string[];
	readonly model?: string;
	readonly effort?: string;
	readonly fastMode?: boolean;
}

export interface TextGenerationServiceOptions {
	readonly provider?: TextGenerationProvider;
}

export class TextGenerationUnavailableError extends Error {
	constructor(message = "Text generation provider is not configured.") {
		super(message);
		this.name = "TextGenerationUnavailableError";
	}
}

export class DeterministicTextGenerationProvider implements TextGenerationProvider {
	async generate(request: TextGenerationProviderRequest): Promise<string> {
		const summary = summarizeContext(request.context);
		switch (request.kind) {
			case "threadTitle":
				return summary;
			case "branchName":
				return summary;
			case "commitMessage":
				return `${summary}\n\n${request.context.diff ? "Updates implementation based on the provided diff." : "Updates implementation based on the provided context."}`;
			case "prContent":
				return `${summary}\n\n## Summary\n- ${summary}\n\n## Testing\n- Not run (text generation only)`;
		}
	}
}

export class TextGenerationService {
	private readonly provider?: TextGenerationProvider;

	constructor(options: TextGenerationServiceOptions = {}) {
		this.provider = options.provider;
	}

	async generateThreadTitle(
		params: protocolV1.TextGenerateThreadTitleParams,
	): Promise<protocolV1.TextGenerateThreadTitleResult> {
		const text = await this.generate("threadTitle", params);
		return { title: sanitizeTitle(text, 120) };
	}

	async generateBranchName(
		params: protocolV1.TextGenerateBranchNameParams,
	): Promise<protocolV1.TextGenerateBranchNameResult> {
		const text = await this.generate("branchName", params);
		return { branch: sanitizeBranchName(text) };
	}

	async generateCommitMessage(
		params: protocolV1.TextGenerateCommitMessageParams,
	): Promise<protocolV1.TextGenerateCommitMessageResult> {
		const text = await this.generate("commitMessage", params);
		const [subjectLine, ...bodyLines] = normalizeWhitespace(text).split("\n");
		const subject = sanitizeTitle(subjectLine ?? "Update implementation", 120);
		const body = sanitizeBody(bodyLines.join("\n")).trim();
		return body ? { subject, body } : { subject };
	}

	async generatePrContent(
		params: protocolV1.TextGeneratePrContentParams,
	): Promise<protocolV1.TextGeneratePrContentResult> {
		const text = await this.generate("prContent", params);
		const [titleLine, ...bodyLines] = normalizeWhitespace(text).split("\n");
		const title = sanitizeTitle(titleLine ?? "Update implementation", 120);
		const body = sanitizeBody(bodyLines.join("\n")).trim() || "## Summary\n- Update implementation";
		return { title, body };
	}

	private async generate(kind: TextGenerationKind, context: TextGenerationContext): Promise<string> {
		if (!this.provider) throw new TextGenerationUnavailableError();
		return this.provider.generate({ kind, context: sanitizeContext(context), prompt: promptFor(kind, context) });
	}
}

function promptFor(kind: TextGenerationKind, context: TextGenerationContext): string {
	return [
		`Generate safe non-mutating ${kind} text.`,
		"Do not request or use tools. Return only the requested text.",
		context.message ? `Message: ${context.message}` : undefined,
		context.diff ? `Diff: ${context.diff}` : undefined,
		context.files?.length ? `Files: ${context.files.join(", ")}` : undefined,
	]
		.filter(Boolean)
		.join("\n");
}

function sanitizeContext(context: TextGenerationContext): TextGenerationContext {
	return {
		message: context.message ? clamp(stripControl(context.message), 4000) : undefined,
		diff: context.diff ? clamp(stripControl(context.diff), 12000) : undefined,
		files: context.files
			?.map((file) => clamp(stripControl(file), 240))
			.filter(Boolean)
			.slice(0, 100),
		model: context.model ? clamp(stripControl(context.model), 160) : undefined,
		effort: context.effort ? clamp(stripControl(context.effort), 40) : undefined,
		fastMode: context.fastMode,
	};
}

function summarizeContext(context: TextGenerationContext): string {
	const source = context.message || context.files?.[0] || context.diff || "Update implementation";
	return sanitizeTitle(source.replace(/^#+\s*/, ""), 80);
}

function sanitizeTitle(value: string, maxLength: number): string {
	const cleaned = normalizeInline(value)
		.replace(/^title:\s*/i, "")
		.replace(/[.!?]+$/g, "");
	return clamp(cleaned, maxLength) || "Update implementation";
}

function sanitizeBranchName(value: string): string {
	const branch = normalizeInline(value)
		.toLowerCase()
		.replace(/^[\w.-]+\//, "")
		.replace(/[^a-z0-9._/-]+/g, "-")
		.replace(/\/+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^[.-]+|[.-]+$/g, "");
	return clamp(branch, 80) || "update-implementation";
}

function sanitizeBody(value: string): string {
	return normalizeWhitespace(value)
		.replace(/\u0000/g, "")
		.trim();
}

function normalizeInline(value: string): string {
	return stripControl(value)
		.replace(/[`*_#[\]<>]/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

function normalizeWhitespace(value: string): string {
	return stripControl(value)
		.replace(/\r\n?/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

function stripControl(value: string): string {
	return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
}

function clamp(value: string, maxLength: number): string {
	return value.length > maxLength ? value.slice(0, maxLength).trim() : value.trim();
}
