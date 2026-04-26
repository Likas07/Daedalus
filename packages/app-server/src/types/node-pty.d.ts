declare module "node-pty" {
	export function spawn(
		file: string,
		args: readonly string[],
		options: { cwd: string; cols: number; rows: number; env: NodeJS.ProcessEnv },
	): {
		readonly pid: number;
		write(data: string): void;
		resize(cols: number, rows: number): void;
		kill(signal?: string): void;
		onData(listener: (data: string) => void): { dispose(): void };
		onExit(listener: (event: { exitCode: number; signal?: number | string }) => void): { dispose(): void };
	};
}
