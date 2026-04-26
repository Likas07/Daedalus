export interface ResourceItem {
	readonly id: string;
	readonly name?: string;
	readonly kind: "extension" | "skill" | "prompt-template" | "theme" | "package" | string;
	readonly enabled?: boolean;
	readonly status?: string;
	readonly source?: string;
	readonly sourcePath?: string;
	readonly diagnostics?: readonly string[];
	readonly disabledReason?: string;
}

export interface ResourcesViewModel {
	readonly groups: readonly { kind: string; resources: readonly ResourceItem[]; count: number; diagnostics: number }[];
	readonly diagnostics: readonly string[];
	readonly total: number;
}

export function createResourcesViewModel(snapshot?: {
	resources?: readonly ResourceItem[];
	diagnostics?: readonly string[];
}): ResourcesViewModel {
	const resources = [...(snapshot?.resources ?? [])];
	const kinds = [...new Set(resources.map((resource) => resource.kind))].sort();
	return {
		groups: kinds.map((kind) => {
			const items = resources.filter((resource) => resource.kind === kind);
			return {
				kind,
				resources: items,
				count: items.length,
				diagnostics: items.reduce((sum, item) => sum + (item.diagnostics?.length ?? 0), 0),
			};
		}),
		diagnostics: snapshot?.diagnostics ?? [],
		total: resources.length,
	};
}
