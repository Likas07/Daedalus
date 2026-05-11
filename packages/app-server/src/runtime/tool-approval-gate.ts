export interface ToolGateResult {
	readonly block?: boolean;
	readonly reason?: string;
}

import type { AccessPolicyService } from "./access-policy-service";
import type { ApprovalService } from "./approval-service";

export type ToolRisk = "safe" | "soft" | "hard";

export interface ToolApprovalGateOptions {
	readonly sessionId: string;
	readonly approvalService: ApprovalService;
	readonly accessPolicy: AccessPolicyService;
	readonly timeoutMs?: number;
	readonly workspaceTargetId?: string;
	readonly getTurnId?: () => string | undefined;
	readonly getWorkspaceTargetId?: () => string | undefined;
}

export interface ToolApprovalInput {
	readonly toolName: string;
	readonly toolCallId: string;
	readonly args: unknown;
	readonly turnId?: string;
	readonly workspaceTargetId?: string;
	readonly signal?: AbortSignal;
}

export class ToolApprovalDeniedError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ToolApprovalDeniedError";
	}
}

export class ToolApprovalGate {
	private disposed = false;
	private readonly pending = new Set<string>();
	private runtimeContext: {
		readonly getTurnId?: () => string | undefined;
		readonly workspaceTargetId?: string;
	} = {};

	constructor(private readonly options: ToolApprovalGateOptions) {}

	setContext(context: { readonly getTurnId?: () => string | undefined; readonly workspaceTargetId?: string }): void {
		this.runtimeContext = context;
	}

	async beforeToolCall(input: ToolApprovalInput): Promise<ToolGateResult | undefined> {
		const risk = classifyToolRisk(input.toolName, input.args);
		if (risk === "safe") return undefined;
		if (risk === "hard") {
			return {
				block: true,
				reason: `Blocked by access policy: ${input.toolName} is not allowed from the GUI.`,
			};
		}
		if (this.disposed)
			return {
				block: true,
				reason: "Session was disposed before tool approval.",
			};
		const approvalId = `tool-${input.toolCallId}`;
		this.pending.add(approvalId);
		try {
			const requested = this.options.approvalService.request({
				id: approvalId,
				sessionId: this.options.sessionId,
				request: {
					type: "tool",
					toolName: input.toolName,
					toolCallId: input.toolCallId,
					args: input.args,
					summary: summarizeTool(input.toolName, input.args),
					risk: "medium",
					scope: input.toolName,
					kind: "command",
					turnId:
						input.turnId ?? this.options.getTurnId?.() ?? this.runtimeContext.getTurnId?.() ?? "turn:unknown",
					workspaceTargetId:
						input.workspaceTargetId ??
						this.options.getWorkspaceTargetId?.() ??
						this.options.workspaceTargetId ??
						this.runtimeContext.workspaceTargetId ??
						`base:${this.options.sessionId}`,
				},
			});
			if (requested.autoApproved) return undefined;
			const decision = await this.options.approvalService.waitForDecision(approvalId, {
				timeoutMs: this.options.timeoutMs,
				signal: input.signal,
			});
			if (decision.decision === "approved") return undefined;
			return {
				block: true,
				reason: decision.reason || decision.message || `Tool ${input.toolName} was denied by the user.`,
			};
		} finally {
			this.pending.delete(approvalId);
		}
	}

	dispose(reason = "Session disposed before approval was resolved."): void {
		this.disposed = true;
		for (const approvalId of this.pending) this.options.approvalService.cancel(approvalId, reason);
		this.pending.clear();
	}
}

export function classifyToolRisk(toolName: string, args?: unknown): ToolRisk {
	const name = toolName.toLowerCase();
	if (name.includes("extension") || name.startsWith("mcp") || name.startsWith("plugin")) return "soft";
	if (["read", "grep", "find", "ls", "ast_grep", "search", "view", "cat"].includes(name)) return "safe";
	if (name.includes("read") && !name.includes("write")) return "safe";
	if (name.includes("fetch") || name.includes("web") || name.includes("http")) return "soft";
	if (name.includes("bash") || name.includes("shell") || name.includes("exec") || name.includes("terminal")) {
		return isDangerousShell(args) ? "hard" : "soft";
	}
	if (name.includes("git")) return isGitMutation(args) ? "soft" : "safe";
	if (
		name.includes("write") ||
		name.includes("edit") ||
		name.includes("delete") ||
		name.includes("move") ||
		name.includes("patch")
	)
		return "soft";
	return "safe";
}

function isGitMutation(args: unknown): boolean {
	const text = JSON.stringify(args ?? {}).toLowerCase();
	return /\b(commit|push|reset|rebase|merge|checkout|switch|clean|am|apply)\b/.test(text);
}

function isDangerousShell(args: unknown): boolean {
	const text = JSON.stringify(args ?? {}).toLowerCase();
	return /\b(sudo|su\b|chmod\s+777|rm\s+-rf\s+\/)\b/.test(text);
}

function summarizeTool(toolName: string, args: unknown): string {
	const raw = JSON.stringify(args ?? {});
	return `${toolName} ${raw.length > 180 ? `${raw.slice(0, 177)}...` : raw}`;
}
