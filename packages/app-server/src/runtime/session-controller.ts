import type { AppEvent, ServerNotification, ServerRequest, SessionId, TurnId } from "@daedalus-pi/app-server-protocol";
export type RuntimeSessionManager = unknown;

import { mapRuntimeEvent } from "./event-mapper";

export type RuntimeControllerMessage = AppEvent | ServerNotification | ServerRequest;
export type RuntimeEventSink = (message: RuntimeControllerMessage) => void | Promise<void>;

export interface ControlledSessionRuntime {
	readonly cwd: string;
	readonly session: {
		readonly sessionFile?: string;
		subscribe(listener: (event: unknown) => void): () => void;
		prompt(prompt: string): Promise<void>;
		abort(): Promise<void>;
	};
	dispose(): Promise<void>;
}

export interface RuntimeFactoryInput {
	readonly cwd: string;
	readonly agentDir: string;
	readonly sessionManager: RuntimeSessionManager;
	readonly applyProcessCwd?: boolean;
}

export type RuntimeFactory = (input: RuntimeFactoryInput) => Promise<ControlledSessionRuntime>;

export interface SessionControllerOptions {
	readonly runtimeFactory: RuntimeFactory;
	readonly eventSink: RuntimeEventSink;
	readonly makeSessionManager: (input: { cwd: string; sessionPath?: string }) => RuntimeSessionManager;
	readonly agentDir: string;
	readonly nextSessionId?: () => SessionId;
	readonly nextTurnId?: () => TurnId;
	readonly nextEventId?: () => string;
	readonly now?: () => Date;
}

export interface StartSessionInput {
	readonly cwd: string;
	readonly prompt?: string;
	readonly sessionId?: SessionId;
}

export interface ResumeSessionInput {
	readonly cwd: string;
	readonly sessionPath: string;
	readonly sessionId?: SessionId;
}

export interface StartTurnInput {
	readonly sessionId: SessionId;
	readonly prompt: string;
	readonly turnId?: TurnId;
}

export interface InterruptTurnInput {
	readonly sessionId: SessionId;
	readonly turnId?: TurnId;
}

export interface SessionControllerState {
	readonly sessions: ReadonlyArray<{
		readonly sessionId: SessionId;
		readonly cwd: string;
		readonly sessionFile?: string;
	}>;
}

interface SessionRecord {
	readonly id: SessionId;
	readonly runtime: ControlledSessionRuntime;
	unsubscribe: () => void;
	activeTurnId?: TurnId;
}

export class SessionController {
	private readonly sessions = new Map<SessionId, SessionRecord>();

	constructor(private readonly options: SessionControllerOptions) {}

	async startSession(input: StartSessionInput): Promise<{ sessionId: SessionId }> {
		const sessionId = input.sessionId ?? this.nextSessionId();
		const runtime = await this.options.runtimeFactory({
			cwd: input.cwd,
			agentDir: this.options.agentDir,
			sessionManager: this.options.makeSessionManager({ cwd: input.cwd }),
			applyProcessCwd: false,
		});
		this.register(sessionId, runtime);
		await this.emit({
			id: this.nextEventId(),
			type: "session/started",
			ts: this.nowIso(),
			sessionId,
			payload: { sessionId, cwd: runtime.cwd, sessionFile: runtime.session.sessionFile },
		});
		await this.emit({ kind: "notification", method: "session/changed", params: { sessionId, status: "active" } });
		if (input.prompt) {
			await this.startTurn({ sessionId, prompt: input.prompt });
		}
		return { sessionId };
	}

	async resumeSession(input: ResumeSessionInput): Promise<{ sessionId: SessionId }> {
		const sessionId = input.sessionId ?? this.nextSessionId();
		const runtime = await this.options.runtimeFactory({
			cwd: input.cwd,
			agentDir: this.options.agentDir,
			sessionManager: this.options.makeSessionManager({ cwd: input.cwd, sessionPath: input.sessionPath }),
			applyProcessCwd: false,
		});
		this.register(sessionId, runtime);
		await this.emit({
			id: this.nextEventId(),
			type: "session/resumed",
			ts: this.nowIso(),
			sessionId,
			payload: { sessionId, cwd: runtime.cwd, sessionFile: runtime.session.sessionFile },
		});
		await this.emit({ kind: "notification", method: "session/changed", params: { sessionId, status: "active" } });
		return { sessionId };
	}

	async startTurn(input: StartTurnInput): Promise<{ turnId: TurnId }> {
		const record = this.requireSession(input.sessionId);
		const turnId = input.turnId ?? this.nextTurnId();
		record.activeTurnId = turnId;
		await this.emit({
			id: this.nextEventId(),
			type: "turn/started",
			ts: this.nowIso(),
			sessionId: input.sessionId,
			payload: { sessionId: input.sessionId, turnId, prompt: input.prompt },
		});
		await this.emit({
			kind: "notification",
			method: "turn/changed",
			params: { sessionId: input.sessionId, turnId, status: "running" },
		});
		await record.runtime.session.prompt(input.prompt);
		return { turnId };
	}

	async interruptTurn(input: InterruptTurnInput): Promise<void> {
		const record = this.requireSession(input.sessionId);
		await record.runtime.session.abort();
		const turnId = input.turnId ?? record.activeTurnId;
		if (turnId) {
			await this.emit({
				id: this.nextEventId(),
				type: "turn/interrupted",
				ts: this.nowIso(),
				sessionId: input.sessionId,
				payload: { sessionId: input.sessionId, turnId },
			});
			await this.emit({
				kind: "notification",
				method: "turn/changed",
				params: { sessionId: input.sessionId, turnId, status: "interrupted" },
			});
		}
	}

	readState(): SessionControllerState {
		return {
			sessions: [...this.sessions.values()].map((record) => ({
				sessionId: record.id,
				cwd: record.runtime.cwd,
				sessionFile: record.runtime.session.sessionFile,
			})),
		};
	}

	async disposeSession(sessionId: SessionId): Promise<void> {
		const record = this.requireSession(sessionId);
		record.unsubscribe();
		await record.runtime.dispose();
		this.sessions.delete(sessionId);
		await this.emit({
			id: this.nextEventId(),
			type: "session/disposed",
			ts: this.nowIso(),
			sessionId,
			payload: { sessionId },
		});
		await this.emit({ kind: "notification", method: "session/changed", params: { sessionId, status: "disposed" } });
	}

	private register(sessionId: SessionId, runtime: ControlledSessionRuntime): void {
		if (this.sessions.has(sessionId)) throw new Error(`Session already exists: ${sessionId}`);
		const record: SessionRecord = { id: sessionId, runtime, unsubscribe: () => {} };
		record.unsubscribe = runtime.session.subscribe((event) => {
			const mapped = mapRuntimeEvent(event as never, {
				sessionId,
				turnId: record.activeTurnId,
				nextEventId: () => this.nextEventId(),
				now: this.options.now,
			});
			void this.emit(mapped.event);
			if (mapped.notification) void this.emit(mapped.notification);
		});
		this.sessions.set(sessionId, record);
	}

	private requireSession(sessionId: SessionId): SessionRecord {
		const record = this.sessions.get(sessionId);
		if (!record) throw new Error(`Unknown session: ${sessionId}`);
		return record;
	}

	private async emit(message: RuntimeControllerMessage): Promise<void> {
		await this.options.eventSink(message);
	}

	private nextSessionId(): SessionId {
		return this.options.nextSessionId?.() ?? `session-${crypto.randomUUID()}`;
	}

	private nextTurnId(): TurnId {
		return this.options.nextTurnId?.() ?? `turn-${crypto.randomUUID()}`;
	}

	private nextEventId(): string {
		return this.options.nextEventId?.() ?? `event-${crypto.randomUUID()}`;
	}

	private nowIso(): string {
		return (this.options.now?.() ?? new Date()).toISOString();
	}
}
