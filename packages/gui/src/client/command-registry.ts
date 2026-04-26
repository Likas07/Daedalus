import { getGuiCapability, type GuiCapabilityId } from "./capability-registry";
import { commandDisabledReason, GUI_COMMANDS, type CommandDescriptor, type CommandId } from "./commands";
import { extensionCommands, type RendererSafeExtensionMetadata, type RendererSafeExtensionSurface } from "./extension-surfaces";
import type { AppEvent } from "@daedalus-pi/app-server-protocol";
import type { AccessMode } from "./gui-state-types";
import type { GuiRuntime, GuiState } from "./runtime";
import type { UiState } from "./ui-state.svelte";

export type RegisteredCommandId = CommandId | `extension:${string}:${string}`;

export interface RegisteredCommand extends Omit<CommandDescriptor, "id" | "disabled" | "disabledReason"> {
	readonly id: RegisteredCommandId;
	readonly disabledReason?: string;
	readonly run?: () => void | Promise<void>;
}

export interface CommandRegistryContext {
	readonly guiState: GuiState;
	readonly ui: UiState;
	readonly runtime: GuiRuntime;
	readonly extensions?: readonly RendererSafeExtensionMetadata[];
	readonly focusComposer?: () => void;
	readonly dispatchExtensionCommand?: (command: RendererSafeExtensionSurface) => void | Promise<void>;
	readonly exportDiagnostics?: (diagnostics: string) => void | Promise<void>;
}

const COMMAND_CAPABILITIES: Partial<Record<CommandId, GuiCapabilityId>> = {
	"open-settings": "settings",
	"provider-settings": "settings",
	"open-model-selector": "models",
	"export-diagnostics": "diagnostics",
	"show-approval-queue": "approvals",
	"cancel-turn": "turns",
	"stop-session": "turns",
	"create-terminal": "terminal",
	"toggle-terminal": "terminal",
};

export function createCommandRegistry(context: CommandRegistryContext): readonly RegisteredCommand[] {
	const commands = GUI_COMMANDS.map((command) => bindCoreCommand(command, context));
	const extensionRegistryCommands = extensionCommands(context.extensions ?? []).map((command): RegisteredCommand => ({
		id: `extension:${command.extensionId}:${command.id}`,
		label: command.title,
		group: `Extensions · ${command.extensionId}`,
		keywords: [command.description ?? "", command.id, command.extensionId],
		run: context.dispatchExtensionCommand ? () => context.dispatchExtensionCommand?.(command) : undefined,
		disabledReason: context.dispatchExtensionCommand ? undefined : "Extension command dispatch is not available in this renderer.",
	}));
	const registry = [...commands, ...extensionRegistryCommands];
	installNativeCommandRegistryBridge(context, registry);
	return registry;
}

export function assertCommandRegistryRunnable(commands: readonly RegisteredCommand[]): void {
	const missing = commands.filter((command) => !command.run && !command.disabledReason).map((command) => command.id);
	if (missing.length > 0) throw new Error(`Commands missing run handler or disabled reason: ${missing.join(", ")}`);
}

const nativeCommandContexts = new WeakSet<CommandRegistryContext>();

function installNativeCommandRegistryBridge(context: CommandRegistryContext, commands: readonly RegisteredCommand[]): void {
	if (typeof globalThis.addEventListener !== "function" || nativeCommandContexts.has(context)) return;
	nativeCommandContexts.add(context);
	globalThis.addEventListener("daedalus:native-command", (event) => {
		const detail = (event as CustomEvent<{ id?: string }>).detail;
		const commandId = detail?.id === "toggle-terminal" ? "toggle-terminal" : detail?.id === "export-diagnostics" ? "export-diagnostics" : undefined;
		if (!commandId) return;
		const command = commands.find((item) => item.id === commandId);
		void command?.run?.();
	});
}

export function findActiveTurnId(events: readonly AppEvent[], sessionId?: string): string | undefined {
	for (const event of [...events].reverse()) {
		if (sessionId && event.sessionId !== sessionId) continue;
		const payload = event.payload && typeof event.payload === "object" ? (event.payload as { turnId?: unknown; id?: unknown; status?: unknown }) : undefined;
		const turnId = typeof payload?.turnId === "string" ? payload.turnId : typeof payload?.id === "string" && event.type.includes("turn") ? payload.id : undefined;
		if (!turnId) continue;
		if (event.type.includes("completed") || event.type.includes("cancel") || payload?.status === "completed" || payload?.status === "cancelled") return undefined;
		return turnId;
	}
	return undefined;
}

function bindCoreCommand(command: CommandDescriptor, context: CommandRegistryContext): RegisteredCommand {
	const reason = getDisabledReason(command, context);
	return {
		...command,
		disabledReason: reason,
		run: reason ? undefined : runHandler(command.id, context),
	};
}

function getDisabledReason(command: CommandDescriptor, context: CommandRegistryContext): string | undefined {
	if (command.disabledReason) return command.disabledReason;
	if (command.disabled) return commandDisabledReason(command) ?? "Command is disabled.";
	const capabilityId = COMMAND_CAPABILITIES[command.id];
	if (capabilityId) {
		const capability = getGuiCapability(capabilityId);
		if (capability.status === "disabled") return capability.disabledReason;
	}
	if (command.id === "cancel-turn" && !findActiveTurnId(context.guiState.events, context.guiState.selectedSessionId)) return "No active turn is running in the selected session.";
	if (command.id === "stop-session" && !context.guiState.selectedSessionId) return "No session is selected.";
	if (command.id === "open-model-selector" && context.guiState.models.length === 0) return "No models are available from the server yet.";
	return undefined;
}

function runHandler(commandId: CommandId, context: CommandRegistryContext): (() => void | Promise<void>) | undefined {
	switch (commandId) {
		case "focus-composer": return () => context.focusComposer?.();
		case "new-session": return () => { context.ui.view = "empty"; context.runtime.selectSession(undefined); setTimeout(() => context.focusComposer?.(), 0); };
		case "open-project": return () => { context.ui.paletteMode = "project"; context.ui.paletteOpen = true; };
		case "open-settings":
		case "provider-settings": return () => { context.ui.view = "settings"; context.runtime.selectSession(undefined); };
		case "open-model-selector": return () => { context.ui.popoverKind = "model"; };
		case "export-diagnostics": return () => { void context.exportDiagnostics?.(context.runtime.exportDiagnostics()); };
		case "toggle-terminal": return () => { context.ui.terminalOpen = !context.ui.terminalOpen; };
		case "toggle-inspector": return () => { context.ui.rightOpen = !context.ui.rightOpen; };
		case "show-approval-queue": return () => document.querySelector<HTMLElement>('[data-testid="approval-queue"]')?.scrollIntoView();
		case "cancel-turn": return () => {
			const turnId = findActiveTurnId(context.guiState.events, context.guiState.selectedSessionId);
			if (context.guiState.selectedSessionId && turnId) void context.runtime.cancelTurn(context.guiState.selectedSessionId, turnId);
		};
		case "stop-session": return () => { if (context.guiState.selectedSessionId) void context.runtime.stopSession(context.guiState.selectedSessionId); };
		case "create-terminal": return () => { void context.runtime.createTerminal({ cwd: context.guiState.projectRoot ?? "/", projectId: context.guiState.lastProjectId, cols: 100, rows: 24 }); context.ui.terminalOpen = true; };
		case "set-access-mode-supervised": return () => void context.runtime.setAccessMode("supervised");
		case "set-access-mode-auto-accept": return () => void context.runtime.setAccessMode("auto-accept" as AccessMode);
		case "set-access-mode-unrestricted": return () => void context.runtime.setAccessMode("unrestricted");
		case "archived-sessions":
		case "search-files": return undefined;
	}
}
