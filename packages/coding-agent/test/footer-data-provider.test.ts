import * as childProcess from "child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asMock } from "./helpers/bun-compat.js";

let resolvedBranch = "main";

vi.spyOn(childProcess, "execFile");
vi.spyOn(childProcess, "spawnSync");
const execFileMock = asMock(childProcess.execFile as unknown as (...args: unknown[]) => unknown);
const spawnSyncMock = asMock(childProcess.spawnSync as unknown as (...args: unknown[]) => unknown);

type WorktreeFixture = {
	worktreeDir: string;
	reftableDir: string;
};

async function createProvider() {
	const mod = await import("../src/core/footer-data-provider.js");
	return new mod.FooterDataProvider();
}

function createPlainReftableRepo(tempDir: string): string {
	const repoDir = join(tempDir, "repo");
	mkdirSync(join(repoDir, ".git", "reftable"), { recursive: true });
	writeFileSync(join(repoDir, ".git", "HEAD"), "ref: refs/heads/.invalid\n");
	return repoDir;
}

function createPlainRepo(tempDir: string): string {
	const repoDir = join(tempDir, "repo");
	mkdirSync(join(repoDir, ".git"), { recursive: true });
	writeFileSync(join(repoDir, ".git", "HEAD"), "ref: refs/heads/main\n");
	return repoDir;
}

function createReftableWorktree(tempDir: string): WorktreeFixture {
	const repoDir = join(tempDir, "repo");
	const commonGitDir = join(repoDir, ".git");
	const gitDir = join(commonGitDir, "worktrees", "src");
	const worktreeDir = join(tempDir, "worktree");
	const reftableDir = join(commonGitDir, "reftable");

	mkdirSync(gitDir, { recursive: true });
	mkdirSync(reftableDir, { recursive: true });
	mkdirSync(worktreeDir, { recursive: true });

	writeFileSync(join(worktreeDir, ".git"), `gitdir: ${gitDir}\n`);
	writeFileSync(join(gitDir, "HEAD"), "ref: refs/heads/.invalid\n");
	writeFileSync(join(gitDir, "commondir"), "../..\n");
	writeFileSync(join(reftableDir, "tables.list"), "0\n");

	return { worktreeDir, reftableDir };
}

async function waitFor(condition: () => boolean, timeoutMs = 3000): Promise<void> {
	const startedAt = Date.now();
	while (!condition()) {
		if (Date.now() - startedAt > timeoutMs) {
			throw new Error("Timed out waiting for condition");
		}
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
}

describe("FooterDataProvider reftable branch detection", () => {
	let originalCwd: string;
	let tempDir: string;

	beforeEach(() => {
		originalCwd = process.cwd();
		tempDir = mkdtempSync(join(tmpdir(), "footer-data-provider-"));
		resolvedBranch = "main";
		spawnSyncMock.mockReset();
		execFileMock.mockReset();
		spawnSyncMock.mockImplementation((_command, args: readonly string[]) => {
			if (args[1] === "symbolic-ref") {
				return { status: resolvedBranch ? 0 : 1, stdout: resolvedBranch ? `${resolvedBranch}\n` : "", stderr: "" };
			}
			return { status: 1, stdout: "", stderr: "" };
		});
		execFileMock.mockImplementation(
			(_command, args: readonly string[], _options, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
				if (args[1] === "symbolic-ref") {
					setTimeout(
						() =>
							callback(
								resolvedBranch ? null : new Error("detached"),
								resolvedBranch ? `${resolvedBranch}\n` : "",
								"",
							),
						0,
					);
					return undefined as never;
				}
				setTimeout(() => callback(new Error("unsupported"), "", ""), 0);
				return undefined as never;
			},
		);
	});

	afterEach(() => {
		process.chdir(originalCwd);
		if (tempDir && existsSync(tempDir)) {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	afterAll(() => {
		vi.restoreAllMocks();
	});

	it("uses HEAD directly in a regular repo from a nested directory", async () => {
		const repoDir = createPlainRepo(tempDir);
		const nestedDir = join(repoDir, "src", "nested");
		mkdirSync(nestedDir, { recursive: true });
		process.chdir(nestedDir);

		const provider = await createProvider();
		try {
			expect(provider.getGitBranch()).toBe("main");
			expect(spawnSyncMock).not.toHaveBeenCalled();
		} finally {
			provider.dispose();
		}
	});

	it("resolves the branch via git when HEAD is .invalid in a reftable repo", async () => {
		const repoDir = createPlainReftableRepo(tempDir);
		process.chdir(repoDir);

		const provider = await createProvider();
		try {
			expect(provider.getGitBranch()).toBe("main");
			expect(spawnSyncMock).toHaveBeenCalledWith(
				"git",
				["--no-optional-locks", "symbolic-ref", "--quiet", "--short", "HEAD"],
				expect.objectContaining({
					cwd: expect.stringMatching(/repo$/),
					encoding: "utf8",
					stdio: ["ignore", "pipe", "ignore"],
				}),
			);
		} finally {
			provider.dispose();
		}
	});

	it("resolves the branch via git in a reftable-backed worktree", async () => {
		const { worktreeDir } = createReftableWorktree(tempDir);
		process.chdir(worktreeDir);

		const provider = await createProvider();
		try {
			expect(provider.getGitBranch()).toBe("main");
		} finally {
			provider.dispose();
		}
	});

	it("treats an unresolved .invalid reftable HEAD as detached", async () => {
		const repoDir = createPlainReftableRepo(tempDir);
		process.chdir(repoDir);
		resolvedBranch = "";

		const provider = await createProvider();
		try {
			expect(provider.getGitBranch()).toBe("detached");
		} finally {
			provider.dispose();
		}
	});

	it("does not notify listeners when reftable updates keep the same branch", async () => {
		const { worktreeDir, reftableDir } = createReftableWorktree(tempDir);
		process.chdir(worktreeDir);

		const provider = await createProvider();
		try {
			expect(provider.getGitBranch()).toBe("main");
			spawnSyncMock.mockClear();
			const onBranchChange = vi.fn();
			provider.onBranchChange(onBranchChange);

			writeFileSync(join(reftableDir, "tables.list"), "1\n");
			await waitFor(() => execFileMock.mock.calls.length === 1);

			expect(execFileMock).toHaveBeenCalledTimes(1);
			expect(spawnSyncMock).not.toHaveBeenCalled();
			expect(provider.getGitBranch()).toBe("main");
			expect(onBranchChange).not.toHaveBeenCalled();
		} finally {
			provider.dispose();
		}
	});

	it("debounces rapid reftable updates into a single async refresh", async () => {
		const { worktreeDir, reftableDir } = createReftableWorktree(tempDir);
		process.chdir(worktreeDir);

		const provider = await createProvider();
		try {
			expect(provider.getGitBranch()).toBe("main");
			execFileMock.mockClear();

			writeFileSync(join(reftableDir, "tables.list"), "1\n");
			writeFileSync(join(reftableDir, "tables.list"), "2\n");
			writeFileSync(join(reftableDir, "tables.list"), "3\n");
			await waitFor(() => execFileMock.mock.calls.length === 1);
			await new Promise((resolve) => setTimeout(resolve, 650));

			expect(execFileMock).toHaveBeenCalledTimes(1);
		} finally {
			provider.dispose();
		}
	});

	it("updates the cached branch when the reftable directory changes", async () => {
		const { worktreeDir, reftableDir } = createReftableWorktree(tempDir);
		process.chdir(worktreeDir);

		const provider = await createProvider();
		try {
			expect(provider.getGitBranch()).toBe("main");
			resolvedBranch = "foo";
			const onBranchChange = vi.fn();
			provider.onBranchChange(onBranchChange);

			writeFileSync(join(reftableDir, "tables.list"), "1\n");
			await waitFor(() => execFileMock.mock.calls.length === 1);
			await waitFor(() => provider.getGitBranch() === "foo");

			expect(execFileMock).toHaveBeenCalledTimes(1);
			expect(provider.getGitBranch()).toBe("foo");
			expect(onBranchChange).toHaveBeenCalledTimes(1);
		} finally {
			provider.dispose();
		}
	});
});
