import { appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { getAgentDir } from "../config.js";

const TOOL_DEBUG_ENV = "DAEDALUS_DEBUG_TOOLS";
const TOOL_DEBUG_FILE_ENV = "DAEDALUS_DEBUG_TOOLS_FILE";
const DEFAULT_TOOL_DEBUG_LOG_FILE = "tool-debug.log";

let didWarnAboutToolDebugFileWriteFailure = false;

function isTruthyEnvFlag(value: string | undefined): boolean {
	if (!value) return false;
	return value === "1" || value.toLowerCase() === "true" || value.toLowerCase() === "yes";
}

function formatToolList(toolNames: readonly string[] | undefined): string {
	if (!toolNames || toolNames.length === 0) {
		return "(none)";
	}
	return toolNames.join(",");
}

function formatDetailValue(value: unknown): string {
	if (Array.isArray(value)) {
		return `[${value.map((entry) => String(entry)).join(",")}]`;
	}
	if (typeof value === "string") {
		return value;
	}
	return JSON.stringify(value);
}

function includesEdit(toolNames: readonly string[] | undefined): boolean {
	return toolNames?.includes("edit") ?? false;
}

export interface ToolDebugLogOptions {
	requested?: readonly string[];
	previous?: readonly string[];
	next?: readonly string[];
	details?: Record<string, unknown>;
}

export function isToolDebugEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
	return isTruthyEnvFlag(env[TOOL_DEBUG_ENV]);
}

export function summarizeToolTransition(previous: readonly string[] = [], next: readonly string[] = []): string {
	const previousSet = new Set(previous);
	const nextSet = new Set(next);
	const added = next.filter((toolName) => !previousSet.has(toolName));
	const removed = previous.filter((toolName) => !nextSet.has(toolName));
	const parts = [`prev=[${formatToolList(previous)}]`, `next=[${formatToolList(next)}]`];

	if (added.length > 0) {
		parts.push(`added=[${formatToolList(added)}]`);
	}
	if (removed.length > 0) {
		parts.push(`removed=[${formatToolList(removed)}]`);
	}
	if (added.length === 0 && removed.length === 0) {
		parts.push("unchanged");
	}

	return parts.join(" ");
}

function expandDebugPath(filePath: string): string {
	if (filePath === "~") return homedir();
	if (filePath.startsWith("~/")) return homedir() + filePath.slice(1);
	return filePath;
}

export function getToolDebugLogPath(env: NodeJS.ProcessEnv = process.env): string {
	const configuredPath = env[TOOL_DEBUG_FILE_ENV];
	if (configuredPath && configuredPath.trim().length > 0) {
		return expandDebugPath(configuredPath.trim());
	}
	return join(getAgentDir(), "logs", DEFAULT_TOOL_DEBUG_LOG_FILE);
}

function writeToolDebugLine(line: string): void {
	const filePath = getToolDebugLogPath();
	try {
		mkdirSync(dirname(filePath), { recursive: true });
		appendFileSync(filePath, `${line}\n`, "utf-8");
	} catch (error) {
		if (didWarnAboutToolDebugFileWriteFailure) {
			return;
		}
		didWarnAboutToolDebugFileWriteFailure = true;
		const message = error instanceof Error ? error.message : String(error);
		console.error(`[tool-debug] failed to write ${filePath}: ${message}`);
	}
}

export function logToolDebug(scope: string, message: string, options: ToolDebugLogOptions = {}): void {
	if (!isToolDebugEnabled()) {
		return;
	}

	const prefix =
		includesEdit(options.requested) || includesEdit(options.previous) || includesEdit(options.next)
			? "[tool-debug:edit]"
			: "[tool-debug]";
	const detailParts = Object.entries(options.details ?? {})
		.filter(([, value]) => value !== undefined)
		.map(([key, value]) => `${key}=${formatDetailValue(value)}`);
	const detailSuffix = detailParts.length > 0 ? ` | ${detailParts.join(" | ")}` : "";
	const line = `${prefix} ${scope} | ${message}${detailSuffix}`;

	console.error(line);
	writeToolDebugLine(line);
}
