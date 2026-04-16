import path from "node:path";
import { minimatch } from "minimatch";
import { createCodingTools, type Tool } from "../tools/index.js";
import type { SubagentDefinition, SubagentPolicy } from "./types.js";

const WRITE_TOOLS = new Set(["write", "edit", "hashline_edit"]);

export function resolveSubagentPolicy(agent: SubagentDefinition, override?: Partial<SubagentPolicy>): SubagentPolicy {
	return {
		allowedTools: override?.allowedTools ??
			agent.toolPolicy?.allowedTools ??
			agent.tools ?? ["read", "grep", "find", "ls"],
		writableGlobs: override?.writableGlobs ?? agent.toolPolicy?.writableGlobs ?? [],
		readableGlobs: override?.readableGlobs ?? agent.toolPolicy?.readableGlobs,
		spawns: override?.spawns ?? agent.toolPolicy?.spawns ?? agent.spawns ?? [],
		maxDepth: override?.maxDepth ?? agent.toolPolicy?.maxDepth ?? 2,
	};
}

function isWritablePathAllowed(cwd: string, rawPath: string, policy: SubagentPolicy): boolean {
	const normalized = rawPath.startsWith("@") ? rawPath.slice(1) : rawPath;
	const absolutePath = path.resolve(cwd, normalized);
	return policy.writableGlobs.some((glob) => minimatch(absolutePath, glob, { dot: true }));
}

export function createSubagentTools(cwd: string, policy: SubagentPolicy): Tool[] {
	return createCodingTools(cwd)
		.filter((tool) => policy.allowedTools.includes(tool.name))
		.map((tool) => {
			if (!WRITE_TOOLS.has(tool.name)) {
				return tool;
			}
			return {
				...tool,
				async execute(toolCallId: string, params: { path?: string }, signal, onUpdate) {
					const rawPath = typeof params.path === "string" ? params.path : "";
					if (!rawPath || !isWritablePathAllowed(cwd, rawPath, policy)) {
						throw new Error(`Writes to ${rawPath || "<unknown>"} are not allowed for this subagent.`);
					}
					return tool.execute(toolCallId, params, signal, onUpdate);
				},
			};
		});
}
