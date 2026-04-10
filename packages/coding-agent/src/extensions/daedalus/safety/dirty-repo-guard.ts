import type { ExtensionAPI, ExtensionContext } from "@daedalus-pi/coding-agent";
import { getGitStatus } from "../shared/git.js";

async function checkDirtyRepo(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	action: string,
): Promise<{ cancel: boolean } | undefined> {
	const status = await getGitStatus(pi);

	if (!status.isRepo || !status.isDirty) {
		return;
	}

	if (!ctx.hasUI) {
		return { cancel: true };
	}

	const choice = await ctx.ui.select(
		`You have ${status.changedFileCount} uncommitted file(s). ${action} anyway?`,
		["Yes, proceed anyway", "No, let me commit first"],
	);

	if (choice !== "Yes, proceed anyway") {
		ctx.ui.notify("Commit your changes first", "warning");
		return { cancel: true };
	}
}

export default function (pi: ExtensionAPI) {
	pi.on("session_before_switch", async (event, ctx) => {
		const action = event.reason === "new" ? "new session" : "switch session";
		return checkDirtyRepo(pi, ctx, action);
	});

	pi.on("session_before_fork", async (_event, ctx) => {
		return checkDirtyRepo(pi, ctx, "fork");
	});
}
