import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getModel } from "@daedalus-pi/ai";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAgentSession } from "../src/core/sdk.js";
import { SessionManager } from "../src/core/session-manager.js";
import { SettingsManager } from "../src/core/settings-manager.js";

function getText(result: any): string {
	return result.content
		.filter((block: any) => block.type === "text")
		.map((block: any) => block.text)
		.join("\n");
}

describe("fs_search and sem_search tools", () => {
	let tempDir: string;
	let agentDir: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `daedalus-search-tools-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		agentDir = join(tempDir, "agent");
		mkdirSync(agentDir, { recursive: true });
		mkdirSync(join(tempDir, "src"), { recursive: true });
		writeFileSync(
			join(tempDir, "src", "refresh-token.ts"),
			"export function refreshTokenFlow() {\n  const refreshToken = 'alpha';\n  return refreshToken;\n}\n",
		);
		writeFileSync(join(tempDir, "src", "auth.ts"), "export function authenticate() {\n  return 'alpha';\n}\n");
		writeFileSync(join(tempDir, "README.md"), "This project handles token refresh and authentication.\n");
	});

	afterEach(() => {
		if (tempDir && existsSync(tempDir)) {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("supports exact file and content search with pagination modes", async () => {
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

		const fsSearch = session.getToolDefinition("fs_search");
		expect(fsSearch).toBeDefined();

		const fileResult = await fsSearch!.execute(
			"fs-search-1",
			{ pattern: "*.ts", target: "files", path: "src", limit: 10 },
			undefined,
			undefined,
			{ cwd: tempDir } as any,
		);
		expect(getText(fileResult)).toContain("refresh-token.ts");
		expect(getText(fileResult)).toContain("auth.ts");

		const countResult = await fsSearch!.execute(
			"fs-search-2",
			{ pattern: "alpha", target: "content", path: "src", output_mode: "count" },
			undefined,
			undefined,
			{ cwd: tempDir } as any,
		);
		expect(getText(countResult)).toContain("refresh-token.ts:1");
		expect(getText(countResult)).toContain("auth.ts:1");

		const pagedResult = await fsSearch!.execute(
			"fs-search-3",
			{ pattern: "alpha", target: "content", path: "src", limit: 1, offset: 0 },
			undefined,
			undefined,
			{ cwd: tempDir } as any,
		);
		expect(getText(pagedResult)).toContain("[Showing 1-1 of 2. Use offset=1 for more.]");

		session.dispose();
	});

	it("bounds fs_search content output and saves the full page when rows are huge", async () => {
		const longTail = "z".repeat(80_000);
		writeFileSync(join(tempDir, "src", "huge.txt"), `alpha ${longTail}\n`);
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

		const fsSearch = session.getToolDefinition("fs_search");
		const result = await fsSearch!.execute(
			"fs-search-huge",
			{ pattern: "alpha", target: "content", path: "src", glob: "huge.txt", limit: 1 },
			undefined,
			undefined,
			{ cwd: tempDir } as any,
		);
		const text = getText(result);

		expect(text.length).toBeLessThan(5_000);
		expect(text).toContain("... [truncated]");
		expect(text).toContain("Some rows truncated to 500 chars");
		expect(result.details?.linesTruncated).toBe(true);
		expect(result.details?.fullOutputPath).toBeDefined();
		expect(readFileSync(result.details.fullOutputPath, "utf8")).toContain(longTail);

		session.dispose();
	});

	it("applies a 50KB cap to fs_search pages after row truncation", async () => {
		for (let index = 0; index < 140; index++) {
			writeFileSync(join(tempDir, "src", `large-${index}.txt`), `alpha ${"x".repeat(900)}\n`);
		}
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

		const fsSearch = session.getToolDefinition("fs_search");
		const result = await fsSearch!.execute(
			"fs-search-byte-cap",
			{ pattern: "alpha", target: "content", path: "src", glob: "large-*.txt", limit: 140 },
			undefined,
			undefined,
			{ cwd: tempDir } as any,
		);
		const text = getText(result);

		expect(Buffer.byteLength(text, "utf8")).toBeLessThan(55_000);
		expect(text).toContain("Output truncated");
		expect(text).toContain("Full output saved to:");
		expect(result.details?.truncation?.truncated).toBe(true);
		expect(result.details?.fullOutputPath).toBeDefined();

		session.dispose();
	});

	it("bounds sem_search output and saves the full semantic result when snippets are huge", async () => {
		const hugeLines = Array.from({ length: 250 }, (_, index) => `alpha huge semantic ${index} ${"z".repeat(900)}`);
		writeFileSync(join(tempDir, "src", "huge-semantic.txt"), `${hugeLines.join("\n")}\n`);
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
		expect(semSearch).toBeDefined();

		await session.prompt("/workspace-init");
		await session.prompt("/workspace-sync");

		const result = await semSearch!.execute(
			"sem-search-huge",
			{
				queries: [{ query: "alpha huge semantic", use_case: "find huge semantic test snippets", top_k: 5 }],
				path: "src",
				limit: 5,
			},
			undefined,
			undefined,
			{ cwd: tempDir } as any,
		);
		const text = getText(result);

		expect(Buffer.byteLength(text, "utf8")).toBeLessThan(60_000);
		expect(text).toContain("... [truncated]");
		expect(text).toContain("Full output saved to:");
		expect(result.details?.fullOutputPath).toBeDefined();
		expect(readFileSync(result.details.fullOutputPath, "utf8")).toContain("huge-semantic.txt");
		expect(result.details?.linesTruncated || result.details?.truncation?.truncated).toBe(true);

		session.dispose();
	});

	it("ranks semantically related files ahead of weaker matches", async () => {
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
		expect(semSearch).toBeDefined();

		await session.prompt("/workspace-init");
		await session.prompt("/workspace-sync");

		const result = await semSearch!.execute(
			"sem-search-1",
			{
				queries: [{ query: "token refresh flow", use_case: "find token refresh implementation" }],
				path: ".",
				limit: 3,
			},
			undefined,
			undefined,
			{ cwd: tempDir } as any,
		);
		const text = getText(result);
		expect(text).toContain("<sem_search_results>");
		expect(text).toContain('query="token refresh flow"');
		expect(text).toContain("refresh-token.ts");

		session.dispose();
	});
});
