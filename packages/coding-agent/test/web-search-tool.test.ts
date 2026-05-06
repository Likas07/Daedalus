import { describe, expect, test } from "bun:test";
import { createWebSearchToolDefinition } from "../src/core/tools/web-search.js";

function ctxWithToken(token: string | undefined): any {
	return {
		modelRegistry: {
			getApiKeyForProvider: async (provider: string) => (provider === "openai-codex" ? token : undefined),
		},
		sessionManager: { getSessionId: () => "session_123" },
		model: { provider: "anthropic", id: "claude-test" },
		cwd: process.cwd(),
	};
}
describe("web_search tool", () => {
	test("explains missing Codex OAuth credentials", async () => {
		const tool = createWebSearchToolDefinition(process.cwd());
		await expect(
			tool.execute("call_1", { query: "news" }, undefined, undefined, ctxWithToken(undefined)),
		).rejects.toThrow("Missing Codex OAuth credentials");
	});
});
