export type GuiCapabilityStatus = "wired" | "partial" | "disabled";

export interface GuiCapability {
	readonly id: string;
	readonly label: string;
	readonly status: GuiCapabilityStatus;
	readonly disabledReason?: string;
}

type CapabilityInput =
	| (Omit<GuiCapability, "status" | "disabledReason"> & { readonly status: "wired"; readonly disabledReason?: never })
	| (Omit<GuiCapability, "disabledReason"> & { readonly status: "partial" | "disabled"; readonly disabledReason: string });

const GUI_CAPABILITY_DEFINITIONS = [
	{ id: "entrypoints", label: "Entrypoints", status: "wired" },
	{ id: "sessions", label: "Sessions", status: "wired" },
	{ id: "turns", label: "Turns", status: "partial", disabledReason: "Turn cancellation/stop controls are not fully wired to app-server lifecycle yet." },
	{ id: "transcript", label: "Transcript", status: "wired" },
	{ id: "tools", label: "Tools", status: "wired" },
	{ id: "approvals", label: "Approvals", status: "wired" },
	{ id: "models", label: "Models", status: "wired" },
	{ id: "auth", label: "Auth", status: "wired" },
	{ id: "settings", label: "Settings", status: "partial", disabledReason: "Several settings panes are read-only until mutation APIs are connected." },
	{ id: "keybindings", label: "Keybindings", status: "partial", disabledReason: "Keybindings are displayed but rebinding is not implemented." },
	{ id: "slash-commands", label: "Slash commands", status: "wired" },
	{ id: "extensions", label: "Extensions", status: "wired" },
	{ id: "skills", label: "Skills", status: "disabled", disabledReason: "No GUI skill browser/activation surface exists yet." },
	{ id: "prompts", label: "Prompts", status: "disabled", disabledReason: "No GUI prompt template browser/editor exists yet." },
	{ id: "themes", label: "Themes", status: "partial", disabledReason: "Theme display is fixed to the current dark theme; switching is not implemented." },
	{ id: "package-resources", label: "Package resources", status: "disabled", disabledReason: "Package resource install/manage flows are not exposed in GUI yet." },
	{ id: "plans", label: "Plans", status: "wired" },
	{ id: "todos", label: "Todos", status: "wired" },
	{ id: "subagents", label: "Subagents", status: "wired" },
	{ id: "semantic-search", label: "Semantic search", status: "disabled", disabledReason: "Semantic index/search controls are not connected to app-server yet." },
	{ id: "terminal", label: "Terminal", status: "wired" },
	{ id: "diff", label: "Diff", status: "wired" },
	{ id: "git", label: "Git", status: "wired" },
	{ id: "worktrees", label: "Worktrees", status: "wired" },
	{ id: "diagnostics", label: "Diagnostics", status: "partial", disabledReason: "Diagnostics are visible, but export/download is not implemented." },
	{ id: "export", label: "Export", status: "disabled", disabledReason: "Transcript/log export controls are not wired yet." },
	{ id: "reconnect", label: "Reconnect", status: "wired" },
	{ id: "desktop-native", label: "Desktop-native behavior", status: "partial", disabledReason: "Desktop shell integration is pending native packaging hooks." },
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
