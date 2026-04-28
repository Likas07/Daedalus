import type { ImageContent } from "@daedalus-pi/ai";
import type {
	AppEvent,
	ServerNotification,
	ServerRequest,
	SessionId,
	TurnId,
	WorkflowRunsInTarget,
} from "@daedalus-pi/app-server-protocol";
export type RuntimeSessionManager = unknown;

import { mapRuntimeEvent } from "./event-mapper";

export type RuntimeControllerMessage = AppEvent | ServerNotification | ServerRequest;
export type RuntimeEventSink = (message: RuntimeControllerMessage) => void | Promise<void>;

export interface ControlledSessionRuntime {
	readonly cwd: string;
	readonly session: {
		readonly sessionFile?: string;
		subscribe(listener: (event: unknown) => void): () => void;
		prompt(prompt: string, options?: { images?: ImageContent[] }): Promise<void>;
		abort(): Promise<void>;
	};
	readonly control?: unknown;
	applyRuntimeOptions?(context?: PromptContextInput): Promise<void>;
	dispose(): Promise<void>;
}

export interface RuntimeFactoryInput {
	readonly cwd: string;
	readonly agentDir: string;
	readonly sessionId?: SessionId;
	readonly sessionManager: RuntimeSessionManager;
	readonly applyProcessCwd?: boolean;
	readonly context?: PromptContextInput;
}

export type RuntimeFactory = (input: RuntimeFactoryInput) => Promise<ControlledSessionRuntime>;

export interface SessionControllerOptions {
	readonly runtimeFactory: RuntimeFactory;
	readonly eventSink: RuntimeEventSink;
	readonly makeSessionManager: (input: {
		cwd: string;
		sessionPath?: string;
		sessionId?: string;
		parentSession?: string;
	}) => RuntimeSessionManager | Promise<RuntimeSessionManager>;
	readonly agentDir: string;
	readonly nextSessionId?: () => SessionId;
	readonly nextTurnId?: () => TurnId;
	readonly nextEventId?: () => string;
	readonly now?: () => Date;
	readonly promptContextResolver?: PromptContextResolver;
}

export interface PromptContextInput {
	readonly attachmentIds?: readonly string[];
	readonly filePaths?: readonly string[];
	readonly model?: string;
	readonly effort?: string;
	readonly accessMode?: string;
	readonly mode?: string;
	readonly fastMode?: boolean;
	readonly projectId?: string;
	readonly worktreeId?: string;
	readonly sessionId?: string;
	readonly draftState?: Record<string, unknown>;
	readonly tools?: readonly string[];
}

export interface PromptContextResolver {
	resolve(input: PromptContextInput & { cwd: string }): Promise<{ preamble?: string; images?: ImageContent[] }>;
}

export interface StartSessionInput {
	readonly cwd: string;
	readonly prompt?: string;
	readonly sessionId?: SessionId;
	readonly context?: PromptContextInput;
	readonly projectId?: string;
	readonly worktreeId?: string;
	readonly runsIn?: WorkflowRunsInTarget;
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
	readonly context?: PromptContextInput;
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

	async startSession(input: StartSessionInput): Promise<{ sessionId: SessionId; runsIn?: WorkflowRunsInTarget }> {
		const sessionId = input.sessionId ?? this.nextSessionId();
		const runtime = await this.options.runtimeFactory({
			cwd: input.cwd,
			agentDir: this.options.agentDir,
			sessionManager: await this.options.makeSessionManager({ cwd: input.cwd, sessionId }),
			sessionId,
			applyProcessCwd: false,
			context: input.context,
		});
		this.register(sessionId, runtime);
		await this.emit({
			id: this.nextEventId(),
			type: "session/started",
			ts: this.nowIso(),
			sessionId,
			payload: {
				sessionId,
				cwd: runtime.cwd,
				sessionFile: runtime.session.sessionFile,
				projectId: input.projectId,
				worktreeId: input.worktreeId,
				runsIn: input.runsIn,
			},
		});
		await this.emit({ kind: "notification", method: "session/changed", params: { sessionId, status: "active" } });
		if (input.prompt) {
			await this.startTurn({ sessionId, prompt: input.prompt, context: input.context });
		}
		return { sessionId, runsIn: input.runsIn };
	}

	async resumeSession(input: ResumeSessionInput): Promise<{ sessionId: SessionId }> {
		const sessionId = input.sessionId ?? (input.sessionPath as SessionId);
		const runtime = await this.options.runtimeFactory({
			cwd: input.cwd,
			agentDir: this.options.agentDir,
			sessionManager: await this.options.makeSessionManager({
				cwd: input.cwd,
				sessionPath: input.sessionPath,
				sessionId,
			}),
			sessionId,
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
			payload: { sessionId: input.sessionId, turnId, role: "user", content: input.prompt, prompt: input.prompt },
		});
		await this.emit({
			kind: "notification",
			method: "turn/changed",
			params: { sessionId: input.sessionId, turnId, status: "running" },
		});
		await record.runtime.applyRuntimeOptions?.(input.context);
		const context = await this.resolvePromptContext(record.runtime.cwd, input.context);
		await record.runtime.session.prompt(context.preamble ? `${context.preamble}\n\n${input.prompt}` : input.prompt, {
			images: context.images,
		});
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

	getSessionRuntime(sessionId: SessionId): ControlledSessionRuntime {
		return this.requireSession(sessionId).runtime;
	}

	async emitRuntimeControlChanged(sessionId: SessionId, control: string, payload: unknown): Promise<void> {
		await this.emit({
			id: this.nextEventId(),
			type: "runtime/control-changed",
			ts: this.nowIso(),
			sessionId,
			payload: { sessionId, control, ...(payload && typeof payload === "object" ? payload : { value: payload }) },
		});
		await this.emit({ kind: "notification", method: "runtime/changed", params: { sessionId, control, payload } });
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

	private async resolvePromptContext(
		cwd: string,
		context?: PromptContextInput,
	): Promise<{ preamble?: string; images?: ImageContent[] }> {
		if (!context || !this.options.promptContextResolver) return {};
		return this.options.promptContextResolver.resolve({ ...context, cwd });
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
