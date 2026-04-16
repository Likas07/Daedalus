import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getModel } from "@daedalus-pi/ai";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { DefaultResourceLoader } from "../src/core/resource-loader.js";
import { createAgentSession } from "../src/core/sdk.js";
import { SessionManager } from "../src/core/session-manager.js";
import { SettingsManager } from "../src/core/settings-manager.js";
import { buildSystemPrompt } from "../src/core/system-prompt.js";
import { BUILTIN_TOOL_ORDER, DEFAULT_ACTIVE_TOOL_NAMES, READ_ONLY_TOOL_NAMES } from "../src/core/tools/defaults.js";
import { codingTools, createCodingTools, createReadOnlyTools, readOnlyTools } from "../src/core/tools/index.js";

describe("default built-in tool selection", () => {
	let tempDir: string;
	let agentDir: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `daedalus-default-tools-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		agentDir = join(tempDir, "agent");
		mkdirSync(agentDir, { recursive: true });
	});

	afterEach(() => {
		if (tempDir && existsSync(tempDir)) {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	test("tool sets derive from the centralized default name lists", () => {
		expect(codingTools.map((tool) => tool.name)).toEqual([...DEFAULT_ACTIVE_TOOL_NAMES]);
		expect(createCodingTools(tempDir).map((tool) => tool.name)).toEqual([...DEFAULT_ACTIVE_TOOL_NAMES]);
		expect(readOnlyTools.map((tool) => tool.name)).toEqual([...READ_ONLY_TOOL_NAMES]);
		expect(createReadOnlyTools(tempDir).map((tool) => tool.name)).toEqual([...READ_ONLY_TOOL_NAMES]);
	});

	test("buildSystemPrompt defaults to the centralized active tool list", () => {
		const toolSnippets = Object.fromEntries(
			BUILTIN_TOOL_ORDER.map((name) => [name, `Snippet for ${name}`]),
		) as Record<string, string>;

		const prompt = buildSystemPrompt({
			toolSnippets,
			contextFiles: [],
			skills: [],
		});

		for (const name of DEFAULT_ACTIVE_TOOL_NAMES) {
			expect(prompt).toContain(`- ${name}: Snippet for ${name}`);
		}
		expect(prompt).not.toContain("- edit: Snippet for edit");
	});

	test("default sessions activate hashline/fetch/AST tools and exclude edit", async () => {
		const settingsManager = SettingsManager.create(tempDir, agentDir);
		const sessionManager = SessionManager.inMemory();
		const resourceLoader = new DefaultResourceLoader({
			cwd: tempDir,
			agentDir,
			settingsManager,
			extensionFactories: [],
		});
		await resourceLoader.reload();

		const { session } = await createAgentSession({
			cwd: tempDir,
			agentDir,
			model: getModel("anthropic", "claude-sonnet-4-5")!,
			settingsManager,
			sessionManager,
			resourceLoader,
		});

		expect(session.getActiveToolNames()).toEqual([...DEFAULT_ACTIVE_TOOL_NAMES]);
		expect(session.systemPrompt).toContain("- hashline_edit:");
		expect(session.systemPrompt).toContain("- ast_grep:");
		expect(session.systemPrompt).toContain("- ast_edit:");
		expect(session.systemPrompt).toContain(
			'- Prefer hashline_edit for ordinary surgical file edits; start with read({ path, format: "hashline" }) to get fresh LINE#ID anchors',
		);
		expect(session.systemPrompt).toContain(
			"- hashline_edit is not exact-text edit: do not send oldText/newText style patterns or reproduce surrounding file text",
		);
		expect(session.systemPrompt).toContain("- Use ast_grep when syntax shape matters more than plain text");
		expect(session.systemPrompt).toContain(
			"- Use ast_edit for codemods and structural rewrites where plain text replace is unsafe",
		);
		expect(session.systemPrompt).not.toContain("- edit:");
		expect(session.systemPrompt).not.toContain("- Use edit for precise changes");

		session.dispose();
	});
});
