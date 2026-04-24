import { describe, expect, it } from "bun:test";
import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { discoverSemanticFilesFdDefault } from "../../src/extensions/daedalus/tools/semantic-file-discovery.js";

async function run(cwd: string, args: string[]): Promise<void> {
	const proc = Bun.spawn(args, { cwd, stdout: "pipe", stderr: "pipe" });
	const code = await proc.exited;
	if (code !== 0) throw new Error(`${args.join(" ")} failed`);
}

function rels(root: string, files: string[]): string[] {
	return files.map((file) => relative(root, file).split("\\").join("/")).sort();
}

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
	const dir = join(tmpdir(), `daedalus-semantic-candidates-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	await mkdir(dir, { recursive: true });
	try {
		return await fn(dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

async function writeFixture(dir: string): Promise<void> {
	await writeFile(join(dir, "main.ts"), "export const main = true;\n");
	await writeFile(join(dir, "script.py"), "print('ok')\n");
	await writeFile(join(dir, "yarn.lock"), "lock\n");
	await writeFile(join(dir, "image.png"), "png\n");
	await mkdir(join(dir, "testing", "harbor"), { recursive: true });
	await writeFile(join(dir, "testing", "harbor", "ignored.ts"), "ignored\n");
	await mkdir(join(dir, "testing", "terminal-bench-2"), { recursive: true });
	await writeFile(join(dir, "testing", "terminal-bench-2", "ignored.ts"), "ignored\n");
	await symlink(join(dir, "main.ts"), join(dir, "linked.ts"));
}

describe("semantic candidate collection via FdDefault + Forge filters", () => {
	it("uses git-first candidates then filters lockfiles, symlinks, extensions, and Daedalus hard excludes", async () => {
		await withTempDir(async (dir) => {
			await run(dir, ["git", "init"]);
			await writeFixture(dir);
			await run(dir, ["git", "add", "."]);
			await writeFile(join(dir, "untracked.ts"), "export const untracked = true;\n");
			const actual = await discoverSemanticFilesFdDefault(dir, {
				profile: "exhaustive",
				skipContentHeuristics: true,
			});
			expect(rels(dir, actual.files)).toEqual(["main.ts", "script.py", "untracked.ts"]);
		});
	});

	it("falls back to walker in non-git directories", async () => {
		await withTempDir(async (dir) => {
			await writeFixture(dir);
			const actual = await discoverSemanticFilesFdDefault(dir, {
				profile: "exhaustive",
				skipContentHeuristics: true,
			});
			expect(rels(dir, actual.files)).toEqual(["main.ts", "script.py"]);
		});
	});
});
