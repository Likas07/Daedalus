export function formatTaskProgress(input: {
	agent: string;
	status: string;
	summary: string;
	activity?: string;
	branch?: string;
}): string {
	const prefix = input.status === "running" ? "⋯" : input.status === "completed" ? "✓" : "✗";
	const detail = input.activity ?? input.summary;
	const branch = input.branch ? ` · ${input.branch}` : "";
	return `${prefix} ${input.agent} · ${detail}${branch}`;
}
