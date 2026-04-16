import { createExtensionRuntime } from "../extensions/loader.js";
import type { ResourceLoader } from "../resource-loader.js";

export function createSubagentResourceLoader(parent: ResourceLoader, appendSystemPrompt: string): ResourceLoader {
	const runtime = createExtensionRuntime();
	return {
		getExtensions: () => ({ extensions: [], errors: [], runtime }),
		getSkills: () => parent.getSkills(),
		getPrompts: () => parent.getPrompts(),
		getThemes: () => parent.getThemes(),
		getAgentsFiles: () => parent.getAgentsFiles(),
		getSystemPrompt: () => parent.getSystemPrompt(),
		getAppendSystemPrompt: () => [...parent.getAppendSystemPrompt(), appendSystemPrompt],
		extendResources: (paths) => parent.extendResources(paths),
		reload: async () => {},
	};
}
