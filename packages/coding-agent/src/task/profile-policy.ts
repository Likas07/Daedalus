import type { RoutingProfilePolicy } from "../config/model-resolver";
import type { Settings } from "../config/settings";
import { getAgentToolNames, getAgentToolScopeMap, parseAgentToolSpec } from "./tool-permissions";
import type { AgentDefinition } from "./types";

const READ_ONLY_BLOCKED_TOOL_NAMES = new Set([
	"ast_edit",
	"bash",
	"edit",
	"lsp",
	"notebook",
	"python",
	"resolve",
	"write",
]);

const SCOPED_EDIT_BLOCKED_TOOL_NAMES = new Set(["bash", "lsp", "python"]);
const EDIT_SCOPE_TOOL_NAMES = ["edit", "write", "ast_edit", "notebook"] as const;

function dedupe(values: string[] | undefined): string[] | undefined {
	if (!values || values.length === 0) return undefined;
	return Array.from(new Set(values));
}

function resolveScopedEditScopes(agent: AgentDefinition): string[] | undefined {
	const toolScopes = getAgentToolScopeMap(agent.allowedTools);
	const scopedToolPaths = EDIT_SCOPE_TOOL_NAMES.flatMap(toolName => toolScopes?.[toolName] ?? []);
	return dedupe([...(agent.editScopes ?? []), ...scopedToolPaths]);
}

function getProfilePermissions(agent: AgentDefinition, readOnly: boolean): string[] {
	const permissions: string[] = [];
	if (readOnly) {
		permissions.push("read-only");
	}
	if (resolveScopedEditScopes(agent)?.length) {
		permissions.push("scoped-edits");
	}
	if (getAgentToolScopeMap(agent.allowedTools)) {
		permissions.push("scoped-tools");
	}
	if (agent.orchestrationRole) {
		permissions.push(`orchestration:${agent.orchestrationRole}`);
	}
	return permissions;
}

export function resolveAgentReadOnly(agent: AgentDefinition, settings: Settings): boolean {
	if (agent.readOnly !== undefined) {
		return agent.readOnly;
	}
	if (!(settings.get("task.profiles.orchestratorDefaultReadOnly") ?? true)) {
		return false;
	}
	return agent.orchestrationRole === "orchestrator";
}

export function filterAgentToolNames(agent: AgentDefinition, toolNames: string[], settings: Settings): string[] {
	const requestedNames = Array.from(new Set(toolNames.map(name => parseAgentToolSpec(name).toolName).filter(Boolean)));
	let filtered = [...requestedNames];
	const allowedToolNames = getAgentToolNames(agent.allowedTools);
	if (allowedToolNames && !allowedToolNames.includes("*")) {
		filtered = filtered.filter(name => name === "submit_result" || allowedToolNames.includes(name));
	}
	const deniedToolNames = getAgentToolNames(agent.deniedTools);
	if (deniedToolNames && deniedToolNames.length > 0) {
		filtered = filtered.filter(name => !deniedToolNames.includes(name));
	}
	if ((settings.get("task.profiles.enforceReadOnly") ?? true) && resolveAgentReadOnly(agent, settings)) {
		filtered = filtered.filter(name => !READ_ONLY_BLOCKED_TOOL_NAMES.has(name));
	}
	if ((settings.get("task.profiles.enforceEditScopes") ?? true) && resolveScopedEditScopes(agent)?.length) {
		filtered = filtered.filter(name => !SCOPED_EDIT_BLOCKED_TOOL_NAMES.has(name));
	}
	if (agent.canSpawnAgents === false) {
		filtered = filtered.filter(name => name !== "task");
	}
	if (requestedNames.includes("submit_result") && !filtered.includes("submit_result")) {
		filtered.push("submit_result");
	}
	return filtered;
}

export function buildAgentRoutingProfile(agent: AgentDefinition, settings: Settings): RoutingProfilePolicy | undefined {
	const readOnly = resolveAgentReadOnly(agent, settings);
	const permissions = getProfilePermissions(agent, readOnly);
	const editScopes = resolveScopedEditScopes(agent);
	const toolScopes = getAgentToolScopeMap(agent.allowedTools);
	const delegation: Record<string, unknown> = {};
	if (agent.orchestrationRole) {
		delegation.orchestrationRole = agent.orchestrationRole;
	}
	if (editScopes && editScopes.length > 0) {
		delegation.editScopes = editScopes;
	}
	if (toolScopes && Object.keys(toolScopes).length > 0) {
		delegation.toolScopes = toolScopes;
	}
	if (agent.canSpawnAgents !== undefined) {
		delegation.canSpawnAgents = agent.canSpawnAgents;
	} else if (agent.spawns !== undefined) {
		delegation.canSpawnAgents = true;
	}
	if (agent.spawns !== undefined) {
		delegation.spawns = agent.spawns === "*" ? "*" : [...agent.spawns];
	}
	const budgets =
		agent.turnBudget !== undefined || agent.useWorktree !== undefined
			? { turnBudget: agent.turnBudget, useWorktree: agent.useWorktree ?? false }
			: undefined;
	const compaction = agent.compactionOverrides ? { ...agent.compactionOverrides } : undefined;

	if (!agent.role && permissions.length === 0 && Object.keys(delegation).length === 0 && !budgets && !compaction) {
		return undefined;
	}

	return {
		id: agent.name,
		role: agent.role,
		permissions,
		budgets,
		delegation,
		compaction,
	};
}
