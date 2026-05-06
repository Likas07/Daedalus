import { describe, expect, test } from "vitest";
import {
	buildCodexSseHeaders,
	extractCodexAccountId,
	resolveCodexResponsesUrl,
} from "../src/providers/openai-codex-api.js";

function jwtWithAccount(accountId: string): string {
	const payload = Buffer.from(
		JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: accountId } }),
	).toString("base64url");
	return `header.${payload}.signature`;
}

describe("openai-codex-api helpers", () => {
	test("extracts chatgpt account id from OAuth access token", () => {
		expect(extractCodexAccountId(jwtWithAccount("acct_123"))).toBe("acct_123");
	});
	test("rejects access tokens without account id", () => {
		expect(() => extractCodexAccountId("not.jwt")).toThrow("Failed to extract accountId from token");
	});
	test("normalizes Codex Responses URLs", () => {
		expect(resolveCodexResponsesUrl()).toBe("https://chatgpt.com/backend-api/codex/responses");
		expect(resolveCodexResponsesUrl("https://chatgpt.com/backend-api")).toBe(
			"https://chatgpt.com/backend-api/codex/responses",
		);
		expect(resolveCodexResponsesUrl("https://chatgpt.com/backend-api/codex")).toBe(
			"https://chatgpt.com/backend-api/codex/responses",
		);
		expect(resolveCodexResponsesUrl("https://chatgpt.com/backend-api/codex/responses")).toBe(
			"https://chatgpt.com/backend-api/codex/responses",
		);
	});
	test("builds required SSE headers", () => {
		const headers = buildCodexSseHeaders({
			accountId: "acct_123",
			token: "token_123",
			userAgent: "daedalus-test/1",
			sessionId: "session_123",
		});
		expect(headers.get("authorization")).toBe("Bearer token_123");
		expect(headers.get("chatgpt-account-id")).toBe("acct_123");
		expect(headers.get("openai-beta")).toBe("responses=experimental");
		expect(headers.get("accept")).toBe("text/event-stream");
		expect(headers.get("content-type")).toBe("application/json");
		expect(headers.get("originator")).toBe("pi");
		expect(headers.get("user-agent")).toBe("daedalus-test/1");
		expect(headers.get("session_id")).toBe("session_123");
	});
});
