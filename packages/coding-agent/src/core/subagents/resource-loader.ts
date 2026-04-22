import { createExtensionRuntime } from "../extensions/loader.js";
import type { ResourceLoader } from "../resource-loader.js";
import { buildSubagentSystemPrompt } from "./subagent-system-prompt.js";

export function createSubagentResourceLoader(
	parent: ResourceLoader,
	appendSystemPrompt: string | string[],
): ResourceLoader {
	const runtime = createExtensionRuntime();
	const appendPrompts = Array.isArray(appendSystemPrompt) ? appendSystemPrompt : [appendSystemPrompt];
	const [rolePrompt, overridePrompt, ...rest] = appendPrompts;
	const packetPrompt = rest.at(-1);
	const runtimeOverlays = packetPrompt?.startsWith("Delegated task packet:\n") ? rest.slice(0, -1) : rest;
	const subagentPrompt = buildSubagentSystemPrompt({
		rolePrompt: rolePrompt ?? "",
		overridePrompt,
		runtimeOverlays,
		packetText: packetPrompt?.startsWith("Delegated task packet:\n")
			? packetPrompt.replace(/^Delegated task packet:\n/, "")
			: undefined,
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
