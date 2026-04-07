import { describe, expect, test } from "bun:test";
import type { Settings } from "../../src/config/settings";
import { buildAgentRoutingProfile, filterAgentToolNames, resolveAgentReadOnly } from "../../src/task/profile-policy";
import type { AgentDefinition } from "../../src/task/types";

function createAgent(overrides: Partial<AgentDefinition> = {}): AgentDefinition {
	return {
		name: "planner",
		description: "desc",
		systemPrompt: "prompt",
		source: "bundled",
		...overrides,
	};
}

function createSettings(overrides: Record<string, unknown> = {}): Settings {
	return {
		get(path: string): unknown {
			return overrides[path];
		},
	} as unknown as Settings;
}

describe("agent profile policy", () => {
	test("defaults orchestrator profiles to read-only when enabled", () => {
		const settings = createSettings({
			"task.profiles.orchestratorDefaultReadOnly": true,
			"task.profiles.enforceReadOnly": true,
		});

		expect(resolveAgentReadOnly(createAgent({ orchestrationRole: "orchestrator" }), settings)).toBe(true);
	});

	test("honors explicit readOnly false on orchestrator profiles", () => {
		const settings = createSettings({
			"task.profiles.orchestratorDefaultReadOnly": true,
			"task.profiles.enforceReadOnly": true,
		});

		expect(resolveAgentReadOnly(createAgent({ orchestrationRole: "orchestrator", readOnly: false }), settings)).toBe(
			false,
		);
	});

	test("filters write-capable tools for read-only profiles", () => {
		const settings = createSettings({
			"task.profiles.orchestratorDefaultReadOnly": true,
			"task.profiles.enforceReadOnly": true,
		});

		expect(
			filterAgentToolNames(
				createAgent({ readOnly: true }),
				["read", "grep", "edit", "bash", "task", "ast_edit", "submit_result", "write", "lsp"],
				settings,
			),
		).toEqual(["read", "grep", "task", "submit_result"]);
	});

	test("filters unscopable tools when edit scopes are enforced", () => {
		const settings = createSettings({
			"task.profiles.enforceReadOnly": true,
			"task.profiles.enforceEditScopes": true,
		});

		expect(
			filterAgentToolNames(
				createAgent({ editScopes: ["src/task/**"] }),
				["read", "grep", "edit", "bash", "python", "lsp", "submit_result", "write"],
				settings,
			),
		).toEqual(["read", "grep", "edit", "submit_result", "write"]);
	});

	test("builds routing profile policy from declarative metadata", () => {
		const settings = createSettings({
			"task.profiles.orchestratorDefaultReadOnly": true,
			"task.profiles.enforceReadOnly": true,
		});
		const policy = buildAgentRoutingProfile(
			createAgent({
				role: "plan",
				orchestrationRole: "orchestrator",
				readOnly: true,
				editScopes: ["src/task/**"],
			}),
			settings,
		);

		expect(policy).toMatchObject({
			id: "planner",
			role: "plan",
			permissions: ["read-only", "scoped-edits", "orchestration:orchestrator"],
		});
		expect(policy?.delegation).toEqual({
			orchestrationRole: "orchestrator",
			editScopes: ["src/task/**"],
			spawns: undefined,
		});
	});
});

test("allows planner markdown-only write tools without broad write access", () => {
	const settings = createSettings({
		"task.profiles.enforceReadOnly": true,
		"task.profiles.enforceEditScopes": true,
	});

	expect(
		filterAgentToolNames(
			createAgent({
				allowedTools: ["read", "write(**/*.md)", "edit(**/*.md)"],
				readOnly: false,
				canSpawnAgents: false,
			}),
			["read", "write", "edit", "bash", "task", "submit_result"],
			settings,
		),
	).toEqual(["read", "write", "edit", "submit_result"]);
});

test("builds routing profile budgets, scopes, and compaction metadata", () => {
	const settings = createSettings({
		"task.profiles.enforceReadOnly": true,
		"task.profiles.enforceEditScopes": true,
	});
	const policy = buildAgentRoutingProfile(
		createAgent({
			role: "plan",
			allowedTools: ["read", "write(**/*.md)", "edit(**/*.md)"],
			canSpawnAgents: false,
			turnBudget: 80,
			useWorktree: false,
			compactionOverrides: { bufferTokens: 150000, keepRecentTokens: 50000 },
		}),
		settings,
	);

	expect(policy?.budgets).toEqual({ turnBudget: 80, useWorktree: false });
	expect(policy?.delegation).toMatchObject({
		canSpawnAgents: false,
		toolScopes: {
			write: ["**/*.md"],
			edit: ["**/*.md"],
		},
		editScopes: ["**/*.md"],
	});
	expect(policy?.compaction).toEqual({ bufferTokens: 150000, keepRecentTokens: 50000 });
});
