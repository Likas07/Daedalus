import { describe, expect, it } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverViaWalker, FD_WALKER_DEFAULTS } from "../../src/extensions/daedalus/tools/fd-walker.js";

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
	const dir = join(tmpdir(), `daedalus-fd-walker-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	await mkdir(dir, { recursive: true });
	try {
		return await fn(dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

describe("FdWalker fallback", () => {
	it("uses Forge default caps", () => {
		expect(FD_WALKER_DEFAULTS.maxDepth).toBe(5);
		expect(FD_WALKER_DEFAULTS.maxFiles).toBe(100);
		expect(FD_WALKER_DEFAULTS.maxTotalBytes).toBe(10 * 1024 * 1024);
		expect(FD_WALKER_DEFAULTS.maxBreadth).toBe(10);
		expect(FD_WALKER_DEFAULTS.maxFileSizeBytes).toBe(1024 * 1024);
	});

	it("respects max breadth per directory and per-file size caps", async () => {
		await withTempDir(async (dir) => {
			for (let index = 0; index < 12; index += 1) {
				await writeFile(
					join(dir, `${String(index).padStart(2, "0")}.ts`),
					`export const value${index} = ${index};\n`,
				);
			}
			await writeFile(join(dir, "large.ts"), "x".repeat(1024 * 1024 + 1));
			const actual = await discoverViaWalker(dir, { maxBreadth: 20, maxFileSizeBytes: 1024 * 1024 });
			expect(actual).not.toContain(join(dir, "large.ts"));

			const breadthCapped = await discoverViaWalker(dir, { maxBreadth: 3, maxFileSizeBytes: 1024 * 1024 });
			expect(breadthCapped).toEqual([join(dir, "00.ts"), join(dir, "01.ts"), join(dir, "02.ts")]);
		});
	});

	it("skips hidden files, .git, binary files, and respects max depth", async () => {
		await withTempDir(async (dir) => {
			await writeFile(join(dir, "visible.ts"), "export const visible = true;\n");
			await writeFile(join(dir, ".hidden.ts"), "export const hidden = true;\n");
			await mkdir(join(dir, ".git"), { recursive: true });
			await writeFile(join(dir, ".git", "config"), "config\n");
			await writeFile(join(dir, "binary.bin"), Buffer.from([0, 1, 2, 3]));
			await mkdir(join(dir, "a", "b", "c"), { recursive: true });
			await writeFile(join(dir, "a", "b", "c", "deep.ts"), "deep\n");
			const actual = await discoverViaWalker(dir, { maxDepth: 2, maxFiles: 100 });
			expect(actual).toEqual([join(dir, "visible.ts")]);
		});
	});

	it("respects .gitignore when feasible", async () => {
		await withTempDir(async (dir) => {
			await writeFile(join(dir, ".gitignore"), "ignored.ts\n");
			await writeFile(join(dir, "ignored.ts"), "ignored\n");
			await writeFile(join(dir, "kept.ts"), "kept\n");
			expect(await discoverViaWalker(dir)).toEqual([join(dir, "kept.ts")]);
		});
	});
});
