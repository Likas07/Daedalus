import type { ProjectId, SessionId, TerminalId, WorktreeId } from "@daedalus-pi/app-server-protocol";

export type TerminalStatus = "running" | "exited" | "killed" | "error";

export interface TerminalDimensions {
	readonly cols: number;
	readonly rows: number;
}

export interface TerminalOutputChunk {
	readonly seq: number;
	readonly data: string;
}

export interface TerminalSessionRecord {
	readonly terminalId: TerminalId;
	readonly projectId?: ProjectId;
	readonly worktreeId?: WorktreeId;
	readonly sessionId?: SessionId;
	readonly owner?: string;
	readonly cwd: string;
	readonly shell: string;
	readonly status: TerminalStatus;
	readonly dimensions: TerminalDimensions;
	readonly pid?: number;
	readonly exitCode?: number | null;
	readonly exitSignal?: string | null;
	readonly history: string;
	readonly createdAt: string;
	readonly updatedAt: string;
	readonly attached: boolean;
	readonly cursor: {
		readonly nextSeq: number;
		readonly replayCursor: number;
	};
	readonly elapsedMs: number;
}

export interface TerminalCreateParams {
	readonly projectId?: ProjectId;
	readonly worktreeId?: WorktreeId;
	readonly sessionId?: SessionId;
	readonly owner?: string;
	readonly cwd: string;
	readonly shell?: string;
	readonly cols?: number;
	readonly rows?: number;
}

export interface TerminalReplayParams {
	readonly terminalId: TerminalId;
	readonly afterSeq?: number;
}

export interface TerminalReplayResult {
	readonly chunks: readonly TerminalOutputChunk[];
	readonly nextSeq: number;
	readonly status: TerminalStatus;
	readonly replayCursor: number;
}
