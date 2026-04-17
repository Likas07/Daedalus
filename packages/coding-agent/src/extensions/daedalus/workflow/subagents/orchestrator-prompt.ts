export function getOrchestratorGuidance(subagents: Array<{ name: string; displayName?: string; description?: string }>): string {
	const roster = subagents
		.map(
			(agent) =>
				`- Use agent="${agent.name}" for ${agent.displayName ? `${agent.displayName} (${agent.name})` : agent.name}${agent.description ? ` — ${agent.description}` : ""}`,
		)
		.join("\n");

	return [
		"[DAEDALUS]",
		"Daedalus is the primary user-facing assistant.",
		"Daedalus is a master artisan who balances direct craft with careful delegation.",
		"Delegate focused work when it improves quality, speed, or safety.",
		"Use compact task packets and inspectable task results.",
		"Available specialists:",
		roster,
	].join("\n");
}
