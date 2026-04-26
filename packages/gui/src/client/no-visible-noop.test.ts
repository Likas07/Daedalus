import { describe, expect, test } from "bun:test";
import { GUI_CAPABILITIES, strictGuiParityViolations } from "./capability-registry";
import { assertCommandRegistryRunnable, createCommandRegistry } from "./command-registry";
import type { AppServerClient } from "@daedalus-pi/app-server-client";
import type { GuiRuntime, GuiState } from "./runtime";
import type { UiState } from "./ui-state.svelte";

function state(input: Partial<GuiState> = {}): GuiState {
	return {
		connected: true,
		connectionStatus: "connected",
		reconnectAttempt: 0,
		displayDensity: "comfortable",
		providerStatuses: [],
		approvalItems: [],
		worktrees: [],
		sessions: [],
		events: [],
		extensionRequests: [],
		notifications: [],
		diagnostics: [],
		integrations: [],
		terminalOutput: "",
		terminalCursor: 0,
		projects: [],
		terminals: [],
		models: [{ id: "model-a", label: "Model A", provider: "test", available: true }],
		mode: "daedalus",
		fastMode: false,
		accessMode: "supervised",
		authStatuses: [],
		composerAttachments: [],
		composerFileMentions: [],
		composerSlashCommands: [],
		sessionTokensUsed: 0,
		...input,
	};
}

function uiState(): UiState {
	return {
		view: "empty",
		paletteOpen: false,
		paletteMode: "commands",
		terminalOpen: false,
		leftOpen: true,
		rightOpen: true,
		leftWidth: 248,
		rightWidth: 328,
		popoverKind: null,
		popoverAnchor: null,
		favorites: [],
		diffPath: null,
		compact: false,
	};
}

function runtime(guiState: GuiState): GuiRuntime {
	return {
		client: {} as AppServerClient,
		state: guiState,
		notify() {},
		subscribe() {
			return () => {};
		},
		async initialize() {},
		async reconnect() {},
		selectSession(sessionId) {
			guiState.selectedSessionId = sessionId;
		},
		async openProject() {
			return { projectId: "project-1" };
		},
		async startSessionFromPrompt() {},
		async respondToExtensionUI() {
			return {};
		},
		async startTurn() {},
		async cancelTurn() {},
		async stopSession() {},
		async respondToApproval() {},
		async setModel() {},
		async setEffort() {},
		async setAccessMode() {
			return {};
		},
		async setMode() {},
		async setFastMode() {},
		async searchComposerFiles() {
			return [];
		},
		async listComposerCommands() {
			return [];
		},
		async refreshDiff() {
			return undefined;
		},
		async createWorktree() {
			throw new Error("not used");
		},
		async openInEditor() {},
		async saveComposerAttachment() {
			throw new Error("not used");
		},
		async createTerminal() {
			return {
				terminalId: "term-1",
				id: "term-1",
				cwd: "/repo",
				cols: 100,
				rows: 24,
				status: "running",
				history: "",
			};
		},
		async sendTerminalInput() {},
		async resizeTerminal() {},
		async replayTerminal() {
			return [];
		},
		async killTerminal() {
			return undefined;
		},
		exportDiagnostics() {
			return "{}";
		},
		async close() {},
	};
}

describe("no visible no-op GUI policy", () => {
	test("every visible command has a handler or an explicit disabled reason", () => {
		const guiState = state({
			selectedSessionId: "session-1",
			events: [
				{ id: "event-1", ts: "now", type: "turn/running", sessionId: "session-1", payload: { turnId: "turn-1" } },
			],
		});
		const commands = createCommandRegistry({
			guiState,
			ui: uiState(),
			runtime: runtime(guiState),
			focusComposer() {},
			exportDiagnostics() {},
		});
		expect(() => assertCommandRegistryRunnable(commands)).not.toThrow();
		expect(commands.filter((command) => !command.run && !command.disabledReason)).toEqual([]);
	});

	test("required incomplete capabilities are strict full-gate blockers, not visible no-op exemptions", () => {
		const incompleteRequiredIds = GUI_CAPABILITIES.filter(
			(capability) => capability.requirement === "required" && capability.status !== "wired",
		).map((capability) => capability.id);
		const strictStatusBlockers = strictGuiParityViolations()
			.filter((violation) => violation.kind === "required-status")
			.map((violation) => violation.capabilityId);
		expect(strictStatusBlockers).toEqual(incompleteRequiredIds);
		expect(
			GUI_CAPABILITIES.filter(
				(capability) =>
					capability.requirement === "required" &&
					capability.status !== "wired" &&
					!capability.disabledReason?.trim(),
			),
		).toEqual([]);
	});
});
