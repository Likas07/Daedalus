import * as fs from "node:fs";
import type { SubagentDefinition } from "../../../../core/subagents/index.js";
import { parseFrontmatter } from "../../../../utils/frontmatter.js";

const mdGlob = "**/*.md";
const toolPolicies: Record<string, SubagentDefinition["toolPolicy"]> = {
	orchestrator: {
		allowedTools: ["subagent", "read", "grep", "find", "ls"],
		writableGlobs: [mdGlob],
		spawns: ["scout", "planner", "worker", "reviewer"],
		maxDepth: 2,
	},
	scout: {
		allowedTools: ["read", "grep", "find", "ls", "bash", "write", "edit", "hashline_edit"],
		writableGlobs: [mdGlob],
		spawns: [],
		maxDepth: 1,
	},
	planner: {
		allowedTools: ["read", "grep", "find", "ls", "write", "edit", "hashline_edit"],
		writableGlobs: [mdGlob],
		spawns: [],
		maxDepth: 1,
	},
	worker: {
		allowedTools: ["read", "bash", "hashline_edit", "write", "grep", "find", "ls", "fetch", "ast_grep", "ast_edit"],
		writableGlobs: ["**/*"],
		spawns: [],
		maxDepth: 1,
	},
	reviewer: {
		allowedTools: ["read", "grep", "find", "ls", "bash", "write", "edit", "hashline_edit"],
		writableGlobs: [mdGlob],
		spawns: [],
		maxDepth: 1,
	},
};

function readAgentFile(name: string): string {
	return fs.readFileSync(new URL(`./agents/${name}.md`, import.meta.url), "utf8");
}

function parseBundledAgent(source: string): SubagentDefinition {
	const { frontmatter, body } = parseFrontmatter<{
		name?: string;
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
		useWhen: frontmatter.useWhen?.split(",").map((value) => value.trim()).filter(Boolean),
		avoidWhen: frontmatter.avoidWhen?.split(",").map((value) => value.trim()).filter(Boolean),
		observabilityTags: frontmatter.observabilityTags
			?.split(",")
			.map((value) => value.trim())
			.filter(Boolean),
		toolPolicy: toolPolicies[frontmatter.name],
	};
}

export function getBundledStarterAgents(): SubagentDefinition[] {
	return ["orchestrator", "scout", "planner", "worker", "reviewer"].map((name) =>
		parseBundledAgent(readAgentFile(name)),
	);
}
