import { describe, expect, it } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverViaGit } from "../../src/extensions/daedalus/tools/git-file-discovery.js";

async function run(cwd: string, args: string[]): Promise<void> {
	const proc = Bun.spawn(args, { cwd, stdout: "pipe", stderr: "pipe" });
	const code = await proc.exited;
	if (code !== 0) throw new Error(`${args.join(" ")} failed`);
}

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
	const dir = join(tmpdir(), `daedalus-git-discovery-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	await mkdir(dir, { recursive: true });
	try {
		return await fn(dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

describe("git file discovery", () => {
	it("returns tracked and untracked non-ignored files as absolute paths", async () => {
		await withTempDir(async (dir) => {
			await run(dir, ["git", "init"]);
			await mkdir(join(dir, "src"), { recursive: true });
			await writeFile(join(dir, "src", "a.ts"), "a\n");
			await writeFile(join(dir, "b.py"), "b\n");
			await writeFile(join(dir, "c.rs"), "c\n");
			await writeFile(join(dir, "untracked.ts"), "u\n");
			await writeFile(join(dir, ".gitignore"), "ignored.ts\n");
			await writeFile(join(dir, "ignored.ts"), "ignored\n");
			await run(dir, ["git", "add", "src/a.ts", "b.py", "c.rs"]);
			const actual = await discoverViaGit(dir);
			expect(actual).toEqual(
				[
					join(dir, ".gitignore"),
					join(dir, "b.py"),
					join(dir, "c.rs"),
					join(dir, "src", "a.ts"),
					join(dir, "untracked.ts"),
				].sort(),
			);
		});
	});

	it("returns undefined outside git worktrees", async () => {
		await withTempDir(async (dir) => {
			expect(await discoverViaGit(dir)).toBeUndefined();
		});
	});
});
