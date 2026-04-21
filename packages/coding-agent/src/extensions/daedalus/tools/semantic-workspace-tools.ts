import { Text } from "@daedalus-pi/tui";
import { Type } from "@sinclair/typebox";
import type { ExtensionAPI } from "@daedalus-pi/coding-agent";
import {
	getSemanticWorkspaceStatus,
	initSemanticWorkspace,
	syncSemanticWorkspace,
} from "./semantic-workspace.js";

const EmptyParams = Type.Object({});

function formatStatus(status: ReturnType<typeof getSemanticWorkspaceStatus>): string {
	const lines = [
		`state: ${status.state}`,
		`initialized: ${status.initialized}`,
		`ready: ${status.ready}`,
		`indexed_files: ${status.indexedFiles}`,
		`root: ${status.root}`,
		`index_path: ${status.indexPath}`,
	];
	if (status.indexedAt) lines.push(`indexed_at: ${new Date(status.indexedAt).toISOString()}`);
	if (status.staleReason) lines.push(`stale_reason: ${status.staleReason}`);
	return lines.join("\n");
}

export default function semanticWorkspaceExtension(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "sem_workspace_init",
		label: "Semantic Workspace Init",
		description: "Initialize semantic workspace metadata for the current project.",
		promptSnippet: "Initialize semantic workspace metadata before first semantic indexing run",
		parameters: EmptyParams,
		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			const state = initSemanticWorkspace(ctx.cwd);
			const status = getSemanticWorkspaceStatus(ctx.cwd);
			return {
				content: [{ type: "text", text: `Initialized semantic workspace at ${ctx.cwd}` }],
				details: { ...status, initializedAt: state.initializedAt },
			};
		},
		renderCall(_args, theme) {
			return new Text(theme.fg("toolTitle", theme.bold("sem_workspace_init")), 0, 0);
		},
		renderResult(result, _options, theme) {
			const text = result.content.find((block) => block.type === "text")?.text ?? "";
			return new Text(theme.fg("toolOutput", text), 0, 0);
		},
	});

	pi.registerTool({
		name: "sem_workspace_sync",
		label: "Semantic Workspace Sync",
		description: "Build or refresh the semantic workspace index for the current project.",
		promptSnippet: "Build or refresh semantic workspace index before readiness-aware semantic search",
		parameters: EmptyParams,
		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			const state = syncSemanticWorkspace(ctx.cwd);
			const status = getSemanticWorkspaceStatus(ctx.cwd);
			return {
				content: [{ type: "text", text: `Indexed ${state.indexedFiles} files for semantic workspace` }],
				details: status,
			};
		},
		renderCall(_args, theme) {
			return new Text(theme.fg("toolTitle", theme.bold("sem_workspace_sync")), 0, 0);
		},
		renderResult(result, _options, theme) {
			const text = result.content.find((block) => block.type === "text")?.text ?? "";
			return new Text(theme.fg("toolOutput", text), 0, 0);
		},
	});

	pi.registerTool({
		name: "sem_workspace_status",
		label: "Semantic Workspace Status",
		description: "Show semantic workspace readiness, freshness, and index location.",
		promptSnippet: "Inspect semantic workspace readiness before using semantic retrieval",
		parameters: EmptyParams,
		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			const status = getSemanticWorkspaceStatus(ctx.cwd);
			return {
				content: [{ type: "text", text: formatStatus(status) }],
				details: status,
			};
		},
		renderCall(_args, theme) {
			return new Text(theme.fg("toolTitle", theme.bold("sem_workspace_status")), 0, 0);
		},
		renderResult(result, _options, theme) {
			const text = result.content.find((block) => block.type === "text")?.text ?? "";
			return new Text(theme.fg("toolOutput", text), 0, 0);
		},
	});

	pi.registerTool({
		name: "sem_workspace_info",
		label: "Semantic Workspace Info",
		description: "Return detailed semantic workspace metadata, including index path and file counts.",
		promptSnippet: "Inspect detailed semantic workspace metadata and index path",
		parameters: EmptyParams,
		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			const status = getSemanticWorkspaceStatus(ctx.cwd);
			return {
				content: [{ type: "text", text: formatStatus(status) }],
				details: status,
			};
		},
		renderCall(_args, theme) {
			return new Text(theme.fg("toolTitle", theme.bold("sem_workspace_info")), 0, 0);
		},
		renderResult(result, _options, theme) {
			const text = result.content.find((block) => block.type === "text")?.text ?? "";
			return new Text(theme.fg("toolOutput", text), 0, 0);
		},
	});
}
