import { describe, expect, test } from "vitest";
import type { IntentMetadata } from "../src/core/intent-gate.js";
import { evaluateToolCallAgainstIntent, routePlanningWritePathIfNeeded } from "../src/core/intent-policy.js";

const cwd = "/repo";

function intent(metadata: Partial<IntentMetadata>): IntentMetadata {
	return {
		trueIntent: "research",
		approach: "inspect and explain only",
		readOnly: false,
		mutationScope: "none",
		source: "assistant-line",
		valid: true,
		...metadata,
	};
}

describe("intent tool policy", () => {
	test("blocks mutations when no valid intent line exists in enforce mode", () => {
		const decision = evaluateToolCallAgainstIntent({
			toolName: "write",
			input: { path: "src/file.ts" },
			intent: undefined,
			cwd,
			mode: "enforce",
		});
		expect(decision).toMatchObject({ allow: false });
		expect(decision.reason).toContain("no valid visible Intent line");
	});

	test("blocks code mutation for research intent", () => {
		const decision = evaluateToolCallAgainstIntent({
			toolName: "edit",
			input: { path: "src/file.ts" },
			intent: intent({ trueIntent: "research", mutationScope: "none" }),
			cwd,
			mode: "enforce",
		});
		expect(decision.allow).toBe(false);
		expect(decision.reason).toContain("current turn is research");
	});

	test("allows planning markdown writes inside allowlist", () => {
		const decision = evaluateToolCallAgainstIntent({
			toolName: "write",
			input: { path: "plans/intent-gate.md" },
			intent: intent({ trueIntent: "planning", mutationScope: "docs-only", planningArtifactKind: "plan" }),
			cwd,
			mode: "enforce",
		});
		expect(decision.allow).toBe(true);
	});

	test("auto-routes planning write paths into allowlist", () => {
		const input: Record<string, unknown> = { path: "src/intent-gate.md" };
		const routed = routePlanningWritePathIfNeeded({
			toolName: "write",
			input,
			intent: intent({ trueIntent: "planning", mutationScope: "docs-only", planningArtifactKind: "spec" }),
			cwd,
		});
		expect(routed).toMatchObject({
			routed: true,
			originalPath: "src/intent-gate.md",
			routedPath: expect.stringMatching(/^specs\/\d{4}-\d{2}-\d{2}-intent-gate\.md$/u),
		});
		expect(input.path).toMatch(/^specs\/\d{4}-\d{2}-\d{2}-intent-gate\.md$/u);
	});

	test("blocks planning edits outside allowlist", () => {
		const decision = evaluateToolCallAgainstIntent({
			toolName: "hashline_edit",
			input: { path: "src/intent-gate.md" },
			intent: intent({ trueIntent: "planning", mutationScope: "docs-only", planningArtifactKind: "spec" }),
			cwd,
			mode: "enforce",
		});
		expect(decision.allow).toBe(false);
		expect(decision.reason).toContain("Suggested path");
	});

	test("blocks ast_edit during planning intent", () => {
		const decision = evaluateToolCallAgainstIntent({
			toolName: "ast_edit",
			input: { path: "docs" },
			intent: intent({ trueIntent: "planning", mutationScope: "docs-only" }),
			cwd,
			mode: "enforce",
		});
		expect(decision.allow).toBe(false);
	});

	test("allows read-only bash during non-mutating intent and blocks mutating bash", () => {
		const readDecision = evaluateToolCallAgainstIntent({
			toolName: "bash",
			input: { command: "rg Intent packages/coding-agent/src" },
			intent: intent({ trueIntent: "research", mutationScope: "none" }),
			cwd,
			mode: "enforce",
		});
		expect(readDecision.allow).toBe(true);

		const mutateDecision = evaluateToolCallAgainstIntent({
			toolName: "bash",
			input: { command: "touch plans/new.md" },
			intent: intent({ trueIntent: "research", mutationScope: "none" }),
			cwd,
			mode: "enforce",
		});
		expect(mutateDecision.allow).toBe(false);
	});

	test("allows planning-safe mkdir bash commands", () => {
		const decision = evaluateToolCallAgainstIntent({
			toolName: "bash",
			input: { command: "mkdir -p plans design" },
			intent: intent({ trueIntent: "planning", mutationScope: "docs-only" }),
			cwd,
			mode: "enforce",
		});
		expect(decision.allow).toBe(true);
	});

	test("blocks planning-unsafe bash commands", () => {
		const decision = evaluateToolCallAgainstIntent({
			toolName: "bash",
			input: { command: "mkdir -p src/tmp" },
			intent: intent({ trueIntent: "planning", mutationScope: "docs-only" }),
			cwd,
			mode: "enforce",
		});
		expect(decision.allow).toBe(false);
	});

	test("allows code mutation for fix intent", () => {
		const decision = evaluateToolCallAgainstIntent({
			toolName: "write",
			input: { path: "src/file.ts" },
			intent: intent({ trueIntent: "fix", mutationScope: "code-allowed", approach: "patch minimally" }),
			cwd,
			mode: "enforce",
		});
		expect(decision.allow).toBe(true);
	});
});
