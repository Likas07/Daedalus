import type { ExtensionAPI } from "@daedalus-pi/coding-agent";
import { Type } from "@sinclair/typebox";
import { getAgentResultOutput } from "./agent-result-store.js";

const Params = Type.Object({
	result_id: Type.String({ description: "Stable id for the stored subagent result sidecar." }),
});

export default function readAgentResultOutput(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "read_agent_result_output",
		label: "Read Agent Result Output",
		description: "Read the deferred full output body for a previously completed subagent result by result_id.",
		promptSnippet:
			"Read the deferred full output body for a subagent result when the summary reference is not enough.",
		parameters: Params,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const result = await getAgentResultOutput({
				parentSessionFile: ctx.sessionManager.getSessionFile(),
				resultId: (params as { result_id: string }).result_id,
			});
			if (!result) {
				throw new Error(`Unknown subagent result_id: ${(params as { result_id: string }).result_id}`);
			}
			return {
				content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
				details: result,
			};
		},
	});
}
