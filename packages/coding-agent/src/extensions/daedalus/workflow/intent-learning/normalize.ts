const CODE_FENCE_PATTERN = /```[\s\S]*?```/g;
const INLINE_CODE_PATTERN = /`[^`]*`/g;
const URL_PATTERN = /https?:\/\/\S+/g;
const WORD_PATTERN = /[a-z0-9]+(?:['-][a-z0-9]+)*/g;

function collapseWhitespace(text: string): string {
	return text.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

export function normalizeIntentUserText(text: string): string {
	const sanitized = text.replace(CODE_FENCE_PATTERN, " ").replace(INLINE_CODE_PATTERN, " ").replace(URL_PATTERN, " ");
	return collapseWhitespace(sanitized).toLowerCase();
}

export function extractNormalizedWords(text: string): string[] {
	return normalizeIntentUserText(text).match(WORD_PATTERN) ?? [];
}

export function getLeadingPhrase(words: string[], count: 1 | 2 | 3): string | undefined {
	if (words.length < count) {
		return undefined;
	}
	return words.slice(0, count).join(" ");
}

export function sanitizeIntentExampleSnippet(text: string, maxLength = 160): string {
	const sanitized = collapseWhitespace(text.replace(CODE_FENCE_PATTERN, " [code] ").replace(INLINE_CODE_PATTERN, " "));
	if (sanitized.length <= maxLength) {
		return sanitized;
	}
	return `${sanitized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}
