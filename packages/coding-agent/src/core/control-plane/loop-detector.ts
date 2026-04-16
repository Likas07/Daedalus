function stableSignature(toolName: string, input: Record<string, unknown>): string {
	const normalized = Object.keys(input)
		.sort()
		.map((key) => [key, input[key]]);
	return JSON.stringify([toolName, normalized]);
}

export class LoopDetector {
	private readonly counts = new Map<string, number>();

	constructor(private readonly options: { maxRepeats: number }) {}

	record(toolName: string, input: Record<string, unknown>): boolean {
		const signature = stableSignature(toolName, input);
		const next = (this.counts.get(signature) ?? 0) + 1;
		this.counts.set(signature, next);
		return next >= this.options.maxRepeats;
	}
}
