import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "../extensions/types.js";
import type { SubagentResultEnvelope } from "./types.js";

export interface SubmitResultPayload extends SubagentResultEnvelope {}

export function createSubmitResultTool(onSubmit: (payload: SubmitResultPayload) => void): ToolDefinition {
	let submitted = false;
	const parameters = Type.Object({
		task: Type.String(),
		status: Type.Union([Type.Literal("completed"), Type.Literal("partial"), Type.Literal("blocked")]),
		summary: Type.String(),
		output: Type.String(),
	});

	return {
		name: "submit_result",
		label: "Submit Result",
		description:
			"Submit the final subagent result exactly once using { task, status, summary, output }. summary is the short parent-facing conclusion; output is the full deferred result body.",
		parameters,
		async execute(_toolCallId, rawParams) {
			const params = rawParams as SubmitResultPayload;
			if (submitted) {
				throw new Error("submit_result may only be called once");
			}
			submitted = true;
			onSubmit(params);
			return {
				content: [{ type: "text", text: "Result submitted." }],
				details: {},
			};
		},
	};
}
