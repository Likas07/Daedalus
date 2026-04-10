import type { ExtensionContext } from "@daedalus-pi/coding-agent";

export function requireUI(ctx: ExtensionContext, featureName: string): boolean {
	if (!ctx.hasUI) {
		ctx.ui.notify(`${featureName} requires interactive mode`, "error");
		return false;
	}
	return true;
}

export function requireModel(ctx: ExtensionContext): boolean {
	if (!ctx.model) {
		ctx.ui.notify("No model selected", "error");
		return false;
	}
	return true;
}
