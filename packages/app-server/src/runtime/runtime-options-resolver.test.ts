import { expect, test } from "bun:test";
import type { Model } from "@daedalus-pi/ai";
import { resolveRuntimeOptions } from "./runtime-options-resolver";

const reasoningModel = {
	provider: "test",
	id: "reasoner",
	name: "Reasoner",
	api: "openai-responses",
	reasoning: true,
} as unknown as Model<any>;
const plainModel = { provider: "test", id: "plain", name: "Plain", api: "openai-responses" } as unknown as Model<any>;

function services(models: Model<any>[]) {
	return {
		cwd: "/tmp/project",
		agentDir: "/tmp/agent",
		modelRegistry: { getAll: () => models },
		diagnostics: [],
		authStorage: {},
		settingsManager: {},
		resourceLoader: {},
	} as never;
}

test("selects GUI model and scopes model list", async () => {
	const resolved = await resolveRuntimeOptions({
		services: services([reasoningModel]),
		sessionManager: {},
		context: { model: "test/reasoner", effort: "high" },
	});
	expect(resolved.model).toBe(reasoningModel);
	expect(resolved.selectedModelId).toBe("test/reasoner");
	expect(resolved.scopedModels).toEqual([{ model: reasoningModel, thinkingLevel: "high" }]);
});

test("clamps thinking for non-reasoning models", async () => {
	const resolved = await resolveRuntimeOptions({
		services: services([plainModel]),
		sessionManager: {},
		context: { model: "plain", effort: "xhigh" },
	});
	expect(resolved.thinkingLevel).toBe("off");
	expect(resolved.diagnostics.map((d) => d.message).join("\n")).toContain("does not support thinking");
});

test("reports missing selected model", async () => {
	const resolved = await resolveRuntimeOptions({
		services: services([]),
		sessionManager: {},
		context: { model: "missing" },
	});
	expect(resolved.model).toBeUndefined();
	expect(resolved.diagnostics).toContainEqual({ type: "warning", message: "GUI selected model not found: missing" });
});

test("applies tool set from mode and explicit tools", async () => {
	const sage = await resolveRuntimeOptions({
		services: services([]),
		sessionManager: {},
		context: { mode: "sage", tools: ["bash", "write"] },
	});
	expect(sage.tools?.map((tool) => tool.name)).toEqual(["read", "grep", "find", "ls"]);
	const daedalus = await resolveRuntimeOptions({
		services: services([]),
		sessionManager: {},
		context: { mode: "daedalus", tools: ["read", "ls"] },
	});
	expect(daedalus.tools?.map((tool) => tool.name)).toEqual(["read", "ls"]);
});

test("maps access policy", async () => {
	const resolved = await resolveRuntimeOptions({
		services: services([]),
		sessionManager: {},
		context: { accessMode: "unrestricted" },
	});
	expect(resolved.accessPolicy).toEqual({
		mode: "unrestricted",
		autoApproveSoftPrompts: true,
		bypassHardBlocks: false,
		auditRequired: true,
	});
});

test("persists fast-mode entry honestly", async () => {
	const entries: boolean[] = [];
	const resolved = await resolveRuntimeOptions({
		services: services([]),
		sessionManager: { appendFastModeChange: (enabled: boolean) => String(entries.push(enabled)) },
		context: { fastMode: true },
	});
	expect(entries).toEqual([true]);
	expect(
		resolved.diagnostics.some((diagnostic) => diagnostic.message.includes("Fast mode selection was persisted")),
	).toBe(true);
});
