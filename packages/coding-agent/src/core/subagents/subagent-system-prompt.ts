import subagentBaseContract from "./subagent-base-contract.md" with { type: "text" };

export function buildSubagentSystemPrompt(input: {
	rolePrompt: string;
	overridePrompt?: string;
	packetText?: string;
}): string {
	return [
		subagentBaseContract.trim(),
		input.rolePrompt.trim(),
		input.overridePrompt?.trim(),
		input.packetText ? `Delegated task packet:\n${input.packetText.trim()}` : undefined,
	]
		.filter(Boolean)
		.join("\n\n");
}
