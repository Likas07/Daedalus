const DEFAULT_CODEX_BASE_URL = "https://chatgpt.com/backend-api";
const JWT_CLAIM_PATH = "https://api.openai.com/auth";

export interface CodexSseHeaderOptions {
	accountId: string;
	token: string;
	initHeaders?: Record<string, string>;
	additionalHeaders?: Record<string, string>;
	userAgent?: string;
	sessionId?: string;
}

export function extractCodexAccountId(token: string): string {
	try {
		const parts = token.split(".");
		if (parts.length !== 3) throw new Error("Invalid token");
		const payload = JSON.parse(Buffer.from(parts[1] ?? "", "base64url").toString("utf8"));
		const accountId = payload?.[JWT_CLAIM_PATH]?.chatgpt_account_id;
		if (typeof accountId !== "string" || accountId.length === 0) throw new Error("No account ID in token");
		return accountId;
	} catch {
		throw new Error("Failed to extract accountId from token");
	}
}

export function resolveCodexResponsesUrl(baseUrl?: string): string {
	const raw = baseUrl && baseUrl.trim().length > 0 ? baseUrl : DEFAULT_CODEX_BASE_URL;
	const normalized = raw.replace(/\/+$/, "");
	if (normalized.endsWith("/codex/responses")) return normalized;
	if (normalized.endsWith("/codex")) return `${normalized}/responses`;
	return `${normalized}/codex/responses`;
}

export function buildCodexSseHeaders(options: CodexSseHeaderOptions): Headers {
	const headers = new Headers(options.initHeaders);
	for (const [key, value] of Object.entries(options.additionalHeaders ?? {})) headers.set(key, value);
	headers.set("Authorization", `Bearer ${options.token}`);
	headers.set("chatgpt-account-id", options.accountId);
	headers.set("originator", "pi");
	headers.set("OpenAI-Beta", "responses=experimental");
	headers.set("accept", "text/event-stream");
	headers.set("content-type", "application/json");
	if (options.userAgent) headers.set("User-Agent", options.userAgent);
	if (options.sessionId) {
		headers.set("conversation_id", options.sessionId);
		headers.set("session_id", options.sessionId);
	}
	return headers;
}
