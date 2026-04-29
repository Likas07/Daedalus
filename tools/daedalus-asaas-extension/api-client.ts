import type { AsaasConfig } from "./config";
import type { AsaasMethod } from "./guards";
import { normalizeAsaasPath } from "./guards";
import { redactSensitive } from "./redact";

export interface AsaasApiRequest {
	method: AsaasMethod;
	path: string;
	query?: Record<string, string | number | boolean>;
	body?: Record<string, unknown>;
	signal?: AbortSignal;
}

export async function callAsaasApi(
	config: Required<Pick<AsaasConfig, "baseUrl" | "accessToken">>,
	request: AsaasApiRequest,
) {
	const url = new URL(`${config.baseUrl}${normalizeAsaasPath(request.path)}`);
	for (const [key, value] of Object.entries(request.query ?? {})) url.searchParams.set(key, String(value));
	const init: RequestInit = {
		method: request.method,
		headers: { "Content-Type": "application/json", access_token: config.accessToken },
		signal: request.signal,
	};
	if (request.method !== "GET" && request.body) init.body = JSON.stringify(request.body);
	const response = await fetch(url, init);
	const text = (await response.text()).slice(0, 100_000);
	const parsed = safeParseJson(text);
	if (!response.ok) {
		throw new Error(
			`Asaas API request failed with status ${response.status}: ${JSON.stringify(redactSensitive(parsed ?? text)).slice(0, 2000)}`,
		);
	}
	return { content: parsed ?? text, details: redactSensitive({ status: response.status, url: url.toString(), method: request.method }) };
}

function safeParseJson(text: string): unknown | undefined {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}
