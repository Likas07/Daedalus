import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "../extensions/types.js";

export interface SubmitResultPayload {
	summary: string;
	deliverable?: unknown;
	data?: unknown;
	error?: string;
}

export function createSubmitResultTool(onSubmit: (payload: SubmitResultPayload) => void): ToolDefinition {
	let submitted = false;
	const parameters = Type.Object({
		summary: Type.String(),
		deliverable: Type.Optional(Type.Unknown()),
		data: Type.Optional(Type.Unknown()),
		error: Type.Optional(Type.String()),
	});

	return {
		name: "submit_result",
		label: "Submit Result",
		description:
			"Submit the final structured result for this subagent run exactly once. Use `summary` for parent-facing status, `deliverable` for the actual requested output, and `error` when blocked.",
		parameters,
		async execute(_toolCallId, rawParams) {
			const params = rawParams as { summary: string; deliverable?: unknown; data?: unknown; error?: string };
			if (submitted) {
				throw new Error("submit_result may only be called once");
			}
			submitted = true;
			onSubmit({ summary: params.summary, deliverable: params.deliverable, data: params.data, error: params.error });
			return {
				content: [{ type: "text", text: "Result submitted." }],
				details: {},
			};
		},
	};
}
