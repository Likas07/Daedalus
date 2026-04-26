import { describe, expect, test } from "bun:test";
import type { IntegrationProviderState } from "@daedalus-pi/app-server-protocol";
import { integrationPanelViewModel, prCreateApprovalSummary } from "./integration-state";

describe("integration view model", () => {
	const state: IntegrationProviderState = {
		provider: "github",
		status: "authenticated",
		repository: { provider: "github", owner: "acme", name: "app" },
		issues: [{ id: "1", number: 1, title: "Fix", state: "open" }],
		pullRequests: [{ number: 2, title: "Ship", state: "open", createUpdateGuarded: true }],
		ciChecks: [
			{ name: "test", status: "failure" },
			{ name: "lint", status: "in_progress" },
		],
		syncErrors: [],
		updatedAt: "2026-04-26T00:00:00.000Z",
	};

	test("projects real GitHub integration counts and CI status", () => {
		expect(integrationPanelViewModel(state)).toEqual({
			provider: "github",
			status: "authenticated",
			repositoryLabel: "acme/app",
			backendStatus: "GitHub CLI connected",
			issueCount: 1,
			pullRequestCount: 1,
			ciSummary: "2 checks · 1 failing · 1 pending",
			loading: false,
			error: undefined,
		});
	});

	test("surfaces loading and actionable backend errors", () => {
		const vm = integrationPanelViewModel(
			{
				...state,
				status: "not-configured",
				syncErrors: [{ provider: "github", message: "Install gh", code: "gh-missing", occurredAt: "now" }],
			},
			{ loading: true },
		);
		expect(vm.loading).toBe(true);
		expect(vm.backendStatus).toBe("Install gh");
		expect(vm.error).toBe("Install gh");
	});

	test("builds exact approval summary for PR creation", () => {
		expect(prCreateApprovalSummary({ title: "Ship", head: "feature", base: "main" })).toBe(
			'Create GitHub pull request "Ship" from feature into main',
		);
	});
});
