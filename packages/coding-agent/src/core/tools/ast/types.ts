export interface AstRangePosition {
	line: number;
	column: number;
}

export interface AstByteRange {
	start: number;
	end: number;
}

export interface AstMatch {
	text: string;
	lines: string;
	file: string;
	range: {
		byteOffset: AstByteRange;
		start: AstRangePosition;
		end: AstRangePosition;
	};
	replacement?: string;
	language?: string;
	metaVariables?: {
		single?: Record<string, { text: string }>;
		multi?: Record<string, Array<{ text: string }>>;
		transformed?: Record<string, { text: string }>;
	};
}

export interface AstBackendRequest {
	pattern: string;
	rewrite?: string;
	lang?: string;
	selector?: string;
	cwd: string;
	paths: string[];
	glob?: string;
	signal?: AbortSignal;
}

export interface AstBackendResult {
	matches: AstMatch[];
	stderr: string;
}

export interface AstBackend {
	run(request: AstBackendRequest): Promise<AstBackendResult>;
}

export interface AstScope {
	absolutePath: string;
	displayPath: string;
	cwd: string;
	isDirectory: boolean;
	commandCwd: string;
	commandPaths: string[];
	glob?: string;
}

export interface AstFileSnapshot {
	absolutePath: string;
	relativePath: string;
	bom: string;
	originalEnding: "\n" | "\r\n";
	normalizedContent: string;
}

export interface AstEditChange {
	path: string;
	count: number;
	before: string;
	after: string;
	startLine: number;
}
