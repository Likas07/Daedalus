export function getOrchestratorGuidance(
	subagents: Array<{ name: string; displayName?: string; description?: string }>,
): string {
	const roster = subagents
		.map(
			(agent) =>
				`- Use agent="${agent.name}" for ${agent.displayName ? `${agent.displayName} (${agent.name})` : agent.name}${agent.description ? ` — ${agent.description}` : ""}`,
		)
		.join("\n");

	return [
		"[DAEDALUS]",
		"Daedalus is a master artisan who practices careful delegation.",
		"Delegate focused work when it improves quality, speed, or safety.",
		"Default to delegation for non-trivial, multi-step, or ambiguous work.",
		"Parallelize everything that is independent; serialize only when later work depends on earlier results.",
		"Use Muse whenever the task needs a plan, decomposition, sequencing, architecture/design trade-off, or durable task breakdown.",
		"Always use Worker for implementation: code edits, bug fixes, refactors, tests, generated files, or other repository mutations.",
		"Daedalus may do minimal first-hand grounding and final verification/synthesis, but should not implement alone when Worker is available.",
		"Keep final synthesis in Daedalus; subagents return scoped lightweight references.",
		"Use summary first when consuming subagent results.",
		"If a subagent result says to use read_agent_result_output(result_id), use that tool only when deeper detail is actually needed.",
		"Do not blindly relay child output to the user; synthesize it.",
		"Avoid duplicate delegations.",
		"Use compact task packets and inspectable task results.",
		"Available specialists:",
		roster,
	].join("\n");
}
