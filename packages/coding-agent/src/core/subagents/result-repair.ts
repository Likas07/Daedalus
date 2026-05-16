import { validateSubagentEnvelope } from "./result-validation.js";
import type { SubagentEnvelopeStatus, SubagentResultEnvelope } from "./types.js";

export type RepairSubagentEnvelopeResult =
	| { ok: true; envelope: SubagentResultEnvelope; repairs: string[] }
	| { ok: false; error: string; repairs: string[]; candidate?: unknown };

const STATUS_ALIASES: Record<string, SubagentEnvelopeStatus> = {
	completed: "completed",
	complete: "completed",
	done: "completed",
	partial: "partial",
	blocked: "blocked",
	block: "blocked",
};

export function repairSubagentEnvelope(input: unknown): RepairSubagentEnvelopeResult {
	const repairs: string[] = [];
	if (!input || typeof input !== "object" || Array.isArray(input)) {
		return { ok: false, error: "Envelope must be an object.", repairs, candidate: input };
	}

	const source = input as Record<string, unknown>;
	const allowed = new Set(["task", "status", "summary", "output"]);
	const extras = Object.keys(source).filter((key) => !allowed.has(key));
	const candidate: Record<string, unknown> = {
		task: source.task,
		status: source.status,
		summary: source.summary,
		output: source.output,
	};
	if (extras.length > 0) repairs.push(`stripped additional properties: ${extras.sort().join(", ")}`);

	if (typeof candidate.status === "string") {
		const normalized = STATUS_ALIASES[candidate.status.trim().toLowerCase()];
		if (normalized && normalized !== candidate.status) {
			candidate.status = normalized;
			repairs.push(`normalized status to ${normalized}`);
		}
	}

	if (candidate.output !== undefined && typeof candidate.output !== "string") {
		candidate.output = JSON.stringify(candidate.output, null, 2);
		repairs.push("coerced output object to JSON string");
	}

	const error = validateSubagentEnvelope(candidate);
	if (error) return { ok: false, error, repairs, candidate };
	if (
		typeof candidate.task !== "string" ||
		(candidate.status !== "completed" && candidate.status !== "partial" && candidate.status !== "blocked") ||
		typeof candidate.summary !== "string" ||
		typeof candidate.output !== "string"
	) {
		return {
			ok: false,
			error: "Envelope must contain narrowed task, status, summary, and output fields.",
			repairs,
			candidate,
		};
	}
	const envelope: SubagentResultEnvelope = {
		task: candidate.task,
		status: candidate.status,
		summary: candidate.summary,
		output: candidate.output,
	};
	return { ok: true, envelope, repairs };
}
