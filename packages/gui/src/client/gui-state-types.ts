import type { AppEvent, WorkflowChangedFile, WorkflowRiskGroup } from "@daedalus-pi/app-server-protocol";

export type AccessMode = "supervised" | "auto-accept" | "unrestricted";

export interface RendererProject {
	readonly id: string;
	readonly path: string;
	readonly name?: string;
}

export type ReasoningLevel = "minimal" | "low" | "medium" | "high" | "xhigh";

export interface RendererModel {
	readonly id: string;
	readonly label?: string;
	readonly provider?: string;
	readonly available?: boolean;
	readonly contextWindow?: number;
	readonly maxTokens?: number;
	readonly reasoning?: boolean;
	readonly reasoningLevels?: readonly ReasoningLevel[];
	readonly supportsFastMode?: boolean;
	readonly capabilities?: readonly string[];
	readonly diagnostics?: readonly string[];
}

export interface RendererAuthStatus {
	readonly provider: string;
	readonly label?: string;
	readonly enabled?: boolean;
	readonly authenticated: boolean;
	status: "ready" | "missing-auth" | "env-key" | "oauth" | "unavailable" | "error" | "unknown";
	readonly authMethod?: "oauth" | "api-key" | "env" | "config";
	readonly actionable?: boolean;
	readonly canLogin?: boolean;
	readonly canLogout?: boolean;
	readonly canRelogin?: boolean;
	readonly instruction?: string;
	readonly message?: string;
	readonly source?: string;
	readonly version?: string;
	readonly modelCount?: number;
	readonly models?: readonly RendererModel[];
	readonly capabilities?: readonly string[];
	readonly diagnostics?: readonly string[];
	readonly updatedAt?: string;
}

export interface RendererAccessPolicy {
	readonly mode: AccessMode;
	readonly autoApproveSoftPrompts: boolean;
	readonly bypassHardBlocks: false;
	readonly auditRequired: true;
}

export interface RendererTerminal {
	readonly terminalId: string;
	readonly cwd: string;
	readonly cols: number;
	readonly rows: number;
	status: "starting" | "running" | "exited" | "killed" | "error";
	history: string;
	cursor?: number;
	projectId?: string;
	worktreeId?: string;
	sessionId?: string;
	updatedAt?: string;
}

export interface ComposerDraftAttachment {
	readonly id: string;
	readonly kind: "image" | "text" | "file";
	readonly filename: string;
	readonly size: number;
	readonly loading?: boolean;
}

export interface ComposerFileMention {
	readonly path: string;
	readonly label: string;
	readonly kind: "file" | "directory";
	readonly extension?: string;
}

export interface ComposerSlashCommand {
	readonly name: string;
	readonly label: string;
	readonly description?: string;
	readonly source: string;
	readonly disabled?: boolean;
	readonly disabledReason?: string;
	readonly sourcePath?: string;
}

export interface RendererDiffSummary {
	readonly branch: string | null;
	readonly upstream: string | null;
	readonly ahead: number;
	readonly behind: number;
	readonly stagedCount: number;
	readonly unstagedCount: number;
	readonly files: readonly WorkflowChangedFile[];
	readonly patch?: string;
	readonly riskyGroups: readonly WorkflowRiskGroup[];
}

export interface RendererDiagnostic {
	readonly label: string;
	readonly message: string;
	readonly error?: unknown;
}

export interface RendererDiffStatus {
	readonly files: number;
	readonly insertions: number;
	readonly deletions: number;
	readonly clean: boolean;
}

export interface HydrationSnapshot {
	readonly projects?: readonly RendererProject[];
	readonly events?: readonly AppEvent[];
}
