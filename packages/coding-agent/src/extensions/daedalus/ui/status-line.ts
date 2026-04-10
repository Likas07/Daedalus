import type { ExtensionAPI } from "@daedalus-pi/coding-agent";

export default function (pi: ExtensionAPI) {
	let turnCount = 0;

	pi.on("session_start", async (_event, ctx) => {
		const theme = ctx.ui.theme;
		ctx.ui.setStatus("daedalus-status", theme.fg("dim", "Ready"));
	});

	pi.on("turn_start", async (_event, ctx) => {
		turnCount++;
		const theme = ctx.ui.theme;
		const spinner = theme.fg("accent", "●");
		const text = theme.fg("dim", ` Turn ${turnCount}...`);
		ctx.ui.setStatus("daedalus-status", spinner + text);
	});

	pi.on("turn_end", async (_event, ctx) => {
		const theme = ctx.ui.theme;
		const check = theme.fg("success", "✓");
		const text = theme.fg("dim", ` Turn ${turnCount} complete`);
		ctx.ui.setStatus("daedalus-status", check + text);
	});
}
