import { createExtensionRuntime } from "../extensions/loader.js";
import type { ResourceLoader } from "../resource-loader.js";
import { buildSubagentSystemPrompt } from "./subagent-system-prompt.js";

export function createSubagentResourceLoader(
	parent: ResourceLoader,
	appendSystemPrompt: string | string[],
): ResourceLoader {
	const runtime = createExtensionRuntime();
	const appendPrompts = Array.isArray(appendSystemPrompt) ? appendSystemPrompt : [appendSystemPrompt];
	const [rolePrompt, overridePrompt, packetPrompt] = appendPrompts;
	const subagentPrompt = buildSubagentSystemPrompt({
		rolePrompt: rolePrompt ?? "",
		overridePrompt,
		packetText: packetPrompt?.replace(/^Delegated task packet:\n/, ""),
	});
	return {
		getExtensions: () => ({ extensions: [], errors: [], runtime }),
		getSkills: () => parent.getSkills(),
		getPrompts: () => parent.getPrompts(),
		getThemes: () => parent.getThemes(),
		getAgentsFiles: () => parent.getAgentsFiles(),
		getSystemPrompt: () => subagentPrompt,
		getAppendSystemPrompt: () => [],
		extendResources: (paths) => parent.extendResources(paths),
		reload: async () => {},
	};
}
