import type { ExtensionAPI } from "@daedalus-pi/coding-agent";
import { isProtectedPath } from "../shared/guards.js";

export default function (pi: ExtensionAPI) {
	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "write" && event.toolName !== "edit" && event.toolName !== "hashline_edit") {
			return undefined;
		}

		const path = event.input.path as string;

		if (isProtectedPath(path)) {
			if (ctx.hasUI) {
				ctx.ui.notify(`Blocked file mutation to protected path: ${path}`, "warning");
			}
			return { block: true, reason: `Path "${path}" is protected` };
		}

		return undefined;
	});
}
