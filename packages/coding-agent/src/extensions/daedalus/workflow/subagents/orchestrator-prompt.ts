export function getOrchestratorGuidance(): string {
	return [
		"[DAEDALUS ORCHESTRATOR]",
		"You are the primary user-facing assistant.",
		"Delegate focused work when it improves speed, clarity, or safety.",
		"Use compact task packets and inspectable task results.",
	].join("\n");
}
