import type { SubagentDefinition } from "../../../../core/subagents/index.js";
import { parseFrontmatter } from "../../../../utils/frontmatter.js";
import musePrompt from "./agents/muse.md" with { type: "text" };
import museClaudeOverride from "./agents/muse-overrides-claude.md" with { type: "text" };
import museGptOverride from "./agents/muse-overrides-gpt.md" with { type: "text" };
import sagePrompt from "./agents/sage.md" with { type: "text" };
import sageClaudeOverride from "./agents/sage-overrides-claude.md" with { type: "text" };
import sageGptOverride from "./agents/sage-overrides-gpt.md" with { type: "text" };
import workerPrompt from "./agents/worker.md" with { type: "text" };
import workerClaudeOverride from "./agents/worker-overrides-claude.md" with { type: "text" };
import workerGptOverride from "./agents/worker-overrides-gpt.md" with { type: "text" };

const mdGlob = "**/*.md";
const toolPolicies: Record<string, SubagentDefinition["toolPolicy"]> = {
	sage: {
		allowedTools: ["read", "grep", "find", "ls", "fs_search", "sem_search", "todo_read"],
		writableGlobs: [],
		spawns: [],
		maxDepth: 1,
	},
	muse: {
		allowedTools: [
			"read",
			"grep",
			"find",
			"ls",
			"fs_search",
			"sem_search",
			"todo_read",
			"todo_write",
			"plan_create",
			"plan_validate",
			"write",
			"hashline_edit",
			"skill",
		],
		writableGlobs: [mdGlob],
		spawns: [],
		maxDepth: 1,
	},
	worker: {
		allowedTools: [
			"read",
			"bash",
			"todo_read",
			"todo_write",
			"hashline_edit",
			"write",
			"grep",
			"find",
			"ls",
			"fs_search",
			"sem_search",
			"execute_plan",
			"fetch",
			"ast_grep",
			"ast_edit",
			"skill",
		],
		writableGlobs: ["**/*"],
		spawns: [],
		maxDepth: 1,
	},
};

const agentPrompts = {
	sage: sagePrompt,
	muse: musePrompt,
	worker: workerPrompt,
} as const;

const agentModelOverrides: Record<keyof typeof agentPrompts, { gpt?: string; claude?: string }> = {
	sage: { gpt: sageGptOverride.trim(), claude: sageClaudeOverride.trim() },
	muse: { gpt: museGptOverride.trim(), claude: museClaudeOverride.trim() },
	worker: { gpt: workerGptOverride.trim(), claude: workerClaudeOverride.trim() },
};

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
		modelOverrides: agentModelOverrides[frontmatter.name as keyof typeof agentPrompts],
		toolPolicy: toolPolicies[frontmatter.name],
	};
}

export function getBundledStarterAgents(): SubagentDefinition[] {
	return Object.values(agentPrompts).map((source) => parseBundledAgent(source));
}
