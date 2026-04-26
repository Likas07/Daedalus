export type GuiCapabilityStatus = "wired" | "partial" | "disabled";
export type GuiCapabilityRequirement = "required" | "optional";

export interface GuiCapabilityCoverage {
	readonly behavioral: readonly string[];
	readonly e2e?: readonly string[];
}

export interface GuiCapability {
	readonly id: string;
	readonly label: string;
	readonly status: GuiCapabilityStatus;
	readonly requirement: GuiCapabilityRequirement;
	readonly coverage?: GuiCapabilityCoverage;
	readonly disabledReason?: string;
}

export type StrictGuiParityViolationKind =
	| "missing-required-capability"
	| "required-status"
	| "missing-behavioral-coverage"
	| "non-behavioral-coverage"
	| "forbidden-capability-copy";

export interface StrictGuiParityViolation {
	readonly capabilityId: string;
	readonly kind: StrictGuiParityViolationKind;
	readonly message: string;
}

type CapabilityInput =
	| (Omit<GuiCapability, "status" | "disabledReason"> & { readonly status: "wired"; readonly disabledReason?: never })
	| (Omit<GuiCapability, "disabledReason"> & {
			readonly status: "partial" | "disabled";
			readonly disabledReason: string;
	  });

export const REQUIRED_GUI_FULL_PARITY_CAPABILITY_IDS = [
	"composer",
	"project-session",
	"provider-model-auth",
	"terminal",
	"git-diff-checkpoint-pr",
	"settings",
	"persistence",
	"workflow-inspector",
	"desktop-native",
	"e2e",
] as const;

export type RequiredGuiFullParityCapabilityId = (typeof REQUIRED_GUI_FULL_PARITY_CAPABILITY_IDS)[number];

const GUI_CAPABILITY_DEFINITIONS = [
	{
		id: "composer",
		label: "Composer",
		status: "wired",
		requirement: "required",
		coverage: {
			behavioral: [
				"packages/gui/src/components/composer/composer-logic.test.ts",
				"packages/gui/src/components/composer/composer-submit-context.test.ts",
				"packages/gui/src/app.test.ts",
			],
			e2e: ["packages/gui/test/e2e/web-gui-smoke.test.ts"],
		},
	},
	{
		id: "project-session",
		label: "Project/session",
		status: "wired",
		requirement: "required",
		coverage: {
			behavioral: [
				"packages/app-server/src/server/session-routes.test.ts",
				"packages/app-server/src/runtime/session-controller.test.ts",
				"packages/gui/src/client/project-dashboard-view-model.test.ts",
				"packages/gui/src/client/session-entry-projection.test.ts",
				"packages/gui/src/app.test.ts",
			],
		},
	},
	{
		id: "provider-model-auth",
		label: "Provider/model/auth",
		status: "wired",
		requirement: "required",
		coverage: {
			behavioral: [
				"packages/app-server/src/runtime/provider-auth-service.test.ts",
				"packages/app-server/src/runtime/settings-service.test.ts",
				"packages/gui/src/client/settings-view-model.test.ts",
				"packages/gui/src/app.test.ts",
			],
		},
	},
	{
		id: "terminal",
		label: "Terminal",
		status: "wired",
		requirement: "required",
		coverage: {
			behavioral: [
				"packages/app-server/src/terminal/terminal-service.test.ts",
				"packages/app-server/src/terminal/pty-adapter.test.ts",
				"packages/gui/src/components/terminal/terminal-state.test.ts",
				"packages/gui/src/components/terminal/xterm-manager.test.ts",
				"packages/gui/src/app.test.ts",
			],
			e2e: ["packages/gui/test/e2e/web-gui-smoke.test.ts", "packages/desktop/test/e2e/desktop-gui-smoke.test.ts"],
		},
	},
	{
		id: "git-diff-checkpoint-pr",
		label: "Git/diff/checkpoint/PR",
		status: "wired",
		requirement: "required",
		coverage: {
			behavioral: [
				"packages/app-server/src/workspaces/git-mutation-service.test.ts",
				"packages/app-server/src/integrations/github-cli-service.test.ts",
				"packages/app-server/src/integrations/integration-api.test.ts",
				"packages/gui/src/client/diff-view-model.test.ts",
				"packages/gui/src/app.test.ts",
			],
			e2e: ["packages/gui/test/e2e/web-gui-smoke.test.ts"],
		},
	},
	{
		id: "settings",
		label: "Settings",
		status: "wired",
		requirement: "required",
		coverage: {
			behavioral: [
				"packages/app-server/src/runtime/settings-service.test.ts",
				"packages/app-server/src/runtime/resource-management-service.test.ts",
				"packages/gui/src/client/settings-view-model.test.ts",
				"packages/gui/src/app.test.ts",
			],
		},
	},
	{
		id: "persistence",
		label: "Persistence",
		status: "wired",
		requirement: "required",
		coverage: {
			behavioral: [
				"packages/app-server/src/persistence/event-store.test.ts",
				"packages/app-server/src/persistence/projector.test.ts",
				"packages/app-server/src/sessions/sqlite-session-store.test.ts",
				"packages/gui/src/client/reconnect-state.test.ts",
			],
		},
	},
	{
		id: "workflow-inspector",
		label: "Workflow/inspector",
		status: "wired",
		requirement: "required",
		coverage: {
			behavioral: [
				"packages/app-server/src/runtime/daedalus-workflow-service.test.ts",
				"packages/gui/src/client/daedalus-workflow-view-model.test.ts",
				"packages/gui/src/phase4-differentiation.test.ts",
				"packages/gui/src/app.test.ts",
			],
		},
	},
	{
		id: "desktop-native",
		label: "Desktop-native behavior",
		status: "wired",
		requirement: "required",
		coverage: {
			behavioral: [
				"packages/desktop/src/native-command-router.test.ts",
				"packages/desktop/src/server-process.test.ts",
			],
			e2e: [
				"packages/desktop/test/e2e/desktop-gui-smoke.test.ts",
				"packages/desktop/test/e2e/preload-smoke.test.ts",
			],
		},
	},
	{
		id: "e2e",
		label: "E2E",
		status: "wired",
		requirement: "required",
		coverage: {
			behavioral: [
				"packages/gui/test/e2e/web-gui-smoke.test.ts",
				"packages/desktop/test/e2e/desktop-gui-smoke.test.ts",
			],
			e2e: ["packages/gui/test/e2e/web-gui-smoke.test.ts", "packages/desktop/test/e2e/desktop-gui-smoke.test.ts"],
		},
	},
	{ id: "entrypoints", label: "Entrypoints", status: "wired", requirement: "optional" },
	{ id: "sessions", label: "Sessions", status: "wired", requirement: "optional" },
	{
		id: "turns",
		label: "Turns",
		status: "partial",
		requirement: "optional",
		disabledReason: "Turn cancellation/stop controls are not fully wired to app-server lifecycle yet.",
	},
	{ id: "transcript", label: "Transcript", status: "wired", requirement: "optional" },
	{ id: "tools", label: "Tools", status: "wired", requirement: "optional" },
	{ id: "approvals", label: "Approvals", status: "wired", requirement: "optional" },
	{ id: "models", label: "Models", status: "wired", requirement: "optional" },
	{ id: "auth", label: "Auth", status: "wired", requirement: "optional" },
	{
		id: "keybindings",
		label: "Keybindings",
		status: "partial",
		requirement: "optional",
		disabledReason: "Keybindings are displayed but rebinding is not implemented.",
	},
	{ id: "slash-commands", label: "Slash commands", status: "wired", requirement: "optional" },
	{ id: "extensions", label: "Extensions", status: "wired", requirement: "optional" },
	{
		id: "skills",
		label: "Skills",
		status: "disabled",
		requirement: "optional",
		disabledReason: "No GUI skill browser/activation surface exists yet.",
	},
	{
		id: "prompts",
		label: "Prompts",
		status: "disabled",
		requirement: "optional",
		disabledReason: "No GUI prompt template browser/editor exists yet.",
	},
	{
		id: "themes",
		label: "Themes",
		status: "partial",
		requirement: "optional",
		disabledReason: "Theme display is fixed to the current dark theme; switching is not implemented.",
	},
	{
		id: "package-resources",
		label: "Package resources",
		status: "disabled",
		requirement: "optional",
		disabledReason: "Package resource install/manage flows are not exposed in GUI yet.",
	},
	{ id: "plans", label: "Plans", status: "wired", requirement: "optional" },
	{ id: "todos", label: "Todos", status: "wired", requirement: "optional" },
	{ id: "subagents", label: "Subagents", status: "wired", requirement: "optional" },
	{
		id: "semantic-search",
		label: "Semantic search",
		status: "disabled",
		requirement: "optional",
		disabledReason: "Semantic index/search controls are not connected to app-server yet.",
	},
	{ id: "diff", label: "Diff", status: "wired", requirement: "optional" },
	{ id: "git", label: "Git", status: "wired", requirement: "optional" },
	{ id: "worktrees", label: "Worktrees", status: "wired", requirement: "optional" },
	{
		id: "diagnostics",
		label: "Diagnostics",
		status: "partial",
		requirement: "optional",
		disabledReason: "Diagnostics are visible, but export/download is not implemented.",
	},
	{
		id: "export",
		label: "Export",
		status: "disabled",
		requirement: "optional",
		disabledReason: "Transcript/log export controls are not wired yet.",
	},
	{ id: "reconnect", label: "Reconnect", status: "wired", requirement: "optional" },
] as const satisfies readonly CapabilityInput[];

export const GUI_CAPABILITIES: readonly GuiCapability[] = GUI_CAPABILITY_DEFINITIONS;

export type GuiCapabilityId = (typeof GUI_CAPABILITY_DEFINITIONS)[number]["id"];

export function getGuiCapability(id: GuiCapabilityId): GuiCapability {
	return GUI_CAPABILITY_DEFINITIONS.find((capability) => capability.id === id) as GuiCapability;
}

export function isGuiCapabilityEnabled(id: GuiCapabilityId): boolean {
	return getGuiCapability(id).status === "wired";
}

export function disabledReasonFor(id: GuiCapabilityId): string | undefined {
	const capability = getGuiCapability(id);
	return capability.status === "wired" ? undefined : capability.disabledReason;
}

export function strictGuiParityViolations(
	capabilities: readonly GuiCapability[] = GUI_CAPABILITIES,
): readonly StrictGuiParityViolation[] {
	const violations: StrictGuiParityViolation[] = [];
	const capabilityIds = new Set(capabilities.map((capability) => capability.id));
	for (const capabilityId of REQUIRED_GUI_FULL_PARITY_CAPABILITY_IDS) {
		if (!capabilityIds.has(capabilityId)) {
			violations.push({
				capabilityId,
				kind: "missing-required-capability",
				message: `Required GUI full-parity surface is not registered: ${capabilityId}.`,
			});
		}
	}

	for (const capability of capabilities) {
		if (hasForbiddenCapabilityCopy(capability)) {
			violations.push({
				capabilityId: capability.id,
				kind: "forbidden-capability-copy",
				message: `${capability.label} uses forbidden parity-gate copy.`,
			});
		}

		if (capability.requirement !== "required") continue;

		if (capability.status !== "wired") {
			violations.push({
				capabilityId: capability.id,
				kind: "required-status",
				message: `${capability.label} is required for GUI full parity and must be wired, not ${capability.status}.`,
			});
		}

		const behavioralCoverage = capability.coverage?.behavioral ?? [];
		if (behavioralCoverage.length === 0) {
			violations.push({
				capabilityId: capability.id,
				kind: "missing-behavioral-coverage",
				message: `${capability.label} must list behavioral test coverage for GUI full parity.`,
			});
		}

		for (const reference of [...behavioralCoverage, ...(capability.coverage?.e2e ?? [])]) {
			if (!isBehavioralCoverageReference(reference)) {
				violations.push({
					capabilityId: capability.id,
					kind: "non-behavioral-coverage",
					message: `${capability.label} coverage must point at behavioral or E2E tests, not ${reference}.`,
				});
			}
		}
	}

	return violations;
}

export function assertStrictGuiFullParity(capabilities: readonly GuiCapability[] = GUI_CAPABILITIES): void {
	const violations = strictGuiParityViolations(capabilities);
	if (violations.length === 0) return;
	throw new Error(
		`Strict GUI full parity gate failed:\n${violations.map((violation) => `- ${violation.message}`).join("\n")}`,
	);
}

function hasForbiddenCapabilityCopy(capability: GuiCapability): boolean {
	const copy = [capability.label, capability.disabledReason ?? ""].join("\n");
	return /\b(?:placeholder|no-op|noop|stub|dummy|fixture-only|tbd|unknown|untriaged)\b/i.test(copy);
}

function isBehavioralCoverageReference(reference: string): boolean {
	return /\.test\.ts$/.test(reference) && !/\b(?:source-string|readFileSync|fixture-only)\b/i.test(reference);
}
