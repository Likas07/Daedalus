import { describe, expect, test } from "bun:test";
import type { ToolSession } from "../../src/tools";
import {
	enforceDelegatedEditScope,
	enforceDelegatedToolScope,
	getAllowedEditScopes,
	getAllowedToolScopes,
} from "../../src/tools/task-scope-guard";

function createSession(overrides: Partial<ToolSession> = {}): ToolSession {
	return {
		cwd: "/repo",
		hasUI: false,
		getSessionFile: () => null,
		getSessionSpawns: () => "*",
		settings: {} as ToolSession["settings"],
		...overrides,
	};
}

describe("task scope guard", () => {
	test("returns configured scopes", () => {
		expect(getAllowedEditScopes(createSession({ allowedEditScopes: ["src/task/**"] }))).toEqual(["src/task/**"]);
	});

	test("allows writes inside delegated scopes", () => {
		const session = createSession({ allowedEditScopes: ["src/task/**"] });

		expect(() => enforceDelegatedEditScope(session, "/repo/src/task/index.ts", { resolved: true })).not.toThrow();
	});

	test("rejects writes outside delegated scopes", () => {
		const session = createSession({ allowedEditScopes: ["src/task/**"] });

		expect(() =>
			enforceDelegatedEditScope(session, "/repo/src/config/settings-schema.ts", { resolved: true }),
		).toThrow("outside the delegated edit scope");
	});

	test("rejects paths escaping the delegated workspace", () => {
		const session = createSession({ allowedEditScopes: ["src/task/**"] });

		expect(() => enforceDelegatedEditScope(session, "/tmp/outside.ts", { resolved: true })).toThrow(
			"escapes the delegated workspace",
		);
	});
});

test("returns tool-specific scopes when configured", () => {
	const session = createSession({ allowedToolScopes: { write: ["**/*.md"] } });

	expect(getAllowedToolScopes(session, "write")).toEqual(["**/*.md"]);
	expect(getAllowedEditScopes(session)).toEqual(["**/*.md"]);
});

test("enforces tool-specific scopes separately from edit scopes", () => {
	const session = createSession({ allowedToolScopes: { write: ["**/*.md"] } });

	expect(() => enforceDelegatedToolScope(session, "write", "/repo/docs/plan.md", { resolved: true })).not.toThrow();
	expect(() => enforceDelegatedToolScope(session, "write", "/repo/src/task/index.ts", { resolved: true })).toThrow(
		"outside the delegated write scope",
	);
	expect(() => enforceDelegatedEditScope(session, "/repo/docs/plan.md", { resolved: true })).toThrow(
		"outside the delegated edit scope",
	);
});
