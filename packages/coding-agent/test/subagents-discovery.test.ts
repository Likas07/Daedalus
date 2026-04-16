import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CONFIG_DIR_NAME } from "../src/config.js";
import { createExtensionRuntime } from "../src/core/extensions/loader.js";
import type { ResourceLoader } from "../src/core/resource-loader.js";
import {
	createSubagentResourceLoader,
	discoverSubagents,
	type SubagentDefinition,
} from "../src/core/subagents/index.js";

describe("discoverSubagents", () => {
	let tempDir: string;
	let cwd: string;
	let agentDir: string;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "daedalus-subagents-"));
		cwd = path.join(tempDir, "project");
		agentDir = path.join(tempDir, "agent");
		fs.mkdirSync(path.join(cwd, CONFIG_DIR_NAME, "agents"), { recursive: true });
		fs.mkdirSync(path.join(agentDir, "agents"), { recursive: true });
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	it("prefers project agents over user agents over bundled agents", async () => {
		const bundled: SubagentDefinition[] = [
			{ name: "worker", description: "bundled", systemPrompt: "bundled worker", source: "bundled" },
		];

		fs.writeFileSync(
			path.join(agentDir, "agents", "worker.md"),
			`---\nname: worker\ndescription: user\n---\nuser worker`,
		);
		fs.writeFileSync(
			path.join(cwd, CONFIG_DIR_NAME, "agents", "worker.md"),
			`---\nname: worker\ndescription: project\n---\nproject worker`,
		);

		const result = await discoverSubagents({ cwd, agentDir, bundled });

		expect(result.agents).toHaveLength(1);
		expect(result.agents[0]?.description).toBe("project");
		expect(result.agents[0]?.systemPrompt).toBe("project worker");
	});
});

describe("createSubagentResourceLoader", () => {
	it("keeps parent context files, prompts, and skills but strips extensions", async () => {
		const parent: ResourceLoader = {
			getExtensions: () => ({
				extensions: [{ path: "/tmp/ext.ts" }] as never[],
				errors: [],
				runtime: createExtensionRuntime(),
			}),
			getSkills: () => ({ skills: [{ name: "planner-skill" }] as never[], diagnostics: [] }),
			getPrompts: () => ({ prompts: [{ name: "review" }] as never[], diagnostics: [] }),
			getThemes: () => ({ themes: [], diagnostics: [] }),
			getAgentsFiles: () => ({ agentsFiles: [{ path: "/tmp/AGENTS.md", content: "# rules" }] }),
			getSystemPrompt: () => undefined,
			getAppendSystemPrompt: () => [],
			extendResources: () => {},
			reload: async () => {},
		};

		const child = createSubagentResourceLoader(parent, ["Subagent append prompt", "Task packet"]);

		expect(child.getExtensions().extensions).toEqual([]);
		expect(child.getSkills().skills).toHaveLength(1);
		expect(child.getPrompts().prompts).toHaveLength(1);
		expect(child.getAgentsFiles().agentsFiles[0]?.path).toBe("/tmp/AGENTS.md");
		expect(child.getAppendSystemPrompt()).toEqual(["Subagent append prompt", "Task packet"]);
	});
});
