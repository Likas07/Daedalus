import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getModel } from "@daedalus-pi/ai";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAgentSession } from "../src/core/sdk.js";
import { SessionManager } from "../src/core/session-manager.js";
import { SettingsManager } from "../src/core/settings-manager.js";

describe("semantic search Forge-style query envelope", () => {
	let tempDir: string;
	let agentDir: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `daedalus-semantic-envelope-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		agentDir = join(tempDir, "agent");
		mkdirSync(agentDir, { recursive: true });
		mkdirSync(join(tempDir, "src"), { recursive: true });
		writeFileSync(
			join(tempDir, "src", "refresh-token.ts"),
			"export function refreshTokenFlow() {\n  const refreshToken = 'alpha';\n  return refreshToken;\n}\n",
		);
		writeFileSync(join(tempDir, "src", "oauth.ts"), "export function oauthLoginFlow() {\n  return 'oauth';\n}\n");
	});

	afterEach(() => {
		if (tempDir && existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
	});

	it("supports Forge-style query/use_case schema and returns grouped query buckets with cross-query dedup", async () => {
		const settingsManager = SettingsManager.create(tempDir, agentDir);
		const sessionManager = SessionManager.inMemory();
		const { session } = await createAgentSession({
			cwd: tempDir,
			agentDir,
			model: getModel("anthropic", "claude-sonnet-4-5")!,
			settingsManager,
			sessionManager,
		});
		await session.bindExtensions({});

		await session.prompt("/workspace-init");
		await session.prompt("/workspace-sync");

		const semSearch = session.getToolDefinition("sem_search")!;
		const result = await semSearch.execute(
			"envelope-search",
			{
				queries: [
					{ query: "token refresh", use_case: "find the implementation function for token refresh" },
					{ query: "refresh flow", use_case: "find the implementation function for token refresh" },
					{ query: "oauth flow", use_case: "find the oauth implementation function" },
				],
				path: "src",
				glob: "*.ts",
				limit: 5,
			},
			undefined,
			undefined,
			{ cwd: tempDir } as any,
		);

		expect(Array.isArray(result.details.queries)).toBe(true);
		expect(result.details.queries).toHaveLength(3);
		const [q1, q2, q3] = result.details.queries;
		expect(q1.query).toBe("token refresh");
		expect(q1.use_case).toContain("token refresh");
		expect(Array.isArray(q1.results)).toBe(true);
		expect(Array.isArray(q2.results)).toBe(true);
		expect(Array.isArray(q3.results)).toBe(true);

		const allChunkIds = result.details.queries.flatMap((queryBucket: any) =>
			queryBucket.results.map((row: any) => row.chunkId),
		);
		expect(new Set(allChunkIds).size).toBe(allChunkIds.length);

		const refreshBuckets = result.details.queries
			.slice(0, 2)
			.flatMap((queryBucket: any) => queryBucket.results.map((row: any) => row.filePath));
		expect(refreshBuckets.filter((path: string) => path === "src/refresh-token.ts").length).toBeLessThanOrEqual(1);

		const text = result.content.find((block: any) => block.type === "text")?.text ?? "";
		expect(text).toContain("<sem_search_results>");
		expect(text).toContain('query="token refresh"');
		expect(text).toContain('use_case="find the implementation function for token refresh"');
		expect(text).toContain("src/refresh-token.ts");
		expect(text).toContain("src/oauth.ts");

		session.dispose();
	}, 120_000);
});
