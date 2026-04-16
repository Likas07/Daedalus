import * as fs from "node:fs";
import type { ExtensionCommandContext } from "@daedalus-pi/coding-agent";
import { Text } from "@daedalus-pi/tui";

async function showArtifactContent(ctx: ExtensionCommandContext, title: string, content: string): Promise<void> {
	await ctx.ui.custom((_tui, _theme, _kb, done) => {
		const text = new Text(`${title}\n\n${content}`, 0, 0);
		return {
			render: (width: number) => text.render(width),
			invalidate: () => text.invalidate(),
			handleInput: (input: string) => {
				if (input === "escape" || input === "q") done(undefined);
			},
		};
	});
}

export async function showTextArtifact(ctx: ExtensionCommandContext, title: string, filePath: string): Promise<void> {
	const content = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : `Missing artifact: ${filePath}`;
	await showArtifactContent(ctx, title, content);
}

export async function showJsonArtifact(ctx: ExtensionCommandContext, title: string, filePath: string): Promise<void> {
	if (!fs.existsSync(filePath)) {
		await showArtifactContent(ctx, title, `Missing artifact: ${filePath}`);
		return;
	}

	try {
		const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
		await showArtifactContent(ctx, title, JSON.stringify(parsed, null, 2));
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		await showArtifactContent(ctx, title, `Invalid JSON artifact: ${filePath}\n\n${message}`);
	}
}

export async function showSubagentTranscript(ctx: ExtensionCommandContext, sessionFile: string): Promise<void> {
	await showTextArtifact(ctx, "Subagent transcript", sessionFile);
}
