import { createExtensionRuntime } from "../extensions/loader.js";
import type { ResourceLoader } from "../resource-loader.js";

export function createSubagentResourceLoader(
	parent: ResourceLoader,
	appendSystemPrompt: string | string[],
): ResourceLoader {
	const runtime = createExtensionRuntime();
	const appendPrompts = Array.isArray(appendSystemPrompt) ? appendSystemPrompt : [appendSystemPrompt];
	return {
		getExtensions: () => ({ extensions: [], errors: [], runtime }),
		getSkills: () => parent.getSkills(),
		getPrompts: () => parent.getPrompts(),
		getThemes: () => parent.getThemes(),
		getAgentsFiles: () => parent.getAgentsFiles(),
		getSystemPrompt: () => parent.getSystemPrompt(),
		getAppendSystemPrompt: () => [...parent.getAppendSystemPrompt(), ...appendPrompts],
		extendResources: (paths) => parent.extendResources(paths),
		reload: async () => {},
	};
}
