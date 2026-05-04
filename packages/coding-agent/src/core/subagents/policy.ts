import path from "node:path";
import { minimatch } from "minimatch";
import { createCodingTools, type Tool } from "../tools/index.js";
import { createSkillTool } from "../tools/skill.js";
import type { SubagentDefinition, SubagentPolicy } from "./types.js";

const WRITE_TOOLS = new Set(["write", "edit", "hashline_edit"]);
const READ_TOOLS = new Set(["read", "grep", "find", "ls"]);

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

export function isSubagentSpawnAllowed(spawns: readonly string[] | "*", agentName: string): boolean {
	return spawns === "*" || spawns.includes(agentName);
}

function normalizeToolPath(cwd: string, rawPath: string): string {
	const normalized = rawPath.startsWith("@") ? rawPath.slice(1) : rawPath;
	return path.resolve(cwd, normalized);
}

function isPathAllowed(cwd: string, rawPath: string, globs: readonly string[] | undefined): boolean {
	if (globs === undefined) return true;
	const absolutePath = normalizeToolPath(cwd, rawPath);
	return globs.some((glob) => minimatch(absolutePath, glob, { dot: true }));
}

function isWritablePathAllowed(cwd: string, rawPath: string, policy: SubagentPolicy): boolean {
	return isPathAllowed(cwd, rawPath, policy.writableGlobs);
}

function isReadablePathAllowed(cwd: string, rawPath: string, policy: SubagentPolicy): boolean {
	return isPathAllowed(cwd, rawPath, policy.readableGlobs);
}

function extractPathArgs(toolName: string, params: Record<string, unknown>): string[] {
	switch (toolName) {
		case "read":
		case "write":
		case "edit":
			return [String(params.path ?? params.file_path ?? "")];
		case "hashline_edit": {
			const edits = Array.isArray(params.edits) ? params.edits : [];
			return edits.flatMap((entry) => {
				if (!entry || typeof entry !== "object") return [];
				const record = entry as Record<string, unknown>;
				const paths = [record.path, record.to].filter((value): value is string => typeof value === "string");
				return paths;
			});
		}
		case "grep":
		case "find":
		case "ls":
			return [String(params.path ?? ".")];
		default:
			return [];
	}
}

function getAvailableSubagentTools(cwd: string, policy: SubagentPolicy, extraTools: readonly Tool[] = []): Tool[] {
	const tools = createCodingTools(cwd);
	if (policy.allowedTools.includes("skill")) {
		tools.push(createSkillTool({ cwd }));
	}
	const byName = new Map(tools.map((tool) => [tool.name, tool]));
	for (const tool of extraTools) {
		if (!byName.has(tool.name)) {
			byName.set(tool.name, tool);
		}
	}
	return Array.from(byName.values());
}

export function createSubagentTools(cwd: string, policy: SubagentPolicy, extraTools: readonly Tool[] = []): Tool[] {
	return getAvailableSubagentTools(cwd, policy, extraTools)
		.filter((tool) => policy.allowedTools.includes(tool.name))
		.map((tool) => {
			if (!WRITE_TOOLS.has(tool.name) && !READ_TOOLS.has(tool.name)) {
				return tool;
			}
			return {
				...tool,
				async execute(toolCallId: string, params: Record<string, unknown>, signal, onUpdate) {
					const rawPaths = extractPathArgs(tool.name, params);
					for (const rawPath of rawPaths) {
						if (READ_TOOLS.has(tool.name) && !isReadablePathAllowed(cwd, rawPath, policy)) {
							throw new Error(`Reads from ${rawPath || "<unknown>"} are not allowed for this subagent.`);
						}
						if (WRITE_TOOLS.has(tool.name) && !rawPath) {
							throw new Error("Writes to <unknown> are not allowed for this subagent.");
						}
						if (WRITE_TOOLS.has(tool.name) && !isWritablePathAllowed(cwd, rawPath, policy)) {
							throw new Error(`Writes to ${rawPath} are not allowed for this subagent.`);
						}
					}
					return tool.execute(toolCallId, params as never, signal, onUpdate);
				},
			};
		});
}
