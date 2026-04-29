const SENSITIVE_KEY_PATTERN = /^(authorization|access_token|accessToken|apiKey|token|secret|password)$/i;

export function redactSensitive(value: unknown): unknown {
	if (Array.isArray(value)) return value.map((item) => redactSensitive(item));
	if (!value || typeof value !== "object") return value;
	const output: Record<string, unknown> = {};
	for (const [key, child] of Object.entries(value)) {
		output[key] = SENSITIVE_KEY_PATTERN.test(key) ? "[REDACTED]" : redactSensitive(child);
	}
	return output;
}

export function errorToSafeMessage(error: unknown): string {
	if (error instanceof Error) return error.message.replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]");
	return JSON.stringify(redactSensitive(error));
}
