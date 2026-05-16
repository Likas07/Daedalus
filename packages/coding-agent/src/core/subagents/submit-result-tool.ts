import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "../extensions/types.js";
import { repairSubagentEnvelope } from "./result-repair.js";
import type { SubagentResultEnvelope } from "./types.js";

export interface SubmitResultPayload extends SubagentResultEnvelope {}

export interface InvalidSubmitResultEvent {
	rawParams: unknown;
	error: string;
	repairs: string[];
	attempt: number;
	maxAttempts: number;
}

export interface SubmitResultToolOptions {
	maxInvalidAttempts?: number;
	onInvalidSubmit?: (event: InvalidSubmitResultEvent) => void;
}

export const DEFAULT_MAX_INVALID_SUBMIT_ATTEMPTS = 3;

export function createSubmitResultTool(
	onSubmit: (payload: SubmitResultPayload) => void,
	options: SubmitResultToolOptions = {},
): ToolDefinition {
	let submitted = false;
	let invalidAttempts = 0;
	const maxAttempts = options.maxInvalidAttempts ?? DEFAULT_MAX_INVALID_SUBMIT_ATTEMPTS;
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
			if (submitted) {
				throw new Error("submit_result may only be called once");
			}
			if (invalidAttempts >= maxAttempts) {
				throw new Error(
					`submit_result invalid attempt limit reached. Use exactly { task: string, status: "completed" | "partial" | "blocked", summary: string, output: string }.`,
				);
			}

			const repaired = repairSubagentEnvelope(rawParams);
			if (!repaired.ok) {
				invalidAttempts += 1;
				options.onInvalidSubmit?.({
					rawParams,
					error: repaired.error,
					repairs: repaired.repairs,
					attempt: invalidAttempts,
					maxAttempts,
				});
				const prefix =
					invalidAttempts >= maxAttempts
						? "submit_result invalid attempt limit reached"
						: `Invalid submit_result envelope (attempt ${invalidAttempts} of ${maxAttempts})`;
				throw new Error(
					`${prefix}: ${repaired.error}. Use exactly { task: string, status: "completed" | "partial" | "blocked", summary: string, output: string }.`,
				);
			}

			submitted = true;
			onSubmit(repaired.envelope);
			return {
				content: [{ type: "text", text: "Result submitted." }],
				details: {},
			};
		},
	};
}
