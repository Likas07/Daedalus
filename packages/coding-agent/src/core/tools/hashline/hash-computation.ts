import { HASHLINE_DICT } from "./constants.js";

const RE_SIGNIFICANT = /[\p{L}\p{N}]/u;

function computeNormalizedLineHash(lineNumber: number, normalizedContent: string): string {
	const seed = RE_SIGNIFICANT.test(normalizedContent) ? 0 : lineNumber;
	return HASHLINE_DICT[Bun.hash.xxHash32(normalizedContent, seed) & 0xff];
}

export function computeLineHash(lineNumber: number, content: string): string {
	return computeNormalizedLineHash(lineNumber, content.replace(/\r/g, "").trimEnd());
}

export function formatLineTag(lineNumber: number, content: string): string {
	return `${lineNumber}#${computeLineHash(lineNumber, content)}`;
}

export function formatHashLines(content: string, startLine = 1): string {
	const lines = content.split("\n");
	return lines.map((line, index) => `${formatLineTag(startLine + index, line)}:${line}`).join("\n");
}
