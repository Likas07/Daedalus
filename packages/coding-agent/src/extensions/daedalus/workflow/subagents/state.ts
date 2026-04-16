import type { ExtensionContext } from "@daedalus-pi/coding-agent";
import { SettingsManager } from "../../../../core/settings-manager.js";

export interface SubagentModeState {
	enabled: boolean;
}

export function restoreSubagentMode(ctx: ExtensionContext): SubagentModeState {
	for (const entry of ctx.sessionManager.getBranch().slice().reverse()) {
		if (entry.type === "custom" && entry.customType === "subagent-mode") {
			return { enabled: Boolean((entry.data as { enabled?: boolean } | undefined)?.enabled) };
		}
	}

	const defaults = SettingsManager.create(ctx.cwd).getSubagentSettings();
	return { enabled: defaults.defaultPrimary === "orchestrator" };
}
