import type { ExtensionContext } from "@daedalus-pi/coding-agent";

export interface SubagentModeState {
	enabled: boolean;
}

export function restoreSubagentMode(ctx: ExtensionContext): SubagentModeState {
	for (const entry of ctx.sessionManager.getBranch().slice().reverse()) {
		if (entry.type === "custom" && entry.customType === "subagent-mode") {
			return { enabled: Boolean((entry.data as { enabled?: boolean } | undefined)?.enabled) };
		}
	}

	return { enabled: false };
}
