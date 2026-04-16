import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "../extensions/types.js";

export interface SubmitResultPayload {
	summary: string;
	data?: unknown;
	error?: string;
}

export function createSubmitResultTool(onSubmit: (payload: SubmitResultPayload) => void): ToolDefinition {
	let submitted = false;
	const parameters = Type.Object({
		summary: Type.String(),
		data: Type.Optional(Type.Unknown()),
		error: Type.Optional(Type.String()),
	});

	return {
		name: "submit_result",
		label: "Submit Result",
		description: "Submit the final structured result for this subagent run.",
		parameters,
		async execute(_toolCallId, rawParams) {
			const params = rawParams as { summary: string; data?: unknown; error?: string };
			if (submitted) {
				throw new Error("submit_result may only be called once");
			}
			submitted = true;
			onSubmit({ summary: params.summary, data: params.data, error: params.error });
			return {
				content: [{ type: "text", text: "Result submitted." }],
				details: {},
			};
		},
	};
}
