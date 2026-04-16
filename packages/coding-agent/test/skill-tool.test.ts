import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuthStorage } from "../src/core/auth-storage.js";
import { ExtensionRunner } from "../src/core/extensions/runner.js";
import { ModelRegistry } from "../src/core/model-registry.js";
import { SessionManager } from "../src/core/session-manager.js";
import { createSyntheticSourceInfo } from "../src/core/source-info.js";
import skillToolExtension from "../src/extensions/daedalus/tools/skill.js";
import { createTestExtensionsResult } from "./utilities.js";

describe("skill tool", () => {
	let tempDir: string;
	let skillDir: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `daedalus-skill-tool-${Date.now()}`);
		skillDir = join(tempDir, "test-skill");
		mkdirSync(skillDir, { recursive: true });
		writeFileSync(
			join(skillDir, "SKILL.md"),
			`---
name: test-skill
description: A test skill.
---

# Test Skill

Main body.
`,
		);
		writeFileSync(join(skillDir, "extra.md"), "# Extra\n\nReference file.\n");
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	async function createRunner() {
		const extensionsResult = await createTestExtensionsResult(
			[{ factory: skillToolExtension, path: "<skill-tool>" }],
			tempDir,
		);
		const runner = new ExtensionRunner(
			extensionsResult.extensions,
			extensionsResult.runtime,
			tempDir,
			SessionManager.inMemory(),
			ModelRegistry.inMemory(AuthStorage.inMemory()),
		);

		const skill = {
			name: "test-skill",
			description: "A test skill.",
			filePath: join(skillDir, "SKILL.md"),
			baseDir: skillDir,
			sourceInfo: createSyntheticSourceInfo(join(skillDir, "SKILL.md"), { source: "test" }),
			disableModelInvocation: false,
		};

		runner.bindCore(
			{
				sendMessage: () => {},
				sendUserMessage: () => {},
				appendEntry: () => {},
				setSessionName: () => {},
				getSessionName: () => undefined,
				setLabel: () => {},
				getActiveTools: () => [],
				getAllTools: () => [],
				setActiveTools: () => {},
				refreshTools: () => {},
				getCommands: () => [],
				setModel: async () => false,
				getThinkingLevel: () => "off",
				setThinkingLevel: () => {},
			} as any,
			{
				getModel: () => undefined,
				isIdle: () => true,
				getSignal: () => undefined,
				abort: () => {},
				hasPendingMessages: () => false,
				shutdown: () => {},
				getContextUsage: () => undefined,
				compact: () => {},
				getSystemPrompt: () => "",
				getSkills: () => [skill],
			} as any,
		);

		return runner;
	}

	it("loads the main SKILL.md body", async () => {
		const runner = await createRunner();
		const definition = runner.getToolDefinition("skill");
		expect(definition).toBeDefined();

		const result = await definition!.execute(
			"tool-1",
			{ action: "load", name: "test-skill" },
			undefined,
			undefined,
			runner.createContext(),
		);
		const first = result.content[0];
		const text = first?.type === "text" ? first.text : "";
		expect(text).toContain('<skill name="test-skill"');
		expect(text).toContain("Main body.");
	});

	it("resolves a skill-relative resource", async () => {
		const runner = await createRunner();
		const definition = runner.getToolDefinition("skill");
		expect(definition).toBeDefined();

		const result = await definition!.execute(
			"tool-2",
			{ action: "resolve", name: "test-skill", target: "extra.md" },
			undefined,
			undefined,
			runner.createContext(),
		);
		const first = result.content[0];
		const text = first?.type === "text" ? first.text : "";
		expect(text).toContain('<skill-resource name="test-skill"');
		expect(text).toContain("Reference file.");
	});
});
