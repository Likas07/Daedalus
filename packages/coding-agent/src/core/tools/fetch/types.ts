import type { TruncationResult } from "../truncate.js";

export interface FetchExtractionOptions {
	raw?: boolean;
	maxChars: number;
}

export interface FetchExtractionResult {
	text: string;
	contentType: string;
	truncated: boolean;
	originalLength: number;
	truncation?: TruncationResult;
}

export interface FetchOperations {
	fetch: typeof fetch;
}
