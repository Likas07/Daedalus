export interface AsaasConfig {
	baseUrl: string;
	accessToken?: string;
	safeStatus: { tokenPresent: boolean; baseUrl: string };
}

const ALLOWED_HOSTS = new Set(["api.asaas.com", "sandbox.asaas.com"]);

export function resolveAsaasConfig(env: Record<string, string | undefined> = process.env): AsaasConfig {
	const baseUrl = env.ASAAS_BASE_URL ?? "https://api.asaas.com/v3";
	const parsed = new URL(baseUrl);
	if (parsed.protocol !== "https:") throw new Error("ASAAS_BASE_URL must use HTTPS.");
	if (parsed.username || parsed.password) throw new Error("ASAAS_BASE_URL must not include credentials.");
	if (!ALLOWED_HOSTS.has(parsed.hostname)) throw new Error("ASAAS_BASE_URL must point to an Asaas API host.");
	const normalized = parsed.toString().replace(/\/$/, "");
	return {
		baseUrl: normalized,
		accessToken: env.ASAAS_ACCESS_TOKEN,
		safeStatus: { tokenPresent: Boolean(env.ASAAS_ACCESS_TOKEN), baseUrl: normalized },
	};
}

export function requireAsaasToken(config: AsaasConfig): string {
	if (!config.accessToken) throw new Error("ASAAS_ACCESS_TOKEN is required for authenticated Asaas API calls.");
	return config.accessToken;
}
