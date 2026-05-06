import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyWorktreeInclude, chooseDependencySetupCommand, runWorktreeSetup } from "./worktree-bootstrap.js";
import { createWorktreeMetadata, readWorktreeMetadata, writeWorktreeMetadata } from "./worktree-metadata.js";

const tempDirs: string[] = [];

function tempDir(name: string): string {
	const dir = realpathSync(mkdtempSync(join(tmpdir(), `daedalus-${name}-`)));
	tempDirs.push(dir);
	return dir;
}

afterEach(() => {
	for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("chooseDependencySetupCommand", () => {
	test("prefers lockfile-specific package managers", () => {
		const repo = tempDir("worktree-bootstrap-locks");
		writeFileSync(join(repo, "package.json"), "{}\n");
		expect(chooseDependencySetupCommand(repo)).toEqual(["bun", "install"]);
		writeFileSync(join(repo, "package-lock.json"), "{}\n");
		expect(chooseDependencySetupCommand(repo)).toEqual(["npm", "install"]);
		writeFileSync(join(repo, "yarn.lock"), "\n");
		expect(chooseDependencySetupCommand(repo)).toEqual(["yarn", "install"]);
		writeFileSync(join(repo, "pnpm-lock.yaml"), "\n");
		expect(chooseDependencySetupCommand(repo)).toEqual(["pnpm", "install"]);
		writeFileSync(join(repo, "bun.lock"), "\n");
		expect(chooseDependencySetupCommand(repo)).toEqual(["bun", "install"]);
	});

	test("returns undefined when no package manifest exists", () => {
		expect(chooseDependencySetupCommand(tempDir("worktree-bootstrap-empty"))).toBeUndefined();
	});
});

describe("applyWorktreeInclude", () => {
	test("copies allowlisted files and symlinks allowlisted directories", () => {
		const repo = tempDir("worktree-bootstrap-source");
		const worktree = tempDir("worktree-bootstrap-target");
		writeFileSync(join(repo, ".worktreeinclude"), "# local runtime\n.env.local\n.cache/tool\nmissing.txt\n");
		writeFileSync(join(repo, ".env.local"), "secret\n");
		Bun.spawnSync(["mkdir", "-p", join(repo, ".cache", "tool")]);
		writeFileSync(join(repo, ".cache", "tool", "state.json"), "{}\n");

		expect(applyWorktreeInclude(repo, worktree)).toEqual([".env.local", ".cache/tool"]);
		expect(readFileSync(join(worktree, ".env.local"), "utf8")).toBe("secret\n");
		expect(lstatSync(join(worktree, ".cache", "tool")).isSymbolicLink()).toBe(true);
		expect(readFileSync(join(worktree, ".cache", "tool", "state.json"), "utf8")).toBe("{}\n");
	});

	test("rejects unsafe allowlist entries", () => {
		const repo = tempDir("worktree-bootstrap-unsafe-source");
		const worktree = tempDir("worktree-bootstrap-unsafe-target");
		writeFileSync(join(repo, ".worktreeinclude"), "../outside\n");
		expect(() => applyWorktreeInclude(repo, worktree)).toThrow(/Unsafe/);
		writeFileSync(join(repo, ".worktreeinclude"), "/tmp/outside\n");
		expect(() => applyWorktreeInclude(repo, worktree)).toThrow(/Unsafe/);
		writeFileSync(join(repo, ".worktreeinclude"), ".git/config\n");
		expect(() => applyWorktreeInclude(repo, worktree)).toThrow(/Unsafe/);
	});
});

describe("runWorktreeSetup", () => {
	test("updates metadata and can skip ignored include copying", () => {
		const repo = tempDir("worktree-bootstrap-run-source");
		const worktree = tempDir("worktree-bootstrap-run-target");
		writeFileSync(join(repo, ".worktreeinclude"), ".env.local\n");
		writeFileSync(join(repo, ".env.local"), "secret\n");
		writeWorktreeMetadata(
			worktree,
			createWorktreeMetadata({ branch: "agent/test", baseRef: "HEAD", baseCommit: "0".repeat(40) }),
		);

		const result = runWorktreeSetup({ projectRoot: repo, worktreePath: worktree, includeIgnored: false });
		expect(result).toEqual({ command: undefined, included: [] });
		expect(existsSync(join(worktree, ".env.local"))).toBe(false);
		expect(readWorktreeMetadata(worktree)?.setup.status).toBe("setup_complete");
	});
});
