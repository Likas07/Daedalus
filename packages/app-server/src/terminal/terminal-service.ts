import { randomUUID } from "node:crypto";
import type { ProjectId, ServerNotification, TerminalId, WorktreeId } from "@daedalus-pi/app-server-protocol";
import type { AppServerDatabase } from "../persistence/database";
import { appendEvent } from "../persistence/event-store";
import type { PtyAdapter, PtyProcessHandle } from "./pty-adapter";
import { createNodePtyAdapter } from "./pty-adapter";
import type {
	TerminalCreateParams,
	TerminalDimensions,
	TerminalOutputChunk,
	TerminalReplayResult,
	TerminalSessionRecord,
	TerminalStatus,
} from "./terminal-protocol";
import { TerminalSafetyService } from "./terminal-safety";

export interface TerminalServiceOptions {
	readonly publish?: (
		message: Extract<ServerNotification, { method: "terminal/output" | "terminal/closed" | "terminal/event" }>,
	) => void;
	readonly maxScrollbackChunks?: number;
	readonly maxHistoryBytes?: number;
	readonly maxHistoryLines?: number;
	readonly pty?: PtyAdapter;
	readonly database?: AppServerDatabase;
	readonly maxInputBytes?: number;
}

interface TerminalSessionState {
	record: Omit<TerminalSessionRecord, "attached" | "cursor" | "elapsedMs" | "history">;
	process?: PtyProcessHandle;
	attached: boolean;
	nextSeq: number;
	buffer: TerminalOutputChunk[];
	history: string;
	unsubscribeData?: () => void;
	unsubscribeExit?: () => void;
}

export class TerminalService {
	private readonly sessions = new Map<TerminalId, TerminalSessionState>();
	private readonly maxScrollbackChunks: number;
	private readonly maxHistoryBytes: number;
	private readonly maxHistoryLines: number;
	private readonly publish?: TerminalServiceOptions["publish"];
	private readonly pty?: PtyAdapter;
	private readonly database?: AppServerDatabase;
	private readonly safety: TerminalSafetyService;

	constructor(options: TerminalServiceOptions = {}) {
		this.maxScrollbackChunks = options.maxScrollbackChunks ?? 1000;
		this.maxHistoryBytes = options.maxHistoryBytes ?? 256 * 1024;
		this.maxHistoryLines = options.maxHistoryLines ?? 5000;
		this.publish = options.publish;
		this.pty = options.pty;
		this.database = options.database;
		this.safety = new TerminalSafetyService({ maxInputBytes: options.maxInputBytes });
		this.loadPersistedSessions();
	}

	async create(params: TerminalCreateParams): Promise<TerminalSessionRecord> {
		const terminalId = `term_${randomUUID()}`;
		const now = new Date().toISOString();
		const dimensions = { cols: params.cols ?? 80, rows: params.rows ?? 24 };
		const safety = await this.safety.validateCreate(params);
		if (safety.rejectedReason) throw new Error(`Terminal create rejected: ${safety.rejectedReason}`);
		const shell = safety.shell;
		const state: TerminalSessionState = {
			record: {
				terminalId,
				projectId: params.projectId,
				worktreeId: params.worktreeId,
				sessionId: params.sessionId,
				owner: params.owner,
				cwd: safety.cwd,
				shell,
				status: "running",
				dimensions,
				createdAt: now,
				updatedAt: now,
				guardStatus: safety.guardStatus,
				guardTarget: safety.guardTarget,
				boundaryViolation: safety.boundaryViolation,
			},
			attached: true,
			nextSeq: 1,
			buffer: [],
			history: "",
		};
		this.sessions.set(terminalId, state);
		const processHandle = (this.pty ?? (await createNodePtyAdapter())).spawn({
			cwd: safety.cwd,
			shell,
			cols: dimensions.cols,
			rows: dimensions.rows,
			env: { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor" },
		});
		state.process = processHandle;
		state.record = { ...state.record, pid: processHandle.pid };
		state.unsubscribeData = processHandle.onData((data) => this.recordOutput(terminalId, data));
		state.unsubscribeExit = processHandle.onExit((event) =>
			this.markClosed(terminalId, state.record.status === "killed" ? "killed" : "exited", event),
		);
		this.persist(state);
		this.appendLifecycleEvent("terminal/started", state);
		return this.snapshot(state);
	}

	list(filter: { projectId?: ProjectId; worktreeId?: WorktreeId } = {}): TerminalSessionRecord[] {
		return [...this.sessions.values()]
			.filter(
				(state) =>
					(!filter.projectId || state.record.projectId === filter.projectId) &&
					(!filter.worktreeId || state.record.worktreeId === filter.worktreeId),
			)
			.map((state) => this.snapshot(state));
	}

	get(terminalId: TerminalId): TerminalSessionRecord {
		return this.snapshot(this.mustGet(terminalId));
	}

	attach(terminalId: TerminalId): TerminalSessionRecord {
		const state = this.mustGet(terminalId);
		state.attached = true;
		state.record = { ...state.record, updatedAt: new Date().toISOString() };
		return this.snapshot(state);
	}

	detach(terminalId: TerminalId): TerminalSessionRecord {
		const state = this.mustGet(terminalId);
		state.attached = false;
		state.record = { ...state.record, updatedAt: new Date().toISOString() };
		return this.snapshot(state);
	}

	input(terminalId: TerminalId, data: string): void {
		const state = this.mustGet(terminalId);
		if (state.record.status !== "running" || !state.process) {
			state.record = {
				...state.record,
				rejectedReason: `terminal-not-writable:${state.record.status}`,
				updatedAt: new Date().toISOString(),
			};
			throw new Error(`Terminal ${terminalId} is not writable: ${state.record.status}`);
		}
		const validation = this.safety.validateInput(data);
		if (!validation.ok) {
			state.record = {
				...state.record,
				rejectedReason: validation.rejectedReason,
				updatedAt: new Date().toISOString(),
			};
			throw new Error(`Terminal input rejected: ${validation.rejectedReason}`);
		}
		state.process.write(data);
	}

	resize(terminalId: TerminalId, dimensions: TerminalDimensions): TerminalSessionRecord {
		const state = this.mustGet(terminalId);
		state.record = { ...state.record, dimensions, updatedAt: new Date().toISOString() };
		state.process?.resize(dimensions.cols, dimensions.rows);
		this.persist(state);
		return this.snapshot(state);
	}

	kill(terminalId: TerminalId): TerminalSessionRecord {
		const state = this.mustGet(terminalId);
		if (state.record.status === "running") {
			state.record = { ...state.record, status: "killed", updatedAt: new Date().toISOString() };
			state.process?.kill();
			this.persist(state);
		}
		return this.snapshot(state);
	}

	replay(terminalId: TerminalId, afterSeq = 0): TerminalReplayResult {
		const state = this.mustGet(terminalId);
		return {
			chunks: state.buffer.filter((chunk) => chunk.seq > afterSeq),
			nextSeq: state.nextSeq,
			status: state.record.status,
			replayCursor: afterSeq,
		};
	}

	interrupt(terminalId: TerminalId): TerminalSessionRecord {
		this.input(terminalId, "\u0003");
		return this.snapshot(this.mustGet(terminalId));
	}

	private recordOutput(terminalId: TerminalId, data: string): void {
		const state = this.sessions.get(terminalId);
		if (!state) return;
		const chunk = { seq: state.nextSeq++, data };
		state.buffer.push(chunk);
		state.history = capHistory(state.history + data, this.maxHistoryBytes, this.maxHistoryLines);
		while (state.buffer.length > this.maxScrollbackChunks || bufferBytes(state.buffer) > this.maxHistoryBytes)
			state.buffer.shift();
		state.record = { ...state.record, updatedAt: new Date().toISOString() };
		this.persist(state);
		this.publish?.({
			kind: "notification",
			method: "terminal/event",
			params: { terminalId, event: { type: "output", seq: chunk.seq, data } },
		});
		if (state.attached)
			this.publish?.({
				kind: "notification",
				method: "terminal/output",
				params: { terminalId, seq: chunk.seq, data },
			});
	}

	private markClosed(
		terminalId: TerminalId,
		status: TerminalStatus,
		event: { exitCode: number | null; signal: string | null } = { exitCode: null, signal: null },
	): void {
		const state = this.sessions.get(terminalId);
		if (!state || state.record.status === "exited") return;
		state.unsubscribeData?.();
		state.unsubscribeExit?.();
		state.record = {
			...state.record,
			status,
			exitCode: event.exitCode,
			exitSignal: event.signal,
			updatedAt: new Date().toISOString(),
		};
		this.persist(state);
		this.appendLifecycleEvent("terminal/closed", state);
		this.publish?.({
			kind: "notification",
			method: "terminal/event",
			params: { terminalId, event: { type: "exit", status, ...event } },
		});
		this.publish?.({ kind: "notification", method: "terminal/closed", params: { terminalId, status } });
	}

	private mustGet(terminalId: TerminalId): TerminalSessionState {
		const state = this.sessions.get(terminalId);
		if (!state) throw new Error(`Unknown terminal ${terminalId}`);
		return state;
	}

	private snapshot(state: TerminalSessionState): TerminalSessionRecord {
		return {
			...state.record,
			attached: state.attached,
			cursor: { nextSeq: state.nextSeq, replayCursor: Math.max(0, state.nextSeq - 1) },
			elapsedMs: Date.now() - Date.parse(state.record.createdAt),
			history: state.history,
		};
	}

	private persist(state: TerminalSessionState): void {
		this.database
			?.query(
				`INSERT INTO terminal_sessions (id, project_id, worktree_id, session_id, status, cwd, shell, cols, rows, history, pid, exit_code, exit_signal, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET project_id = excluded.project_id, worktree_id = excluded.worktree_id, session_id = excluded.session_id, status = excluded.status, cwd = excluded.cwd, shell = excluded.shell, cols = excluded.cols, rows = excluded.rows, history = excluded.history, pid = excluded.pid, exit_code = excluded.exit_code, exit_signal = excluded.exit_signal, updated_at = excluded.updated_at`,
			)
			.run(
				state.record.terminalId,
				state.record.projectId ?? null,
				state.record.worktreeId ?? null,
				state.record.sessionId ?? null,
				state.record.status,
				state.record.cwd,
				state.record.shell,
				state.record.dimensions.cols,
				state.record.dimensions.rows,
				state.history,
				state.record.pid ?? null,
				state.record.exitCode ?? null,
				state.record.exitSignal ?? null,
				state.record.createdAt,
				state.record.updatedAt,
			);
	}

	private appendLifecycleEvent(type: "terminal/started" | "terminal/closed", state: TerminalSessionState): void {
		if (!this.database) return;
		appendEvent(this.database, {
			streamId: state.record.terminalId,
			type,
			payload: this.snapshot(state) as unknown as import("../persistence/event-store").EventPayload,
		});
	}

	private loadPersistedSessions(): void {
		if (!this.database) return;
		const rows = this.database
			.query<
				{
					id: string;
					project_id: string | null;
					worktree_id: string | null;
					session_id: string | null;
					status: string;
					cwd: string;
					shell: string;
					cols: number;
					rows: number;
					history: string;
					pid: number | null;
					exit_code: number | null;
					exit_signal: string | null;
					created_at: string;
					updated_at: string;
				},
				[]
			>("SELECT * FROM terminal_sessions ORDER BY created_at ASC")
			.all();
		for (const row of rows) {
			const history = capHistory(row.history ?? "", this.maxHistoryBytes, this.maxHistoryLines);
			const wasRunningWithoutProcess = row.status === "running";
			const status: TerminalStatus = row.status === "killed" ? "killed" : "exited";
			this.sessions.set(row.id, {
				record: {
					terminalId: row.id,
					projectId: row.project_id ?? undefined,
					worktreeId: row.worktree_id ?? undefined,
					sessionId: row.session_id ?? undefined,
					cwd: row.cwd,
					shell: row.shell,
					status,
					dimensions: { cols: row.cols, rows: row.rows },
					pid: row.pid ?? undefined,
					exitCode: row.exit_code ?? undefined,
					exitSignal: row.exit_signal ?? (wasRunningWithoutProcess ? "orphaned-no-live-process" : undefined),
					createdAt: row.created_at,
					updatedAt: row.updated_at,
					guardStatus: "unchecked",
					rejectedReason: wasRunningWithoutProcess ? "persisted-running-terminal-has-no-live-process" : undefined,
				},
				attached: false,
				nextSeq: history ? 2 : 1,
				buffer: history ? [{ seq: 1, data: history }] : [],
				history,
			});
		}
	}
}

function bufferBytes(buffer: readonly TerminalOutputChunk[]): number {
	return buffer.reduce((sum, chunk) => sum + chunk.data.length, 0);
}

function capHistory(history: string, maxBytes: number, maxLines: number): string {
	let capped = history;
	if (capped.length > maxBytes) capped = capped.slice(capped.length - maxBytes);
	const lines = capped.split("\n");
	if (lines.length > maxLines) capped = lines.slice(lines.length - maxLines).join("\n");
	return capped;
}
