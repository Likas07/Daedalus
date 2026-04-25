export type CommandId =
	| "focus-composer"
	| "new-session"
	| "open-settings"
	| "toggle-terminal"
	| "toggle-inspector"
	| "show-approval-queue"
	| "archived-sessions"
	| "provider-settings"
	| "extension-commands";

export interface CommandDescriptor {
	readonly id: CommandId;
	readonly label: string;
	readonly group: string;
	readonly keywords?: readonly string[];
	readonly disabled?: boolean;
}

export const GUI_COMMANDS: readonly CommandDescriptor[] = [
	{ id: "focus-composer", label: "Focus composer", group: "Navigation", keywords: ["prompt", "task"] },
	{ id: "new-session", label: "New session", group: "Sessions", keywords: ["start", "task", "composer"] },
	{ id: "open-settings", label: "Open settings", group: "Settings", keywords: ["preferences", "configuration"] },
	{ id: "toggle-terminal", label: "Toggle terminal", group: "Layout", keywords: ["shell", "drawer"] },
	{ id: "toggle-inspector", label: "Toggle inspector", group: "Layout", keywords: ["debug", "details"] },
	{ id: "show-approval-queue", label: "Show approval queue", group: "Approvals", keywords: ["autonomy", "risk"] },
	{ id: "archived-sessions", label: "Archived sessions", group: "Sessions", keywords: ["history"], disabled: true },
	{ id: "provider-settings", label: "Provider settings", group: "Settings", keywords: ["models", "auth"] },
	{
		id: "extension-commands",
		label: "Extension commands",
		group: "Extensions",
		keywords: ["plugins"],
		disabled: true,
	},
];
