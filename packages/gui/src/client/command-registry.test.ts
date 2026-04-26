import { describe, expect, test } from "bun:test";
import type { AppServerClient } from "@daedalus-pi/app-server-client";
import { assertCommandRegistryRunnable, createCommandRegistry } from "./command-registry";
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

function runtime(guiState: GuiState, calls: string[] = []): GuiRuntime {
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
			calls.push(`select:${sessionId ?? "none"}`);
		},
		async openProject() {
			return { projectId: "project-1" };
		},
		async startSessionFromPrompt() {},
		async respondToExtensionUI() {
			return {};
		},
		async startTurn() {},
		async cancelTurn(_sessionId, _turnId) {
			calls.push("cancel-turn");
		},
		async stopSession(_sessionId) {
			calls.push("stop-session");
		},
		async respondToApproval() {},
		async setModel() {},
		async setEffort() {},
		async setAccessMode(mode) {
			guiState.accessMode = mode;
			calls.push(`access:${mode}`);
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
			calls.push("create-terminal");
			return { terminalId: "term-1", cwd: "/repo", cols: 100, rows: 24, status: "running", history: "" };
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
			calls.push("export-diagnostics");
			return "{}";
		},
		async close() {},
	};
}

describe("command registry", () => {
	test("every command has a handler or disabled reason", () => {
		const guiState = state();
		const commands = createCommandRegistry({
			guiState,
			ui: uiState(),
			runtime: runtime(guiState),
			exportDiagnostics() {},
		});
		expect(() => assertCommandRegistryRunnable(commands)).not.toThrow();
		expect(commands.filter((command) => !command.run && !command.disabledReason)).toEqual([]);
	});

	test("toggle terminal changes ui state", () => {
		const guiState = state();
		const ui = uiState();
		const command = createCommandRegistry({ guiState, ui, runtime: runtime(guiState) }).find(
			(item) => item.id === "toggle-terminal",
		);
		expect(ui.terminalOpen).toBe(false);
		command?.run?.();
		expect(ui.terminalOpen).toBe(true);
	});

	test("disabled commands do not run", () => {
		const calls: string[] = [];
		const guiState = state();
		const command = createCommandRegistry({ guiState, ui: uiState(), runtime: runtime(guiState, calls) }).find(
			(item) => item.id === "cancel-turn",
		);
		expect(command?.disabledReason).toContain("No active turn");
		expect(command?.run).toBeUndefined();
		expect(calls).toEqual([]);
	});

	test("runtime commands wire cancel stop access terminal diagnostics and extensions", () => {
		const calls: string[] = [];
		const guiState = state({
			selectedSessionId: "session-1",
			events: [
				{ id: "event-1", ts: "now", type: "turn/running", sessionId: "session-1", payload: { turnId: "turn-1" } },
			],
		});
		const ui = uiState();
		let extensionRan = false;
		let diagnostics = "";
		const commands = createCommandRegistry({
			guiState,
			ui,
			runtime: runtime(guiState, calls),
			extensions: [
				{
					id: "ext",
					enabled: true,
					capabilities: [],
					permissions: [],
					commands: [{ id: "run", extensionId: "ext", kind: "command", title: "Run extension" }],
					panes: [],
					backgroundTasks: [],
					errors: [],
				},
			],
			dispatchExtensionCommand: () => {
				extensionRan = true;
			},
			exportDiagnostics: (value) => {
				diagnostics = value;
			},
		});
		commands.find((item) => item.id === "cancel-turn")?.run?.();
		commands.find((item) => item.id === "stop-session")?.run?.();
		commands.find((item) => item.id === "set-access-mode-unrestricted")?.run?.();
		commands.find((item) => item.id === "create-terminal")?.run?.();
		commands.find((item) => item.id === "export-diagnostics")?.run?.();
		commands.find((item) => item.id === "extension:ext:run")?.run?.();
		expect(calls).toContain("cancel-turn");
		expect(calls).toContain("stop-session");
		expect(calls).toContain("access:unrestricted");
		expect(calls).toContain("create-terminal");
		expect(calls).toContain("export-diagnostics");
		expect(diagnostics).toBe("{}");
		expect(extensionRan).toBe(true);
		expect(ui.terminalOpen).toBe(true);
	});
});
