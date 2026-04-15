export interface FetchExtractionOptions {
	raw?: boolean;
	maxChars: number;
}

export interface FetchExtractionResult {
	text: string;
	contentType: string;
	truncated: boolean;
	originalLength: number;
}

export interface FetchOperations {
	fetch: typeof fetch;
}
