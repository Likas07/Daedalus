import type { ExtensionContext } from "@daedalus-pi/coding-agent";

export type AsaasMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type AsaasRisk = "read" | "write" | "destructive" | "production-write";

export function normalizeAsaasPath(path: string): string {
	const trimmed = path.trim();
	if (!trimmed) throw new Error("Asaas API path is required.");
	if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.startsWith("//")) {
		throw new Error("Use a relative Asaas API path, not a full URL.");
	}
	const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
	if (withSlash.includes("..")) throw new Error("Asaas API path must not contain '..'.");
	return withSlash;
}

export function classifyAsaasRequest(method: AsaasMethod, baseUrl: string, path: string): AsaasRisk {
	normalizeAsaasPath(path);
	if (method === "GET") return "read";
	if (method === "DELETE") return "destructive";
	return new URL(baseUrl).hostname === "api.asaas.com" ? "production-write" : "write";
}

export async function confirmAsaasMutation(
	ctx: Pick<ExtensionContext, "hasUI" | "ui">,
	request: { method: AsaasMethod; path: string; dryRun?: boolean; baseUrl: string },
) {
	if (request.dryRun !== false) return { allowed: false, dryRun: true as const };
	if (!ctx.hasUI) throw new Error("Live Asaas mutations require interactive UI confirmation.");
	const risk = classifyAsaasRequest(request.method, request.baseUrl, request.path);
	const ok = await ctx.ui.confirm(
		"Confirm Asaas API mutation",
		`${risk}: ${request.method} ${request.path} on ${request.baseUrl}`,
	);
	if (!ok) throw new Error("Asaas API mutation cancelled by user.");
	return { allowed: true, dryRun: false as const, risk };
}
