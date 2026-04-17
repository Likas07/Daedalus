import * as fs from "node:fs/promises";
import { join } from "node:path";
import { CONFIG_DIR_NAME } from "../../config.js";
import { parseFrontmatter } from "../../utils/frontmatter.js";
import type { SubagentDefinition } from "./types.js";

interface DiscoverSubagentsOptions {
	cwd: string;
	agentDir: string;
	bundled?: SubagentDefinition[];
}

type AgentFrontmatter = Record<string, unknown> & {
	name?: string;
	displayName?: string;
	description?: string;
	purpose?: string;
	tools?: string | string[];
	spawns?: string | string[];
	model?: string;
	thinkingLevel?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
	output?: unknown;
	executionModePreference?: "foreground" | "background" | "either";
	isolationPreference?: "shared-branch" | "child-branch" | "either";
	costClass?: string;
	useWhen?: string | string[];
	avoidWhen?: string | string[];
	observabilityTags?: string | string[];
};

function asStringArray(value: string | string[] | undefined): string[] | undefined {
	if (Array.isArray(value)) {
		return value.map((entry) => entry.trim()).filter(Boolean);
	}
	return value
		?.split(",")
		.map((entry) => entry.trim())
		.filter(Boolean);
}

async function loadDir(dir: string, source: "user" | "project"): Promise<SubagentDefinition[]> {
	const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
	const files = entries
		.filter((entry) => (entry.isFile() || entry.isSymbolicLink()) && entry.name.endsWith(".md"))
		.sort((a, b) => a.name.localeCompare(b.name));

	const loaded: Array<SubagentDefinition | null> = await Promise.all(
		files.map(async (entry) => {
			const filePath = join(dir, entry.name);
			const content = await fs.readFile(filePath, "utf8");
			const { frontmatter, body } = parseFrontmatter<AgentFrontmatter>(content);
			if (!frontmatter.name || !frontmatter.description) return null;
			const tools = asStringArray(frontmatter.tools);
			const spawns = Array.isArray(frontmatter.spawns)
				? frontmatter.spawns
				: frontmatter.spawns === "*"
					? "*"
					: frontmatter.spawns
							?.split(",")
							.map((value) => value.trim())
							.filter(Boolean);
			return {
				name: frontmatter.name,
				displayName: frontmatter.displayName,
				description: frontmatter.description,
				systemPrompt: body,
				source,
				filePath,
				purpose: frontmatter.purpose,
				tools,
				spawns,
				model: frontmatter.model,
				thinkingLevel: frontmatter.thinkingLevel,
				outputSchema: frontmatter.output,
				executionModePreference: frontmatter.executionModePreference,
				isolationPreference: frontmatter.isolationPreference,
				costClass: frontmatter.costClass,
				useWhen: asStringArray(frontmatter.useWhen),
				avoidWhen: asStringArray(frontmatter.avoidWhen),
				observabilityTags: asStringArray(frontmatter.observabilityTags),
			};
		}),
	);

	return loaded.filter((value): value is SubagentDefinition => value !== null);
}

export async function discoverSubagents(options: DiscoverSubagentsOptions): Promise<{ agents: SubagentDefinition[] }> {
	const { cwd, agentDir, bundled = [] } = options;
	const projectAgents = await loadDir(join(cwd, CONFIG_DIR_NAME, "agents"), "project");
	const userAgents = await loadDir(join(agentDir, "agents"), "user");
	const seen = new Set<string>();
	const agents: SubagentDefinition[] = [];

	for (const candidate of [...projectAgents, ...userAgents, ...bundled]) {
		if (seen.has(candidate.name)) continue;
		seen.add(candidate.name);
		agents.push(candidate);
	}

	return { agents };
}
