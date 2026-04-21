function stableSignature(toolName: string, input: Record<string, unknown>): string {
	const normalized = Object.keys(input)
		.sort()
		.map((key) => [key, input[key]]);
	return JSON.stringify([toolName, normalized]);
}

export class LoopDetector {
	private readonly counts = new Map<string, number>();
	private lastCompletionSignature?: string;
	private completionAttempts = 0;

	constructor(private readonly options: { maxRepeats: number; maxCompletionAttempts?: number }) {}

	record(toolName: string, input: Record<string, unknown>): boolean {
		const signature = stableSignature(toolName, input);
		const next = (this.counts.get(signature) ?? 0) + 1;
		this.counts.set(signature, next);
		return next >= this.options.maxRepeats;
	}

	recordCompletionAttempt(activeSignature: string): boolean {
		if (this.lastCompletionSignature !== activeSignature) {
			this.lastCompletionSignature = activeSignature;
			this.completionAttempts = 1;
			return false;
		}
		this.completionAttempts += 1;
		return this.completionAttempts >= (this.options.maxCompletionAttempts ?? this.options.maxRepeats);
	}

	resetCompletion(): void {
		this.lastCompletionSignature = undefined;
		this.completionAttempts = 0;
	}
}
