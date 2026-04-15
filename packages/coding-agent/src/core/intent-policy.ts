import type { IntentMetadata } from "./intent-gate.js";
import { isAllowedPlanningDirPath, isAllowedPlanningPath, suggestPlanningPath } from "./intent-path-policy.js";

export type IntentToolPolicyMode = "off" | "warn" | "enforce";

export interface IntentGateRuntimeOptions {
	parseVisibleLine?: boolean;
	persistMetadata?: boolean;
	toolPolicyMode?: IntentToolPolicyMode;
}

export interface ResolvedIntentGateRuntimeOptions {
	parseVisibleLine: boolean;
	persistMetadata: boolean;
	toolPolicyMode: IntentToolPolicyMode;
}

export interface IntentToolPolicyDecision {
	allow: boolean;
	reason?: string;
}

export interface PlanningWriteRoutingResult {
	routed: boolean;
	originalPath?: string;
	routedPath?: string;
}

export const DEFAULT_INTENT_GATE_RUNTIME_OPTIONS: ResolvedIntentGateRuntimeOptions = {
	parseVisibleLine: true,
	persistMetadata: true,
	toolPolicyMode: "warn",
};

const EXPLICIT_MUTATION_TOOLS = new Set(["write", "edit", "hashline_edit", "ast_edit"]);
const DOCS_ONLY_TOOLS = new Set(["write", "edit", "hashline_edit"]);
const BASH_READ_ONLY_PATTERNS: RegExp[] = [
	/^\s*pwd\b/i,
	/^\s*ls\b/i,
	/^\s*cat\b/i,
	/^\s*echo\b/i,
	/^\s*printf\b/i,
	/^\s*(find|fd|grep|rg|head|tail|wc|stat|file|tree|which|where|env|printenv)\b/i,
	/^\s*git\s+(status|diff|log|show|branch(?:\s+--show-current)?|rev-parse|ls-files)\b/i,
];
const SHELL_META_PATTERN = /[|;&><`$(){}]/u;

export function resolveIntentGateRuntimeOptions(
	options: IntentGateRuntimeOptions | undefined,
): ResolvedIntentGateRuntimeOptions {
	return {
		parseVisibleLine: options?.parseVisibleLine ?? DEFAULT_INTENT_GATE_RUNTIME_OPTIONS.parseVisibleLine,
		persistMetadata: options?.persistMetadata ?? DEFAULT_INTENT_GATE_RUNTIME_OPTIONS.persistMetadata,
		toolPolicyMode: options?.toolPolicyMode ?? DEFAULT_INTENT_GATE_RUNTIME_OPTIONS.toolPolicyMode,
	};
}

function getPrimaryToolPath(toolName: string, input: Record<string, unknown>): string | undefined {
	if (toolName === "write" || toolName === "edit" || toolName === "hashline_edit") {
		return typeof input.path === "string" ? input.path : undefined;
	}
	if (toolName === "ast_edit") {
		return typeof input.path === "string" ? input.path : undefined;
	}
	return undefined;
}

function isMutationTool(toolName: string): boolean {
	return EXPLICIT_MUTATION_TOOLS.has(toolName) || toolName === "bash";
}

function isClearlyReadOnlyBash(command: string): boolean {
	const normalized = command.trim();
	if (SHELL_META_PATTERN.test(normalized)) {
		return false;
	}
	return BASH_READ_ONLY_PATTERNS.some((pattern) => pattern.test(normalized));
}

function isAllowedPlanningMkdirCommand(command: string, cwd: string): boolean {
	const normalized = command.trim();
	if (SHELL_META_PATTERN.test(normalized)) {
		return false;
	}
	const tokens = normalized.split(/\s+/u).filter(Boolean);
	if (tokens.length < 2 || tokens[0] !== "mkdir") {
		return false;
	}
	const dirArgs = tokens.slice(1).filter((token) => !token.startsWith("-"));
	if (dirArgs.length === 0) {
		return false;
	}
	return dirArgs.every((dirPath) => isAllowedPlanningDirPath(dirPath, cwd));
}

export function routePlanningWritePathIfNeeded(options: {
	toolName: string;
	input: Record<string, unknown>;
	intent: IntentMetadata | undefined;
	cwd: string;
}): PlanningWriteRoutingResult {
	const { toolName, input, intent, cwd } = options;
	if (toolName !== "write" || intent?.mutationScope !== "docs-only") {
		return { routed: false };
	}
	const targetPath = typeof input.path === "string" ? input.path : undefined;
	if (targetPath && isAllowedPlanningPath(targetPath, cwd)) {
		return { routed: false };
	}
	const routedPath = suggestPlanningPath(targetPath, cwd, intent.planningArtifactKind);
	input.path = routedPath;
	return {
		routed: true,
		originalPath: targetPath,
		routedPath,
	};
}

export function evaluateToolCallAgainstIntent(options: {
	toolName: string;
	input: Record<string, unknown>;
	intent: IntentMetadata | undefined;
	cwd: string;
	mode: IntentToolPolicyMode;
}): IntentToolPolicyDecision {
	const { toolName, input, intent, cwd, mode } = options;
	if (mode === "off" || !isMutationTool(toolName)) {
		return { allow: true };
	}

	if (!intent?.valid) {
		if (mode === "warn") {
			return { allow: true };
		}
		return {
			allow: false,
			reason: "Intent Gate blocked mutation because no valid visible Intent line was parsed for this turn.",
		};
	}

	if (toolName === "bash") {
		const command = typeof input.command === "string" ? input.command : "";
		if (intent.mutationScope === "code-allowed") {
			return { allow: true };
		}
		if (isClearlyReadOnlyBash(command)) {
			return { allow: true };
		}
		if (intent.mutationScope === "docs-only" && isAllowedPlanningMkdirCommand(command, cwd)) {
			return { allow: true };
		}
		return {
			allow: false,
			reason:
				intent.mutationScope === "docs-only"
					? "Intent Gate blocked bash because planning intent only allows read-only shell commands or mkdir for docs/, plans/, specs/, or design/."
					: `Intent Gate blocked bash because current turn is ${intent.trueIntent}${intent.readOnly ? " with an explicit read-only override" : ""}.`,
		};
	}

	if (intent.mutationScope === "none") {
		return {
			allow: false,
			reason: `Intent Gate blocked ${toolName} because current turn is ${intent.trueIntent}${intent.readOnly ? " with an explicit read-only override" : ""}.`,
		};
	}

	if (intent.mutationScope === "docs-only") {
		if (!DOCS_ONLY_TOOLS.has(toolName)) {
			return {
				allow: false,
				reason: `Intent Gate blocked ${toolName} because planning intent only allows markdown planning artifacts in docs/, plans/, specs/, or design/.`,
			};
		}
		const targetPath = getPrimaryToolPath(toolName, input);
		if (!targetPath) {
			if (mode === "warn") {
				return { allow: true };
			}
			return {
				allow: false,
				reason: `Intent Gate blocked ${toolName} because planning intent requires an explicit markdown path in docs/, plans/, specs/, or design/.`,
			};
		}
		if (!isAllowedPlanningPath(targetPath, cwd)) {
			const suggested = suggestPlanningPath(targetPath, cwd, intent.planningArtifactKind);
			return {
				allow: false,
				reason: `Intent Gate blocked ${toolName} because planning intent only allows .md files in docs/, plans/, specs/, or design/. Suggested path: ${suggested}`,
			};
		}
	}

	return { allow: true };
}
