import * as fs from "node:fs";
import type { SubagentDefinition } from "../../../../core/subagents/index.js";
import { parseFrontmatter } from "../../../../utils/frontmatter.js";

const mdGlob = "**/*.md";
const toolPolicies: Record<string, SubagentDefinition["toolPolicy"]> = {
	scout: {
		allowedTools: ["read", "grep", "find", "ls", "bash", "write", "hashline_edit"],
		writableGlobs: [mdGlob],
		spawns: [],
		maxDepth: 1,
	},
	planner: {
		allowedTools: ["read", "grep", "find", "ls", "write", "hashline_edit", "skill"],
		writableGlobs: [mdGlob],
		spawns: [],
		maxDepth: 1,
	},
	worker: {
		allowedTools: [
			"read",
			"bash",
			"hashline_edit",
			"write",
			"grep",
			"find",
			"ls",
			"fetch",
			"ast_grep",
			"ast_edit",
			"skill",
		],
		writableGlobs: ["**/*"],
		spawns: [],
		maxDepth: 1,
	},
	reviewer: {
		allowedTools: ["read", "grep", "find", "ls", "bash", "write", "hashline_edit"],
		writableGlobs: [mdGlob],
		spawns: [],
		maxDepth: 1,
	},
};

function readAgentFile(name: string): string {
	return fs.readFileSync(new URL(`./agents/${name}.md`, import.meta.url), "utf8");
}

function readOptionalAgentFile(name: string): string | undefined {
	const url = new URL(`./agents/${name}`, import.meta.url);
	return fs.existsSync(url) ? fs.readFileSync(url, "utf8") : undefined;
}

function parseBundledAgent(source: string): SubagentDefinition {
	const { frontmatter, body } = parseFrontmatter<{
		name?: string;
		displayName?: string;
		description?: string;
		purpose?: string;
		tools?: string;
		spawns?: string;
		executionModePreference?: "foreground" | "background" | "either";
		isolationPreference?: "shared-branch" | "child-branch" | "either";
		costClass?: string;
		useWhen?: string;
		avoidWhen?: string;
		observabilityTags?: string;
	}>(source);
	if (!frontmatter.name || !frontmatter.description) {
		throw new Error("Bundled subagent definition is missing required frontmatter.");
	}
	return {
		name: frontmatter.name,
		displayName: frontmatter.displayName,
		description: frontmatter.description,
		systemPrompt: body,
		source: "bundled",
		purpose: frontmatter.purpose,
		tools: frontmatter.tools
			?.split(",")
			.map((value) => value.trim())
			.filter(Boolean),
		spawns:
			frontmatter.spawns === "*"
				? "*"
				: frontmatter.spawns
						?.split(",")
						.map((value) => value.trim())
						.filter(Boolean),
		executionModePreference: frontmatter.executionModePreference,
		isolationPreference: frontmatter.isolationPreference,
		costClass: frontmatter.costClass,
		useWhen: frontmatter.useWhen
			?.split(",")
			.map((value) => value.trim())
			.filter(Boolean),
		avoidWhen: frontmatter.avoidWhen
			?.split(",")
			.map((value) => value.trim())
			.filter(Boolean),
		observabilityTags: frontmatter.observabilityTags
			?.split(",")
			.map((value) => value.trim())
			.filter(Boolean),
		modelOverrides: {
			gpt: readOptionalAgentFile(`${frontmatter.name}-overrides-gpt.md`)?.trim(),
			claude: readOptionalAgentFile(`${frontmatter.name}-overrides-claude.md`)?.trim(),
		},
		toolPolicy: toolPolicies[frontmatter.name],
	};
}

export function getBundledStarterAgents(): SubagentDefinition[] {
	return ["scout", "planner", "worker", "reviewer"].map((name) => parseBundledAgent(readAgentFile(name)));
}
