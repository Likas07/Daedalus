export interface WebSearchSource {
	title: string;
	url: string;
}
export interface WebSearchUsage {
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
}
export interface WebSearchResponse {
	provider: "codex";
	answer?: string;
	sources: WebSearchSource[];
	model?: string;
	requestId?: string;
	usage?: WebSearchUsage;
}
