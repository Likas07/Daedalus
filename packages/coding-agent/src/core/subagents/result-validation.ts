import AjvModule from "ajv";
import type { SubagentResultEnvelope } from "./types.js";

const Ajv = (AjvModule as any).default || AjvModule;
const ajv = new Ajv({ allErrors: true, strict: false });

export function validateSubagentResult(data: unknown, schema: unknown): string | undefined {
	if (!schema) return undefined;
	try {
		const validate = ajv.compile(schema as object);
		const ok = validate(data);
		if (ok) return undefined;
		return ajv.errorsText(validate.errors, { separator: "\n" });
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}
}

export function validateSubagentEnvelope(data: unknown): string | undefined {
	return validateSubagentResult(data, {
		type: "object",
		additionalProperties: false,
		properties: {
			task: { type: "string" },
			status: { type: "string", enum: ["completed", "partial", "blocked"] },
			summary: { type: "string" },
			output: { type: "string" },
		},
		required: ["task", "status", "summary", "output"],
	});
}

export function isSubagentResultEnvelope(data: unknown): data is SubagentResultEnvelope {
	return validateSubagentEnvelope(data) === undefined;
}
