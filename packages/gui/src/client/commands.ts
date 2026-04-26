import { disabledReasonFor } from "./capability-registry";

export type CommandId =
	| "focus-composer"
	| "new-session"
	| "open-project"
	| "open-settings"
	| "open-model-selector"
	| "export-diagnostics"
	| "toggle-terminal"
	| "toggle-inspector"
	| "show-approval-queue"
	| "archived-sessions"
	| "provider-settings"
	| "cancel-turn"
	| "stop-session"
	| "create-terminal"
	| "set-access-mode-supervised"
	| "set-access-mode-auto-accept"
	| "set-access-mode-unrestricted"
	| "search-files";

export interface CommandDescriptor {
	readonly id: CommandId;
	readonly label: string;
	readonly group: string;
	readonly keywords?: readonly string[];
	readonly disabled?: boolean;
	readonly disabledReason?: string;
}

export const GUI_COMMANDS: readonly CommandDescriptor[] = [
	{ id: "focus-composer", label: "Focus composer", group: "Navigation", keywords: ["prompt", "task"] },
	{ id: "new-session", label: "New session", group: "Sessions", keywords: ["start", "task", "composer"] },
	{ id: "open-project", label: "Open project folder", group: "Projects", keywords: ["folder", "workspace", "browse"] },
	{ id: "open-settings", label: "Open settings", group: "Settings", keywords: ["preferences", "configuration"] },
	{ id: "provider-settings", label: "Provider settings", group: "Settings", keywords: ["models", "auth"] },
	{ id: "open-model-selector", label: "Open model selector", group: "Settings", keywords: ["model", "provider"] },
	{ id: "export-diagnostics", label: "Export diagnostics", group: "Diagnostics", keywords: ["logs", "debug", "copy"] },
	{ id: "toggle-terminal", label: "Toggle terminal", group: "Layout", keywords: ["shell", "drawer"] },
	{ id: "toggle-inspector", label: "Toggle inspector", group: "Layout", keywords: ["debug", "details"] },
	{ id: "show-approval-queue", label: "Show approval queue", group: "Approvals", keywords: ["autonomy", "risk"] },
	{ id: "cancel-turn", label: "Cancel turn", group: "Lifecycle", keywords: ["stop", "interrupt"] },
	{ id: "stop-session", label: "Stop session", group: "Lifecycle", keywords: ["terminate", "halt"] },
	{ id: "create-terminal", label: "Create terminal", group: "Terminal", keywords: ["shell", "pty"] },
	{ id: "set-access-mode-supervised", label: "Access mode: supervised", group: "Access", keywords: ["safe", "approval"] },
	{ id: "set-access-mode-auto-accept", label: "Access mode: auto-accept", group: "Access", keywords: ["automated", "soft"] },
	{ id: "set-access-mode-unrestricted", label: "Access mode: unrestricted", group: "Access", keywords: ["danger", "bypass"] },
	{ id: "search-files", label: "Search files", group: "Composer", keywords: ["mention", "context"], disabled: true, disabledReason: "File search is available from composer mentions, not as a standalone command." },
	{ id: "archived-sessions", label: "Archived sessions", group: "Sessions", keywords: ["history"], disabled: true, disabledReason: "Archived session browsing is not wired to app-server yet." },
];

export function commandDisabledReason(command: CommandDescriptor): string | undefined {
	if (command.disabledReason) return command.disabledReason;
	if (command.id === "cancel-turn" || command.id === "stop-session") return disabledReasonFor("turns");
	return undefined;
}
