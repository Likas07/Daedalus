export interface SemanticEmbedBatchMetrics {
	batchIndex: number;
	batchSize: number;
	elapsedMs: number;
	completedTexts: number;
	totalTexts: number;
	concurrency: number;
}

export interface SemanticEmbedDocumentsOptions {
	onBatch?: (metrics: SemanticEmbedBatchMetrics) => void;
}

export interface SemanticChunk {
	chunkId: string;
	filePath: string;
	language?: string;
	content: string;
	startLine: number;
	endLine: number;
	contentHash: string;
	symbolName?: string;
	symbolKind?: string;
}

export interface SemanticLocalFileState {
	filePath: string;
	fileHash: string;
	fileSize: number;
	modifiedMs: number;
}

export interface SemanticIndexedFile {
	filePath: string;
	fileHash: string;
	fileSize: number;
	modifiedMs: number;
	chunkCount: number;
	indexedAt: number;
}

export interface SemanticSyncPlan {
	newFiles: string[];
	modifiedFiles: string[];
	deletedFiles: string[];
	unchangedFiles: string[];
	failedFiles: Array<{ filePath: string; reason: string }>;
}

export type SemanticPathValue = "high" | "medium" | "low";

export type SemanticSkipReason =
	| "hardExclude"
	| "gitignore"
	| "semanticignore"
	| "nonText"
	| "sizeLimit"
	| "generated"
	| "minified"
	| "lockfile"
	| "profile";

export type SemanticSkipCounts = Partial<Record<SemanticSkipReason, number>>;

export interface SemanticSearchRequest {
	query: string;
	useCase?: string;
	limit?: number;
	topK?: number;
	startsWith?: string;
	endsWith?: string[];
}

export interface SemanticSearchHit {
	chunkId: string;
	filePath: string;
	startLine: number;
	endLine: number;
	snippet: string;
	relevanceScore: number;
	distance?: number;
	language?: string;
	contentHash: string;
}

export interface SemanticEmbedderModelInfo {
	provider: string;
	model: string;
	dimension: number;
	host: string;
}

export interface SemanticEmbedder {
	embedDocuments(texts: string[], options?: SemanticEmbedDocumentsOptions): Promise<number[][]>;
	embedQuery(text: string): Promise<number[]>;
	getModelInfo(): Promise<SemanticEmbedderModelInfo>;
}
