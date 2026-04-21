import AjvModule from "ajv";
import addFormatsModule from "ajv-formats";
import { parseStreamingJson } from "./json-parse.js";

// Handle both default and named exports
const Ajv = (AjvModule as any).default || AjvModule;
const addFormats = (addFormatsModule as any).default || addFormatsModule;

import type { Tool, ToolCall } from "../types.js";

export const TOOL_ARGUMENT_REPAIR_SYMBOL = Symbol.for("daedalus.toolArgumentRepairs");

export interface ToolArgumentRepair {
	code: "parsed_json_string" | "parsed_partial_json_string" | "normalized_enum_case" | "wrapped_singleton_array";
	path: string;
	message: string;
}

type JsonSchemaLike = Record<string, any>;

function isObjectLike(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function appendRepair(repairs: ToolArgumentRepair[], repair: ToolArgumentRepair): void {
	repairs.push(repair);
}

function normalizePath(path: string): string {
	return path.length > 0 ? path : "root";
}

function extractStringEnumValues(schema: JsonSchemaLike | undefined): string[] | undefined {
	if (!schema || typeof schema !== "object") return undefined;
	if (Array.isArray(schema.enum) && schema.enum.every((value) => typeof value === "string")) {
		return schema.enum as string[];
	}
	for (const key of ["anyOf", "oneOf", "allOf"] as const) {
		const variants = schema[key];
		if (!Array.isArray(variants)) continue;
		const values = variants
			.map((variant) => (typeof variant?.const === "string" ? variant.const : undefined))
			.filter((value): value is string => typeof value === "string");
		if (values.length > 0 && values.length === variants.length) {
			return values;
		}
	}
	return undefined;
}

function normalizeEnumCase(value: string, values: string[]): string | undefined {
	const lowerValue = value.toLowerCase();
	const matches = values.filter((candidate) => candidate.toLowerCase() === lowerValue);
	if (matches.length !== 1) {
		return undefined;
	}
	return matches[0] === value ? undefined : matches[0];
}

function maybeParseArguments(argumentsValue: unknown, repairs: ToolArgumentRepair[]): unknown {
	if (typeof argumentsValue !== "string") {
		return argumentsValue;
	}

	const trimmed = argumentsValue.trim();
	if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) {
		return argumentsValue;
	}

	try {
		const parsed = JSON.parse(trimmed);
		appendRepair(repairs, {
			code: "parsed_json_string",
			path: "root",
			message: "Parsed stringified JSON tool arguments.",
		});
		return parsed;
	} catch {
		try {
			const parsed = parseStreamingJson(trimmed);
			appendRepair(repairs, {
				code: "parsed_partial_json_string",
				path: "root",
				message: "Recovered tool arguments from partial JSON.",
			});
			return parsed;
		} catch {
			return argumentsValue;
		}
	}
}

function repairValueAgainstSchema(
	value: unknown,
	schema: JsonSchemaLike | undefined,
	path: string,
	repairs: ToolArgumentRepair[],
): unknown {
	if (!schema || typeof schema !== "object") {
		return value;
	}

	if (Array.isArray(value) && schema.type === "array") {
		const itemSchema = schema.items;
		return value.map((item, index) => repairValueAgainstSchema(item, itemSchema, `${path}/${index}`, repairs));
	}

	if (!Array.isArray(value) && schema.type === "array" && value !== undefined) {
		appendRepair(repairs, {
			code: "wrapped_singleton_array",
			path: normalizePath(path),
			message: `Wrapped singleton value at ${normalizePath(path)} into an array.`,
		});
		return [repairValueAgainstSchema(value, schema.items, `${path}/0`, repairs)];
	}

	if (typeof value === "string") {
		const enumValues = extractStringEnumValues(schema);
		if (enumValues) {
			const normalized = normalizeEnumCase(value, enumValues);
			if (normalized) {
				appendRepair(repairs, {
					code: "normalized_enum_case",
					path: normalizePath(path),
					message: `Normalized enum casing at ${normalizePath(path)} from ${JSON.stringify(value)} to ${JSON.stringify(normalized)}.`,
				});
				return normalized;
			}
		}
		return value;
	}

	if (isObjectLike(value) && schema.type === "object" && isObjectLike(schema.properties)) {
		const repairedEntries = Object.entries(value).map(([key, childValue]) => {
			const childSchema = schema.properties?.[key] as JsonSchemaLike | undefined;
			return [key, repairValueAgainstSchema(childValue, childSchema, `${path}/${key}`, repairs)];
		});
		return Object.fromEntries(repairedEntries);
	}

	return value;
}

function attachRepairs<T>(value: T, repairs: ToolArgumentRepair[]): T {
	if (repairs.length === 0 || value === null || value === undefined) {
		return value;
	}
	if (typeof value !== "object") {
		return value;
	}
	Object.defineProperty(value, TOOL_ARGUMENT_REPAIR_SYMBOL, {
		value: repairs,
		enumerable: false,
		configurable: true,
	});
	return value;
}

// Detect if we're in a browser extension environment with strict CSP
// Chrome extensions with Manifest V3 don't allow eval/Function constructor
const isBrowserExtension = typeof globalThis !== "undefined" && (globalThis as any).chrome?.runtime?.id !== undefined;

function canUseRuntimeCodegen(): boolean {
	if (isBrowserExtension) {
		return false;
	}

	try {
		new Function("return true;");
		return true;
	} catch {
		return false;
	}
}

// Create a singleton AJV instance with formats only when runtime code generation is available.
let ajv: any = null;
if (canUseRuntimeCodegen()) {
	try {
		ajv = new Ajv({
			allErrors: true,
			strict: false,
			coerceTypes: true,
		});
		addFormats(ajv);
	} catch (_e) {
		console.warn("AJV validation disabled due to CSP restrictions");
	}
}

/**
 * Finds a tool by name and validates the tool call arguments against its TypeBox schema
 * @param tools Array of tool definitions
 * @param toolCall The tool call from the LLM
 * @returns The validated arguments
 * @throws Error if tool is not found or validation fails
 */
export function validateToolCall(tools: Tool[], toolCall: ToolCall): any {
	const tool = tools.find((t) => t.name === toolCall.name);
	if (!tool) {
		throw new Error(`Tool "${toolCall.name}" not found`);
	}
	return validateToolArguments(tool, toolCall);
}

/**
 * Validates tool call arguments against the tool's TypeBox schema
 * @param tool The tool definition with TypeBox schema
 * @param toolCall The tool call from the LLM
 * @returns The validated (and potentially coerced) arguments
 * @throws Error with formatted message if validation fails
 */
export function validateToolArguments(tool: Tool, toolCall: ToolCall): any {
	const repairs: ToolArgumentRepair[] = [];
	const parsedArguments = maybeParseArguments(toolCall.arguments, repairs);
	const repairedInput = repairValueAgainstSchema(parsedArguments, tool.parameters as JsonSchemaLike | undefined, "", repairs);

	// Skip validation in environments where runtime code generation is unavailable.
	if (!ajv || !canUseRuntimeCodegen()) {
		return attachRepairs(repairedInput, repairs);
	}

	// Compile the schema.
	const validate = ajv.compile(tool.parameters);

	// Clone arguments so AJV can safely mutate for type coercion
	const args = structuredClone(repairedInput);

	// Validate the arguments (AJV mutates args in-place for type coercion)
	if (validate(args)) {
		return attachRepairs(args, repairs);
	}

	// Format validation errors nicely
	const errors =
		validate.errors
			?.map((err: any) => {
				const path = err.instancePath ? err.instancePath.substring(1) : err.params.missingProperty || "root";
				return `  - ${path}: ${err.message}`;
			})
			.join("\n") || "Unknown validation error";

	const repairsText =
		repairs.length > 0
			? `\n\nRepairs attempted before validation:\n${repairs.map((repair) => `  - ${repair.message}`).join("\n")}`
			: "";
	const errorMessage = `Validation failed for tool "${toolCall.name}":\n${errors}${repairsText}\n\nReceived arguments:\n${JSON.stringify(toolCall.arguments, null, 2)}`;

	throw new Error(errorMessage);
}
