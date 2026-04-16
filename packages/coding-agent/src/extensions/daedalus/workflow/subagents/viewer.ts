import * as fs from "node:fs";
import type { ExtensionCommandContext } from "@daedalus-pi/coding-agent";
import { Text } from "@daedalus-pi/tui";

export async function showSubagentTranscript(ctx: ExtensionCommandContext, sessionFile: string): Promise<void> {
	const content = fs.existsSync(sessionFile) ? fs.readFileSync(sessionFile, "utf8") : "Missing child session file.";
	await ctx.ui.custom((_tui, _theme, _kb, done) => {
		const text = new Text(content, 0, 0);
		return {
			render: (width: number) => text.render(width),
			invalidate: () => text.invalidate(),
			handleInput: (input: string) => {
				if (input === "escape" || input === "q") done(undefined);
			},
		};
	});
}
