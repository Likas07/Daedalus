import { readPersistedSubagentResult } from "../../../core/subagents/index.js";

export async function getAgentResultOutput(input: {
	parentSessionFile: string | undefined;
	resultId: string;
}): Promise<{ result_id: string; conversation_id: string; status: string; output: string } | undefined> {
	const record = await readPersistedSubagentResult(input.parentSessionFile, input.resultId);
	if (!record) return undefined;
	return {
		result_id: record.resultId,
		conversation_id: record.conversationId,
		status: record.status,
		output: record.output,
	};
}
