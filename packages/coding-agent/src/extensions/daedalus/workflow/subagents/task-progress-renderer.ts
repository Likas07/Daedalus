export function formatAgentLabel(input: { name: string; displayName?: string }): string {
	return input.displayName ? `${input.displayName} (${input.name})` : input.name;
}

export function formatTaskProgress(input: {
	agent: string;
	displayName?: string;
	status: string;
	summary: string;
	activity?: string;
	branch?: string;
}): string {
	const prefix = input.status === "running" ? "⋯" : input.status === "completed" ? "✓" : "✗";
	const detail = input.activity ?? input.summary;
	const branch = input.branch ? ` · ${input.branch}` : "";
	return `${prefix} ${formatAgentLabel({ name: input.agent, displayName: input.displayName })} · ${detail}${branch}`;
}
