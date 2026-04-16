import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll } from "vitest";

export type MockLike<TArgs extends unknown[] = unknown[], TResult = unknown> = ((...args: TArgs) => TResult) & {
	mock: { calls: TArgs[] };
	mockClear(): void;
	mockReset(): void;
	mockImplementation(fn: (...args: TArgs) => TResult): unknown;
	mockResolvedValue(value: Awaited<TResult>): unknown;
};

export function asMock<TArgs extends unknown[] = unknown[], TResult = unknown>(
	fn: (...args: TArgs) => TResult,
): MockLike<TArgs, TResult> {
	return fn as MockLike<TArgs, TResult>;
}

export function createGlobalStubManager() {
	const restores: Array<() => void> = [];

	return {
		stub(name: keyof typeof globalThis | string, value: unknown) {
			const key = String(name);
			const hadOwn = Object.hasOwn(globalThis, key);
			const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
			const previousValue = (globalThis as Record<string, unknown>)[key];

			Object.defineProperty(globalThis, key, {
				configurable: true,
				writable: true,
				value,
			});

			const restore = () => {
				if (hadOwn) {
					if (descriptor) {
						Object.defineProperty(globalThis, key, descriptor);
					} else {
						Object.defineProperty(globalThis, key, {
							configurable: true,
							writable: true,
							value: previousValue,
						});
					}
				} else {
					delete (globalThis as Record<string, unknown>)[key];
				}
			};

			restores.push(restore);
			return restore;
		},
		restoreAll() {
			while (restores.length > 0) {
				restores.pop()?.();
			}
		},
	};
}

export async function advanceTimers(ms: number): Promise<void> {
	const { vi } = await import("vitest");
	vi.advanceTimersByTime(ms);
	await Promise.resolve();
	await Promise.resolve();
}

let warnedMissingCommands = new Set<string>();

function runCommandUnmocked(command: string, args: string[], cwd?: string): { status: number | null } {
	const bunRuntime = (
		globalThis as {
			Bun?: {
				spawnSync: (options: { cmd: string[]; cwd?: string; stdout?: "pipe"; stderr?: "pipe" }) => {
					exitCode: number;
					success: boolean;
				};
			};
		}
	).Bun;
	if (bunRuntime) {
		const result = bunRuntime.spawnSync({ cmd: [command, ...args], cwd, stdout: "pipe", stderr: "pipe" });
		return { status: result.success ? 0 : result.exitCode };
	}
	const result = spawnSync(command, args, { cwd, stdio: "ignore" });
	return { status: result.status };
}

export function warnAndSkipMissingCommand(command: string): boolean {
	const result = runCommandUnmocked(command, ["--version"]);
	if (result.status === 0) {
		return false;
	}
	if (!warnedMissingCommands.has(command)) {
		warnedMissingCommands.add(command);
		console.warn(`[test skip] Missing required command: ${command}`);
	}
	return true;
}

export function supportsGitInitialBranchFlag(): boolean {
	const probeDir = mkdtempSync(join(tmpdir(), "git-initial-branch-probe-"));
	try {
		const result = runCommandUnmocked("git", ["init", "--initial-branch=main"], probeDir);
		return result.status === 0;
	} finally {
		rmSync(probeDir, { recursive: true, force: true });
	}
}

export function warnAndSkip(reason: string): boolean {
	if (!warnedMissingCommands.has(reason)) {
		warnedMissingCommands.add(reason);
		console.warn(`[test skip] ${reason}`);
	}
	return true;
}

export function resetBunCompatWarnings(): void {
	warnedMissingCommands = new Set<string>();
}

beforeAll(() => {
	resetBunCompatWarnings();
});
