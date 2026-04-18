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
import { getBundledStarterAgents } from "../src/extensions/daedalus/workflow/subagents/bundled.js";

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

	it("maps v2 routing metadata from agent frontmatter", async () => {
		fs.writeFileSync(
			path.join(cwd, CONFIG_DIR_NAME, "agents", "explore.md"),
			[
				"---",
				"name: explore",
				"description: Find relevant code",
				"purpose: exploration",
				"executionModePreference: background",
				"isolationPreference: shared-branch",
				"costClass: cheap",
				"useWhen: ['repo search', 'mapping']",
				"avoidWhen: ['direct file edits']",
				"observabilityTags: ['search', 'background']",
				"thinkingLevel: low",
				"---",
				"You are the explore role.",
			].join("\n"),
		);

		const result = await discoverSubagents({ cwd, agentDir, bundled: [] });
		const agent = result.agents.find((candidate) => candidate.name === "explore");

		expect(agent).toMatchObject({
			purpose: "exploration",
			executionModePreference: "background",
			isolationPreference: "shared-branch",
			costClass: "cheap",
			useWhen: ["repo search", "mapping"],
			avoidWhen: ["direct file edits"],
			observabilityTags: ["search", "background"],
			thinkingLevel: "low",
		});
	});

	it("parses dual-name metadata for mythic display names", async () => {
		fs.writeFileSync(
			path.join(cwd, CONFIG_DIR_NAME, "agents", "worker.md"),
			[
				"---",
				"name: worker",
				"displayName: Hephaestus",
				"description: Implementation specialist",
				"purpose: implementation",
				"---",
				"You are the worker subagent.",
			].join("\n"),
		);

		const result = await discoverSubagents({ cwd, agentDir, bundled: [] });
		const agent = result.agents.find((candidate) => candidate.name === "worker");

		expect(agent).toMatchObject({
			name: "worker",
			displayName: "Hephaestus",
			description: "Implementation specialist",
		});
	});

	it("does not expose Daedalus as a bundled subagent", () => {
		const agents = getBundledStarterAgents();
		expect(agents.map((agent) => agent.name)).toEqual(["scout", "planner", "worker", "reviewer"]);
		expect(agents.some((agent) => agent.displayName === "Daedalus")).toBe(false);
	});

	it("bundled planner prompt maximizes parallel execution and marks serialization boundaries", () => {
		const planner = getBundledStarterAgents().find((agent) => agent.name === "planner");
		const prompt = planner?.systemPrompt ?? "";

		expect(prompt).toContain("maximize safe parallel execution");
		expect(prompt).toContain("serialization boundaries");
		expect(prompt).toContain("parallel lanes and serialized steps");
	});

	it("bundled worker prompt includes execution anti-patterns, finish-fully doctrine, and dependency reporting", () => {
		const worker = getBundledStarterAgents().find((agent) => agent.name === "worker");
		const prompt = worker?.systemPrompt ?? "";

		expect(prompt).toContain("Operating Mode");
		expect(prompt).toContain("do not become another orchestrator");
		expect(prompt).toContain("finish the assigned task fully");
		expect(prompt).toContain("report blocked prerequisites clearly");
		expect(prompt).toContain("leave final synthesis and user-facing judgment to Daedalus");
	});

	it("bundled scout and reviewer prompts reinforce non-overlap and scoped findings", () => {
		const scout = getBundledStarterAgents().find((agent) => agent.name === "scout");
		const reviewer = getBundledStarterAgents().find((agent) => agent.name === "reviewer");

		expect(scout?.systemPrompt ?? "").toContain("avoid overlapping reconnaissance already likely assigned elsewhere");
		expect(scout?.systemPrompt ?? "").toContain("stop once enough evidence exists for the next lane to proceed");
		expect(reviewer?.systemPrompt ?? "").toContain("avoid re-implementing or re-scouting");
		expect(reviewer?.systemPrompt ?? "").toContain("Daedalus to synthesize");
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
			getSystemPrompt: () => "The primary assistant is Daedalus.",
			getAppendSystemPrompt: () => [],
			extendResources: () => {},
			reload: async () => {},
		};

		const child = createSubagentResourceLoader(parent, ["Subagent append prompt", "Task packet"]);

		expect(child.getExtensions().extensions).toEqual([]);
		expect(child.getSkills().skills).toHaveLength(1);
		expect(child.getPrompts().prompts).toHaveLength(1);
		expect(child.getAgentsFiles().agentsFiles[0]?.path).toBe("/tmp/AGENTS.md");
		expect(child.getSystemPrompt()).toContain("Subagent append prompt");
		expect(child.getSystemPrompt()).toContain("Task packet");
		expect(child.getSystemPrompt()).not.toContain("The primary assistant is Daedalus");
		expect(child.getAppendSystemPrompt()).toEqual([]);
	});
});
