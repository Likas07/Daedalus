import type { ExtensionContext } from "@daedalus-pi/coding-agent";

export interface ModelAuth {
	apiKey: string;
	headers?: Record<string, string>;
}

export async function resolveModelAuth(ctx: ExtensionContext): Promise<ModelAuth> {
	if (!ctx.model) {
		throw new Error("No model selected");
	}

	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
	if (!auth.ok || !auth.apiKey) {
		throw new Error(auth.ok ? `No API key for ${ctx.model.provider}` : auth.error);
	}

	return { apiKey: auth.apiKey, headers: auth.headers };
}
