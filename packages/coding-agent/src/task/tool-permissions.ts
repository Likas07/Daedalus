export interface ParsedAgentToolSpec {
	toolName: string;
	scope?: string;
	normalized: string;
}

export function normalizeAgentToolSpec(spec: string): string {
	const trimmed = spec.trim();
	if (!trimmed) return "";
	if (trimmed === "*") return trimmed;
	const openParen = trimmed.indexOf("(");
	const closeParen = trimmed.endsWith(")") ? trimmed.lastIndexOf(")") : -1;
	if (openParen <= 0 || closeParen <= openParen) {
		return trimmed.toLowerCase();
	}
	const toolName = trimmed.slice(0, openParen).trim().toLowerCase();
	const ruleContent = trimmed.slice(openParen + 1, closeParen);
	if (!ruleContent || ruleContent === "*") return toolName;
	return `${toolName}(${ruleContent})`;
}

export function parseAgentToolSpec(spec: string): ParsedAgentToolSpec {
	const normalized = normalizeAgentToolSpec(spec);
	if (!normalized || normalized === "*") {
		return { toolName: normalized, normalized };
	}
	const openParen = normalized.indexOf("(");
	const closeParen = normalized.endsWith(")") ? normalized.lastIndexOf(")") : -1;
	if (openParen <= 0 || closeParen <= openParen) {
		return { toolName: normalized, normalized };
	}
	const toolName = normalized.slice(0, openParen);
	const scope = normalized.slice(openParen + 1, closeParen);
	return {
		toolName,
		scope: scope || undefined,
		normalized,
	};
}

export function normalizeAgentToolSpecs(specs: string[] | undefined): string[] | undefined {
	if (!specs || specs.length === 0) return undefined;
	const normalized = specs.map(normalizeAgentToolSpec).filter(Boolean);
	return normalized.length > 0 ? normalized : undefined;
}

export function getAgentToolNames(specs: string[] | undefined): string[] | undefined {
	if (!specs || specs.length === 0) return undefined;
	const toolNames = specs
		.map(parseAgentToolSpec)
		.map(spec => spec.toolName)
		.filter(Boolean);
	return toolNames.length > 0 ? Array.from(new Set(toolNames)) : undefined;
}

export function getAgentToolScopeMap(specs: string[] | undefined): Record<string, string[]> | undefined {
	if (!specs || specs.length === 0) return undefined;
	const scopeMap = new Map<string, string[]>();
	for (const spec of specs.map(parseAgentToolSpec)) {
		if (!spec.toolName || !spec.scope) continue;
		const existing = scopeMap.get(spec.toolName) ?? [];
		existing.push(spec.scope);
		scopeMap.set(spec.toolName, existing);
	}
	if (scopeMap.size === 0) return undefined;
	return Object.fromEntries(scopeMap);
}
