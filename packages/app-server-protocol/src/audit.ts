import type { SessionId } from "./ids";

export type AuditEntryKind =
	| "transcript"
	| "tool"
	| "approval"
	| "file-edit"
	| "diff"
	| "terminal"
	| "git"
	| "pr"
	| "diagnostic"
	| "extension"
	| "automation";
export type AutomationRuleKind = "background-agent" | "post-run-review" | "test-status" | "cleanup";

export interface AuditEntry {
	readonly id: string;
	readonly ts: string;
	readonly kind: AuditEntryKind;
	readonly title: string;
	readonly summary: string;
	readonly sessionId?: SessionId;
	readonly actor?: string;
	readonly target?: string;
	readonly destructive?: boolean;
	readonly metadata?: Record<string, unknown>;
}
export interface AuditTrailProjection {
	readonly entries: readonly AuditEntry[];
	readonly updatedAt?: string;
}
export interface AutomationRule {
	readonly id: string;
	readonly kind: AutomationRuleKind;
	readonly title: string;
	readonly description: string;
	readonly enabled: boolean;
	readonly requiresConfirmation: boolean;
	readonly destructive?: boolean;
}
export interface AutomationProjection {
	readonly rules: readonly AutomationRule[];
	readonly suggestions: readonly AuditEntry[];
	readonly updatedAt?: string;
}
export interface AuditQuery {
	readonly sessionId?: SessionId;
	readonly kinds?: readonly AuditEntryKind[];
	readonly text?: string;
	readonly limit?: number;
}
