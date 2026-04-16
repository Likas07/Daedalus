import AjvModule from "ajv";

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
