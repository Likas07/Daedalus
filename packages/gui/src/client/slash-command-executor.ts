import type { ComposerSlashCommand } from "./gui-state-types";

export type SlashCommandAction = "gui" | "runtime" | "submit" | "noop";
export interface SlashCommandExecutionContext {
	readonly sessionId?: string;
	openSettings?(): void;
	openModelPicker?(): void;
	newSession?(): void;
	quit?(): void;
	reloadResources?(): Promise<unknown> | unknown;
	compact?(sessionId?: string): Promise<unknown> | unknown;
}
export interface SlashCommandExecutionResult {
	readonly action: SlashCommandAction;
	readonly command: string;
	readonly message: string;
	readonly prompt?: string;
}

const GUI_COMMANDS = new Set(["settings", "model", "scoped-models", "hotkeys", "session", "tree", "new"]);
const RUNTIME_COMMANDS = new Set(["compact", "reload", "resume", "fork", "login", "logout", "export", "import", "share", "copy", "name", "changelog", "quit"]);

export function normalizeSlashCommand(input: string): string {
	return input.trim().replace(/^\//, "").split(/\s+/)[0] ?? "";
}

export function listSlashCommands(commands: readonly ComposerSlashCommand[]): readonly ComposerSlashCommand[] {
	return commands.map((command) => ({ ...command, disabled: (command as ComposerSlashCommand & { disabled?: boolean }).disabled, disabledReason: (command as ComposerSlashCommand & { disabledReason?: string }).disabledReason } as ComposerSlashCommand));
}

export async function executeSlashCommand(input: string | ComposerSlashCommand, context: SlashCommandExecutionContext = {}): Promise<SlashCommandExecutionResult> {
	const command = typeof input === "string" ? normalizeSlashCommand(input) : input.name;
	if (!command) return { action: "noop", command, message: "No slash command selected." };
	if (command === "settings") { context.openSettings?.(); return { action: "gui", command, message: "Opened settings." }; }
	if (command === "model" || command === "scoped-models") { context.openModelPicker?.(); return { action: "gui", command, message: "Opened model controls." }; }
	if (command === "new") { context.newSession?.(); return { action: "gui", command, message: "Started a new session draft." }; }
	if (command === "reload") { await context.reloadResources?.(); return { action: "runtime", command, message: "Reloaded resources." }; }
	if (command === "compact") { await context.compact?.(context.sessionId); return { action: "runtime", command, message: "Compacted session context." }; }
	if (command === "quit") { context.quit?.(); return { action: "runtime", command, message: "Requested quit." }; }
	if (GUI_COMMANDS.has(command)) return { action: "gui", command, message: `Handled /${command} in the GUI.` };
	if (RUNTIME_COMMANDS.has(command)) return { action: "runtime", command, message: `Handled /${command} through the runtime.` };
	return { action: "submit", command, prompt: `/${command}`, message: `Inserted /${command} for agent execution.` };
}
