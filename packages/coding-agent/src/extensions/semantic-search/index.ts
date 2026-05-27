import type { ExtensionAPI } from "@daedalus-pi/coding-agent";
import semSearch from "./sem-search.js";
import semanticWorkspaceTools from "./semantic-workspace-tools.js";

export default function semanticSearchExtension(pi: ExtensionAPI): void {
	semSearch(pi);
	semanticWorkspaceTools(pi);
}
