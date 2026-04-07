import type { ThinkingLevel } from "@oh-my-pi/pi-agent-core";
import { normalizeAgentToolSpecs } from "../task/tool-permissions";
import type { AgentCompactionOverrides } from "../task/types";
import { parseThinkingLevel } from "../thinking";

function parseBoolean(value: unknown): boolean | undefined {
	if (typeof value === "boolean") return value;
	if (typeof value === "string") {
		const normalized = value.trim().toLowerCase();
		if (normalized === "true") return true;
		if (normalized === "false") return false;
	}
	return undefined;
}

function parsePositiveInteger(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value) && value > 0) {
		return Math.floor(value);
	}
	if (typeof value === "string") {
		const parsed = Number.parseInt(value.trim(), 10);
		if (Number.isFinite(parsed) && parsed > 0) {
			return parsed;
		}
	}
	return undefined;
}

function parseCSV(value: string): string[] {
	return value
		.split(",")
		.map(entry => entry.trim())
		.filter(Boolean);
}

function parseArrayOrCSV(value: unknown): string[] | undefined {
	if (Array.isArray(value)) {
		const filtered = value.filter((item): item is string => typeof item === "string");
		return filtered.length > 0 ? filtered : undefined;
	}
	if (typeof value === "string") {
		const parsed = parseCSV(value);
		return parsed.length > 0 ? parsed : undefined;
	}
	return undefined;
}

function parseModelList(value: unknown): string[] | undefined {
	const parsed = parseArrayOrCSV(value);
	if (!parsed) return undefined;
	const normalized = parsed.map(entry => entry.trim()).filter(Boolean);
	return normalized.length > 0 ? normalized : undefined;
}
function parseToolSpecs(value: unknown): string[] | undefined {
	const parsed = parseArrayOrCSV(value);
	if (!parsed) return undefined;
	return normalizeAgentToolSpecs(parsed);
}

function withSubmitResult(toolSpecs: string[] | undefined): string[] | undefined {
	if (!toolSpecs || toolSpecs.includes("*")) return toolSpecs;
	return toolSpecs.includes("submit_result") ? toolSpecs : [...toolSpecs, "submit_result"];
}

function parseCompactionOverrides(value: unknown): AgentCompactionOverrides | undefined {
	if (!value || typeof value !== "object") return undefined;
	const record = value as Record<string, unknown>;
	const bufferTokens = parsePositiveInteger(record.bufferTokens);
	const keepRecentTokens = parsePositiveInteger(record.keepRecentTokens);
	if (bufferTokens === undefined && keepRecentTokens === undefined) return undefined;
	return { bufferTokens, keepRecentTokens };
}

export interface ParsedAgentFields {
	name: string;
	description: string;
	allowedTools?: string[];
	deniedTools?: string[];
	canSpawnAgents?: boolean;
	turnBudget?: number;
	useWorktree?: boolean;
	compactionOverrides?: AgentCompactionOverrides;
	spawns?: string[] | "*";
	model?: string[];
	output?: unknown;
	thinkingLevel?: ThinkingLevel;
	blocking?: boolean;
	role?: string;
	orchestrationRole?: "orchestrator" | "worker";
	readOnly?: boolean;
	editScopes?: string[];
}

export function parseAgentFields(frontmatter: Record<string, unknown>): ParsedAgentFields | null {
	const name = typeof frontmatter.name === "string" ? frontmatter.name : undefined;
	const description = typeof frontmatter.description === "string" ? frontmatter.description : undefined;
	if (!name || !description) {
		return null;
	}

	const allowedTools = withSubmitResult(parseToolSpecs(frontmatter.allowedTools ?? frontmatter.tools));
	const deniedTools = parseToolSpecs(frontmatter.deniedTools);

	let spawns: string[] | "*" | undefined;
	if (frontmatter.spawns === "*") {
		spawns = "*";
	} else if (typeof frontmatter.spawns === "string") {
		const trimmed = frontmatter.spawns.trim();
		spawns = trimmed === "*" ? "*" : parseArrayOrCSV(trimmed);
	} else {
		spawns = parseArrayOrCSV(frontmatter.spawns);
	}

	const explicitCanSpawnAgents = parseBoolean(frontmatter.canSpawnAgents);
	const canSpawnAgents = explicitCanSpawnAgents ?? (spawns !== undefined ? true : undefined);
	if (explicitCanSpawnAgents === false) {
		spawns = undefined;
	}

	const output = frontmatter.output !== undefined ? frontmatter.output : undefined;
	const rawThinkingLevel =
		typeof frontmatter.thinkingLevel === "string"
			? frontmatter.thinkingLevel
			: typeof frontmatter["thinking-level"] === "string"
				? frontmatter["thinking-level"]
				: typeof frontmatter.thinking === "string"
					? frontmatter.thinking
					: undefined;
	const role = typeof frontmatter.role === "string" ? frontmatter.role.trim() || undefined : undefined;
	const rawOrchestrationRole =
		typeof frontmatter.orchestrationRole === "string"
			? frontmatter.orchestrationRole
			: typeof frontmatter.mode === "string"
				? frontmatter.mode
				: undefined;
	const orchestrationRole =
		rawOrchestrationRole === "orchestrator" || rawOrchestrationRole === "worker" ? rawOrchestrationRole : undefined;
	const readOnly = parseBoolean(frontmatter.readOnly);
	const editScopes = parseArrayOrCSV(frontmatter.editScopes);

	return {
		name,
		description,
		allowedTools,
		deniedTools,
		canSpawnAgents,
		turnBudget: parsePositiveInteger(frontmatter.turnBudget),
		useWorktree: parseBoolean(frontmatter.useWorktree),
		compactionOverrides: parseCompactionOverrides(frontmatter.compactionOverrides),
		spawns,
		model: parseModelList(frontmatter.model),
		output,
		thinkingLevel: parseThinkingLevel(rawThinkingLevel),
		blocking: parseBoolean(frontmatter.blocking),
		role,
		orchestrationRole,
		readOnly,
		editScopes,
	};
}
