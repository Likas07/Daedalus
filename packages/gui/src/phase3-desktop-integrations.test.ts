import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { IntegrationProviderState } from "@daedalus-pi/app-server-protocol";
import {
	canCreateOrUpdatePullRequest,
	integrationArtifactChips,
	reconnectMessage,
	summarizeIntegration,
} from "./client/integration-state";

describe("phase 3 desktop and integrations helpers", () => {
	const state: IntegrationProviderState = {
		provider: "github",
		status: "authenticated",
		repository: { provider: "github", owner: "daedalus", name: "app" },
		issues: [{ id: "123", number: 123, title: "Fix provider auth", state: "open" }],
		pullRequests: [{ number: 7, title: "Add diagnostics", state: "open", createUpdateGuarded: true }],
		ciChecks: [{ name: "check", status: "success" }],
		syncErrors: [],
		updatedAt: "2026-04-24T00:00:00.000Z",
	};

	test("summarizes integration provider state", () => {
		expect(summarizeIntegration(state)).toContain("github: authenticated");
		expect(summarizeIntegration(state)).toContain("daedalus/app");
	});

	test("projects issue and PR composer chips", () => {
		expect(integrationArtifactChips(state)).toEqual([
			{ id: "github:issue:123", kind: "issue", label: "Fix provider auth", url: undefined },
			{ id: "github:pr:7", kind: "pr", label: "#7 Add diagnostics", url: undefined },
		]);
	});

	test("guards PR creation until safe push support exists", () => {
		expect(canCreateOrUpdatePullRequest({ safePushEnabled: false })).toBe(false);
		expect(canCreateOrUpdatePullRequest({ safePushEnabled: true })).toBe(true);
	});

	test("builds reconnect copy for diagnostics recovery", () => {
		expect(reconnectMessage(true)).toBeUndefined();
		expect(reconnectMessage(false, "ws://localhost:1/ws")).toContain("ws://localhost:1/ws");
	});
});

test("documents renderer-safe extension command palette exposure", () => {
	const docs = readFileSync(new URL("../docs/extension-support.md", import.meta.url), "utf8");
	expect(docs).toContain("GUI command palette exposes extension command labels");
});
