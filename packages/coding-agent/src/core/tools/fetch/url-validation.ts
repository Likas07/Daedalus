import { DEFAULT_FETCH_MAX_CHARS } from "../../tool-output-defaults.js";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

export function normalizeFetchUrl(input: string): string {
	const raw = input.trim();
	const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
	let parsed: URL;
	try {
		parsed = new URL(withProtocol);
	} catch {
		throw new Error(`Invalid URL: ${input}`);
	}
	if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
		throw new Error(`Unsupported protocol: ${parsed.protocol}`);
	}
	return parsed.toString();
}

export function normalizeTimeoutSeconds(value: number | undefined, fallback = 15): number {
	if (value === undefined) return fallback;
	const normalized = Math.floor(value);
	if (!Number.isFinite(normalized) || normalized < 1) {
		throw new Error("timeout must be a positive number of seconds");
	}
	return Math.min(normalized, 60);
}

export function normalizeMaxChars(value: number | undefined, fallback = DEFAULT_FETCH_MAX_CHARS): number {
	if (value === undefined) return fallback;
	const normalized = Math.floor(value);
	if (!Number.isFinite(normalized) || normalized < 500) {
		throw new Error("maxChars must be at least 500");
	}
	return Math.min(normalized, 200_000);
}

export function isTextLikeContentType(contentType: string): boolean {
	const normalized = contentType.split(";")[0].trim().toLowerCase();
	return (
		normalized.startsWith("text/") ||
		normalized === "application/json" ||
		normalized === "application/ld+json" ||
		normalized === "application/xml" ||
		normalized === "application/xhtml+xml" ||
		normalized === "application/javascript" ||
		normalized === "application/x-javascript"
	);
}
