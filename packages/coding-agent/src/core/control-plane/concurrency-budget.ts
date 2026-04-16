export class ConcurrencyBudget {
	private readonly modelCounts = new Map<string, number>();
	private readonly roleCounts = new Map<string, number>();
	private readonly rootCounts = new Map<string, number>();

	constructor(private readonly limits: { perModel: number; perRole: number; perRoot: number }) {}

	tryReserve(input: { modelKey?: string; role: string; rootId?: string }): boolean {
		if (input.modelKey && (this.modelCounts.get(input.modelKey) ?? 0) >= this.limits.perModel) {
			return false;
		}
		if ((this.roleCounts.get(input.role) ?? 0) >= this.limits.perRole) {
			return false;
		}
		if (input.rootId && (this.rootCounts.get(input.rootId) ?? 0) >= this.limits.perRoot) {
			return false;
		}

		if (input.modelKey) {
			this.modelCounts.set(input.modelKey, (this.modelCounts.get(input.modelKey) ?? 0) + 1);
		}
		this.roleCounts.set(input.role, (this.roleCounts.get(input.role) ?? 0) + 1);
		if (input.rootId) {
			this.rootCounts.set(input.rootId, (this.rootCounts.get(input.rootId) ?? 0) + 1);
		}
		return true;
	}
}
