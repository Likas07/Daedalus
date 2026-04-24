import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getModel } from "@daedalus-pi/ai";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAgentSession } from "../src/core/sdk.js";
import { SessionManager } from "../src/core/session-manager.js";
import { SettingsManager } from "../src/core/settings-manager.js";

describe("semantic search result shape", () => {
	let tempDir: string;
	let agentDir: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `daedalus-semantic-shape-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		agentDir = join(tempDir, "agent");
		mkdirSync(agentDir, { recursive: true });
		mkdirSync(join(tempDir, "src"), { recursive: true });
		mkdirSync(join(tempDir, "docs"), { recursive: true });
		writeFileSync(
			join(tempDir, "src", "refresh-token.ts"),
			"export function refreshTokenFlow() {\n  const refreshToken = 'alpha';\n  return refreshToken;\n}\n",
		);
		writeFileSync(join(tempDir, "src", "oauth.ts"), "export function oauthLoginFlow() {\n  return 'oauth';\n}\n");
		writeFileSync(join(tempDir, "docs", "guide.md"), "OAuth token refresh guide\n");
	});

	afterEach(() => {
		if (tempDir && existsSync(tempDir)) {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("returns chunk-level results with file path, line range, scores, and supports path/glob filters", async () => {
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

		const semSearch = session.getToolDefinition("sem_search");

		await session.prompt("/workspace-init");
		await session.prompt("/workspace-sync");

		const relativePathResult = await semSearch!.execute(
			"shape-search-relative",
			{
				queries: [
					{ query: "token refresh", use_case: "find token refresh implementation" },
					{ query: "oauth flow", use_case: "find oauth implementation" },
				],
				path: "src",
				glob: "*.ts",
				limit: 5,
			},
			undefined,
			undefined,
			{ cwd: tempDir } as any,
		);

		expect(relativePathResult.details.queries.length).toBeGreaterThan(0);
		const firstBucket = relativePathResult.details.queries[0];
		expect(firstBucket.results.length).toBeGreaterThan(0);
		const first = firstBucket.results[0];
		expect(first.filePath.startsWith("src/")).toBe(true);
		expect(first.filePath.endsWith(".ts")).toBe(true);
		expect(typeof first.startLine).toBe("number");
		expect(typeof first.endLine).toBe("number");
		expect(typeof first.relevanceScore).toBe("number");
		expect(typeof first.snippet).toBe("string");

		const absolutePathResult = await semSearch!.execute(
			"shape-search-absolute",
			{
				queries: [
					{ query: "token refresh", use_case: "find token refresh implementation" },
					{ query: "oauth flow", use_case: "find oauth implementation" },
				],
				path: join(tempDir, "src"),
				glob: "*.ts",
				limit: 5,
			},
			undefined,
			undefined,
			{ cwd: tempDir } as any,
		);

		expect(absolutePathResult.details.total).toBeGreaterThan(0);
		expect(absolutePathResult.details.queries).toHaveLength(relativePathResult.details.queries.length);
		expect(
			absolutePathResult.details.queries.map((bucket: any) => bucket.results.map((row: any) => row.filePath)),
		).toEqual(relativePathResult.details.queries.map((bucket: any) => bucket.results.map((row: any) => row.filePath)));

		session.dispose();
	}, 120_000);
});
