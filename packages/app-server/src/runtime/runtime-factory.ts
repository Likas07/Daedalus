export type RuntimeSessionManager = unknown;

export interface SessionRuntimeFactoryInput {
	readonly cwd: string;
	readonly agentDir: string;
	readonly sessionManager: RuntimeSessionManager;
	readonly applyProcessCwd?: boolean;
}

export interface SessionRuntime {
	readonly cwd: string;
	readonly session: {
		readonly sessionFile?: string;
		subscribe(listener: (event: unknown) => void): () => void;
		prompt(prompt: string): Promise<void>;
		abort(): Promise<void>;
	};
	dispose(): Promise<void>;
}

export type SessionRuntimeFactory = (input: SessionRuntimeFactoryInput) => Promise<SessionRuntime>;

export type SessionRuntimeCreator = (input: SessionRuntimeFactoryInput) => Promise<SessionRuntime>;

export function createSessionRuntimeFactory(createRuntime: SessionRuntimeCreator): SessionRuntimeFactory {
	return (input) => createRuntime({ ...input, applyProcessCwd: input.applyProcessCwd ?? false });
}
