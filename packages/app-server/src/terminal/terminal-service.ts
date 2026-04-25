import { randomUUID } from "node:crypto";
import type { ProjectId, ServerNotification, TerminalId, WorktreeId } from "@daedalus-pi/app-server-protocol";
import type {
	TerminalCreateParams,
	TerminalDimensions,
	TerminalOutputChunk,
	TerminalReplayResult,
	TerminalSessionRecord,
	TerminalStatus,
} from "./terminal-protocol";

export interface TerminalServiceOptions {
	readonly publish?: (
		message:
			| Extract<ServerNotification, { method: "terminal/output" }>
			| Extract<ServerNotification, { method: "terminal/closed" }>,
	) => void;
	readonly maxScrollbackChunks?: number;
	readonly spawn?: TerminalSpawner;
}

export interface TerminalProcess {
	readonly stdin?: { write(data: string): void };
	readonly exited: Promise<unknown>;
	kill(signal?: string): void;
	resize?(dimensions: TerminalDimensions): void;
}

export type TerminalSpawner = (input: {
	cwd: string;
	shell: string;
	dimensions: TerminalDimensions;
	onOutput(data: string): void;
}) => TerminalProcess;

interface TerminalSessionState {
	record: Omit<TerminalSessionRecord, "attached" | "nextSeq" | "replayCursor" | "elapsedMs">;
	process: TerminalProcess;
	attached: boolean;
	nextSeq: number;
	buffer: TerminalOutputChunk[];
}

export class TerminalService {
	private readonly sessions = new Map<TerminalId, TerminalSessionState>();
	private readonly maxScrollbackChunks: number;
	private readonly publish?: TerminalServiceOptions["publish"];
	private readonly spawn: TerminalSpawner;

	constructor(options: TerminalServiceOptions = {}) {
		this.maxScrollbackChunks = options.maxScrollbackChunks ?? 1000;
		this.publish = options.publish;
		this.spawn = options.spawn ?? spawnBunShell;
	}

	create(params: TerminalCreateParams): TerminalSessionRecord {
		const id = `term_${randomUUID()}`;
		const now = new Date().toISOString();
		const dimensions = { cols: params.cols ?? 80, rows: params.rows ?? 24 };
		const shell = params.shell ?? process.env.SHELL ?? "/bin/sh";
		const processHandle = this.spawn({
			cwd: params.cwd,
			shell,
			dimensions,
			onOutput: (data) => this.recordOutput(id, data),
		});
		const state: TerminalSessionState = {
			record: {
				id,
				projectId: params.projectId,
				worktreeId: params.worktreeId,
				sessionId: params.sessionId,
				owner: params.owner,
				cwd: params.cwd,
				shell,
				status: "running",
				dimensions,
				createdAt: now,
				updatedAt: now,
			},
			process: processHandle,
			attached: true,
			nextSeq: 1,
			buffer: [],
		};
		this.sessions.set(id, state);
		void processHandle.exited.then(() => this.markClosed(id, state.record.status === "killed" ? "killed" : "exited"));
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
		if (state.record.status !== "running") throw new Error(`Terminal ${terminalId} is not running`);
		state.process.stdin?.write(data);
	}

	resize(terminalId: TerminalId, dimensions: TerminalDimensions): TerminalSessionRecord {
		const state = this.mustGet(terminalId);
		state.record = { ...state.record, dimensions, updatedAt: new Date().toISOString() };
		state.process.resize?.(dimensions);
		return this.snapshot(state);
	}

	kill(terminalId: TerminalId): TerminalSessionRecord {
		const state = this.mustGet(terminalId);
		if (state.record.status === "running") {
			state.record = { ...state.record, status: "killed", updatedAt: new Date().toISOString() };
			state.process.kill();
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

	private recordOutput(terminalId: TerminalId, data: string): void {
		const state = this.sessions.get(terminalId);
		if (!state) return;
		const chunk = { seq: state.nextSeq++, data };
		state.buffer.push(chunk);
		while (state.buffer.length > this.maxScrollbackChunks) state.buffer.shift();
		if (state.attached)
			this.publish?.({
				kind: "notification",
				method: "terminal/output",
				params: { terminalId, seq: chunk.seq, data },
			});
	}

	interrupt(terminalId: TerminalId): TerminalSessionRecord {
		this.input(terminalId, "\u0003");
		return this.snapshot(this.mustGet(terminalId));
	}

	private markClosed(terminalId: TerminalId, status: TerminalStatus): void {
		const state = this.sessions.get(terminalId);
		if (!state || state.record.status !== "running") return;
		state.record = { ...state.record, status, updatedAt: new Date().toISOString() };
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
			nextSeq: state.nextSeq,
			replayCursor: Math.max(0, state.nextSeq - 1),
			elapsedMs: Date.now() - Date.parse(state.record.createdAt),
		};
	}
}

function spawnBunShell(input: {
	cwd: string;
	shell: string;
	dimensions: TerminalDimensions;
	onOutput(data: string): void;
}): TerminalProcess {
	const proc = Bun.spawn([input.shell], {
		cwd: input.cwd,
		stdin: "pipe",
		stdout: "pipe",
		stderr: "pipe",
		env: { ...process.env, COLUMNS: String(input.dimensions.cols), LINES: String(input.dimensions.rows) },
	});
	void streamText(proc.stdout, input.onOutput);
	void streamText(proc.stderr, input.onOutput);
	return {
		stdin: { write: (data) => proc.stdin.write(data) },
		exited: proc.exited,
		kill: (signal) => proc.kill(signal as NodeJS.Signals | undefined),
	};
}

async function streamText(stream: ReadableStream<Uint8Array>, onOutput: (data: string) => void): Promise<void> {
	const decoder = new TextDecoder();
	for await (const chunk of stream) onOutput(decoder.decode(chunk, { stream: true }));
}
