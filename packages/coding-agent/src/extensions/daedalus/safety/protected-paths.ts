import type { ExtensionAPI } from "@daedalus-pi/coding-agent";
import { isProtectedPath } from "../shared/guards.js";

function stringPath(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function getMutationPaths(toolName: string, input: Record<string, unknown>): string[] {
	if (toolName === "hashline_edit") {
		const edits = Array.isArray(input.edits) ? input.edits : [];
		return edits.flatMap((edit) => {
			if (!edit || typeof edit !== "object") return [];
			const entry = edit as Record<string, unknown>;
			return [stringPath(entry.path), stringPath(entry.to)].filter((path): path is string => Boolean(path));
		});
	}

	return [stringPath(input.path), stringPath(input.file_path)].filter((path): path is string => Boolean(path));
}

export default function (pi: ExtensionAPI) {
	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "write" && event.toolName !== "edit" && event.toolName !== "hashline_edit") {
			return undefined;
		}

		const paths = getMutationPaths(event.toolName, event.input as Record<string, unknown>);
		const protectedPath = paths.find((path) => isProtectedPath(path));

		if (protectedPath) {
			if (ctx.hasUI) {
				ctx.ui.notify(`Blocked file mutation to protected path: ${protectedPath}`, "warning");
			}
			return { block: true, reason: `Path "${protectedPath}" is protected` };
		}

		return undefined;
	});
}
