export interface PtyProcessHandle {
	readonly pid: number;
	write(data: string): void;
	resize(cols: number, rows: number): void;
	kill(signal?: string): void;
	onData(listener: (data: string) => void): () => void;
	onExit(listener: (event: { exitCode: number | null; signal: string | null }) => void): () => void;
}

export interface PtyAdapter {
	spawn(input: { cwd: string; shell: string; cols: number; rows: number; env: NodeJS.ProcessEnv }): PtyProcessHandle;
}

type NodePtyModule = {
	spawn(file: string, args: readonly string[], options: { cwd: string; cols: number; rows: number; env: NodeJS.ProcessEnv }): {
		readonly pid: number;
		write(data: string): void;
		resize(cols: number, rows: number): void;
		kill(signal?: string): void;
		onData(listener: (data: string) => void): { dispose(): void };
		onExit(listener: (event: { exitCode: number; signal?: number | string }) => void): { dispose(): void };
	};
};

export class NodePtyAdapter implements PtyAdapter {
	constructor(private readonly nodePty: NodePtyModule) {}

	spawn(input: { cwd: string; shell: string; cols: number; rows: number; env: NodeJS.ProcessEnv }): PtyProcessHandle {
		const proc = this.nodePty.spawn(input.shell, [], {
			cwd: input.cwd,
			cols: input.cols,
			rows: input.rows,
			env: input.env,
		});
		return {
			pid: proc.pid,
			write: (data) => proc.write(data),
			resize: (cols, rows) => proc.resize(cols, rows),
			kill: (signal) => proc.kill(signal),
			onData: (listener) => {
				const disposable = proc.onData(listener);
				return () => disposable.dispose();
			},
			onExit: (listener) => {
				const disposable = proc.onExit((event) =>
					listener({ exitCode: event.exitCode, signal: event.signal == null ? null : String(event.signal) }),
				);
				return () => disposable.dispose();
			},
		};
	}
}

export async function createNodePtyAdapter(): Promise<PtyAdapter> {
	const nodePty = (await import("node-pty")) as NodePtyModule;
	return new NodePtyAdapter(nodePty);
}
